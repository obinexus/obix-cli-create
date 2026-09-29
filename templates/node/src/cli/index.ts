#!/usr/bin/env node
/**
 * obix-template-node — CLI
 *
 * Usage:
 *   obix-app team create
 *   obix-app team list
 *   obix-app item create
 *   obix-app item list [teamId]
 *   obix-app item complete <itemId>
 *   obix-app compliance violations
 *   obix-app compliance escalations
 *   obix-app compliance report <teamId>
 *   obix-app status
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { table } from 'table';
import { v4 as uuid } from 'uuid';

import { createApp, Item } from '../core/index.js';
import { AppDatabase } from '../server/database.js';

const program = new Command();
const db = new AppDatabase();
const app = createApp();

// ── Hydrate from DB ───────────────────────────────────────────────────────

function hydrate(): void {
  for (const team of db.getAllTeams()) {
    app.dispatch({ type: 'CREATE_TEAM', payload: team });
  }
}

// ── Print helpers ─────────────────────────────────────────────────────────

const hr = (title: string) =>
  console.log(chalk.cyan(`\n${'─'.repeat(52)}\n  ${title}\n${'─'.repeat(52)}\n`));

const ok  = (msg: string) => console.log(chalk.green(`✅  ${msg}`));
const err = (msg: string) => console.log(chalk.red(`❌  ${msg}`));

// ── Teams ─────────────────────────────────────────────────────────────────

program
  .command('team create')
  .description('Create a new team')
  .action(async () => {
    hr('Create Team');
    const { name, description } = await inquirer.prompt([
      { type: 'input', name: 'name',        message: 'Team name:' },
      { type: 'input', name: 'description', message: 'Description:' },
    ]);

    app.dispatch({
      type: 'CREATE_TEAM',
      payload: {
        name, description,
        members: [{
          id: `user-${uuid().slice(0, 8)}`,
          name: 'You',
          email: 'you@example.com',
          role: 'owner',
          status: 'active',
          joinedAt: Date.now(),
          lastActiveAt: Date.now(),
          settings: {},
        }],
        settings: {
          visibility: 'private',
          enableNotifications: true,
          enableReminders: true,
          reminderThresholdHours: 24,
          escalationEnabled: true,
          escalationThresholdHours: 48,
          requireAcknowledgment: true,
          acknowledgmentTimeoutHours: 2,
        },
      },
    });

    const teams = Object.values(app.state().teams);
    const created = teams.at(-1)!;
    db.saveTeam(created);
    ok(`Team "${created.name}" created  (id: ${created.id})`);
  });

program
  .command('team list')
  .description('List all teams')
  .action(() => {
    hr('Teams');
    const teams = Object.values(app.state().teams);
    if (teams.length === 0) {
      console.log(chalk.yellow('No teams. Run: obix-app team create'));
      return;
    }
    console.log(table([
      [chalk.bold('Name'), chalk.bold('Members'), chalk.bold('ID'), chalk.bold('Created')],
      ...teams.map((t) => [
        t.name,
        String(t.members.length),
        t.id,
        new Date(t.createdAt).toLocaleDateString(),
      ]),
    ]));
  });

// ── Items ─────────────────────────────────────────────────────────────────

program
  .command('item create')
  .description('Create a new item')
  .action(async () => {
    hr('Create Item');
    const teams = Object.values(app.state().teams);
    if (teams.length === 0) {
      err('No teams found. Create one first: obix-app team create');
      return;
    }

    const answers = await inquirer.prompt([
      {
        type: 'list', name: 'teamId', message: 'Team:',
        choices: teams.map((t) => ({ name: t.name, value: t.id })),
      },
      { type: 'input', name: 'title',       message: 'Title:' },
      { type: 'input', name: 'description', message: 'Description (optional):' },
      {
        type: 'list', name: 'priority', message: 'Priority:',
        choices: ['low', 'medium', 'high', 'critical'],
        default: 'medium',
      },
    ]);

    app.dispatch({
      type: 'CREATE_ITEM',
      payload: {
        title: answers.title,
        description: answers.description,
        assignedTo: [],
        createdBy: 'cli',
        teamId: answers.teamId,
        priority: answers.priority,
        status: 'open',
        childIds: [],
        tags: [],
        customFields: {},
      },
    });

    const items = Object.values(app.state().items);
    const created = items.at(-1)!;
    db.saveItem(created);
    ok(`Item "${created.title}" created  (id: ${created.id})`);
  });

program
  .command('item list [teamId]')
  .description('List items (all teams, or filter by teamId)')
  .action((teamId?: string) => {
    hr('Items');
    const teams = Object.values(app.state().teams);

    let items: Item[];
    if (teamId) {
      items = app.runtime.getTeamItems(teamId);
    } else if (teams.length === 1) {
      items = app.runtime.getTeamItems(teams[0].id);
    } else if (teams.length > 1) {
      console.log(chalk.yellow('Multiple teams — specify one:'));
      teams.forEach((t) => console.log(`  obix-app item list ${t.id}   # ${t.name}`));
      return;
    } else {
      items = [];
    }

    if (items.length === 0) {
      console.log(chalk.yellow('No items yet. Run: obix-app item create'));
      return;
    }

    console.log(table([
      [chalk.bold('Title'), chalk.bold('Status'), chalk.bold('Priority'), chalk.bold('Assigned'), chalk.bold('ID')],
      ...items.map((i) => [
        i.title,
        i.status,
        i.priority,
        String(i.assignedTo.length),
        i.id.slice(0, 8),
      ]),
    ]));
  });

program
  .command('item complete <itemId>')
  .description('Mark an item as complete')
  .action((itemId: string) => {
    app.dispatch({ type: 'COMPLETE_ITEM', payload: { id: itemId } });
    const item = app.runtime.getItem(itemId);
    if (item) {
      db.saveItem(item);
      ok(`"${item.title}" marked complete`);
    } else {
      err(`Item ${itemId} not found`);
    }
  });

// ── Compliance ────────────────────────────────────────────────────────────

program
  .command('compliance violations')
  .description('Show #NoGhosting policy violations')
  .action(() => {
    hr('#NoGhosting — Violations');
    const vs = app.validateCompliance();
    if (vs.length === 0) { console.log(chalk.green('✅  No violations')); return; }
    console.log(table([
      [chalk.bold('Type'), chalk.bold('Severity'), chalk.bold('Description')],
      ...vs.map((v) => [
        v.type,
        v.severity === 'critical' ? chalk.red(v.severity) : chalk.yellow(v.severity),
        v.description,
      ]),
    ]));
  });

program
  .command('compliance escalations')
  .description('Show items needing escalation')
  .action(() => {
    hr('Escalations');
    const es = app.checkEscalations();
    if (es.length === 0) { console.log(chalk.green('✅  Nothing to escalate')); return; }
    console.log(table([
      [chalk.bold('Item'), chalk.bold('Severity'), chalk.bold('Reason'), chalk.bold('Action')],
      ...es.map((e) => [
        e.itemId.slice(0, 8),
        e.severity === 'critical' ? chalk.red(e.severity) : chalk.yellow(e.severity),
        e.reason,
        e.recommendedAction,
      ]),
    ]));
  });

program
  .command('compliance report <teamId>')
  .description('Engagement report for a team')
  .action((teamId: string) => {
    try {
      hr('Engagement Report');
      const r = app.getEngagementReport(teamId);
      console.log(chalk.cyan('Summary'));
      console.log(`  Total items:          ${r.totalItems}`);
      console.log(`  Engagement rate:      ${(r.engagementRate * 100).toFixed(1)}%`);
      console.log(`  Avg completion time:  ${(r.averageResponseTime / 3_600_000).toFixed(1)}h`);
      console.log(`  Violations:           ${r.violations.length}`);

      if (Object.keys(r.memberEngagement).length > 0) {
        console.log(chalk.cyan('\nMembers'));
        console.log(table([
          [chalk.bold('Name'), chalk.bold('Assigned'), chalk.bold('Completed'), chalk.bold('In Progress')],
          ...Object.values(r.memberEngagement).map((m) => [
            m.name, String(m.itemsAssigned), String(m.itemsCompleted), String(m.itemsInProgress),
          ]),
        ]));
      }
    } catch (e) {
      err(String(e));
    }
  });

// ── Status ────────────────────────────────────────────────────────────────

program
  .command('status')
  .description('App and database status')
  .action(() => {
    hr('Status');
    const stats = db.getStats();
    const vs    = app.validateCompliance();
    const es    = app.checkEscalations();
    console.log(chalk.cyan('Database'));
    console.log(`  Items:   ${stats.items}`);
    console.log(`  Teams:   ${stats.teams}`);
    console.log(`  Events:  ${stats.events}`);
    console.log(chalk.cyan('\nCompliance'));
    console.log(`  Violations:  ${vs.length}`);
    console.log(`  Escalations: ${es.length}`);
  });

// ── Boot ──────────────────────────────────────────────────────────────────

program
  .name('obix-app')
  .description('obix-template-node CLI — #NoGhosting protocol enabled')
  .version('0.1.0');

hydrate();

if (process.argv.length < 3) {
  program.help();
} else {
  program.parse(process.argv);
}
