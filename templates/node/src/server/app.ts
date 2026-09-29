/**
 * obix-template-node — Express REST API Server
 *
 * Endpoints:
 *   GET  /health
 *   GET  /api/teams                        list teams
 *   POST /api/teams                        create team
 *   GET  /api/teams/:id                    get team
 *   GET  /api/teams/:id/items              list team items
 *   POST /api/items                        create item
 *   GET  /api/items/:id                    get item
 *   PATCH /api/items/:id                   update item
 *   POST /api/items/:id/complete           mark complete
 *   POST /api/items/:id/assign             assign to user
 *   GET  /api/compliance/violations        #NoGhosting violations
 *   GET  /api/compliance/escalations       escalation signals
 *   GET  /api/compliance/report/:teamId    engagement report
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import { createApp } from '../core/index.js';
import { AppDatabase } from './database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);

const server = express();
server.use(express.json());
server.use(cors());

const db = new AppDatabase();
const app = createApp();

// ── Seed state from DB on startup ─────────────────────────────────────────

function hydrate(): void {
  for (const team of db.getAllTeams()) {
    app.dispatch({ type: 'CREATE_TEAM', payload: team });
  }
}

// ── Health ────────────────────────────────────────────────────────────────

server.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), db: db.getStats() });
});

// ── Teams ─────────────────────────────────────────────────────────────────

server.get('/api/teams', (_req: Request, res: Response) => {
  res.json({ success: true, data: Object.values(app.state().teams) });
});

server.post('/api/teams', (req: Request, res: Response) => {
  const { name, description, members = [], settings } = req.body;
  app.dispatch({
    type: 'CREATE_TEAM',
    payload: {
      name, description, members,
      settings: settings ?? {
        visibility: 'private',
        enableNotifications: true,
        enableReminders: true,
        reminderThresholdHours: 24,
        escalationEnabled: true,
        escalationThresholdHours: 48,
        requireAcknowledgment: false,
        acknowledgmentTimeoutHours: 24,
      },
    },
  });
  const teams = Object.values(app.state().teams);
  const created = teams.at(-1)!;
  db.saveTeam(created);
  res.status(201).json({ success: true, data: created });
});

server.get('/api/teams/:id', (req: Request, res: Response) => {
  const team = app.runtime.getTeam(req.params.id);
  if (!team) return res.status(404).json({ success: false, error: 'Team not found' });
  res.json({ success: true, data: team });
});

server.get('/api/teams/:id/items', (req: Request, res: Response) => {
  res.json({ success: true, data: app.runtime.getTeamItems(req.params.id) });
});

// ── Items ─────────────────────────────────────────────────────────────────

server.post('/api/items', (req: Request, res: Response) => {
  const {
    title, description = '', assignedTo = [], createdBy, teamId,
    priority = 'medium', status = 'open', dueDate, tags = [], customFields = {},
  } = req.body;

  app.dispatch({
    type: 'CREATE_ITEM',
    payload: { title, description, assignedTo, createdBy, teamId, priority, status,
               dueDate, childIds: [], tags, customFields },
  });
  const items = Object.values(app.state().items);
  const created = items.at(-1)!;
  db.saveItem(created);
  res.status(201).json({ success: true, data: created });
});

server.get('/api/items/:id', (req: Request, res: Response) => {
  const item = app.runtime.getItem(req.params.id);
  if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
  res.json({ success: true, data: item });
});

server.patch('/api/items/:id', (req: Request, res: Response) => {
  app.dispatch({ type: 'UPDATE_ITEM', payload: { id: req.params.id, updates: req.body } });
  const item = app.runtime.getItem(req.params.id);
  if (item) db.saveItem(item);
  res.json({ success: true, data: item });
});

server.post('/api/items/:id/complete', (req: Request, res: Response) => {
  app.dispatch({ type: 'COMPLETE_ITEM', payload: { id: req.params.id } });
  const item = app.runtime.getItem(req.params.id);
  if (item) db.saveItem(item);
  res.json({ success: true, data: item });
});

server.post('/api/items/:id/assign', (req: Request, res: Response) => {
  const { userId } = req.body;
  app.dispatch({ type: 'ASSIGN_ITEM', payload: { itemId: req.params.id, userId } });
  const item = app.runtime.getItem(req.params.id);
  if (item) db.saveItem(item);
  res.json({ success: true, data: item });
});

// ── Compliance ────────────────────────────────────────────────────────────

server.get('/api/compliance/violations', (_req: Request, res: Response) => {
  res.json({ success: true, data: app.validateCompliance() });
});

server.get('/api/compliance/escalations', (_req: Request, res: Response) => {
  res.json({ success: true, data: app.checkEscalations() });
});

server.get('/api/compliance/report/:teamId', (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: app.getEngagementReport(req.params.teamId) });
  } catch (err) {
    res.status(400).json({ success: false, error: String(err) });
  }
});

// ── Static UI (if built) ──────────────────────────────────────────────────

const uiDist = path.join(__dirname, '../../ui/dist');
if (fs.existsSync(uiDist)) {
  server.use(express.static(uiDist));
  server.get('/', (_req, res) => res.sendFile(path.join(uiDist, 'index.html')));
} else {
  server.get('/', (_req, res) =>
    res.json({
      message: 'obix-template-node API Server',
      endpoints: ['/health', '/api/teams', '/api/items', '/api/compliance/*'],
      note: 'Build src/ui/ to serve the browser dashboard.',
    })
  );
}

// ── Error handler ─────────────────────────────────────────────────────────

server.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ── Boot ──────────────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== 'test') {
  hydrate();
  server.listen(PORT, () => {
    console.log(`
┌─────────────────────────────────────────┐
│  obix-template-node  ✅  running        │
│  http://localhost:${PORT}               │
│  REST API  →  /api/*                    │
│  DB        →  app.db (SQLite/WAL)       │
└─────────────────────────────────────────┘
    `);
  });
}

export default server;
