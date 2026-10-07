/** All times are stored as seconds. Clock times are seconds from midnight (may exceed 24h). */

export type EntryType = 'event' | 'block' | 'delay';

export interface EventSettings {
  name: string;
  timezone: string;
  defaultDuration: number;
}

export interface Day {
  id: string;
  label: string;
  /** ISO date (YYYY-MM-DD) or null when not decided yet. */
  date: string | null;
  sortOrder: number;
}

export interface Stage {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
}

export interface CustomField {
  id: string;
  label: string;
  color: string;
  sortOrder: number;
}

export interface Rundown {
  id: string;
  dayId: string;
  stageId: string;
  /** Start time of the first entry, seconds from midnight. */
  startTime: number;
  revision: number;
}

export interface Entry {
  id: string;
  rundownId: string;
  sortOrder: number;
  type: EntryType;
  cue: string;
  title: string;
  speakers: string;
  /** Duration in seconds. For delays, the delay amount (may be negative). */
  duration: number;
  /** Fixed start time (seconds from midnight). Null = follows the previous entry. */
  timeStart: number | null;
  note: string;
  color: string;
  isPublic: boolean;
  skip: boolean;
  /** Values of custom fields, keyed by custom field id. */
  custom: Record<string, string>;
}

/** Fields that may be set when creating or editing an entry. */
export type EntryInput = Partial<Omit<Entry, 'id' | 'rundownId' | 'sortOrder'>>;

export interface RundownSummary {
  rundownId: string;
  dayId: string;
  stageId: string;
  start: number | null;
  end: number | null;
  count: number;
}

export interface Meta {
  settings: EventSettings;
  days: Day[];
  stages: Stage[];
  customFields: CustomField[];
  summaries: RundownSummary[];
}

export interface RundownWithEntries {
  rundown: Rundown;
  entries: Entry[];
}

export interface Backup {
  format: 'utopian-hours-rundown';
  version: 1;
  exportedAt: string;
  settings: EventSettings;
  days: Day[];
  stages: Stage[];
  customFields: CustomField[];
  rundowns: Rundown[];
  entries: Entry[];
}

/** Messages pushed to clients over the websocket. */
export type ServerMessage =
  | { type: 'rundown'; rundownId: string; revision: number; origin?: string }
  | { type: 'meta'; origin?: string };
