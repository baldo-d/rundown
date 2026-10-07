import { describe, expect, it } from 'vitest';
import { computeTimeline } from '../src/shared/timeline';
import { entry, h, min } from './helpers';

describe('computeTimeline', () => {
  it('chains linked events from the rundown start', () => {
    const t = computeTimeline(
      [entry({ duration: min(30) }), entry({ duration: min(15) }), entry({ duration: min(45) })],
      h(10),
    );
    expect(t.rows.map((r) => [r.start, r.end])).toEqual([
      [h(10), h(10, 30)],
      [h(10, 30), h(10, 45)],
      [h(10, 45), h(11, 30)],
    ]);
    expect(t.start).toBe(h(10));
    expect(t.end).toBe(h(11, 30));
    expect(t.totalDuration).toBe(min(90));
    expect(t.eventCount).toBe(3);
  });

  it('reports gaps and overlaps for fixed start times', () => {
    const t = computeTimeline(
      [
        entry({ duration: min(30) }),
        entry({ duration: min(30), timeStart: h(11) }), // 30 min gap
        entry({ duration: min(30), timeStart: h(11, 15) }), // 15 min overlap
        entry({ duration: min(10) }), // follows the previous
      ],
      h(10),
    );
    expect(t.rows[1].gap).toBe(min(30));
    expect(t.rows[1].start).toBe(h(11));
    expect(t.rows[2].gap).toBe(-min(15));
    expect(t.rows[3].start).toBe(h(11, 45));
    expect(t.rows[3].gap).toBeNull();
  });

  it('uses a fixed start on the first event without reporting a gap', () => {
    const t = computeTimeline([entry({ duration: min(30), timeStart: h(9) })], h(10));
    expect(t.rows[0].start).toBe(h(9));
    expect(t.rows[0].gap).toBeNull();
    expect(t.start).toBe(h(9));
  });

  it('accumulates delays on following events only', () => {
    const t = computeTimeline(
      [
        entry({ duration: min(30) }),
        entry({ type: 'delay', duration: min(5) }),
        entry({ duration: min(30) }),
        entry({ type: 'delay', duration: -min(2) }),
        entry({ duration: min(30) }),
      ],
      h(10),
    );
    expect(t.rows.map((r) => r.delay)).toEqual([0, min(5), min(5), min(3), min(3)]);
    // delays do not change the scheduled times
    expect(t.rows[2].start).toBe(h(10, 30));
    expect(t.end).toBe(h(11, 30));
    expect(t.expectedEnd).toBe(h(11, 33));
    expect(t.totalDelay).toBe(min(3));
  });

  it('skips skipped events and skipped delays', () => {
    const t = computeTimeline(
      [
        entry({ duration: min(30) }),
        entry({ duration: min(60), skip: true }),
        entry({ type: 'delay', duration: min(10), skip: true }),
        entry({ duration: min(30) }),
      ],
      h(10),
    );
    expect(t.rows[3].start).toBe(h(10, 30));
    expect(t.rows[3].delay).toBe(0);
    expect(t.eventCount).toBe(2);
    expect(t.totalDuration).toBe(min(60));
  });

  it('computes block spans', () => {
    const t = computeTimeline(
      [
        entry({ id: 'b1', type: 'block' }),
        entry({ duration: min(30) }),
        entry({ duration: min(30) }),
        entry({ id: 'b2', type: 'block' }),
        entry({ duration: min(20), timeStart: h(12) }),
        entry({ id: 'b3', type: 'block' }),
      ],
      h(10),
    );
    const [b1, e1, , b2, , b3] = t.rows;
    expect([b1.start, b1.end, b1.blockCount]).toEqual([h(10), h(11), 2]);
    expect(e1.blockId).toBe('b1');
    expect([b2.start, b2.end, b2.blockCount]).toEqual([h(12), h(12, 20), 1]);
    expect([b3.start, b3.end, b3.blockCount]).toEqual([h(12, 20), h(12, 20), 0]);
  });

  it('handles empty rundowns', () => {
    const t = computeTimeline([], h(10));
    expect(t.start).toBeNull();
    expect(t.end).toBeNull();
    expect(t.expectedEnd).toBeNull();
  });
});
