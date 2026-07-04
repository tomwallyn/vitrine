import { randomUUID } from 'node:crypto';

import { ApiError } from '@fal-ai/client';
import type { CreateGenerationRequest, Generation } from '@vitrine/shared';
import { and, eq, sql } from 'drizzle-orm';

import { getTxDb, type Db } from '../db/client.js';
import { generations, shops } from '../db/schema.js';
import { ADAPTERS } from './ai/adapters.js';
import { getFalQueueResult, getFalQueueStatus, submitToFal } from './ai/client.js';
import { endpointForProvider, resolveAiRoute } from './ai/config.js';
import { extractProductInfo } from './ai/product-ocr.js';
import { holdCredit, refundCredit } from './credits.js';
import { sendPushToShop } from './push.js';
import { signedReadUrl, trySignedReadUrl, uploadResultImage } from './storage.js';

export type GenerationRow = typeof generations.$inferSelect;

/**
 * Logger minimal (compatible pino/Fastify `req.log`) — permet de tester les
 * finalisations/reconcile avec un stub sans dépendre du type FastifyBaseLogger.
 */
type LogFn = (obj: unknown, msg?: string) => void;
export interface GenerationLogger {
  info: LogFn;
  warn: LogFn;
  error: LogFn;
}

/** TTL des URLs signées passées à fal (la génération dure 8-60 s, 1 h est large). */
const FAL_INPUT_TTL_SECONDS = 3600;

/**
 * Ligne Drizzle → contrat `Generation` de @vitrine/shared (dates ISO).
 *
 * Le bucket GCS est **privé** : `sourceImageUrl` et `resultImageUrl` sont
 * renvoyées **signées GET** (1 h) pour que l'app puisse les afficher. En base,
 * les URLs canoniques publiques restent inchangées. Si la signature échoue,
 * l'URL brute est renvoyée (robustesse > affichage).
 */
export async function serializeGeneration(row: GenerationRow): Promise<Generation> {
  const [sourceImageUrl, resultImageUrl] = await Promise.all([
    trySignedReadUrl(row.sourceImageUrl),
    row.resultImageUrl ? trySignedReadUrl(row.resultImageUrl) : Promise.resolve(null),
  ]);
  return {
    id: row.id,
    shopId: row.shopId,
    sourceImageUrl,
    renderType: row.renderType,
    mannequinOption: row.modelOption,
    backgroundOption: row.backgroundOption,
    customBackgroundUrl: row.customBackgroundUrl,
    provider: row.provider,
    status: row.status,
    resultImageUrl,
    error: row.error,
    // Fiche produit OCR telle quelle (données texte, aucune URL à signer).
    productInfo: row.productInfo ?? null,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Crée une génération de bout en bout (utilisé par POST /generations,
 * /regenerate et /variants) :
 *
 *   1. résout la route IA (provider figé) et construit l'input fal — la photo
 *      source, le fond custom et les vues additionnelles (multi-détails) sont
 *      convertis en **URLs signées GET** (bucket privé : fal doit pouvoir les
 *      télécharger) ; la base conserve les URLs canoniques publiques ;
 *   2. **hold 1 crédit** (transaction + FOR UPDATE, cf. services/credits.ts)
 *      — lève InsufficientCreditsError (→ 402) si solde < 1 ;
 *   3. insère la ligne `generations` (status `queued`, params + fond) ;
 *   4. soumet à la queue fal avec webhook → stocke provider_request_id,
 *      status `processing` ;
 *   5. si la soumission échoue → refund du crédit + status `failed`
 *      (la ligne est renvoyée telle quelle, la route décide du code HTTP).
 */
export async function createGeneration(
  db: Db,
  shopId: string,
  params: CreateGenerationRequest,
): Promise<GenerationRow> {
  // Id généré côté app : le hold référence la génération AVANT son insertion.
  const generationId = randomUUID();
  const route = resolveAiRoute(params.renderType, params.mannequinOption);

  // URLs signées pour l'appel fal uniquement (avant le hold : un échec de
  // signature ne coûte aucun crédit). Les vues additionnelles `back`/`detail`
  // sont signées comme la source ; `label` (étiquette) n'est JAMAIS passée à
  // fal (stockée en base pour l'OCR à venir) donc pas signée ici.
  // Pièces de tenue (« sur modèle ») signées comme la source. Les suggestions
  // par défaut (URLs CDN hors bucket) traversent signedReadUrl telles quelles.
  const [
    signedSourceUrl,
    signedBackgroundUrl,
    signedBackUrl,
    signedDetailUrl,
    signedTopUrl,
    signedBottomUrl,
    signedShoesUrl,
  ] = await Promise.all([
    signedReadUrl(params.sourceImageUrl, FAL_INPUT_TTL_SECONDS),
    params.customBackgroundUrl
      ? signedReadUrl(params.customBackgroundUrl, FAL_INPUT_TTL_SECONDS)
      : Promise.resolve(null),
    params.extraImages?.back
      ? signedReadUrl(params.extraImages.back, FAL_INPUT_TTL_SECONDS)
      : Promise.resolve(null),
    params.extraImages?.detail
      ? signedReadUrl(params.extraImages.detail, FAL_INPUT_TTL_SECONDS)
      : Promise.resolve(null),
    params.outfit?.top
      ? signedReadUrl(params.outfit.top, FAL_INPUT_TTL_SECONDS)
      : Promise.resolve(null),
    params.outfit?.bottom
      ? signedReadUrl(params.outfit.bottom, FAL_INPUT_TTL_SECONDS)
      : Promise.resolve(null),
    params.outfit?.shoes
      ? signedReadUrl(params.outfit.shoes, FAL_INPUT_TTL_SECONDS)
      : Promise.resolve(null),
  ]);
  const input = route.adapter.buildInput({
    sourceImageUrl: signedSourceUrl,
    renderType: params.renderType,
    mannequinOption: params.mannequinOption,
    backgroundOption: params.backgroundOption,
    customBackgroundUrl: signedBackgroundUrl,
    extraImageUrls:
      signedBackUrl || signedDetailUrl
        ? {
            ...(signedBackUrl ? { back: signedBackUrl } : {}),
            ...(signedDetailUrl ? { detail: signedDetailUrl } : {}),
          }
        : null,
    garmentType: params.garmentType ?? null,
    outfitImages:
      signedTopUrl || signedBottomUrl || signedShoesUrl
        ? {
            ...(signedTopUrl ? { top: signedTopUrl } : {}),
            ...(signedBottomUrl ? { bottom: signedBottomUrl } : {}),
            ...(signedShoesUrl ? { shoes: signedShoesUrl } : {}),
          }
        : null,
  });

  // 1 crédit réservé (= débité, cf. design du ledger). Throw → aucune ligne créée.
  const holdLedgerId = await holdCredit(getTxDb(), shopId, generationId);

  let row: GenerationRow;
  try {
    const [inserted] = await db
      .insert(generations)
      .values({
        id: generationId,
        shopId,
        sourceImageUrl: params.sourceImageUrl,
        renderType: params.renderType,
        modelOption: params.mannequinOption,
        backgroundOption: params.backgroundOption,
        customBackgroundUrl: params.customBackgroundUrl ?? null,
        // URLs GCS canoniques (les URLs signées ne servent qu'à l'appel fal).
        extraImages: params.extraImages ?? null,
        garmentType: params.garmentType ?? null,
        outfit: params.outfit ?? null,
        provider: route.provider,
        status: 'queued',
        holdLedgerId,
      })
      .returning();
    if (!inserted) throw new Error('INSERT generations sans ligne retournée');
    row = inserted;
  } catch (err) {
    // La génération n'existe pas : on rend le crédit et on propage.
    await refundCredit(db, shopId, generationId);
    throw err;
  }

  try {
    const requestId = await submitToFal(route.endpoint, input, generationId);
    const [updated] = await db
      .update(generations)
      .set({ providerRequestId: requestId, status: 'processing' })
      .where(eq(generations.id, generationId))
      .returning();
    return updated ?? row;
  } catch (err) {
    // Soumission fal impossible → refund + failed (idempotent côté ledger).
    await refundCredit(db, shopId, generationId);
    const [failed] = await db
      .update(generations)
      .set({ status: 'failed', error: errorMessage(err), completedAt: new Date() })
      .where(eq(generations.id, generationId))
      .returning();
    return failed ?? { ...row, status: 'failed' as const, error: errorMessage(err) };
  }
}

/**
 * Finalise une génération en **échec** : refund du crédit (idempotent) +
 * status `failed` + completed_at. Partagée par le webhook fal et le reconcile
 * (polling) — rejouer l'une ou l'autre voie ne re-crédite jamais deux fois.
 */
export async function finalizeGenerationFailure(
  db: Db,
  row: GenerationRow,
  error: string,
  log: GenerationLogger,
): Promise<GenerationRow> {
  await refundCredit(db, row.shopId, row.id);
  const [failed] = await db
    .update(generations)
    .set({ status: 'failed', error, completedAt: new Date() })
    .where(eq(generations.id, row.id))
    .returning();
  log.info({ generationId: row.id, error }, 'Génération fal échouée — crédit remboursé');

  // Push Expo fire-and-forget (jamais de throw ni de blocage, cf. push.ts) —
  // envoyé même app au premier plan (le handler de notifs côté client filtre).
  void sendPushToShop(
    db,
    row.shopId,
    {
      title: 'La génération a échoué',
      body: 'Crédit remboursé — tu peux relancer quand tu veux.',
      data: { generationId: row.id },
    },
    log,
  );
  return failed ?? { ...row, status: 'failed' as const, error };
}

/**
 * Finalise une génération en **succès** à partir du payload de sortie fal
 * (webhook `payload` ou `result.data` de la queue) : parse via l'adapter du
 * provider → télécharge le rendu → upload GCS (results/{authUserId}/{genId})
 * → status `done` + result_image_url + completed_at.
 *
 * - Payload sans image exploitable (parse) → échec **définitif** : délègue à
 *   {@link finalizeGenerationFailure} (refund) et renvoie la row `failed`.
 * - Erreur **transitoire** (shop introuvable, download, GCS, DB) → throw :
 *   le webhook répond 500 (fal rejoue), le reconcile réessaie au poll suivant.
 */
export async function finalizeGenerationSuccess(
  db: Db,
  row: GenerationRow,
  falPayload: unknown,
  log: GenerationLogger,
): Promise<GenerationRow> {
  let falImageUrl: string;
  try {
    if (!row.provider) throw new Error(`Génération ${row.id} sans provider — parse impossible`);
    falImageUrl = ADAPTERS[row.provider].parseOutput(falPayload).imageUrl;
  } catch (err) {
    // fal dit OK mais pas d'image exploitable : retenter ne changera rien.
    log.error({ generationId: row.id, error: errorMessage(err) }, 'Payload fal OK sans image — refund');
    return finalizeGenerationFailure(db, row, errorMessage(err), log);
  }

  const [shop] = await db.select().from(shops).where(eq(shops.id, row.shopId));
  if (!shop) throw new Error(`Shop ${row.shopId} introuvable (génération ${row.id})`);

  // Nano génère déjà en 2K natif (cf. adapters) → pas de post-upscale nécessaire.
  const res = await fetch(falImageUrl);
  if (!res.ok) throw new Error(`Téléchargement du rendu impossible (${res.status})`);
  const data = Buffer.from(await res.arrayBuffer());
  const resultImageUrl = await uploadResultImage(
    shop.authId,
    row.id,
    data,
    res.headers.get('content-type'),
  );

  const [done] = await db
    .update(generations)
    .set({ status: 'done', resultImageUrl, error: null, completedAt: new Date() })
    .where(eq(generations.id, row.id))
    .returning();
  log.info({ generationId: row.id, resultImageUrl }, 'Génération terminée (done)');
  const doneRow = done ?? { ...row, status: 'done' as const, resultImageUrl, error: null };

  // Push Expo fire-and-forget (jamais de throw ni de blocage, cf. push.ts) —
  // envoyé même app au premier plan (le handler de notifs côté client filtre).
  void sendPushToShop(
    db,
    row.shopId,
    {
      title: 'Ton visuel VITRINE est prêt',
      body: 'Ouvre l’app pour le découvrir.',
      data: { generationId: row.id },
    },
    log,
  );

  // OCR étiquette → fiche produit : fire-and-forget APRÈS le passage en done.
  // Ne bloque ni ne fait échouer la finalisation (la promesse ne rejette
  // jamais, cf. extractAndStoreProductInfo) — la fiche apparaît au poll suivant.
  void extractAndStoreProductInfo(db, doneRow, log);
  return doneRow;
}

/**
 * OCR de la fiche produit (best-effort, non bloquant) : si la génération a une
 * photo d'étiquette et/ou de détail matière (`extra_images.label` / `.detail`)
 * et pas encore de `product_info`, lit ces images avec le modèle vision fal
 * ({@link extractProductInfo}) et stocke la fiche extraite.
 *
 * Ne throw JAMAIS : un échec (signature GCS, fal, DB) est loggé en warn et
 * laisse `product_info` à null — le rendu reste `done` dans tous les cas.
 * Lancée en fire-and-forget depuis {@link finalizeGenerationSuccess}.
 */
export async function extractAndStoreProductInfo(
  db: Db,
  row: GenerationRow,
  log: GenerationLogger,
): Promise<void> {
  try {
    if (row.productInfo) return; // déjà extraite (webhook rejoué / reconcile)
    const label = row.extraImages?.label;
    const detail = row.extraImages?.detail;
    if (!label && !detail) return;

    // URLs signées GET (bucket privé) : étiquette en priorité, détail en complément.
    const [labelUrl, detailUrl] = await Promise.all([
      label ? signedReadUrl(label, FAL_INPUT_TTL_SECONDS) : Promise.resolve(null),
      detail ? signedReadUrl(detail, FAL_INPUT_TTL_SECONDS) : Promise.resolve(null),
    ]);
    const info = await extractProductInfo(labelUrl, detailUrl, log);
    if (!info) return; // échec déjà loggé côté OCR — le rendu reste done sans fiche.

    await db.update(generations).set({ productInfo: info }).where(eq(generations.id, row.id));
    log.info({ generationId: row.id, productInfo: info }, 'Fiche produit OCR extraite et stockée');
  } catch (err) {
    log.warn(
      { generationId: row.id, error: errorMessage(err) },
      "OCR de l'étiquette échoué — product_info laissé null",
    );
  }
}

/** Message le plus utile possible depuis un ApiError fal (result d'une requête échouée). */
function falApiErrorMessage(err: ApiError<unknown>): string {
  const detail = (err.body as { detail?: unknown } | null | undefined)?.detail;
  if (detail !== undefined) return JSON.stringify(detail).slice(0, 500);
  return err.message || `Génération échouée côté fal (HTTP ${err.status})`;
}

/**
 * Réconcilie une génération en cours avec la queue fal — **polling DEV/local**
 * où le webhook (`API_PUBLIC_URL=http://localhost`) est injoignable par fal.
 * Appelée par GET /generations/:id : le polling de l'app pilote la complétion.
 *
 * - status ∉ {queued, processing} ou pas de provider_request_id → row inchangée.
 * - `fal.queue.status` = IN_QUEUE / IN_PROGRESS → row inchangée (on repollera).
 * - COMPLETED → `fal.queue.result` → {@link finalizeGenerationSuccess}.
 *   Un `ApiError` sur le result = la requête a échoué côté fal →
 *   {@link finalizeGenerationFailure} (refund).
 * - Toute erreur transitoire (réseau fal, GCS, DB) est loggée et la row est
 *   renvoyée telle quelle : le GET ne doit jamais échouer à cause du reconcile.
 */
export async function reconcileGeneration(
  db: Db,
  row: GenerationRow,
  log: GenerationLogger,
): Promise<GenerationRow> {
  if (row.status !== 'queued' && row.status !== 'processing') return row;
  if (!row.providerRequestId || !row.provider) return row;

  const endpoint = endpointForProvider(row.provider);
  const requestId = row.providerRequestId;

  let queueStatus: string;
  try {
    queueStatus = (await getFalQueueStatus(endpoint, requestId)).status;
  } catch (err) {
    log.warn(
      { generationId: row.id, requestId, error: errorMessage(err) },
      'Reconcile fal : statut irrécupérable — row renvoyée telle quelle',
    );
    return row;
  }

  // Toujours en file / en cours → l'app continue de poller.
  if (queueStatus !== 'COMPLETED' && queueStatus !== 'ERROR') return row;

  try {
    if (queueStatus === 'ERROR') {
      // Défensif : hors du type QueueStatus du client, mais couvert au cas où.
      return await finalizeGenerationFailure(
        db,
        row,
        'Génération échouée côté fal (status ERROR)',
        log,
      );
    }
    const result = await getFalQueueResult(endpoint, requestId);
    return await finalizeGenerationSuccess(db, row, result.data, log);
  } catch (err) {
    let reported: unknown = err;
    try {
      // COMPLETED mais result en erreur HTTP → la génération a échoué côté fal.
      if (err instanceof ApiError) {
        return await finalizeGenerationFailure(db, row, falApiErrorMessage(err), log);
      }
    } catch (finalizeErr) {
      reported = finalizeErr; // échec du refund/update (DB) : traité comme transitoire.
    }
    // Erreur transitoire (réseau, GCS, DB) : on réessaiera au prochain poll.
    log.warn(
      { generationId: row.id, requestId, error: errorMessage(reported) },
      'Reconcile fal : finalisation reportée',
    );
    return row;
  }
}

/**
 * Nombre de générations `done` du shop — stat « Visuels » de l'écran 08
 * (le temps gagné en découle : × MINUTES_SAVED_PER_VISUAL).
 */
export async function countDoneGenerations(db: Db, shopId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(generations)
    .where(and(eq(generations.shopId, shopId), eq(generations.status, 'done')));
  return row?.count ?? 0;
}

/** Génération scopée propriétaire (shop courant) — null si absente/étrangère. */
export async function findOwnedGeneration(
  db: Db,
  shopId: string,
  generationId: string,
): Promise<GenerationRow | null> {
  const [row] = await db.select().from(generations).where(eq(generations.id, generationId));
  if (!row || row.shopId !== shopId) return null;
  return row;
}
