import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';

/** Handler stub M0 : 501 + TODO explicite vers le jalon concerné. */
function notImplemented(todo: string) {
  return async (_req: FastifyRequest, reply: FastifyReply) =>
    reply.code(501).send({ error: 'Not Implemented', todo });
}

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });

  // ── Santé ────────────────────────────────────────────────────
  app.get('/health', async () => ({
    status: 'ok',
    service: 'vitrine-api',
    ts: new Date().toISOString(),
  }));

  // ── Upload (M2) ──────────────────────────────────────────────
  app.post(
    '/uploads/sign',
    notImplemented('TODO(M2): générer une URL signée GCS pour la photo source'),
  );

  // ── Générations (M3) ─────────────────────────────────────────
  app.post(
    '/generations',
    notImplemented(
      'TODO(M3): valider le solde, réserver 1 crédit (hold), créer la génération, soumettre à fal.ai avec fal_webhook',
    ),
  );
  app.get(
    '/generations/:id',
    notImplemented('TODO(M3): statut de la génération — polling écran 04'),
  );
  app.post(
    '/generations/:id/regenerate',
    notImplemented('TODO(M3): régénérer — nouveau rendu, 1 crédit'),
  );
  app.post(
    '/generations/:id/variants',
    notImplemented('TODO(M3): variantes — autres types de rendu à partir de la même source'),
  );

  // ── Galerie (M5) ─────────────────────────────────────────────
  app.get(
    '/gallery',
    notImplemented('TODO(M5): galerie filtrable ?filter=all|model|hanger — écran 06'),
  );
  app.post('/gallery', notImplemented('TODO(M5): « Ajouter à ma galerie » (titre + tags)'));

  // ── Profil (M1) ──────────────────────────────────────────────
  app.get('/me', notImplemented('TODO(M1): profil boutique — auth Clerk, création shop au 1er appel'));
  app.patch('/me', notImplemented('TODO(M1): mise à jour profil / settings / watermark'));

  // ── Crédits & packs (M4) ─────────────────────────────────────
  app.get('/credits', notImplemented('TODO(M4): solde (SUM ledger) + historique — écran 07'));
  app.get(
    '/credit-packs',
    notImplemented('TODO(M4): miroir des offerings RevenueCat (CREDIT_PACKS de @vitrine/shared)'),
  );

  // ── Fonds personnalisés (M3) ─────────────────────────────────
  app.get('/backgrounds', notImplemented('TODO(M3): liste des fonds personnalisés réutilisables'));
  app.post('/backgrounds', notImplemented('TODO(M3): enregistrer un fond personnalisé uploadé'));

  // ── Webhooks (M3 / M4) ───────────────────────────────────────
  app.post(
    '/webhooks/fal',
    notImplemented(
      'TODO(M3): callback fal — télécharger le rendu vers GCS, status=done, commit du crédit (ou refund si échec)',
    ),
  );
  app.post(
    '/webhooks/revenuecat',
    notImplemented(
      'TODO(M4): achat validé — +N crédits au ledger, idempotent sur rc_transaction_id',
    ),
  );

  return app;
}
