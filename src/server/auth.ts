import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { loginSchema } from '../shared/schemas';

export const SESSION_COOKIE = 'uh_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 5 * 60 * 1000;

const sha256 = (s: string) => createHash('sha256').update(s).digest();

export interface AuthOptions {
  pin: string;
}

/** Simple PIN-based session using a signed cookie. Changing the PIN invalidates every session. */
export function registerAuth(app: FastifyInstance, { pin }: AuthOptions) {
  const pinHash = sha256(pin);
  const pinTag = pinHash.toString('hex').slice(0, 12);
  const attempts = new Map<string, { count: number; resetAt: number }>();

  const isAuthenticated = (request: FastifyRequest): boolean => {
    const raw = request.cookies[SESSION_COOKIE];
    if (!raw) return false;
    const unsigned = request.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) return false;
    const [issuedAt, tag] = unsigned.value.split('.');
    const age = (Date.now() - Number(issuedAt)) / 1000;
    return tag === pinTag && age >= 0 && age < SESSION_MAX_AGE;
  };

  app.decorate('isAuthenticated', isAuthenticated);

  app.post('/api/auth/login', async (request, reply) => {
    const now = Date.now();
    const key = request.ip;
    const state = attempts.get(key);
    if (state && state.resetAt > now && state.count >= MAX_ATTEMPTS) {
      return reply.code(429).send({ error: 'Troppi tentativi, riprova tra qualche minuto' });
    }
    const { pin: candidate } = loginSchema.parse(request.body);
    if (!timingSafeEqual(sha256(candidate), pinHash)) {
      const next = state && state.resetAt > now ? state : { count: 0, resetAt: now + WINDOW_MS };
      next.count++;
      attempts.set(key, next);
      return reply.code(401).send({ error: 'PIN non valido' });
    }
    attempts.delete(key);
    reply.setCookie(SESSION_COOKIE, `${now}.${pinTag}`, {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      secure: request.protocol === 'https',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    });
    return { ok: true };
  });

  app.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (request) => ({ authenticated: isAuthenticated(request) }));

  // Every other /api route (and the websocket) requires a session
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const url = request.url.split('?')[0];
    const isApi = url.startsWith('/api/') || url === '/ws';
    if (!isApi || url.startsWith('/api/auth/') || url === '/api/health') return;
    if (!isAuthenticated(request)) {
      return reply.code(401).send({ error: 'Accesso richiesto' });
    }
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    isAuthenticated(request: FastifyRequest): boolean;
  }
}
