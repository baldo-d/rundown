import type { Entry } from './types';

export interface TimelineRow {
  entry: Entry;
  /** Scheduled start (without delays). For blocks: start of their first event. */
  start: number;
  /** Scheduled end (without delays). For blocks: end of their last event. */
  end: number;
  /** Accumulated delay applied to this row (seconds, may be negative). */
  delay: number;
  /**
   * Difference between this event's fixed start and the end of the previous event.
   * Positive = gap (dead time), negative = overlap. 0 or null when contiguous / not applicable.
   */
  gap: number | null;
  /** Id of the block this row belongs to, if any. */
  blockId: string | null;
  /** For blocks: number of (non skipped) events contained. */
  blockCount?: number;
}

export interface Timeline {
  rows: TimelineRow[];
  /** Start of the first scheduled event, or null if there are none. */
  start: number | null;
  /** End of the last scheduled event (without delays). */
  end: number | null;
  /** End including accumulated delays. */
  expectedEnd: number | null;
  /** Sum of the durations of scheduled events. */
  totalDuration: number;
  /** Accumulated delay at the end of the rundown. */
  totalDelay: number;
  eventCount: number;
}

/**
 * Computes the schedule of a rundown.
 *
 * - Events without a fixed start follow the previous event (or the rundown start).
 * - Events with a fixed start begin at that time; the difference with the previous
 *   event end is reported as a gap (positive) or overlap (negative).
 * - Delay entries shift every following event by their duration.
 * - Skipped events are listed but do not advance the clock.
 * - Blocks are headers; their start/end span the events until the next block.
 */
export function computeTimeline(entries: Entry[], rundownStart: number): Timeline {
  const rows: TimelineRow[] = [];
  let cursor = rundownStart;
  let delay = 0;
  let firstStart: number | null = null;
  let lastEnd: number | null = null;
  let totalDuration = 0;
  let eventCount = 0;
  let currentBlock: TimelineRow | null = null;
  let hadEvent = false;

  for (const entry of entries) {
    if (entry.type === 'block') {
      const row: TimelineRow = {
        entry,
        start: cursor,
        end: cursor,
        delay,
        gap: null,
        blockId: null,
        blockCount: 0,
      };
      rows.push(row);
      currentBlock = row;
      continue;
    }

    if (entry.type === 'delay') {
      delay += entry.skip ? 0 : entry.duration;
      rows.push({
        entry,
        start: cursor,
        end: cursor,
        delay,
        gap: null,
        blockId: currentBlock?.entry.id ?? null,
      });
      continue;
    }

    // event
    const fixed = entry.timeStart;
    const start = fixed ?? cursor;
    const end = start + Math.max(0, entry.duration);
    const gap = fixed !== null && hadEvent ? fixed - cursor : null;
    rows.push({
      entry,
      start,
      end,
      delay,
      gap: gap === 0 ? null : gap,
      blockId: currentBlock?.entry.id ?? null,
    });
    if (entry.skip) continue;

    if (currentBlock) {
      if (currentBlock.blockCount === 0) currentBlock.start = start;
      currentBlock.end = end;
      currentBlock.blockCount = (currentBlock.blockCount ?? 0) + 1;
    }
    if (firstStart === null) firstStart = start;
    lastEnd = end;
    cursor = end;
    hadEvent = true;
    totalDuration += Math.max(0, entry.duration);
    eventCount++;
  }

  // empty blocks collapse onto the following cursor position
  for (const row of rows) {
    if (row.entry.type === 'block' && row.blockCount === 0) row.end = row.start;
  }

  return {
    rows,
    start: firstStart,
    end: lastEnd,
    expectedEnd: lastEnd === null ? null : lastEnd + delay,
    totalDuration,
    totalDelay: delay,
    eventCount,
  };
}
