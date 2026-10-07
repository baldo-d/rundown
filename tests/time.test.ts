import { describe, expect, it } from 'vitest';
import { formatClock, formatDuration, parseClock, parseDuration } from '../src/shared/time';

describe('parseDuration', () => {
  it.each([
    ['90', 5400],
    ['45', 2700],
    ['1h30', 5400],
    ['1h 30m', 5400],
    ['1h', 3600],
    ['45m', 2700],
    ['45 min', 2700],
    ['30s', 30],
    ['2m30s', 150],
    ['1:30', 5400],
    ['01:30:00', 5400],
    ['00:05:30', 330],
    ['-5', -300],
    ['+10', 600],
    ['1,5', 90],
  ])('%s -> %i', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it.each(['', 'abc', '1:75', '10 mele'])('rejects %s', (input) => {
    expect(parseDuration(input)).toBeNull();
  });
});

describe('parseClock', () => {
  it.each([
    ['14:30', 52200],
    ['14.30', 52200],
    ['14,30', 52200],
    ['1430', 52200],
    ['930', 34200],
    ['9', 32400],
    ['14:30:15', 52215],
    ['2:30pm', 52200],
    ['9am', 32400],
    ['12am', 0],
    ['25:00', 90000],
  ])('%s -> %i', (input, expected) => {
    expect(parseClock(input)).toBe(expected);
  });

  it.each(['', '14:75', 'ieri', '13pm'])('rejects %s', (input) => {
    expect(parseClock(input)).toBeNull();
  });
});

describe('formatting', () => {
  it('formats clock times and wraps past midnight', () => {
    expect(formatClock(52200)).toBe('14:30');
    expect(formatClock(52215)).toBe('14:30:15');
    expect(formatClock(90000)).toBe('01:00');
    expect(formatClock(null)).toBe('');
  });

  it('formats durations compactly', () => {
    expect(formatDuration(5400)).toBe('1h 30m');
    expect(formatDuration(2700)).toBe('45m');
    expect(formatDuration(150)).toBe('2m 30s');
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(-300)).toBe('-5m');
    expect(formatDuration(3600)).toBe('1h');
  });
});
