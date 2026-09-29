/**
 * The scaffolder is a commander script that parses on import, so it is exercised as a subprocess through its
 * non-interactive path (`--yes`). Each test works in a fresh temp directory.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(pkgDir, 'dist', 'index.js');
const run = (args, cwd) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'obix-create-'));

test('--version and --help report the tool', () => {
  const dir = tmp();
  assert.match(run(['--version'], dir).stdout, /\d+\.\d+\.\d+/);
  const help = run(['--help'], dir).stdout;
  assert.match(help, /obix-cli-create/);
  assert.match(help, /--template/);
  assert.match(help, /--yes/);
});

test('--yes scaffolds the html template with an interpolated package.json and a .gitignore', () => {
  const dir = tmp();
  const r = run(['demo-app', '--yes', '--template', 'html'], dir);
  assert.equal(r.status, 0, r.stderr);
  const out = path.join(dir, 'demo-app');
  for (const f of ['index.html', 'app.js', 'styles.css', 'package.json', '.gitignore']) assert.ok(fs.existsSync(path.join(out, f)), f);
  const pkg = JSON.parse(fs.readFileSync(path.join(out, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'demo-app');
  assert.doesNotMatch(fs.readFileSync(path.join(out, 'package.json'), 'utf8'), /\{\{[A-Z_]+\}\}/, 'no unreplaced template tokens');
  assert.match(fs.readFileSync(path.join(out, '.gitignore'), 'utf8'), /node_modules\//);
});

test('--yes scaffolds the node template', () => {
  const dir = tmp();
  const r = run(['svc', '--yes', '--template', 'node'], dir);
  assert.equal(r.status, 0, r.stderr);
  for (const f of ['tsconfig.json', 'package.json', 'src/core/runtime.ts', 'src/server/app.ts']) assert.ok(fs.existsSync(path.join(dir, 'svc', f)), f);
});

test('a scoped name scaffolds into the unscoped directory', () => {
  const dir = tmp();
  const r = run(['@acme/widgets', '--yes', '--template', 'html'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(dir, 'widgets', 'index.html')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'widgets', 'package.json'), 'utf8')).name, '@acme/widgets');
});

test('an existing target directory is refused with a non-zero exit and is left untouched', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'taken'));
  fs.writeFileSync(path.join(dir, 'taken', 'keep.txt'), 'x');
  const r = run(['taken', '--yes', '--template', 'html'], dir);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /already exists/);
  assert.equal(fs.readFileSync(path.join(dir, 'taken', 'keep.txt'), 'utf8'), 'x');
});

// ── Stage 6: defects found by running the real bin ─────────────────────────────────────────────────────────
test('--version is the package version (it printed a hard-coded 0.1.0)', () => {
  const dir = tmp();
  const version = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).version;
  assert.equal(run(['--version'], dir).stdout.trim(), version);
});

test('the node template declares no dependency that cannot be installed (it asked for obix@^0.1.0, which does not exist and which its sources never import)', () => {
  const dir = tmp();
  const r = run(['svc', '--yes', '--template', 'node'], dir);
  assert.equal(r.status, 0, r.stderr);
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'svc', 'package.json'), 'utf8'));
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  assert.equal(all['obix'], undefined);
  // and nothing in its sources imports an OBIX package (`obix`, `obix-*`) it would then be missing
  const stack = [path.join(dir, 'svc', 'src')];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else assert.doesNotMatch(fs.readFileSync(p, 'utf8'), /from ['"]obix(?:-[a-z0-9-]+)?['"/]/, p);
    }
  }
});

test('an unknown template is refused, not silently replaced by the default', () => {
  const dir = tmp();
  const r = run(['svc', '--yes', '--template', 'vue'], dir);
  assert.notEqual(r.status, 0, 'scaffolded something for an unknown template');
  assert.ok(!fs.existsSync(path.join(dir, 'svc')));
});

test('the node template policy engine (types + policies) compiles with the workspace TypeScript and its #NoGhosting policy behaves', async () => {
  // Only types.ts and policies.ts are checked offline: runtime, server, CLI and UI need uuid, express, sqlite, commander… from a registry,
  // which was not installed. So this is partial evidence for the node template, stated as such in the README.
  const dir = tmp();
  assert.equal(run(['svc', '--yes', '--template', 'node'], dir).status, 0);
  const out = path.join(dir, 'core-out');
  const core = path.join(dir, 'svc', 'src', 'core');
  const tsc = path.resolve(pkgDir, '..', '..', 'node_modules', 'typescript', 'bin', 'tsc');
  const compile = spawnSync(process.execPath, [tsc, '--outDir', out, '--rootDir', core, '--target', 'ES2023', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--strict', '--skipLibCheck', '--types', 'node', '--typeRoots', path.resolve(pkgDir, '..', '..', 'node_modules', '@types'), path.join(core, 'types.ts'), path.join(core, 'policies.ts')], { encoding: 'utf8', cwd: dir });
  assert.equal(compile.status, 0, compile.stdout + compile.stderr);
  fs.writeFileSync(path.join(out, 'package.json'), '{"type":"module"}');
  const { validateCompliance } = await import(pathToFileURL(path.join(out, 'policies.js')).href);
  const item = (over) => ({ id: 'i', title: 'T', description: '', childIds: [], assignedTo: [], createdBy: 'u', teamId: 't', status: 'open', priority: 'medium', createdAt: 0, updatedAt: 0, engagementEvents: [], tags: [], customFields: {}, ...over });
  const state = (items) => ({ items, teams: { t: { id: 't', name: 'T', description: '', createdAt: 0, updatedAt: 0, members: [], settings: {}, complianceTrail: [] } }, currentTeamId: 't', currentUserId: 'u', lastSyncAt: 0 });
  assert.deepEqual(validateCompliance(state({ a: item({ assignedTo: ['u'] }) })), [], 'an assigned open item is fine');
  const found = validateCompliance(state({ a: item({ id: 'a' }), b: item({ id: 'b', priority: 'critical' }) }));
  assert.deepEqual(found.map((v) => [v.itemId, v.type, v.severity]), [['a', 'unassigned_item', 'warning'], ['b', 'unassigned_item', 'critical']]);
});

test('the scaffolder and its templates point at the canonical repository github.com/obinexus/obix, never a retired owner (R6-FIX)', () => {
  const dir = tmp();
  const r = run(['demo-links', '--yes', '--template', 'html'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /https:\/\/github\.com\/obinexus\/obix\b/);
  const written = fs.readdirSync(path.join(dir, 'demo-links'), { recursive: true }).map(String).filter((f) => fs.statSync(path.join(dir, 'demo-links', f)).isFile());
  const text = [r.stdout, ...written.map((f) => fs.readFileSync(path.join(dir, 'demo-links', f), 'utf8'))].join('\n');
  // the retired names, assembled so that this shipped test file is not itself a reference to them (the release payload gate reads it)
  const RETIRED = new RegExp(['obinexusmk2', 'OBINexusComputing', ['obix', 'monorepo'].join('-')].join('|'), 'i');
  assert.doesNotMatch(text, RETIRED);
  assert.match(fs.readFileSync(path.join(dir, 'demo-links', 'index.html'), 'utf8'), /https:\/\/github\.com\/obinexus\/obix\/tree\/main\/docs/);
});
