export const SCHEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS event_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/Rome',
  default_duration INTEGER NOT NULL DEFAULT 1800
);

CREATE TABLE IF NOT EXISTS days (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  date TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS custom_fields (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rundowns (
  id TEXT PRIMARY KEY,
  day_id TEXT NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  stage_id TEXT NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  start_time INTEGER NOT NULL DEFAULT 36000,
  revision INTEGER NOT NULL DEFAULT 0,
  UNIQUE (day_id, stage_id)
);

CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  rundown_id TEXT NOT NULL REFERENCES rundowns(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL CHECK (type IN ('event', 'block', 'delay')),
  cue TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  speakers TEXT NOT NULL DEFAULT '',
  duration INTEGER NOT NULL DEFAULT 0,
  time_start INTEGER,
  note TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  is_public INTEGER NOT NULL DEFAULT 1,
  skip INTEGER NOT NULL DEFAULT 0,
  custom TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS entries_rundown ON entries (rundown_id, sort_order);
`;
