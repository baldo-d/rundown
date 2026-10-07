import { randomUUID } from 'node:crypto';
import type { SQLInputValue } from 'node:sqlite';
import type {
  Backup,
  CustomField,
  Day,
  Entry,
  EntryInput,
  EventSettings,
  Meta,
  Rundown,
  RundownSummary,
  Stage,
} from '../shared/types';
import { computeTimeline } from '../shared/timeline';
import { type Db, tx } from './db';

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} non trovato`);
  }
}

type Row = Record<string, unknown>;

const toDay = (r: Row): Day => ({
  id: r.id as string,
  label: r.label as string,
  date: (r.date as string | null) ?? null,
  sortOrder: r.sort_order as number,
});

const toStage = (r: Row): Stage => ({
  id: r.id as string,
  name: r.name as string,
  color: r.color as string,
  sortOrder: r.sort_order as number,
});

const toCustomField = (r: Row): CustomField => ({
  id: r.id as string,
  label: r.label as string,
  color: r.color as string,
  sortOrder: r.sort_order as number,
});

const toRundown = (r: Row): Rundown => ({
  id: r.id as string,
  dayId: r.day_id as string,
  stageId: r.stage_id as string,
  startTime: r.start_time as number,
  revision: r.revision as number,
});

const toEntry = (r: Row): Entry => ({
  id: r.id as string,
  rundownId: r.rundown_id as string,
  sortOrder: r.sort_order as number,
  type: r.type as Entry['type'],
  cue: r.cue as string,
  title: r.title as string,
  speakers: r.speakers as string,
  duration: r.duration as number,
  timeStart: (r.time_start as number | null) ?? null,
  note: r.note as string,
  color: r.color as string,
  isPublic: Boolean(r.is_public),
  skip: Boolean(r.skip),
  custom: JSON.parse((r.custom as string) || '{}'),
});

/** Maps entry fields to SQL columns. */
const ENTRY_COLUMNS: Record<keyof EntryInput, string> = {
  type: 'type',
  cue: 'cue',
  title: 'title',
  speakers: 'speakers',
  duration: 'duration',
  timeStart: 'time_start',
  note: 'note',
  color: 'color',
  isPublic: 'is_public',
  skip: 'skip',
  custom: 'custom',
};

function entryValue(key: keyof EntryInput, value: unknown): SQLInputValue {
  if (key === 'isPublic' || key === 'skip') return value ? 1 : 0;
  if (key === 'custom') return JSON.stringify(value ?? {});
  return value as SQLInputValue;
}

export class Repo {
  constructor(readonly db: Db) {}

  // ---------- settings ----------

  getSettings(): EventSettings {
    const r = this.db.prepare('SELECT * FROM event_settings WHERE id = 1').get() as Row | undefined;
    if (!r) return { name: 'Utopian Hours 2026', timezone: 'Europe/Rome', defaultDuration: 1800 };
    return {
      name: r.name as string,
      timezone: r.timezone as string,
      defaultDuration: r.default_duration as number,
    };
  }

  updateSettings(patch: Partial<EventSettings>): EventSettings {
    const next = { ...this.getSettings(), ...patch };
    this.db
      .prepare(
        `INSERT INTO event_settings (id, name, timezone, default_duration) VALUES (1, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name, timezone = excluded.timezone,
         default_duration = excluded.default_duration`,
      )
      .run(next.name, next.timezone, next.defaultDuration);
    return next;
  }

  // ---------- generic ordered lists (days, stages, custom fields) ----------

  private nextOrder(table: 'days' | 'stages' | 'custom_fields'): number {
    const r = this.db.prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM ${table}`).get() as Row;
    return r.n as number;
  }

  private reorderTable(table: 'days' | 'stages' | 'custom_fields', ids: string[]) {
    tx(this.db, () => {
      const stmt = this.db.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`);
      ids.forEach((id, i) => stmt.run(i, id));
    });
  }

  private deleteFrom(table: 'days' | 'stages' | 'custom_fields', id: string, what: string) {
    const res = this.db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    if (res.changes === 0) throw new NotFoundError(what);
  }

  // ---------- days ----------

  listDays(): Day[] {
    return (this.db.prepare('SELECT * FROM days ORDER BY sort_order, date, label').all() as Row[]).map(toDay);
  }

  createDay(input: { label?: string; date?: string | null }): Day {
    const day: Day = {
      id: randomUUID(),
      label: input.label ?? `Giorno ${this.listDays().length + 1}`,
      date: input.date ?? null,
      sortOrder: this.nextOrder('days'),
    };
    this.db
      .prepare('INSERT INTO days (id, label, date, sort_order) VALUES (?, ?, ?, ?)')
      .run(day.id, day.label, day.date, day.sortOrder);
    return day;
  }

  updateDay(id: string, patch: { label?: string; date?: string | null }): Day {
    const current = this.listDays().find((d) => d.id === id);
    if (!current) throw new NotFoundError('Giorno');
    const next = { ...current, ...patch };
    this.db.prepare('UPDATE days SET label = ?, date = ? WHERE id = ?').run(next.label, next.date, id);
    return next;
  }

  deleteDay(id: string) {
    this.deleteFrom('days', id, 'Giorno');
  }

  reorderDays(ids: string[]) {
    this.reorderTable('days', ids);
  }

  // ---------- stages ----------

  listStages(): Stage[] {
    return (this.db.prepare('SELECT * FROM stages ORDER BY sort_order, name').all() as Row[]).map(toStage);
  }

  createStage(input: { name?: string; color?: string }): Stage {
    const stage: Stage = {
      id: randomUUID(),
      name: input.name ?? `Palco ${this.listStages().length + 1}`,
      color: input.color ?? '#779be7',
      sortOrder: this.nextOrder('stages'),
    };
    this.db
      .prepare('INSERT INTO stages (id, name, color, sort_order) VALUES (?, ?, ?, ?)')
      .run(stage.id, stage.name, stage.color, stage.sortOrder);
    return stage;
  }

  updateStage(id: string, patch: { name?: string; color?: string }): Stage {
    const current = this.listStages().find((s) => s.id === id);
    if (!current) throw new NotFoundError('Palco');
    const next = { ...current, ...patch };
    this.db.prepare('UPDATE stages SET name = ?, color = ? WHERE id = ?').run(next.name, next.color, id);
    return next;
  }

  deleteStage(id: string) {
    this.deleteFrom('stages', id, 'Palco');
  }

  reorderStages(ids: string[]) {
    this.reorderTable('stages', ids);
  }

  // ---------- custom fields ----------

  listCustomFields(): CustomField[] {
    return (this.db.prepare('SELECT * FROM custom_fields ORDER BY sort_order, label').all() as Row[]).map(
      toCustomField,
    );
  }

  createCustomField(input: { label?: string; color?: string }): CustomField {
    const field: CustomField = {
      id: randomUUID(),
      label: input.label ?? 'Nuovo campo',
      color: input.color ?? '#9d9d9d',
      sortOrder: this.nextOrder('custom_fields'),
    };
    this.db
      .prepare('INSERT INTO custom_fields (id, label, color, sort_order) VALUES (?, ?, ?, ?)')
      .run(field.id, field.label, field.color, field.sortOrder);
    return field;
  }

  updateCustomField(id: string, patch: { label?: string; color?: string }): CustomField {
    const current = this.listCustomFields().find((f) => f.id === id);
    if (!current) throw new NotFoundError('Campo');
    const next = { ...current, ...patch };
    this.db.prepare('UPDATE custom_fields SET label = ?, color = ? WHERE id = ?').run(next.label, next.color, id);
    return next;
  }

  deleteCustomField(id: string) {
    this.deleteFrom('custom_fields', id, 'Campo');
  }

  reorderCustomFields(ids: string[]) {
    this.reorderTable('custom_fields', ids);
  }

  // ---------- rundowns ----------

  listRundowns(): Rundown[] {
    return (this.db.prepare('SELECT * FROM rundowns').all() as Row[]).map(toRundown);
  }

  getRundown(id: string): Rundown {
    const r = this.db.prepare('SELECT * FROM rundowns WHERE id = ?').get(id) as Row | undefined;
    if (!r) throw new NotFoundError('Scaletta');
    return toRundown(r);
  }

  /** Returns the rundown for a day/stage pair, creating it if needed. */
  ensureRundown(dayId: string, stageId: string): Rundown {
    const r = this.db.prepare('SELECT * FROM rundowns WHERE day_id = ? AND stage_id = ?').get(dayId, stageId) as
      | Row
      | undefined;
    if (r) return toRundown(r);
    if (!this.db.prepare('SELECT 1 FROM days WHERE id = ?').get(dayId)) throw new NotFoundError('Giorno');
    if (!this.db.prepare('SELECT 1 FROM stages WHERE id = ?').get(stageId)) throw new NotFoundError('Palco');
    const rundown: Rundown = { id: randomUUID(), dayId, stageId, startTime: 10 * 3600, revision: 0 };
    this.db
      .prepare('INSERT INTO rundowns (id, day_id, stage_id, start_time, revision) VALUES (?, ?, ?, ?, ?)')
      .run(rundown.id, dayId, stageId, rundown.startTime, 0);
    return rundown;
  }

  updateRundown(id: string, patch: { startTime: number }): Rundown {
    this.getRundown(id);
    this.db.prepare('UPDATE rundowns SET start_time = ? WHERE id = ?').run(patch.startTime, id);
    return this.bump(id);
  }

  /** Increments the revision of a rundown and returns it. */
  bump(rundownId: string): Rundown {
    this.db.prepare('UPDATE rundowns SET revision = revision + 1 WHERE id = ?').run(rundownId);
    return this.getRundown(rundownId);
  }

  // ---------- entries ----------

  listEntries(rundownId: string): Entry[] {
    return (
      this.db.prepare('SELECT * FROM entries WHERE rundown_id = ? ORDER BY sort_order').all(rundownId) as Row[]
    ).map(toEntry);
  }

  getEntry(id: string): Entry {
    const r = this.db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as Row | undefined;
    if (!r) throw new NotFoundError('Voce');
    return toEntry(r);
  }

  private insertEntry(rundownId: string, sortOrder: number, input: EntryInput): Entry {
    const settings = this.getSettings();
    const type = input.type ?? 'event';
    const entry: Entry = {
      id: randomUUID(),
      rundownId,
      sortOrder,
      type,
      cue: input.cue ?? '',
      title: input.title ?? '',
      speakers: input.speakers ?? '',
      duration: input.duration ?? (type === 'event' ? settings.defaultDuration : type === 'delay' ? 300 : 0),
      timeStart: type === 'event' ? (input.timeStart ?? null) : null,
      note: input.note ?? '',
      color: input.color ?? '',
      isPublic: input.isPublic ?? true,
      skip: input.skip ?? false,
      custom: input.custom ?? {},
    };
    this.db
      .prepare(
        `INSERT INTO entries (id, rundown_id, sort_order, type, cue, title, speakers, duration, time_start,
          note, color, is_public, skip, custom) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.id,
        rundownId,
        sortOrder,
        entry.type,
        entry.cue,
        entry.title,
        entry.speakers,
        entry.duration,
        entry.timeStart,
        entry.note,
        entry.color,
        entry.isPublic ? 1 : 0,
        entry.skip ? 1 : 0,
        JSON.stringify(entry.custom),
      );
    return entry;
  }

  private writeOrder(ids: string[]) {
    const stmt = this.db.prepare('UPDATE entries SET sort_order = ? WHERE id = ?');
    ids.forEach((id, i) => stmt.run(i, id));
  }

  /** Creates an entry after `afterId` (undefined = at the end, null = at the top). */
  createEntry(rundownId: string, input: EntryInput, afterId?: string | null): Entry {
    this.getRundown(rundownId);
    return tx(this.db, () => {
      const ids = this.listEntries(rundownId).map((e) => e.id);
      let index = ids.length;
      if (afterId === null) index = 0;
      else if (afterId !== undefined) {
        const pos = ids.indexOf(afterId);
        if (pos >= 0) index = pos + 1;
      }
      const entry = this.insertEntry(rundownId, index, input);
      ids.splice(index, 0, entry.id);
      this.writeOrder(ids);
      this.bump(rundownId);
      return { ...entry, sortOrder: index };
    });
  }

  updateEntries(ids: string[], patch: EntryInput): Set<string> {
    const keys = (Object.keys(patch) as (keyof EntryInput)[]).filter(
      (k) => k in ENTRY_COLUMNS && patch[k] !== undefined && k !== 'custom',
    );
    const touched = new Set<string>();
    tx(this.db, () => {
      for (const id of ids) {
        const entry = this.getEntry(id);
        const sets = keys.map((k) => `${ENTRY_COLUMNS[k]} = ?`);
        const values = keys.map((k) => entryValue(k, patch[k]));
        if (patch.custom) {
          // merge custom values; empty strings remove the key
          const merged = { ...entry.custom, ...patch.custom };
          for (const [k, v] of Object.entries(merged)) if (v === '') delete merged[k];
          sets.push('custom = ?');
          values.push(JSON.stringify(merged));
        }
        // only events can have a fixed start time
        const type = patch.type ?? entry.type;
        if (type !== 'event') {
          const i = keys.indexOf('timeStart');
          if (i >= 0) {
            sets.splice(i, 1);
            values.splice(i, 1);
          }
          if (entry.timeStart !== null) sets.push('time_start = NULL');
        }
        if (sets.length) {
          this.db.prepare(`UPDATE entries SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
        }
        touched.add(entry.rundownId);
      }
      touched.forEach((rid) => this.bump(rid));
    });
    return touched;
  }

  updateEntry(id: string, patch: EntryInput): Entry {
    this.updateEntries([id], patch);
    return this.getEntry(id);
  }

  deleteEntries(ids: string[]): Set<string> {
    const touched = new Set<string>();
    tx(this.db, () => {
      for (const id of ids) {
        const r = this.db.prepare('SELECT rundown_id FROM entries WHERE id = ?').get(id) as Row | undefined;
        if (!r) continue;
        this.db.prepare('DELETE FROM entries WHERE id = ?').run(id);
        touched.add(r.rundown_id as string);
      }
      touched.forEach((rid) => {
        this.writeOrder(this.listEntries(rid).map((e) => e.id));
        this.bump(rid);
      });
    });
    return touched;
  }

  duplicateEntries(ids: string[]): Entry[] {
    if (ids.length === 0) return [];
    const originals = ids.map((id) => this.getEntry(id));
    const rundownId = originals[0].rundownId;
    if (originals.some((e) => e.rundownId !== rundownId)) throw new Error('Voci di scalette diverse');
    return tx(this.db, () => {
      const order = this.listEntries(rundownId).map((e) => e.id);
      const sorted = [...originals].sort((a, b) => a.sortOrder - b.sortOrder);
      const insertAfter = sorted[sorted.length - 1].id;
      const copies = sorted.map((e) => {
        const { id: _id, rundownId: _r, sortOrder: _s, ...input } = e;
        return this.insertEntry(rundownId, 0, input);
      });
      order.splice(order.indexOf(insertAfter) + 1, 0, ...copies.map((c) => c.id));
      this.writeOrder(order);
      this.bump(rundownId);
      return copies.map((c) => this.getEntry(c.id));
    });
  }

  /** Sets the order of a rundown's entries. Unknown ids are ignored, missing ones are appended. */
  reorderEntries(rundownId: string, ids: string[]): Rundown {
    this.getRundown(rundownId);
    return tx(this.db, () => {
      const current = this.listEntries(rundownId).map((e) => e.id);
      const known = new Set(current);
      const ordered = ids.filter((id) => known.has(id));
      const seen = new Set(ordered);
      for (const id of current) if (!seen.has(id)) ordered.push(id);
      this.writeOrder(ordered);
      return this.bump(rundownId);
    });
  }

  /** Imports entries into a rundown, replacing or appending. */
  importEntries(rundownId: string, entries: EntryInput[], mode: 'replace' | 'append', startTime?: number): Rundown {
    this.getRundown(rundownId);
    return tx(this.db, () => {
      if (mode === 'replace') this.db.prepare('DELETE FROM entries WHERE rundown_id = ?').run(rundownId);
      if (startTime !== undefined) {
        this.db.prepare('UPDATE rundowns SET start_time = ? WHERE id = ?').run(startTime, rundownId);
      }
      let order = this.listEntries(rundownId).length;
      for (const input of entries) this.insertEntry(rundownId, order++, input);
      return this.bump(rundownId);
    });
  }

  // ---------- aggregate ----------

  summaries(): RundownSummary[] {
    return this.listRundowns().map((r) => {
      const timeline = computeTimeline(this.listEntries(r.id), r.startTime);
      return {
        rundownId: r.id,
        dayId: r.dayId,
        stageId: r.stageId,
        start: timeline.start,
        end: timeline.expectedEnd,
        count: timeline.eventCount,
      };
    });
  }

  meta(): Meta {
    return {
      settings: this.getSettings(),
      days: this.listDays(),
      stages: this.listStages(),
      customFields: this.listCustomFields(),
      summaries: this.summaries(),
    };
  }

  backup(): Backup {
    const rundowns = this.listRundowns();
    return {
      format: 'utopian-hours-rundown',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: this.getSettings(),
      days: this.listDays(),
      stages: this.listStages(),
      customFields: this.listCustomFields(),
      rundowns,
      entries: rundowns.flatMap((r) => this.listEntries(r.id)),
    };
  }

  /** Replaces the whole database content with a backup. */
  restore(backup: Backup) {
    tx(this.db, () => {
      for (const t of ['entries', 'rundowns', 'days', 'stages', 'custom_fields']) {
        this.db.exec(`DELETE FROM ${t}`);
      }
      this.updateSettings(backup.settings);
      const day = this.db.prepare('INSERT INTO days (id, label, date, sort_order) VALUES (?, ?, ?, ?)');
      backup.days.forEach((d) => day.run(d.id, d.label, d.date, d.sortOrder));
      const stage = this.db.prepare('INSERT INTO stages (id, name, color, sort_order) VALUES (?, ?, ?, ?)');
      backup.stages.forEach((s) => stage.run(s.id, s.name, s.color, s.sortOrder));
      const field = this.db.prepare('INSERT INTO custom_fields (id, label, color, sort_order) VALUES (?, ?, ?, ?)');
      backup.customFields.forEach((f) => field.run(f.id, f.label, f.color, f.sortOrder));
      const rundown = this.db.prepare(
        'INSERT INTO rundowns (id, day_id, stage_id, start_time, revision) VALUES (?, ?, ?, ?, ?)',
      );
      backup.rundowns.forEach((r) => rundown.run(r.id, r.dayId, r.stageId, r.startTime, r.revision + 1));
      const entry = this.db.prepare(
        `INSERT INTO entries (id, rundown_id, sort_order, type, cue, title, speakers, duration, time_start,
          note, color, is_public, skip, custom) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      backup.entries.forEach((e) =>
        entry.run(
          e.id,
          e.rundownId,
          e.sortOrder,
          e.type,
          e.cue,
          e.title,
          e.speakers,
          e.duration,
          e.timeStart,
          e.note,
          e.color,
          e.isPublic ? 1 : 0,
          e.skip ? 1 : 0,
          JSON.stringify(e.custom),
        ),
      );
    });
  }

  isEmpty(): boolean {
    const r = this.db.prepare('SELECT (SELECT COUNT(*) FROM days) + (SELECT COUNT(*) FROM stages) AS n').get() as Row;
    return r.n === 0 && !this.db.prepare('SELECT 1 FROM event_settings').get();
  }
}
