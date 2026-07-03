import { and, asc, inArray, isNotNull } from 'drizzle-orm';

import { getDb } from '../db/client.js';
import { generations } from '../db/schema.js';
import { reconcileGeneration, type GenerationLogger } from './generations.js';

/**
 * Worker de finalisation côté serveur — filet de sécurité du webhook fal et
 * remplaçant du polling de l'app quand elle est fermée (cas LOT notamment) :
 * toutes les `RECONCILE_INTERVAL_MS` (défaut 8 s), réconcilie les générations
 * `queued`/`processing` ayant un `provider_request_id` via
 * {@link reconcileGeneration} (statut fal → done/failed + push Expo).
 *
 * - Lot borné (25 plus anciennes) et concurrence bornée (5 à la fois).
 * - Jamais de chevauchement : un tick est sauté si le précédent tourne encore.
 * - Robuste : try/catch par génération ET global — une erreur fal/DB ne tue
 *   jamais la boucle (reconcileGeneration ne throw déjà pas, ceinture+bretelles).
 * - Log discret : un résumé info UNIQUEMENT quand des générations se finalisent.
 * - `RECONCILE_WORKER=off` le désactive ; sans DATABASE_URL il ne démarre pas
 *   (getDb() doit continuer de throw uniquement à l'usage, pas au boot).
 */

const DEFAULT_INTERVAL_MS = 8000;
/** Générations traitées par tick (les plus anciennes d'abord). */
const BATCH_LIMIT = 25;
/** Reconciliations fal simultanées au sein d'un tick. */
const CONCURRENCY = 5;

function intervalMs(): number {
  const raw = Number(process.env.RECONCILE_INTERVAL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_INTERVAL_MS;
}

/** Un tick : sélectionne les générations en cours et les réconcilie. */
async function reconcileTick(log: GenerationLogger): Promise<void> {
  const db = getDb();
  const rows = await db
    .select()
    .from(generations)
    .where(
      and(
        inArray(generations.status, ['queued', 'processing']),
        isNotNull(generations.providerRequestId),
      ),
    )
    .orderBy(asc(generations.createdAt))
    .limit(BATCH_LIMIT);
  if (rows.length === 0) return;

  let done = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    await Promise.all(
      rows.slice(i, i + CONCURRENCY).map(async (row) => {
        try {
          const reconciled = await reconcileGeneration(db, row, log);
          if (reconciled.status === 'done') done += 1;
          else if (reconciled.status === 'failed') failed += 1;
        } catch (err) {
          // reconcileGeneration ne throw pas par contrat — défensif quand même.
          log.warn(
            { generationId: row.id, error: err instanceof Error ? err.message : String(err) },
            'Reconcile worker : erreur sur une génération (ignorée)',
          );
        }
      }),
    );
  }

  // Résumé discret : silence total tant que rien ne bouge.
  if (done + failed > 0) {
    log.info(
      { done, failed, scanned: rows.length },
      `Reconcile worker : ${done + failed} génération(s) finalisée(s)`,
    );
  }
}

/**
 * Démarre la boucle de réconciliation. Renvoie une fonction d'arrêt (idempotente)
 * à appeler au shutdown. No-op (avec log) si `RECONCILE_WORKER=off` ou si
 * DATABASE_URL n'est pas configurée.
 */
export function startReconcileWorker(log: GenerationLogger): () => void {
  if (process.env.RECONCILE_WORKER === 'off') {
    log.info({}, 'Reconcile worker désactivé (RECONCILE_WORKER=off)');
    return () => {};
  }
  if (!process.env.DATABASE_URL) {
    log.warn({}, 'Reconcile worker non démarré : DATABASE_URL manquant');
    return () => {};
  }

  const interval = intervalMs();
  let running = false;

  const timer = setInterval(() => {
    if (running) return; // pas de chevauchement : on saute ce tick.
    running = true;
    reconcileTick(log)
      .catch((err: unknown) => {
        // Filet global : une erreur (DB down, etc.) ne tue jamais la boucle.
        log.error(
          { error: err instanceof Error ? err.message : String(err) },
          'Reconcile worker : tick en erreur (boucle maintenue)',
        );
      })
      .finally(() => {
        running = false;
      });
  }, interval);
  // La boucle ne doit jamais empêcher le process de s'arrêter.
  timer.unref();

  log.info({ intervalMs: interval, batchLimit: BATCH_LIMIT }, 'Reconcile worker démarré');
  return () => {
    clearInterval(timer);
  };
}
