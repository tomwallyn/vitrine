import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';

import { registerAuth } from './plugins/auth.js';
import { registerBackgroundRoutes } from './routes/backgrounds.js';
import { registerCreditRoutes } from './routes/credits.js';
import { registerGenerationRoutes } from './routes/generations.js';
import { registerMeRoutes } from './routes/me.js';
import { registerRevenueCatWebhookRoutes } from './routes/revenuecat.js';
import { registerUploadRoutes } from './routes/uploads.js';
import { registerWebhookRoutes } from './routes/webhooks.js';

/** Handler stub M0 : 501 + TODO explicite vers le jalon concerné. */
function notImplemented(todo: string) {
  return async (_req: FastifyRequest, reply: FastifyReply) =>
    reply.code(501).send({ error: 'Not Implemented', todo });
}

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });

  // ── Auth Clerk (toutes les routes sauf /health et /webhooks/*) ─
  registerAuth(app);

  // ── Santé ────────────────────────────────────────────────────
  app.get('/health', async () => ({
    status: 'ok',
    service: 'vitrine-api',
    ts: new Date().toISOString(),
  }));

  // ── Upload (M2) ──────────────────────────────────────────────
  registerUploadRoutes(app);

  // ── Générations (M3a) ────────────────────────────────────────
  registerGenerationRoutes(app);

  // ── Galerie (M5) ─────────────────────────────────────────────
  app.get(
    '/gallery',
    notImplemented('TODO(M5): galerie filtrable ?filter=all|model|hanger — écran 06'),
  );
  app.post('/gallery', notImplemented('TODO(M5): « Ajouter à ma galerie » (titre + tags)'));

  // ── Profil (M1) ──────────────────────────────────────────────
  registerMeRoutes(app);

  // ── Crédits & packs (M4) ─────────────────────────────────────
  registerCreditRoutes(app);

  // ── Fonds personnalisés (M3a) ────────────────────────────────
  registerBackgroundRoutes(app);

  // ── Webhooks (M3a / M4) ──────────────────────────────────────
  registerWebhookRoutes(app);
  registerRevenueCatWebhookRoutes(app);

  return app;
}
