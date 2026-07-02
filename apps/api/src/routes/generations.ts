import {
  createGenerationRequestSchema,
  createGenerationResponseSchema,
  createVariantsRequestSchema,
  createVariantsResponseSchema,
  getGenerationResponseSchema,
  type CreateGenerationRequest,
} from '@vitrine/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { getDb } from '../db/client.js';
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
    renderType,
    mannequinOption: row.modelOption,
    backgroundOption: row.backgroundOption,
    ...(row.customBackgroundUrl ? { customBackgroundUrl: row.customBackgroundUrl } : {}),
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
    const shop = await upsertShopByAuthId(db, req.authUserId);

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
    const shop = await upsertShopByAuthId(db, req.authUserId);
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
    const shop = await upsertShopByAuthId(db, req.authUserId);
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
    const shop = await upsertShopByAuthId(db, req.authUserId);
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
