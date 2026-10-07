import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app';
import { openDb } from './db';
import { seed } from './db/seed';
import { Repo } from './repo';

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';
const dataDir = resolve(process.env.DATA_DIR ?? 'data');
const isProduction = process.env.NODE_ENV === 'production';

let pin = process.env.EDITOR_PIN;
if (!pin) {
  if (isProduction) {
    console.error('EDITOR_PIN non impostato: imposta la variabile d\'ambiente prima di avviare in produzione.');
    process.exit(1);
  }
  pin = '2026';
  console.warn('EDITOR_PIN non impostato, uso il PIN di sviluppo "2026"');
}

let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  sessionSecret = randomBytes(32).toString('hex');
  console.warn('SESSION_SECRET non impostato: le sessioni scadranno al riavvio del server');
}

const here = fileURLToPath(new URL('.', import.meta.url));
// dist/server/index.js -> dist/client
const clientDir = process.env.CLIENT_DIR ?? join(here, '..', 'client');

const repo = new Repo(openDb(join(dataDir, 'rundown.db')));
if (process.env.SEED !== 'false') seed(repo);

const app = await buildApp({ repo, pin, sessionSecret, clientDir, logger: true });
await app.listen({ port, host });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    repo.db.close();
    process.exit(0);
  });
}
