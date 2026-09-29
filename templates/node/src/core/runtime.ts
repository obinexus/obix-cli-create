/**
 * obix-template-node — App Runtime
 *
 * Controller → Control → Controllee pattern.
 * The runtime holds state, dispatches actions, enforces named policies,
 * and notifies subscribers — all synchronously and without a virtual DOM.
 */

import { v4 as uuid } from 'uuid';
import {
  AppState,
  AppAction,
  Item,
  Team,
  EngagementEvent,
  ComplianceEvent,
  TeamMember,
} from './types.js';

export class AppRuntime {
  private state: AppState;
  private subscribers = new Set<(state: AppState) => void>();
  private policies = new Map<string, (state: AppState) => boolean>();

  constructor(initial: Partial<AppState> = {}) {
    this.state = {
      items: {},
      teams: {},
      currentTeamId: '',
      currentUserId: '',
      lastSyncAt: Date.now(),
      ...initial,
    };

    this.registerDefaultPolicies();
  }

  // ── Policies ────────────────────────────────────────────────────────────

  /** Register a named guard; return false to halt any dispatch. */
  addPolicy(name: string, fn: (state: AppState) => boolean): void {
    this.policies.set(name, fn);
  }

  private registerDefaultPolicies(): void {
    // #NoGhosting: open items must have at least one assignee
    this.addPolicy('require_assignment', (s) => {
      const team = s.teams[s.currentTeamId];
      if (!team) return true;
      for (const item of Object.values(s.items)) {
        if (item.teamId === s.currentTeamId && item.status === 'open' && item.assignedTo.length === 0) {
          return false;
        }
      }
      return true;
    });

    // Critical items must be acknowledged within the team timeout
    this.addPolicy('critical_acknowledgment', (s) => {
      const team = s.teams[s.currentTeamId];
      if (!team?.settings.requireAcknowledgment) return true;
      const now = Date.now();
      const timeoutMs = team.settings.acknowledgmentTimeoutHours * 3_600_000;
      for (const item of Object.values(s.items)) {
        if (item.teamId !== s.currentTeamId || item.priority !== 'critical') continue;
        const last = item.engagementEvents.at(-1);
        if (last && !last.acknowledged && now - last.timestamp > timeoutMs) return false;
      }
      return true;
    });
  }

  private runPolicies(): string[] {
    const violations: string[] = [];
    for (const [name, fn] of this.policies) {
      if (!fn(this.state)) violations.push(name);
    }
    return violations;
  }

  // ── State access ────────────────────────────────────────────────────────

  getState(): AppState {
    return this.state;
  }

  subscribe(cb: (state: AppState) => void): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  private notify(): void {
    for (const cb of this.subscribers) cb(this.state);
  }

  // ── Dispatch ────────────────────────────────────────────────────────────

  dispatch(action: AppAction): void {
    this.state = this.reduce(this.state, action);
    this.notify();
  }

  private reduce(state: AppState, action: AppAction): AppState {
    switch (action.type) {
      case 'CREATE_ITEM': {
        const id = uuid();
        const now = Date.now();
        const item: Item = {
          ...action.payload,
          id,
          createdAt: now,
          updatedAt: now,
          engagementEvents: [],
        };
        return { ...state, items: { ...state.items, [id]: item } };
      }

      case 'UPDATE_ITEM': {
        const existing = state.items[action.payload.id];
        if (!existing) return state;
        const updated: Item = { ...existing, ...action.payload.updates, updatedAt: Date.now() };
        return { ...state, items: { ...state.items, [updated.id]: updated } };
      }

      case 'DELETE_ITEM': {
        const { [action.payload.id]: _removed, ...rest } = state.items;
        return { ...state, items: rest };
      }

      case 'ASSIGN_ITEM': {
        const item = state.items[action.payload.itemId];
        if (!item) return state;
        const assignedTo = Array.from(new Set([...item.assignedTo, action.payload.userId]));
        return {
          ...state,
          items: { ...state.items, [item.id]: { ...item, assignedTo, updatedAt: Date.now() } },
        };
      }

      case 'COMPLETE_ITEM': {
        const item = state.items[action.payload.id];
        if (!item) return state;
        const completed: Item = {
          ...item,
          status: 'completed',
          completedAt: Date.now(),
          updatedAt: Date.now(),
        };
        return { ...state, items: { ...state.items, [completed.id]: completed } };
      }

      case 'ADD_ENGAGEMENT_EVENT': {
        const item = state.items[action.payload.itemId];
        if (!item) return state;
        const withEvent: Item = {
          ...item,
          engagementEvents: [...item.engagementEvents, action.payload.event],
          lastEngagementAt: action.payload.event.timestamp,
          updatedAt: Date.now(),
        };
        return { ...state, items: { ...state.items, [withEvent.id]: withEvent } };
      }

      case 'CREATE_TEAM': {
        const id = uuid();
        const now = Date.now();
        const team: Team = {
          ...action.payload,
          id,
          createdAt: now,
          updatedAt: now,
          complianceTrail: [],
        };
        return { ...state, teams: { ...state.teams, [id]: team } };
      }

      case 'ADD_TEAM_MEMBER': {
        const team = state.teams[action.payload.teamId];
        if (!team) return state;
        const updated: Team = {
          ...team,
          members: [...team.members, action.payload.member],
          updatedAt: Date.now(),
        };
        return { ...state, teams: { ...state.teams, [updated.id]: updated } };
      }

      case 'REMOVE_TEAM_MEMBER': {
        const team = state.teams[action.payload.teamId];
        if (!team) return state;
        const updated: Team = {
          ...team,
          members: team.members.filter((m) => m.id !== action.payload.userId),
          updatedAt: Date.now(),
        };
        return { ...state, teams: { ...state.teams, [updated.id]: updated } };
      }

      case 'ADD_COMPLIANCE_EVENT': {
        const team = state.teams[action.payload.teamId];
        if (!team) return state;
        const updated: Team = {
          ...team,
          complianceTrail: [action.payload.event, ...team.complianceTrail],
          updatedAt: Date.now(),
        };
        return { ...state, teams: { ...state.teams, [updated.id]: updated } };
      }

      default:
        return state;
    }
  }

  // ── Query helpers ────────────────────────────────────────────────────────

  getItem(id: string): Item | undefined {
    return this.state.items[id];
  }

  getTeam(id: string): Team | undefined {
    return this.state.teams[id];
  }

  getTeamItems(teamId: string): Item[] {
    return Object.values(this.state.items).filter((i) => i.teamId === teamId);
  }

  getMemberItems(userId: string): Item[] {
    return Object.values(this.state.items).filter((i) => i.assignedTo.includes(userId));
  }

  validatePolicies(): string[] {
    return this.runPolicies();
  }
}
