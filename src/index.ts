#!/usr/bin/env node
/**
 * obix-cli-create
 *
 * OBIX Heart UX — project scaffolder
 *
 * Usage:
 *   npx obix-cli-create [project-name]
 *   npx obix-cli-create my-app --template html
 *   npx obix-cli-create my-app --template node
 *   obix-cli-create my-app --yes
 */

import { program } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ── Resolve paths ──────────────────────────────────────────────────────────

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES  = path.join(__dirname, '..', 'templates');

// ── Types ──────────────────────────────────────────────────────────────────

type Template = 'node' | 'html';

interface ScaffoldOptions {
  projectName: string;
  template:    Template;
  author:      string;
  targetDir:   string;
}

// ── Banner ──────────────────────────────────────────────────────────────────

function banner() {
  console.log();
  console.log(chalk.hex('#6c63ff').bold('  ◈  OBIX Heart UX  ◈'));
  console.log(chalk.dim('  OBINexus — Data-oriented · Accessibility-first · #NoGhosting'));
  console.log();
}

// ── Prompt ──────────────────────────────────────────────────────────────────

async function prompt(argv: {
  projectName?: string;
  template?: string;
}): Promise<ScaffoldOptions> {

  const answers = await inquirer.prompt([
    {
      type:    'input',
      name:    'projectName',
      message: 'Project name:',
      default: argv.projectName ?? 'my-obix-app',
      when:    !argv.projectName,
      validate: (v: string) =>
        /^[a-z0-9@._/-]+$/i.test(v.trim()) || 'Use only letters, numbers, hyphens, or @scope/name',
    },
    {
      type:    'list',
      name:    'template',
      message: 'Template:',
      when:    !argv.template,
      choices: [
        {
          name:  'node  — TypeScript · Express REST API · SQLite · CLI  (default)',
          value: 'node',
          short: 'node',
        },
        {
          name:  'html  — Vanilla HTML · CSS · JS · npx serve .',
          value: 'html',
          short: 'html',
        },
      ],
      default: 'node',
    },
    {
      type:    'input',
      name:    'author',
      message: 'Author (name <email>):',
      default: '',
    },
  ]);

  const projectName = (argv.projectName ?? answers.projectName).trim();
  const template    = (argv.template    ?? answers.template)    as Template;
  const author      = (answers.author   ?? '').trim();

  // Derive a safe directory name from the scoped package name if needed
  const dirName = projectName.startsWith('@')
    ? projectName.split('/')[1] ?? projectName.replace('@', '').replace('/', '-')
    : projectName;

  const targetDir = path.resolve(process.cwd(), dirName);

  return { projectName, template, author, targetDir };
}

// ── File copy ────────────────────────────────────────────────────────────────

/** Recursively copy src → dest, skipping node_modules / dist / .git */
function copyDir(src: string, dest: string): void {
  const SKIP = new Set(['node_modules', 'dist', '.git', 'app.db']);
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const srcPath  = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/** Replace template tokens in a string */
function interpolate(content: string, tokens: Record<string, string>): string {
  return Object.entries(tokens).reduce(
    (s, [k, v]) => s.replaceAll(`{{${k}}}`, v),
    content,
  );
}

// ── Scaffold ─────────────────────────────────────────────────────────────────

function scaffold(opts: ScaffoldOptions): void {
  const { projectName, template, author, targetDir } = opts;
  const templateSrc = path.join(TEMPLATES, template);

  // Guard: target must not already exist
  if (fs.existsSync(targetDir)) {
    console.error(
      chalk.red(`\n  ✗  Directory already exists: ${targetDir}\n`) +
      chalk.dim('     Choose a different project name or remove the existing folder.\n'),
    );
    process.exit(1);
  }

  // Step 1 — copy all template files
  copyDir(templateSrc, targetDir);

  // Step 2 — write package.json from _package.json stub
  const stubPath = path.join(templateSrc, '_package.json');
  if (fs.existsSync(stubPath)) {
    const binName  = projectName.startsWith('@')
      ? projectName.split('/')[1] ?? 'app'
      : projectName;

    const tokens: Record<string, string> = {
      PROJECT_NAME: projectName,
      AUTHOR:       author || 'OBINexus <okpalan@protonmail.com>',
      BIN_NAME:     binName,
    };

    const pkgContent = interpolate(
      fs.readFileSync(stubPath, 'utf8'),
      tokens,
    );

    fs.writeFileSync(path.join(targetDir, 'package.json'), pkgContent, 'utf8');
  }

  // Step 3 — write a minimal .gitignore
  const gitignore = [
    'node_modules/',
    'dist/',
    'app.db',
    '*.db-shm',
    '*.db-wal',
    '.env',
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(targetDir, '.gitignore'), gitignore, 'utf8');
}

// ── Next-steps printer ────────────────────────────────────────────────────────

function printNextSteps(opts: ScaffoldOptions): void {
  const rel = path.relative(process.cwd(), opts.targetDir) || opts.targetDir;

  console.log();
  console.log(chalk.hex('#3ecf8e').bold('  ✔  Project scaffolded!'));
  console.log();
  console.log(chalk.bold('  Next steps:'));
  console.log();
  console.log(chalk.cyan(`    cd ${rel}`));

  if (opts.template === 'node') {
    console.log(chalk.cyan('    npm install'));
    console.log(chalk.cyan('    npm run dev'));
    console.log();
    console.log(chalk.dim('  Then open: ') + chalk.white('http://localhost:3000'));
    console.log(chalk.dim('  CLI:       ') + chalk.white('npm run cli -- --help'));
  } else {
    console.log(chalk.cyan('    npx serve .'));
    console.log();
    console.log(chalk.dim('  Then open: ') + chalk.white('http://localhost:3000'));
  }

  console.log();
  console.log(
    chalk.dim('  Template docs → ') +
    chalk.hex('#6c63ff')('https://github.com/obinexus/obix'),
  );
  console.log();
}

// ── CLI definition ────────────────────────────────────────────────────────────

program
  .name('obix-cli-create')
  .description('Scaffold an OBIX Heart UX application')
  .version((JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')) as { version: string }).version)
  .argument('[project-name]', 'Name for the new project / directory')
  .option('-t, --template <template>', 'Template to use: node (default) | html')
  .option('-y, --yes', 'Skip prompts, use all defaults')
  .action(async (projectNameArg: string | undefined, opts: { template?: string; yes?: boolean }) => {
    // an unknown template used to fail half way (or, with --yes, scaffold nothing useful): refuse it up front
    if (opts.template !== undefined && opts.template !== 'node' && opts.template !== 'html') {
      console.error(chalk.red(`
  ✗  Unknown template "${opts.template}". Choose: node | html
`));
      process.exit(2);
    }
    banner();

    let scaffoldOpts: ScaffoldOptions;

    if (opts.yes) {
      // Non-interactive fast path
      const projectName = projectNameArg ?? 'my-obix-app';
      const template    = (opts.template as Template) ?? 'node';
      const dirName     = projectName.startsWith('@')
        ? projectName.split('/')[1] ?? projectName
        : projectName;
      scaffoldOpts = {
        projectName,
        template,
        author:    '',
        targetDir: path.resolve(process.cwd(), dirName),
      };
    } else {
      scaffoldOpts = await prompt({ projectName: projectNameArg, template: opts.template });
    }

    console.log(
      chalk.dim(`\n  Scaffolding `) +
      chalk.bold(scaffoldOpts.template) +
      chalk.dim(' template into ') +
      chalk.white(path.basename(scaffoldOpts.targetDir)) +
      chalk.dim(' …'),
    );

    scaffold(scaffoldOpts);
    printNextSteps(scaffoldOpts);
  });

program.parse();
