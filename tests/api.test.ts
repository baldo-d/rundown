import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import { buildApp } from '../src/server/app';
import { openDb } from '../src/server/db';
import { seed } from '../src/server/db/seed';
import { Repo } from '../src/server/repo';
import { guessMapping, mapRows } from '../src/shared/importMapping';
import type { Backup, Entry, Meta, RundownWithEntries } from '../src/shared/types';

let app: FastifyInstance;
let repo: Repo;
let cookie: string;

async function api<T = unknown>(method: string, url: string, payload?: unknown, headers: Record<string, string> = {}) {
  const res = await app.inject({
    method: method as 'GET',
    url,
    payload: payload as string,
    headers: { cookie, ...headers },
  });
  return { status: res.statusCode, body: res.headers['content-type']?.includes('json') ? (res.json() as T) : (undefined as T), raw: res };
}

beforeEach(async () => {
  repo = new Repo(openDb(':memory:'));
  seed(repo);
  app = await buildApp({ repo, pin: '1234', sessionSecret: 'test-secret' });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { pin: '1234' } });
  cookie = login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
});

afterEach(async () => {
  await app.close();
});

describe('auth', () => {
  it('rejects requests without a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/meta' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a wrong PIN and rate limits', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { pin: '0000' } });
      expect(res.statusCode).toBe(401);
    }
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { pin: '1234' } });
    expect(res.statusCode).toBe(429);
  });

  it('rejects a tampered cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/meta', headers: { cookie: 'uh_session=123.abc.def' } });
    expect(res.statusCode).toBe(401);
  });

  it('reports the session state', async () => {
    expect((await api<{ authenticated: boolean }>('GET', '/api/auth/me')).body.authenticated).toBe(true);
  });
});

describe('meta', () => {
  it('returns the seeded structure', async () => {
    const { body } = await api<Meta>('GET', '/api/meta');
    expect(body.settings.name).toBe('Utopian Hours 2026');
    expect(body.days).toHaveLength(3);
    expect(body.stages).toHaveLength(2);
    expect(body.customFields).toHaveLength(2);
    expect(body.summaries.length).toBeGreaterThan(0);
  });

  it('creates, updates, reorders and deletes days and stages', async () => {
    const day = (await api<{ id: string }>('POST', '/api/days', { label: 'Giorno 4', date: '2026-10-20' })).body;
    await api('PATCH', `/api/days/${day.id}`, { label: 'Extra' });
    let meta = (await api<Meta>('GET', '/api/meta')).body;
    expect(meta.days.at(-1)).toMatchObject({ label: 'Extra', date: '2026-10-20' });

    const ids = meta.days.map((d) => d.id).reverse();
    await api('POST', '/api/days/reorder', { ids });
    meta = (await api<Meta>('GET', '/api/meta')).body;
    expect(meta.days[0].id).toBe(day.id);

    const stage = (await api<{ id: string }>('POST', '/api/stages', { name: 'Cortile', color: '#123456' })).body;
    await api('GET', `/api/rundowns/${day.id}/${stage.id}`);
    expect((await api('DELETE', `/api/stages/${stage.id}`)).status).toBe(200);
    expect(repo.listRundowns().some((r) => r.stageId === stage.id)).toBe(false);
    expect((await api('DELETE', `/api/days/${day.id}`)).status).toBe(200);
    expect((await api('DELETE', `/api/days/${day.id}`)).status).toBe(404);
  });

  it('validates input', async () => {
    expect((await api('PATCH', '/api/settings', { name: '' })).status).toBe(400);
    expect((await api('POST', '/api/days', { date: '16/10/2026' })).status).toBe(400);
  });
});

describe('rundowns and entries', () => {
  async function emptyRundown() {
    const meta = (await api<Meta>('GET', '/api/meta')).body;
    return (await api<RundownWithEntries>('GET', `/api/rundowns/${meta.days[2].id}/${meta.stages[0].id}`)).body;
  }

  it('creates a rundown lazily and adds entries at the right position', async () => {
    const { rundown, entries } = await emptyRundown();
    expect(entries).toEqual([]);
    const a = (await api<Entry>('POST', `/api/rundowns/${rundown.id}/entries`, { title: 'A' })).body;
    const c = (await api<Entry>('POST', `/api/rundowns/${rundown.id}/entries`, { title: 'C' })).body;
    await api('POST', `/api/rundowns/${rundown.id}/entries`, { title: 'B', afterId: a.id });
    await api('POST', `/api/rundowns/${rundown.id}/entries`, { title: 'Top', type: 'block', afterId: null });
    const list = repo.listEntries(rundown.id);
    expect(list.map((e) => e.title)).toEqual(['Top', 'A', 'B', 'C']);
    expect(list.map((e) => e.sortOrder)).toEqual([0, 1, 2, 3]);
    expect(c.duration).toBe(1800); // default duration
    expect(repo.getRundown(rundown.id).revision).toBe(4);
  });

  it('patches, batch edits, duplicates, reorders and deletes', async () => {
    const { rundown } = await emptyRundown();
    const make = async (title: string) =>
      (await api<Entry>('POST', `/api/rundowns/${rundown.id}/entries`, { title })).body;
    const a = await make('A');
    const b = await make('B');
    const c = await make('C');

    const patched = (await api<Entry>('PATCH', `/api/entries/${a.id}`, { duration: 600, timeStart: 36000, custom: { x: '1' } })).body;
    expect(patched).toMatchObject({ duration: 600, timeStart: 36000, custom: { x: '1' } });
    await api('PATCH', `/api/entries/${a.id}`, { custom: { x: '', y: '2' } });
    expect(repo.getEntry(a.id).custom).toEqual({ y: '2' });

    await api('POST', '/api/entries/batch', { ids: [b.id, c.id], patch: { color: '#ff0000', skip: true } });
    expect(repo.listEntries(rundown.id).filter((e) => e.color === '#ff0000' && e.skip)).toHaveLength(2);

    const copies = (await api<Entry[]>('POST', '/api/entries/duplicate', { ids: [a.id, b.id] })).body;
    expect(copies).toHaveLength(2);
    expect(repo.listEntries(rundown.id).map((e) => e.title)).toEqual(['A', 'B', 'A', 'B', 'C']);

    const ids = repo.listEntries(rundown.id).map((e) => e.id).reverse();
    await api('POST', `/api/rundowns/${rundown.id}/reorder`, { ids });
    expect(repo.listEntries(rundown.id).map((e) => e.title)).toEqual(['C', 'B', 'A', 'B', 'A']);

    await api('POST', '/api/entries/delete', { ids: copies.map((e) => e.id) });
    await api('DELETE', `/api/entries/${c.id}`);
    expect(repo.listEntries(rundown.id).map((e) => [e.title, e.sortOrder])).toEqual([
      ['B', 0],
      ['A', 1],
    ]);
  });

  it('clears fixed times when an event becomes a block', async () => {
    const { rundown } = await emptyRundown();
    const e = (await api<Entry>('POST', `/api/rundowns/${rundown.id}/entries`, { timeStart: 40000 })).body;
    await api('PATCH', `/api/entries/${e.id}`, { type: 'block' });
    expect(repo.getEntry(e.id).timeStart).toBeNull();
    await api('PATCH', `/api/entries/${e.id}`, { timeStart: 40000, title: 'X' });
    expect(repo.getEntry(e.id)).toMatchObject({ timeStart: null, title: 'X' });
  });

  it('updates the start time', async () => {
    const { rundown } = await emptyRundown();
    const res = await api<{ startTime: number; revision: number }>('PATCH', `/api/rundowns/${rundown.id}`, { startTime: 9 * 3600 });
    expect(res.body.startTime).toBe(9 * 3600);
    expect(res.body.revision).toBe(rundown.revision + 1);
  });

  it('returns 404 for unknown ids', async () => {
    expect((await api('PATCH', '/api/entries/nope', { title: 'x' })).status).toBe(404);
    expect((await api('GET', '/api/rundowns/nope/nope')).status).toBe(404);
  });
});

describe('import / export', () => {
  it('round trips a full JSON backup', async () => {
    const backup = (await api<Backup>('GET', '/api/export/json')).body;
    expect(backup.entries.length).toBeGreaterThan(0);
    const dayId = backup.days[0].id;
    await api('DELETE', `/api/days/${dayId}`);
    expect(repo.listDays()).toHaveLength(2);

    const res = await api('POST', '/api/import/json', JSON.stringify(backup), { 'content-type': 'application/octet-stream' });
    expect(res.status).toBe(200);
    const after = repo.backup();
    expect(after.days).toEqual(backup.days);
    expect(after.entries).toEqual(backup.entries);
  });

  it('rejects an invalid backup and keeps the data', async () => {
    expect((await api('POST', '/api/import/json', { format: 'other' })).status).toBe(400);
    const backup = (await api<Backup>('GET', '/api/export/json')).body;
    backup.entries[0].rundownId = 'missing';
    expect((await api('POST', '/api/import/json', backup)).status).toBe(400);
    expect(repo.listDays()).toHaveLength(3);
  });

  it('round trips a rundown through XLSX export, preview and import', async () => {
    const meta = (await api<Meta>('GET', '/api/meta')).body;
    const day = meta.days[0];
    const stage = meta.stages[0];
    const original = (await api<RundownWithEntries>('GET', `/api/rundowns/${day.id}/${stage.id}`)).body;
    // add a delay to make it interesting
    await api('POST', `/api/rundowns/${original.rundown.id}/entries`, { type: 'delay', duration: 300, afterId: original.entries[2].id });
    const before = (await api<RundownWithEntries>('GET', `/api/rundowns/${day.id}/${stage.id}`)).body;

    const xlsx = await api('GET', `/api/export/xlsx?dayId=${day.id}&stageId=${stage.id}`);
    expect(xlsx.status).toBe(200);
    expect(xlsx.raw.headers['content-disposition']).toContain('.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx.raw.rawPayload as unknown as ArrayBuffer);
    expect(workbook.worksheets).toHaveLength(1);

    const preview = await api<{ sheets: { name: string; rows: string[][] }[] }>(
      'POST',
      '/api/import/preview',
      xlsx.raw.rawPayload,
      { 'content-type': 'application/octet-stream', 'x-filename': 'test.xlsx' },
    );
    expect(preview.status).toBe(200);
    const rows = preview.body.sheets[0].rows;
    const mapping = guessMapping(rows[0], meta.customFields);
    const mapped = mapRows(rows, mapping, { headerRow: 0, defaultDuration: 1800, linkContiguous: true });
    expect(mapped.warnings).toEqual([]);

    const target = (await api<RundownWithEntries>('GET', `/api/rundowns/${meta.days[1].id}/${stage.id}`)).body;
    const imported = await api<RundownWithEntries>('POST', `/api/rundowns/${target.rundown.id}/import`, {
      mode: 'replace',
      startTime: mapped.startTime ?? undefined,
      entries: mapped.entries,
    });
    expect(imported.status).toBe(200);

    const strip = (e: Entry) => {
      const { id: _i, rundownId: _r, ...rest } = e;
      return rest;
    };
    expect(imported.body.rundown.startTime).toBe(before.rundown.startTime);
    expect(imported.body.entries.map(strip)).toEqual(before.entries.map(strip));
  });

  it('exports and previews CSV', async () => {
    const meta = (await api<Meta>('GET', '/api/meta')).body;
    const csv = await api('GET', `/api/export/csv?dayId=${meta.days[0].id}&stageId=${meta.stages[0].id}`);
    expect(csv.status).toBe(200);
    expect(csv.raw.body).toContain('Saluti di benvenuto');
    const preview = await api<{ sheets: { rows: string[][] }[] }>('POST', '/api/import/preview', csv.raw.body, {
      'content-type': 'text/csv',
      'x-filename': 'scaletta.csv',
    });
    expect(preview.body.sheets[0].rows[0][0]).toBe('Tipo');
    expect(preview.body.sheets[0].rows.length).toBeGreaterThan(5);
  });
});
