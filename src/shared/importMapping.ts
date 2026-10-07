import type { CustomField, EntryInput, EntryType } from './types';
import { DAY, parseClock, parseDuration } from './time';

export const IMPORT_FIELDS = [
  'type',
  'cue',
  'title',
  'speakers',
  'timeStart',
  'start',
  'end',
  'duration',
  'note',
  'color',
  'isPublic',
  'skip',
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

export interface ImportMapping {
  /** Column index per field, or null when not mapped. */
  fields: Partial<Record<ImportField, number | null>>;
  /** Column index per custom field id. */
  custom: Record<string, number | null>;
}

export interface MapOptions {
  /** Index of the header row; data starts on the following row. */
  headerRow: number;
  defaultDuration: number;
  /** When true, start times that match the end of the previous event become "follows previous". */
  linkContiguous: boolean;
}

export interface MapResult {
  entries: EntryInput[];
  /** Start of the first event, suggested as the rundown start time. */
  startTime: number | null;
  warnings: string[];
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const SYNONYMS: Record<ImportField, string[]> = {
  type: ['tipo', 'type', 'tipologia', 'kind'],
  cue: ['cue', 'id', 'n', 'nr', 'num', 'numero', '#'],
  title: ['titolo', 'title', 'evento', 'event', 'nome', 'name', 'attivita', 'intervento', 'descrizione'],
  speakers: ['relatori', 'relatore', 'speaker', 'speakers', 'ospiti', 'ospite', 'presenter', 'chi', 'moderatore'],
  timeStart: ['orario fisso', 'inizio fisso', 'fixed start', 'time start'],
  start: ['inizio', 'start', 'ora', 'orario', 'ora inizio', 'time', 'dalle', 'from', 'begin'],
  end: ['fine', 'end', 'ora fine', 'alle', 'to', 'until'],
  duration: ['durata', 'duration', 'dur', 'minuti', 'min', 'length'],
  note: ['note', 'notes', 'nota', 'commenti', 'comments'],
  color: ['colore', 'color', 'colour'],
  isPublic: ['pubblico', 'public', 'visibile'],
  skip: ['salta', 'skip', 'saltato', 'skipped', 'escluso'],
};

/** Guesses which column holds which field from the header labels. */
export function guessMapping(headers: string[], customFields: CustomField[]): ImportMapping {
  const normalized = headers.map((h) => normalize(h ?? ''));
  const used = new Set<number>();
  const fields: ImportMapping['fields'] = {};
  const find = (candidates: string[]) => {
    const exact = normalized.findIndex((h, i) => !used.has(i) && candidates.includes(h));
    if (exact >= 0) return exact;
    return normalized.findIndex(
      (h, i) => !used.has(i) && h.length > 1 && candidates.some((c) => c.length > 2 && h.startsWith(c)),
    );
  };
  for (const field of IMPORT_FIELDS) {
    const idx = find(SYNONYMS[field]);
    if (idx >= 0) {
      fields[field] = idx;
      used.add(idx);
    }
  }
  const custom: ImportMapping['custom'] = {};
  for (const cf of customFields) {
    const idx = normalized.findIndex((h, i) => !used.has(i) && h === normalize(cf.label));
    if (idx >= 0) {
      custom[cf.id] = idx;
      used.add(idx);
    }
  }
  return { fields, custom };
}

const TRUTHY = new Set(['si', 'sì', 'yes', 'y', 'true', '1', 'x', 'v', '✓', '✔', 'vero', 'ok']);

function parseType(value: string): EntryType {
  const v = normalize(value);
  if (['blocco', 'block', 'sezione', 'section', 'header', 'titolo sezione'].includes(v)) return 'block';
  if (['ritardo', 'delay', 'slittamento'].includes(v)) return 'delay';
  return 'event';
}

/** Extracts a clock time, ignoring an eventual date part ("2026-10-16 14:30"). */
function parseCellClock(value: string): number | null {
  const v = value.trim();
  const dt = v.match(/^\d{4}-\d{2}-\d{2}[ T](\d{1,2}:\d{2}(?::\d{2})?)/);
  return parseClock(dt ? dt[1] : v);
}

function parseColor(value: string): string {
  const v = value.trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? v.toLowerCase() : '';
}

/** Turns spreadsheet rows into rundown entries according to a mapping. */
export function mapRows(rows: string[][], mapping: ImportMapping, options: MapOptions): MapResult {
  const warnings: string[] = [];
  const cell = (row: string[], field: ImportField) => {
    const idx = mapping.fields[field];
    return idx === null || idx === undefined ? '' : String(row[idx] ?? '').trim();
  };

  interface Draft {
    input: EntryInput;
    start: number | null;
    end: number | null;
    duration: number | null;
  }

  const drafts: Draft[] = [];
  rows.slice(options.headerRow + 1).forEach((row, i) => {
    if (!row || row.every((c) => String(c ?? '').trim() === '')) return;
    const line = options.headerRow + i + 2;
    const typeCell = cell(row, 'type');
    const type = typeCell ? parseType(typeCell) : 'event';
    const title = cell(row, 'title');

    const durationCell = cell(row, 'duration');
    let duration: number | null = null;
    if (durationCell) {
      duration = parseDuration(durationCell);
      if (duration === null) warnings.push(`Riga ${line}: durata "${durationCell}" non riconosciuta`);
    }

    const fixedCell = cell(row, 'timeStart');
    const startCell = fixedCell || cell(row, 'start');
    let start: number | null = null;
    if (startCell) {
      start = parseCellClock(startCell);
      if (start === null) warnings.push(`Riga ${line}: orario "${startCell}" non riconosciuto`);
    }
    const endCell = cell(row, 'end');
    const end = endCell ? parseCellClock(endCell) : null;

    const custom: Record<string, string> = {};
    for (const [fieldId, idx] of Object.entries(mapping.custom)) {
      if (idx !== null && idx !== undefined && String(row[idx] ?? '').trim()) {
        custom[fieldId] = String(row[idx]).trim();
      }
    }

    const input: EntryInput = {
      type,
      title,
      cue: cell(row, 'cue'),
      speakers: cell(row, 'speakers'),
      note: cell(row, 'note'),
      color: parseColor(cell(row, 'color')),
      isPublic: mapping.fields.isPublic == null ? true : TRUTHY.has(normalize(cell(row, 'isPublic'))),
      skip: TRUTHY.has(normalize(cell(row, 'skip'))),
      custom,
    };
    drafts.push({ input, start: type === 'event' ? start : null, end, duration });
  });

  // durations: explicit, else end - start, else until next start, else default
  drafts.forEach((d, i) => {
    if (d.input.type === 'block') {
      d.input.duration = 0;
      return;
    }
    if (d.input.type === 'delay') {
      d.input.duration = d.duration ?? 0;
      return;
    }
    if (d.duration !== null) {
      d.input.duration = Math.max(0, d.duration);
    } else if (d.start !== null && d.end !== null) {
      let diff = d.end - d.start;
      if (diff < 0) diff += DAY;
      d.input.duration = diff;
    } else if (d.start !== null) {
      const next = drafts.slice(i + 1).find((n) => n.input.type === 'event' && n.start !== null);
      d.input.duration =
        next && next.start !== null && next.start >= d.start ? next.start - d.start : options.defaultDuration;
    } else {
      d.input.duration = options.defaultDuration;
    }
  });

  // start times: fixed, optionally converting contiguous ones to "follows previous"
  let cursor: number | null = null;
  let startTime: number | null = null;
  for (const d of drafts) {
    if (d.input.type !== 'event') {
      d.input.timeStart = null;
      continue;
    }
    let start = d.start;
    if (start !== null && cursor !== null && start < cursor - DAY / 2) start += DAY; // crossed midnight
    if (startTime === null) {
      startTime = start ?? null;
      d.input.timeStart = null;
    } else if (start === null || (options.linkContiguous && cursor !== null && start === cursor)) {
      d.input.timeStart = null;
    } else {
      d.input.timeStart = start;
    }
    const effectiveStart: number = start ?? cursor ?? startTime ?? 0;
    if (!d.input.skip) cursor = effectiveStart + (d.input.duration ?? 0);
  }

  return { entries: drafts.map((d) => d.input), startTime, warnings };
}
