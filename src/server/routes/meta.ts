import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  customFieldInputSchema,
  dayInputSchema,
  settingsSchema,
  stageInputSchema,
} from '../../shared/schemas';
import type { AppContext } from '../app';

const idParam = z.object({ id: z.string() });
const orderSchema = z.object({ ids: z.array(z.string()).max(500) });

export const originOf = (request: FastifyRequest) => {
  const header = request.headers['x-client-id'];
  return typeof header === 'string' ? header.slice(0, 64) : undefined;
};

/** Event settings, days, stages and custom fields. */
export function registerMetaRoutes(app: FastifyInstance, { repo, hub }: AppContext) {
  const changed = (request: FastifyRequest) => hub.broadcast({ type: 'meta', origin: originOf(request) });

  app.get('/api/meta', async () => repo.meta());

  app.patch('/api/settings', async (request) => {
    const settings = repo.updateSettings(settingsSchema.parse(request.body));
    changed(request);
    return settings;
  });

  // days
  app.post('/api/days', async (request) => {
    const day = repo.createDay(dayInputSchema.parse(request.body ?? {}));
    changed(request);
    return day;
  });
  app.patch('/api/days/:id', async (request) => {
    const day = repo.updateDay(idParam.parse(request.params).id, dayInputSchema.parse(request.body));
    changed(request);
    return day;
  });
  app.delete('/api/days/:id', async (request) => {
    repo.deleteDay(idParam.parse(request.params).id);
    changed(request);
    return { ok: true };
  });
  app.post('/api/days/reorder', async (request) => {
    repo.reorderDays(orderSchema.parse(request.body).ids);
    changed(request);
    return { ok: true };
  });

  // stages
  app.post('/api/stages', async (request) => {
    const stage = repo.createStage(stageInputSchema.parse(request.body ?? {}));
    changed(request);
    return stage;
  });
  app.patch('/api/stages/:id', async (request) => {
    const stage = repo.updateStage(idParam.parse(request.params).id, stageInputSchema.parse(request.body));
    changed(request);
    return stage;
  });
  app.delete('/api/stages/:id', async (request) => {
    repo.deleteStage(idParam.parse(request.params).id);
    changed(request);
    return { ok: true };
  });
  app.post('/api/stages/reorder', async (request) => {
    repo.reorderStages(orderSchema.parse(request.body).ids);
    changed(request);
    return { ok: true };
  });

  // custom fields
  app.post('/api/custom-fields', async (request) => {
    const field = repo.createCustomField(customFieldInputSchema.parse(request.body ?? {}));
    changed(request);
    return field;
  });
  app.patch('/api/custom-fields/:id', async (request) => {
    const field = repo.updateCustomField(
      idParam.parse(request.params).id,
      customFieldInputSchema.parse(request.body),
    );
    changed(request);
    return field;
  });
  app.delete('/api/custom-fields/:id', async (request) => {
    repo.deleteCustomField(idParam.parse(request.params).id);
    changed(request);
    return { ok: true };
  });
  app.post('/api/custom-fields/reorder', async (request) => {
    repo.reorderCustomFields(orderSchema.parse(request.body).ids);
    changed(request);
    return { ok: true };
  });
}
