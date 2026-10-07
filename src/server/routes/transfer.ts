import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { backupSchema } from '../../shared/schemas';
import type { AppContext } from '../app';
import { exportCsv, exportXlsx, parseSpreadsheet, type ExportRundown } from '../spreadsheet';
import { originOf } from './meta';

const exportQuery = z.object({
  dayId: z.string().optional(),
  stageId: z.string().optional(),
});

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

const attachment = (name: string) => `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`;

/** Import and export: JSON backups, XLSX and CSV. */
export function registerTransferRoutes(app: FastifyInstance, { repo, hub }: AppContext) {
  /** Collects the rundowns to export, in day/stage order, optionally filtered. */
  const collect = (dayId?: string, stageId?: string): ExportRundown[] => {
    const days = repo.listDays().filter((d) => !dayId || d.id === dayId);
    const stages = repo.listStages().filter((s) => !stageId || s.id === stageId);
    const rundowns = repo.listRundowns();
    const result: ExportRundown[] = [];
    for (const day of days) {
      for (const stage of stages) {
        let rundown = rundowns.find((r) => r.dayId === day.id && r.stageId === stage.id);
        // a single explicitly requested rundown is exported even when empty
        if (!rundown && dayId && stageId) rundown = repo.ensureRundown(day.id, stage.id);
        if (!rundown) continue;
        const entries = repo.listEntries(rundown.id);
        if (entries.length === 0 && !(dayId && stageId)) continue;
        result.push({ day, stage, rundown, entries });
      }
    }
    return result;
  };

  const baseName = (data: ExportRundown[], dayId?: string, stageId?: string) => {
    const event = slug(repo.getSettings().name) || 'scaletta';
    if (dayId && stageId && data[0]) return `${event}-${slug(data[0].day.label)}-${slug(data[0].stage.name)}`;
    if (dayId && data[0]) return `${event}-${slug(data[0].day.label)}`;
    return event;
  };

  app.get('/api/export/json', async (_request, reply) => {
    const backup = repo.backup();
    const date = backup.exportedAt.slice(0, 10);
    reply.header('content-disposition', attachment(`${slug(backup.settings.name)}-backup-${date}.json`));
    return backup;
  });

  app.post('/api/import/json', async (request) => {
    const body = Buffer.isBuffer(request.body) ? JSON.parse(request.body.toString('utf8')) : request.body;
    const backup = backupSchema.parse(body);
    try {
      repo.restore(backup);
    } catch (err) {
      throw Object.assign(new Error(`Backup non valido: ${(err as Error).message}`), { statusCode: 400 });
    }
    hub.broadcast({ type: 'meta', origin: originOf(request) });
    for (const r of repo.listRundowns()) {
      hub.broadcast({ type: 'rundown', rundownId: r.id, revision: r.revision, origin: originOf(request) });
    }
    return { ok: true };
  });

  app.get('/api/export/xlsx', async (request, reply) => {
    const { dayId, stageId } = exportQuery.parse(request.query);
    const data = collect(dayId, stageId);
    const buffer = await exportXlsx(data, repo.listCustomFields(), repo.getSettings().name);
    reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', attachment(`${baseName(data, dayId, stageId)}.xlsx`));
    return reply.send(buffer);
  });

  app.get('/api/export/csv', async (request, reply) => {
    const { dayId, stageId } = z.object({ dayId: z.string(), stageId: z.string() }).parse(request.query);
    const data = collect(dayId, stageId);
    reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', attachment(`${baseName(data, dayId, stageId)}.csv`));
    return exportCsv(data[0], repo.listCustomFields());
  });

  app.post('/api/import/preview', async (request, reply) => {
    if (!Buffer.isBuffer(request.body)) {
      return reply.code(400).send({ error: 'Invia il file come application/octet-stream' });
    }
    const filename = decodeURIComponent(String(request.headers['x-filename'] ?? ''));
    try {
      return { sheets: await parseSpreadsheet(request.body, filename) };
    } catch (err) {
      return reply.code(400).send({ error: `File non leggibile: ${(err as Error).message}` });
    }
  });
}
