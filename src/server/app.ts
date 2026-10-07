import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ZodError } from 'zod';
import { registerAuth } from './auth';
import { Hub } from './hub';
import { NotFoundError, Repo } from './repo';
import { registerMetaRoutes } from './routes/meta';
import { registerRundownRoutes } from './routes/rundowns';
import { registerTransferRoutes } from './routes/transfer';

export interface AppOptions {
  repo: Repo;
  pin: string;
  sessionSecret: string;
  /** Directory with the built client, served in production. */
  clientDir?: string;
  logger?: boolean;
}

export interface AppContext {
  repo: Repo;
  hub: Hub;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: true,
    bodyLimit: 20 * 1024 * 1024,
  });
  const hub = new Hub();
  const ctx: AppContext = { repo: options.repo, hub };

  await app.register(cookie, { secret: options.sessionSecret });
  await app.register(websocket);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'Dati non validi', issues: error.issues });
    }
    if (error instanceof NotFoundError) {
      return reply.code(404).send({ error: error.message });
    }
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) request.log.error(error);
    return reply.code(status).send({ error: status >= 500 ? 'Errore interno' : (error as Error).message });
  });

  // Uploads (xlsx/csv/json files) are sent as raw bodies
  app.addContentTypeParser(
    ['application/octet-stream', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body),
  );

  registerAuth(app, { pin: options.pin });

  app.get('/api/health', async () => ({ ok: true }));

  app.get('/ws', { websocket: true }, (socket) => {
    hub.add(socket);
    socket.send(JSON.stringify({ type: 'hello' }));
  });

  registerMetaRoutes(app, ctx);
  registerRundownRoutes(app, ctx);
  registerTransferRoutes(app, ctx);

  const clientDir = options.clientDir;
  if (clientDir && existsSync(join(clientDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: clientDir, wildcard: false });
    // SPA fallback: page routes (no file extension) serve index.html
    app.setNotFoundHandler((request, reply) => {
      const path = request.url.split('?')[0];
      if (request.method === 'GET' && !path.startsWith('/api/') && !/\.[a-z0-9]+$/i.test(path)) {
        return reply.type('text/html').sendFile('index.html');
      }
      return reply.code(404).send({ error: 'Non trovato' });
    });
  }

  return app;
}
