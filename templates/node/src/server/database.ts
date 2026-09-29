/**
 * obix-template-node — SQLite Persistence Layer
 *
 * Uses Node 24's built-in `node:sqlite` module — no native compilation,
 * no build tools, no prebuild issues.  Requires Node >= 22.5.0.
 *
 * API mirrors better-sqlite3 closely so the rest of the app is unchanged.
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { Item, Team, EngagementEvent, ComplianceEvent } from '../core/index.js';

export class AppDatabase {
  private db: DatabaseSync;

  constructor(dbPath: string = path.join(process.cwd(), 'app.db')) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.migrate();
  }

  // ── Schema ─────────────────────────────────────────────────────────────

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS items (
        id            TEXT PRIMARY KEY,
        title         TEXT NOT NULL,
        description   TEXT,
        parentId      TEXT,
        assignedTo    TEXT NOT NULL,
        createdBy     TEXT NOT NULL,
        teamId        TEXT NOT NULL,
        status        TEXT NOT NULL,
        priority      TEXT NOT NULL,
        createdAt     INTEGER NOT NULL,
        updatedAt     INTEGER NOT NULL,
        dueDate       INTEGER,
        completedAt   INTEGER,
        tags          TEXT,
        customFields  TEXT
      );

      CREATE TABLE IF NOT EXISTS teams (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT,
        createdAt   INTEGER NOT NULL,
        updatedAt   INTEGER NOT NULL,
        members     TEXT NOT NULL,
        settings    TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS engagement_events (
        id                     TEXT PRIMARY KEY,
        type                   TEXT NOT NULL,
        timestamp              INTEGER NOT NULL,
        userId                 TEXT NOT NULL,
        itemId                 TEXT NOT NULL,
        metadata               TEXT,
        acknowledged           INTEGER DEFAULT 0,
        acknowledgmentDeadline INTEGER
      );

      CREATE TABLE IF NOT EXISTS compliance_events (
        id        TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        type      TEXT NOT NULL,
        userId    TEXT NOT NULL,
        teamId    TEXT NOT NULL,
        details   TEXT,
        severity  TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_items_teamId  ON items(teamId);
      CREATE INDEX IF NOT EXISTS idx_items_creator ON items(createdBy);
      CREATE INDEX IF NOT EXISTS idx_eng_itemId    ON engagement_events(itemId);
      CREATE INDEX IF NOT EXISTS idx_comp_teamId   ON compliance_events(teamId);
    `);
  }

  // ── Items ──────────────────────────────────────────────────────────────

  saveItem(item: Item): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO items
        (id, title, description, parentId, assignedTo, createdBy, teamId,
         status, priority, createdAt, updatedAt, dueDate, completedAt, tags, customFields)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      item.id,
      item.title,
      item.description,
      item.parentId ?? null,
      JSON.stringify(item.assignedTo),
      item.createdBy,
      item.teamId,
      item.status,
      item.priority,
      item.createdAt,
      item.updatedAt,
      item.dueDate ?? null,
      item.completedAt ?? null,
      JSON.stringify(item.tags),
      JSON.stringify(item.customFields),
    );
  }

  getItem(id: string): Item | null {
    const row = this.db.prepare('SELECT * FROM items WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.rowToItem(row);
  }

  getTeamItems(teamId: string): Item[] {
    const rows = this.db.prepare(
      'SELECT * FROM items WHERE teamId = ? ORDER BY createdAt DESC'
    ).all(teamId) as any[];
    return rows.map((r) => this.rowToItem(r));
  }

  deleteItem(id: string): void {
    this.db.prepare('DELETE FROM items WHERE id = ?').run(id);
  }

  private rowToItem(row: any): Item {
    return {
      ...row,
      assignedTo:   JSON.parse(row.assignedTo   || '[]'),
      tags:         JSON.parse(row.tags          || '[]'),
      customFields: JSON.parse(row.customFields  || '{}'),
      childIds:     [],
      engagementEvents: this.getEngagementEventsForItem(row.id),
    };
  }

  // ── Teams ──────────────────────────────────────────────────────────────

  saveTeam(team: Team): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO teams
        (id, name, description, createdAt, updatedAt, members, settings)
      VALUES (?,?,?,?,?,?,?)
    `).run(
      team.id,
      team.name,
      team.description,
      team.createdAt,
      team.updatedAt,
      JSON.stringify(team.members),
      JSON.stringify(team.settings),
    );
  }

  getTeam(id: string): Team | null {
    const row = this.db.prepare('SELECT * FROM teams WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.rowToTeam(row);
  }

  getAllTeams(): Team[] {
    const rows = this.db.prepare(
      'SELECT * FROM teams ORDER BY createdAt DESC'
    ).all() as any[];
    return rows.map((r) => this.rowToTeam(r));
  }

  private rowToTeam(row: any): Team {
    return {
      ...row,
      members:         JSON.parse(row.members  || '[]'),
      settings:        JSON.parse(row.settings || '{}'),
      complianceTrail: this.getComplianceEventsForTeam(row.id),
    };
  }

  // ── Engagement Events ──────────────────────────────────────────────────

  saveEngagementEvent(event: EngagementEvent): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO engagement_events
        (id, type, timestamp, userId, itemId, metadata, acknowledged, acknowledgmentDeadline)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(
      event.id,
      event.type,
      event.timestamp,
      event.userId,
      event.itemId,
      JSON.stringify(event.metadata),
      event.acknowledged ? 1 : 0,
      event.acknowledgmentDeadline ?? null,
    );
  }

  private getEngagementEventsForItem(itemId: string): EngagementEvent[] {
    const rows = this.db.prepare(
      'SELECT * FROM engagement_events WHERE itemId = ? ORDER BY timestamp ASC'
    ).all(itemId) as any[];
    return rows.map((r) => ({
      ...r,
      acknowledged: r.acknowledged === 1,
      metadata:     JSON.parse(r.metadata || '{}'),
    }));
  }

  // ── Compliance Events ──────────────────────────────────────────────────

  saveComplianceEvent(event: ComplianceEvent): void {
    this.db.prepare(`
      INSERT INTO compliance_events
        (id, timestamp, type, userId, teamId, details, severity)
      VALUES (?,?,?,?,?,?,?)
    `).run(
      event.id,
      event.timestamp,
      event.type,
      event.userId,
      event.teamId,
      JSON.stringify(event.details),
      event.severity,
    );
  }

  private getComplianceEventsForTeam(teamId: string): ComplianceEvent[] {
    const rows = this.db.prepare(
      'SELECT * FROM compliance_events WHERE teamId = ? ORDER BY timestamp DESC'
    ).all(teamId) as any[];
    return rows.map((r) => ({ ...r, details: JSON.parse(r.details || '{}') }));
  }

  // ── Stats ──────────────────────────────────────────────────────────────

  getStats(): { items: number; teams: number; events: number } {
    const c = (sql: string) => (this.db.prepare(sql).get() as any).count as number;
    return {
      items:  c('SELECT COUNT(*) as count FROM items'),
      teams:  c('SELECT COUNT(*) as count FROM teams'),
      events: c('SELECT COUNT(*) as count FROM engagement_events'),
    };
  }

  close(): void {
    this.db.close();
  }
}
