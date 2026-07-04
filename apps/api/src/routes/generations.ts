import {
  createBatchRequestSchema,
  createBatchResponseSchema,
  createGenerationRequestSchema,
  createGenerationResponseSchema,
  createVariantsRequestSchema,
  createVariantsResponseSchema,
  getGenerationResponseSchema,
  type CreateGenerationRequest,
  type GenerationStatus,
} from '@vitrine/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { getDb, getTxDb } from '../db/client.js';
import { getBalance, InsufficientCreditsError } from '../services/credits.js';
import {
  createGeneration,
  findOwnedGeneration,
  reconcileGeneration,
  serializeGeneration,
  type GenerationRow,
} from '../services/generations.js';
import { upsertShopByAuthId } from '../services/shops.js';

const idParamSchema = z.object({ id: z.string().uuid() });

/** 402 Payment Required — solde insuffisant pour réserver le(s) crédit(s). */
function replyInsufficientCredits(reply: FastifyReply, err: InsufficientCreditsError) {
  return reply.code(402).send({ error: 'Insufficient credits', balance: err.balance });
}

/** Params d'une nouvelle génération à partir d'une ligne existante (regenerate/variants). */
function paramsFromRow(row: GenerationRow, renderType = row.renderType): CreateGenerationRequest {
  return {
    sourceImageUrl: row.sourceImageUrl,
    subjectType: row.subjectType,
    renderType,
    mannequinOption: row.modelOption,
    ...(row.mannequinId ? { mannequinId: row.mannequinId } : {}),
    backgroundOption: row.backgroundOption,
    ...(row.customBackgroundUrl ? { customBackgroundUrl: row.customBackgroundUrl } : {}),
    // Multi-détails : les vues additionnelles suivent la génération d'origine.
    ...(row.extraImages ? { extraImages: row.extraImages } : {}),
    // « Sur modèle » : le type de pièce + la tenue complétée suivent aussi.
    ...(row.garmentType ? { garmentType: row.garmentType } : {}),
    ...(row.outfit ? { outfit: row.outfit } : {}),
    // Objet : ambiance lumière + scène suivent la génération d'origine.
    ...(row.lighting ? { lighting: row.lighting } : {}),
    ...(row.scene ? { scene: row.scene } : {}),
  };
}

/**
 * Pipeline de génération IA (M3a) :
 * - POST /generations                 : hold 1 crédit → insert → submit fal (webhook).
 * - GET  /generations/:id             : polling écran 04 (scopé propriétaire).
 * - POST /generations/:id/regenerate  : mêmes params, nouvelle génération (1 crédit).
 * - POST /generations/:id/variants    : N types de rendu → N générations (N crédits).
 */
export function registerGenerationRoutes(app: FastifyInstance): void {
  app.post('/generations', async (req, reply) => {
    const parsed = createGenerationRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Bad Request', details: parsed.error.flatten().fieldErrors });
    }

    const db = getDb();
    const shop = await upsertShopByAuthId(getTxDb(), req.authUserId);

    let row: GenerationRow;
    try {
      row = await createGeneration(db, shop.id, parsed.data);
    } catch (err) {
      if (err instanceof InsufficientCreditsError) return replyInsufficientCredits(reply, err);
      throw err;
    }

    const creditsRemaining = await getBalance(db, shop.id);
    const payload = createGenerationResponseSchema.parse({
      generation: await serializeGeneration(row),
      creditsRemaining,
    });
    // Soumission fal échouée → crédit remboursé, génération failed : 502 explicite.
    return reply.code(row.status === 'failed' ? 502 : 201).send(payload);
  });

  app.get('/generations/:id', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: 'Not Found' });

    const db = getDb();
    const shop = await upsertShopByAuthId(getTxDb(), req.authUserId);
    const row = await findOwnedGeneration(db, shop.id, params.data.id);
    if (!row) return reply.code(404).send({ error: 'Not Found' });

    // DEV/local sans webhook public : le polling de l'app pilote la complétion
    // (statut fal → finalisation done/failed). Ne jette jamais (cf. reconcile).
    const reconciled = await reconcileGeneration(db, row, req.log);

    return getGenerationResponseSchema.parse({ generation: await serializeGeneration(reconciled) });
  });

  app.post('/generations/:id/regenerate', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: 'Not Found' });

    const db = getDb();
    const shop = await upsertShopByAuthId(getTxDb(), req.authUserId);
    const source = await findOwnedGeneration(db, shop.id, params.data.id);
    if (!source) return reply.code(404).send({ error: 'Not Found' });

    let row: GenerationRow;
    try {
      row = await createGeneration(db, shop.id, paramsFromRow(source));
    } catch (err) {
      if (err instanceof InsufficientCreditsError) return replyInsufficientCredits(reply, err);
      throw err;
    }

    const creditsRemaining = await getBalance(db, shop.id);
    const payload = createGenerationResponseSchema.parse({
      generation: await serializeGeneration(row),
      creditsRemaining,
    });
    return reply.code(row.status === 'failed' ? 502 : 201).send(payload);
  });

  app.post('/generations/:id/variants', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: 'Not Found' });

    const parsed = createVariantsRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Bad Request', details: parsed.error.flatten().fieldErrors });
    }

    const db = getDb();
    const shop = await upsertShopByAuthId(getTxDb(), req.authUserId);
    const source = await findOwnedGeneration(db, shop.id, params.data.id);
    if (!source) return reply.code(404).send({ error: 'Not Found' });

    // Dédoublonne les types demandés (pas de double crédit pour un même type).
    const renderTypes = [...new Set(parsed.data.renderTypes)];

    // Pré-check du solde (le hold transactionnel reste l'unique garde-fou).
    const balance = await getBalance(db, shop.id);
    if (balance < renderTypes.length) {
      return reply.code(402).send({ error: 'Insufficient credits', balance });
    }

    const rows: GenerationRow[] = [];
    for (const renderType of renderTypes) {
      try {
        rows.push(await createGeneration(db, shop.id, paramsFromRow(source, renderType)));
      } catch (err) {
        if (err instanceof InsufficientCreditsError) break; // solde épuisé en cours de route
        throw err;
      }
    }

    const creditsRemaining = await getBalance(db, shop.id);
    if (rows.length === 0) {
      return reply.code(402).send({ error: 'Insufficient credits', balance: creditsRemaining });
    }
    const payload = createVariantsResponseSchema.parse({
      generations: await Promise.all(rows.map((r) => serializeGeneration(r))),
      creditsRemaining,
    });
    return reply.code(201).send(payload);
  });
}

/**
 * POST /generations/batch — lot de générations (1..MAX_BATCH_ITEMS items) avec
 * un **style commun** (rendu, mannequin, fond) appliqué à tous les items :
 *
 * - pré-check global du solde (≥ items.length) AVANT tout hold → 402 sinon
 *   (le hold transactionnel par item reste l'unique garde-fou anti-course) ;
 * - puis, item par item, {@link createGeneration} (hold 1 crédit + insert +
 *   submit fal). Une soumission fal qui échoue ne concerne que SON item :
 *   crédit remboursé, statut `failed` renvoyé, les items suivants continuent.
 * - Réponse 201 : `{ generations: [{ id, status }, ...] }` — l'app polle
 *   ensuite chaque id via GET /generations/:id.
 */
export function registerGenerationBatchRoutes(app: FastifyInstance): void {
  app.post('/generations/batch', async (req, reply) => {
    const parsed = createBatchRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Bad Request', details: parsed.error.flatten().fieldErrors });
    }

    const db = getDb();
    const shop = await upsertShopByAuthId(getTxDb(), req.authUserId);
    const {
      items,
      renderType,
      mannequinOption,
      mannequinId,
      backgroundOption,
      customBackgroundUrl,
      garmentType,
      outfit,
    } = parsed.data;

    // Le lot entier doit être finançable AVANT le premier hold : pas de lot
    // « à moitié lancé » pour cause de solde connu d'avance insuffisant.
    const balance = await getBalance(db, shop.id);
    if (balance < items.length) {
      return reply.code(402).send({ error: 'Insufficient credits', balance });
    }

    const results: Array<{ id: string; status: GenerationStatus }> = [];
    for (const item of items) {
      try {
        const row = await createGeneration(db, shop.id, {
          sourceImageUrl: item.sourceImageUrl,
          // Le lot reste vêtement uniquement en v1.
          subjectType: 'vetement',
          renderType,
          mannequinOption,
          ...(mannequinId ? { mannequinId } : {}),
          backgroundOption,
          ...(customBackgroundUrl ? { customBackgroundUrl } : {}),
          // Tenue commune au lot (« sur modèle » uniquement).
          ...(garmentType ? { garmentType } : {}),
          ...(outfit ? { outfit } : {}),
        });
        results.push({ id: row.id, status: row.status });
      } catch (err) {
        // Course sur le solde malgré le pré-check (dépense concurrente) :
        // on arrête le lot, les items déjà créés restent valides.
        if (err instanceof InsufficientCreditsError) break;
        throw err;
      }
    }

    if (results.length === 0) {
      return reply
        .code(402)
        .send({ error: 'Insufficient credits', balance: await getBalance(db, shop.id) });
    }

    const payload = createBatchResponseSchema.parse({ generations: results });
    return reply.code(201).send(payload);
  });
}
