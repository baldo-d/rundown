export const DAY = 86400;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Parses a duration typed by a person into seconds.
 * Accepts: "90" (minutes), "1h30", "1h 30m", "45m", "30s", "1:30" (h:mm), "01:30:00", "-5".
 * Returns null when the input cannot be understood.
 */
export function parseDuration(input: string): number | null {
  let s = input.trim().toLowerCase().replace(',', '.');
  if (!s) return null;
  let sign = 1;
  if (s.startsWith('-')) {
    sign = -1;
    s = s.slice(1).trim();
  } else if (s.startsWith('+')) {
    s = s.slice(1).trim();
  }

  if (/^\d+(\.\d+)?$/.test(s)) return sign * Math.round(parseFloat(s) * 60);

  const colon = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (colon) {
    const [, h, m, sec] = colon;
    if (Number(m) > 59 || (sec !== undefined && Number(sec) > 59)) return null;
    return sign * (Number(h) * 3600 + Number(m) * 60 + Number(sec ?? 0));
  }

  const unitRe = /(\d+(?:\.\d+)?)\s*(hrs|hr|h|ore|ora|minuti|mins|min|m|′|'|secondi|sec|s|″|")?/g;
  let total = 0;
  let consumed = '';
  let lastUnit = '';
  let match: RegExpExecArray | null;
  while ((match = unitRe.exec(s))) {
    if (match[0] === '') {
      unitRe.lastIndex++;
      continue;
    }
    const value = parseFloat(match[1]);
    let unit = match[2] ?? '';
    // "1h30" -> the trailing number without unit means minutes after hours
    if (!unit) unit = lastUnit === 'h' ? 'm' : lastUnit === 'm' ? 's' : 'm';
    if (['h', 'ore', 'ora', 'hr', 'hrs'].includes(unit)) {
      total += value * 3600;
      lastUnit = 'h';
    } else if (['m', 'min', 'mins', 'minuti', '′', "'"].includes(unit)) {
      total += value * 60;
      lastUnit = 'm';
    } else {
      total += value;
      lastUnit = 's';
    }
    consumed += match[0];
  }
  if (consumed.replace(/\s/g, '') !== s.replace(/\s/g, '')) return null;
  return sign * Math.round(total);
}

/**
 * Parses a clock time typed by a person into seconds from midnight.
 * Accepts: "14:30", "14.30", "14,30", "1430", "930", "14", "14:30:15", "2:30pm", "9am".
 */
export function parseClock(input: string): number | null {
  let s = input.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  let meridiem: 'am' | 'pm' | null = null;
  const mer = s.match(/(am|pm|a|p)$/);
  if (mer) {
    meridiem = mer[1].startsWith('a') ? 'am' : 'pm';
    s = s.slice(0, -mer[1].length);
  }
  let h: number;
  let m = 0;
  let sec = 0;
  const sep = s.match(/^(\d{1,2})[:.,h](\d{1,2})(?:[:.,](\d{1,2}))?$/);
  if (sep) {
    h = Number(sep[1]);
    m = Number(sep[2]);
    sec = Number(sep[3] ?? 0);
  } else if (/^\d{1,2}$/.test(s)) {
    h = Number(s);
  } else if (/^\d{3,4}$/.test(s)) {
    h = Number(s.slice(0, -2));
    m = Number(s.slice(-2));
  } else if (/^\d{6}$/.test(s)) {
    h = Number(s.slice(0, 2));
    m = Number(s.slice(2, 4));
    sec = Number(s.slice(4));
  } else {
    return null;
  }
  if (meridiem) {
    if (h < 1 || h > 12) return null;
    if (meridiem === 'am' && h === 12) h = 0;
    if (meridiem === 'pm' && h !== 12) h += 12;
  }
  if (h > 47 || m > 59 || sec > 59) return null;
  return h * 3600 + m * 60 + sec;
}

/** Formats seconds from midnight as HH:MM (or HH:MM:SS). Times past midnight wrap around. */
export function formatClock(value: number | null | undefined, withSeconds = false): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  const v = ((Math.round(value) % DAY) + DAY) % DAY;
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const s = v % 60;
  return withSeconds || s !== 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}`;
}

/** True when the time is on the following day (crossed midnight). */
export function isNextDay(value: number | null | undefined): boolean {
  return value !== null && value !== undefined && value >= DAY;
}

/** Compact human duration: "1h 30m", "45m", "2m 30s", "0m". */
export function formatDuration(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  const sign = value < 0 ? '-' : '';
  const v = Math.abs(Math.round(value));
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const s = v % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m || (!h && !s)) parts.push(`${m}m`);
  if (s) parts.push(`${s}s`);
  return sign + parts.join(' ');
}

/** Duration as HH:MM:SS, used in exports. */
export function formatDurationHMS(value: number): string {
  const sign = value < 0 ? '-' : '';
  const v = Math.abs(Math.round(value));
  return `${sign}${pad(Math.floor(v / 3600))}:${pad(Math.floor((v % 3600) / 60))}:${pad(v % 60)}`;
}
