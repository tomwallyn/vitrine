import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { getDb } from '../db/client.js';
import { generations } from '../db/schema.js';
import {
  finalizeGenerationFailure,
  finalizeGenerationSuccess,
  serializeGeneration,
  type GenerationRow,
} from '../services/generations.js';

/** Query du webhook : generationId injecté par nous à la soumission (+ secret optionnel). */
const falWebhookQuerySchema = z.object({
  generationId: z.string().uuid().optional(),
  secret: z.string().optional(),
});

/**
 * Corps du webhook fal (parse tolérant) :
 * - succès : { request_id, status: "OK", payload: <output du modèle> }
 * - échec  : { request_id, status: "ERROR", error, payload?, payload_error? }
 */
const falWebhookBodySchema = z
  .object({
    request_id: z.string().optional(),
    status: z.string().optional(),
    payload: z.unknown().optional(),
    error: z.unknown().optional(),
    payload_error: z.string().nullable().optional(),
  })
  .passthrough();

type FalWebhookBody = z.infer<typeof falWebhookBodySchema>;

/** Message d'erreur le plus utile possible depuis un webhook ERROR. */
function extractFalError(body: FalWebhookBody): string {
  if (typeof body.error === 'string' && body.error) return body.error;
  if (body.payload_error) return body.payload_error;
  const detail = (body.payload as { detail?: unknown } | null | undefined)?.detail;
  if (detail !== undefined) return JSON.stringify(detail).slice(0, 500);
  return 'Génération échouée côté fal (webhook ERROR sans détail)';
}

/**
 * POST /webhooks/fal — callback de fin de génération (public : le plugin
 * d'auth Clerk ignore /webhooks/*, protection par secret d'URL optionnel).
 *
 * - **Sécurité** : si FAL_WEBHOOK_SECRET est défini, le query param `secret`
 *   (injecté dans l'URL à la soumission) doit correspondre → sinon 401.
 *   (TODO durcissement : vérification ED25519 des headers X-Fal-Webhook-*.)
 * - **Idempotent** : génération déjà `done`/`failed` → 200 no-op (fal rejoue
 *   le webhook en cas de non-2xx ; le refund est lui-même idempotent).
 * - Succès → finalizeGenerationSuccess (download du rendu + upload GCS
 *   results/{authUserId}/{genId}, status `done` + completed_at) — logique
 *   partagée avec le reconcile/polling (services/generations.ts).
 * - Échec fal → finalizeGenerationFailure (refund + status `failed` + error).
 * - Erreur interne transitoire (download/GCS/DB) → 500, fal retente.
 */
export function registerWebhookRoutes(app: FastifyInstance): void {
  app.post('/webhooks/fal', async (req, reply) => {
    const query = falWebhookQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: 'Bad Request' });

    const expectedSecret = process.env.FAL_WEBHOOK_SECRET;
    if (expectedSecret && query.data.secret !== expectedSecret) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const body = falWebhookBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: 'Bad Request' });

    const { generationId } = query.data;
    const requestId = body.data.request_id;
    if (!generationId && !requestId) {
      return reply.code(400).send({ error: 'generationId ou request_id requis' });
    }

    const db = getDb();

    // Retrouve la génération : par id (query) sinon par provider_request_id.
    let row: GenerationRow | undefined;
    if (generationId) {
      [row] = await db.select().from(generations).where(eq(generations.id, generationId));
    }
    if (!row && requestId) {
      [row] = await db
        .select()
        .from(generations)
        .where(eq(generations.providerRequestId, requestId));
    }
    if (!row) return reply.code(404).send({ error: 'Génération inconnue' });

    // Garde-fou : un request_id qui ne matche pas n'affecte pas la génération.
    if (requestId && row.providerRequestId && requestId !== row.providerRequestId) {
      req.log.warn(
        { generationId: row.id, requestId, expected: row.providerRequestId },
        'Webhook fal ignoré : request_id inattendu',
      );
      return { ok: false, reason: 'request_id mismatch' };
    }

    // Idempotence : terminée (done/failed) → no-op.
    if (row.status === 'done' || row.status === 'failed') {
      return { ok: true, idempotent: true, generation: await serializeGeneration(row) };
    }

    // ── Échec côté fal → refund (idempotent) + failed ────────────
    if (body.data.status !== 'OK') {
      const failed = await finalizeGenerationFailure(db, row, extractFalError(body.data), req.log);
      return { ok: true, generation: await serializeGeneration(failed) };
    }

    // ── Succès : parse → download → GCS → done (logique partagée) ──
    let finalized: GenerationRow;
    try {
      finalized = await finalizeGenerationSuccess(db, row, body.data.payload, req.log);
    } catch (err) {
      // Erreur transitoire (shop/download/GCS/DB) → 500, fal rejouera le webhook.
      const error = err instanceof Error ? err.message : String(err);
      return reply.code(500).send({ error });
    }
    return { ok: true, generation: await serializeGeneration(finalized) };
  });
}
