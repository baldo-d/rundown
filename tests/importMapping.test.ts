import { describe, expect, it } from 'vitest';
import { guessMapping, mapRows } from '../src/shared/importMapping';
import { h, min } from './helpers';

const options = { headerRow: 0, defaultDuration: min(30), linkContiguous: true };

describe('guessMapping', () => {
  it('recognises Italian and English headers', () => {
    const m = guessMapping(['N°', 'Ora', 'Titolo', 'Durata', 'Relatore', 'Note', 'Luci'], [
      { id: 'cf1', label: 'Luci', color: '', sortOrder: 0 },
    ]);
    expect(m.fields.start).toBe(1);
    expect(m.fields.title).toBe(2);
    expect(m.fields.duration).toBe(3);
    expect(m.fields.speakers).toBe(4);
    expect(m.fields.note).toBe(5);
    expect(m.custom.cf1).toBe(6);

    const en = guessMapping(['Start', 'End', 'Title', 'Speakers'], []);
    expect(en.fields).toMatchObject({ start: 0, end: 1, title: 2, speakers: 3 });
  });

  it('prefers the fixed start column of our own exports', () => {
    const m = guessMapping(['Tipo', 'Cue', 'Inizio', 'Fine', 'Durata', 'Orario fisso', 'Titolo'], []);
    expect(m.fields.timeStart).toBe(5);
    expect(m.fields.start).toBe(2);
  });
});

describe('mapRows', () => {
  it('derives durations from start times and links contiguous events', () => {
    const rows = [
      ['Ora', 'Titolo'],
      ['10:00', 'Apertura'],
      ['10:15', 'Keynote'],
      ['11:00', 'Panel'],
      ['', ''],
      ['12:30', 'Pranzo'],
    ];
    const m = guessMapping(rows[0], []);
    const r = mapRows(rows, m, options);
    expect(r.startTime).toBe(h(10));
    expect(r.entries.map((e) => [e.title, e.duration, e.timeStart])).toEqual([
      ['Apertura', min(15), null],
      ['Keynote', min(45), null],
      ['Panel', min(90), null],
      ['Pranzo', min(30), null],
    ]);
  });

  it('keeps fixed times when there is a gap and uses start/end columns', () => {
    const rows = [
      ['Inizio', 'Fine', 'Titolo', 'Tipo'],
      ['', '', 'Mattina', 'Blocco'],
      ['10:00', '10:30', 'A', ''],
      ['11:00', '11:20', 'B', ''],
      ['', '', '', 'Ritardo'],
    ];
    const r = mapRows(rows, guessMapping(rows[0], []), options);
    expect(r.entries.map((e) => [e.type, e.duration, e.timeStart])).toEqual([
      ['block', 0, null],
      ['event', min(30), null],
      ['event', min(20), h(11)],
      ['delay', 0, null],
    ]);
  });

  it('parses flags, colors and custom fields, and reports bad values', () => {
    const rows = [
      ['Titolo', 'Durata', 'Pubblico', 'Salta', 'Colore', 'Regia'],
      ['A', '45', 'no', 'sì', '#FF0000', 'cam 1'],
      ['B', 'boh', 'sì', '', 'rosso', ''],
    ];
    const m = guessMapping(rows[0], [{ id: 'regia', label: 'Regia', color: '', sortOrder: 0 }]);
    const r = mapRows(rows, m, options);
    expect(r.entries[0]).toMatchObject({
      duration: min(45),
      isPublic: false,
      skip: true,
      color: '#ff0000',
      custom: { regia: 'cam 1' },
    });
    expect(r.entries[1]).toMatchObject({ duration: min(30), isPublic: true, skip: false, color: '' });
    expect(r.warnings).toHaveLength(1);
  });
});
