import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  batchPatchSchema,
  createEntrySchema,
  entryInputSchema,
  idsSchema,
  importEntriesSchema,
  reorderSchema,
  rundownPatchSchema,
} from '../../shared/schemas';
import type { AppContext } from '../app';
import { originOf } from './meta';

const idParam = z.object({ id: z.string() });
const pairParams = z.object({ dayId: z.string(), stageId: z.string() });

/** Rundowns and their entries. */
export function registerRundownRoutes(app: FastifyInstance, { repo, hub }: AppContext) {
  const changed = (request: FastifyRequest, rundownIds: Iterable<string>) => {
    for (const rundownId of rundownIds) {
      const { revision } = repo.getRundown(rundownId);
      hub.broadcast({ type: 'rundown', rundownId, revision, origin: originOf(request) });
    }
  };

  app.get('/api/rundowns/:dayId/:stageId', async (request) => {
    const { dayId, stageId } = pairParams.parse(request.params);
    const rundown = repo.ensureRundown(dayId, stageId);
    return { rundown, entries: repo.listEntries(rundown.id) };
  });

  app.patch('/api/rundowns/:id', async (request) => {
    const { id } = idParam.parse(request.params);
    const rundown = repo.updateRundown(id, rundownPatchSchema.parse(request.body));
    changed(request, [id]);
    return rundown;
  });

  app.post('/api/rundowns/:id/entries', async (request) => {
    const { id } = idParam.parse(request.params);
    const { afterId, ...input } = createEntrySchema.parse(request.body ?? {});
    const entry = repo.createEntry(id, input, afterId);
    changed(request, [id]);
    return entry;
  });

  app.post('/api/rundowns/:id/reorder', async (request) => {
    const { id } = idParam.parse(request.params);
    const rundown = repo.reorderEntries(id, reorderSchema.parse(request.body).ids);
    changed(request, [id]);
    return rundown;
  });

  app.post('/api/rundowns/:id/import', async (request) => {
    const { id } = idParam.parse(request.params);
    const body = importEntriesSchema.parse(request.body);
    const rundown = repo.importEntries(id, body.entries, body.mode, body.startTime);
    changed(request, [id]);
    return { rundown, entries: repo.listEntries(id) };
  });

  app.patch('/api/entries/:id', async (request) => {
    const { id } = idParam.parse(request.params);
    const entry = repo.updateEntry(id, entryInputSchema.parse(request.body));
    changed(request, [entry.rundownId]);
    return entry;
  });

  app.delete('/api/entries/:id', async (request) => {
    const { id } = idParam.parse(request.params);
    const touched = repo.deleteEntries([id]);
    changed(request, touched);
    return { ok: true };
  });

  app.post('/api/entries/batch', async (request) => {
    const { ids, patch } = batchPatchSchema.parse(request.body);
    const touched = repo.updateEntries(ids, patch);
    changed(request, touched);
    return { ok: true };
  });

  app.post('/api/entries/delete', async (request) => {
    const touched = repo.deleteEntries(idsSchema.parse(request.body).ids);
    changed(request, touched);
    return { ok: true };
  });

  app.post('/api/entries/duplicate', async (request) => {
    const copies = repo.duplicateEntries(idsSchema.parse(request.body).ids);
    if (copies.length) changed(request, [copies[0].rundownId]);
    return copies;
  });
}
