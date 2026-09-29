/**
 * obix-template-node — #NoGhosting Policy Engine
 *
 * Compliance checks and escalation logic that run outside the reducer.
 * Import these into your runtime, server, or CLI as needed.
 */

import { AppState, Item, Team } from './types.js';

export interface PolicyViolation {
  type: string;
  itemId?: string;
  teamId?: string;
  severity: 'info' | 'warning' | 'critical';
  description: string;
}

export interface EscalationSignal {
  itemId: string;
  teamId: string;
  severity: 'warning' | 'critical';
  reason: string;
  recommendedAction: string;
}

export interface EngagementReport {
  teamId: string;
  totalItems: number;
  engagementRate: number;
  averageResponseTime: number;
  violations: PolicyViolation[];
  memberEngagement: Record<
    string,
    {
      name: string;
      itemsAssigned: number;
      itemsCompleted: number;
      itemsInProgress: number;
    }
  >;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function unassignedOpenItems(state: AppState, teamId: string): Item[] {
  return Object.values(state.items).filter(
    (i) => i.teamId === teamId && i.status === 'open' && i.assignedTo.length === 0
  );
}

function overdueItems(state: AppState, teamId: string): Item[] {
  const now = Date.now();
  return Object.values(state.items).filter(
    (i) =>
      i.teamId === teamId &&
      i.status !== 'completed' &&
      i.status !== 'cancelled' &&
      i.dueDate !== undefined &&
      i.dueDate < now
  );
}

function stalledItems(state: AppState, teamId: string, thresholdMs: number): Item[] {
  const now = Date.now();
  return Object.values(state.items).filter(
    (i) =>
      i.teamId === teamId &&
      i.status === 'in_progress' &&
      now - (i.lastEngagementAt ?? i.updatedAt) > thresholdMs
  );
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Scan all teams and return every policy violation found in the current state. */
export function validateCompliance(state: AppState): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  for (const team of Object.values(state.teams)) {
    const unassigned = unassignedOpenItems(state, team.id);
    for (const item of unassigned) {
      violations.push({
        type: 'unassigned_item',
        itemId: item.id,
        teamId: team.id,
        severity: item.priority === 'critical' ? 'critical' : 'warning',
        description: `Item "${item.title}" has no assignee.`,
      });
    }

    const overdue = overdueItems(state, team.id);
    for (const item of overdue) {
      violations.push({
        type: 'overdue_item',
        itemId: item.id,
        teamId: team.id,
        severity: item.priority === 'critical' ? 'critical' : 'warning',
        description: `Item "${item.title}" is past its due date.`,
      });
    }
  }

  return violations;
}

/** Return escalation signals for items that need human intervention. */
export function checkEscalations(state: AppState): EscalationSignal[] {
  const signals: EscalationSignal[] = [];

  for (const team of Object.values(state.teams)) {
    if (!team.settings.escalationEnabled) continue;
    const thresholdMs = team.settings.escalationThresholdHours * 3_600_000;

    for (const item of stalledItems(state, team.id, thresholdMs)) {
      signals.push({
        itemId: item.id,
        teamId: team.id,
        severity: item.priority === 'critical' ? 'critical' : 'warning',
        reason: `No activity for ${team.settings.escalationThresholdHours}h`,
        recommendedAction: 'Re-assign or unblock the item',
      });
    }

    for (const item of overdueItems(state, team.id)) {
      signals.push({
        itemId: item.id,
        teamId: team.id,
        severity: 'critical',
        reason: 'Past due date',
        recommendedAction: 'Update due date or mark complete',
      });
    }
  }

  return signals;
}

/** Produce a per-team engagement summary. */
export function getEngagementReport(state: AppState, teamId: string): EngagementReport {
  const team = state.teams[teamId];
  if (!team) throw new Error(`Team ${teamId} not found`);

  const items = Object.values(state.items).filter((i) => i.teamId === teamId);
  const completed = items.filter((i) => i.status === 'completed');

  const responseTimes = completed
    .filter((i) => i.completedAt !== undefined)
    .map((i) => i.completedAt! - i.createdAt);

  const avgResponseTime =
    responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;

  const memberEngagement: EngagementReport['memberEngagement'] = {};
  for (const member of team.members) {
    memberEngagement[member.id] = {
      name: member.name,
      itemsAssigned: items.filter((i) => i.assignedTo.includes(member.id)).length,
      itemsCompleted: items.filter(
        (i) => i.assignedTo.includes(member.id) && i.status === 'completed'
      ).length,
      itemsInProgress: items.filter(
        (i) => i.assignedTo.includes(member.id) && i.status === 'in_progress'
      ).length,
    };
  }

  return {
    teamId,
    totalItems: items.length,
    engagementRate: items.length > 0 ? completed.length / items.length : 0,
    averageResponseTime: avgResponseTime,
    violations: validateCompliance(state).filter((v) => v.teamId === teamId),
    memberEngagement,
  };
}
