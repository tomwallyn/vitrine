import Fastify, { type FastifyInstance } from 'fastify';

import { registerAuth } from './plugins/auth.js';
import { registerBackgroundRoutes } from './routes/backgrounds.js';
import { registerCreditRoutes } from './routes/credits.js';
import { registerGalleryRoutes } from './routes/gallery.js';
import { registerGenerationRoutes } from './routes/generations.js';
import { registerMeRoutes } from './routes/me.js';
import { registerRevenueCatWebhookRoutes } from './routes/revenuecat.js';
import { registerUploadRoutes } from './routes/uploads.js';
import { registerWebhookRoutes } from './routes/webhooks.js';

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
  registerGalleryRoutes(app);

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
