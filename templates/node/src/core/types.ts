/**
 * obix-template-node — Core Type Definitions
 *
 * Bioware model: Controller → Control → Controllee
 * All state transitions are typed; policy violations halt dispatch.
 */

// ─── Engagement / #NoGhosting ──────────────────────────────────────────────

export type EngagementEventType =
  | 'item_created'
  | 'item_updated'
  | 'item_assigned'
  | 'item_completed'
  | 'comment_added'
  | 'status_changed'
  | 'deadline_approaching'
  | 'reminder_sent'
  | 'acknowledgment_received'
  | 'escalation_triggered';

export interface EngagementEvent {
  id: string;
  type: EngagementEventType;
  timestamp: number;
  userId: string;
  itemId: string;
  metadata: Record<string, unknown>;
  acknowledged: boolean;
  acknowledgmentDeadline?: number;
}

// ─── Domain: Item (replace with your entity name) ─────────────────────────

export interface Item {
  id: string;
  title: string;
  description: string;

  // Hierarchy
  parentId?: string;
  childIds: string[];

  // Assignment
  assignedTo: string[];
  createdBy: string;
  teamId: string;

  // Status
  status: 'open' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';

  // Timestamps
  createdAt: number;
  updatedAt: number;
  dueDate?: number;
  completedAt?: number;

  // Engagement
  engagementEvents: EngagementEvent[];
  lastEngagementAt?: number;

  // Metadata
  tags: string[];
  customFields: Record<string, unknown>;
}

// ─── Team ─────────────────────────────────────────────────────────────────

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'maintainer' | 'contributor' | 'viewer';
  status: 'active' | 'inactive' | 'archived';
  joinedAt: number;
  lastActiveAt: number;
  settings: Record<string, unknown>;
}

export interface TeamSettings {
  visibility: 'private' | 'internal' | 'public';
  enableNotifications: boolean;
  enableReminders: boolean;
  reminderThresholdHours: number;
  escalationEnabled: boolean;
  escalationThresholdHours: number;
  requireAcknowledgment: boolean;
  acknowledgmentTimeoutHours: number;
  archiveCompletedItemsDays?: number;
}

export interface ComplianceEvent {
  id: string;
  timestamp: number;
  type:
    | 'item_created'
    | 'team_modified'
    | 'member_added'
    | 'member_removed'
    | 'policy_violation'
    | 'escalation';
  userId: string;
  teamId: string;
  details: Record<string, unknown>;
  severity: 'info' | 'warning' | 'critical';
}

export interface Team {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  members: TeamMember[];
  settings: TeamSettings;
  complianceTrail: ComplianceEvent[];
}

// ─── App State ────────────────────────────────────────────────────────────

export interface AppState {
  items: Record<string, Item>;
  teams: Record<string, Team>;
  currentTeamId: string;
  currentUserId: string;
  lastSyncAt: number;
}

// ─── Actions ──────────────────────────────────────────────────────────────

export type AppAction =
  | { type: 'CREATE_ITEM'; payload: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'engagementEvents'> }
  | { type: 'UPDATE_ITEM'; payload: { id: string; updates: Partial<Item> } }
  | { type: 'DELETE_ITEM'; payload: { id: string } }
  | { type: 'ASSIGN_ITEM'; payload: { itemId: string; userId: string } }
  | { type: 'COMPLETE_ITEM'; payload: { id: string } }
  | { type: 'ADD_ENGAGEMENT_EVENT'; payload: { itemId: string; event: EngagementEvent } }
  | { type: 'CREATE_TEAM'; payload: Omit<Team, 'id' | 'createdAt' | 'updatedAt' | 'complianceTrail'> }
  | { type: 'ADD_TEAM_MEMBER'; payload: { teamId: string; member: TeamMember } }
  | { type: 'REMOVE_TEAM_MEMBER'; payload: { teamId: string; userId: string } }
  | { type: 'ADD_COMPLIANCE_EVENT'; payload: { teamId: string; event: ComplianceEvent } };
