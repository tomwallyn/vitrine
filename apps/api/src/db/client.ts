import { neon, Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { drizzle as drizzleWs } from 'drizzle-orm/neon-serverless';
import * as schema from './schema.js';

/**
 * Client Drizzle sur le driver HTTP Neon (serverless) — adapté à Cloud Run
 * (scale-to-zero, pas de pool TCP à gérer).
 */
export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

export type Db = ReturnType<typeof createDb>;

let db: Db | null = null;

/**
 * Singleton paresseux : le client n'est créé qu'au premier appel, pour que
 * l'app puisse se construire (typecheck/build) sans DATABASE_URL.
 */
export function getDb(): Db {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL manquant — copiez apps/api/.env.example vers .env');
    }
    db = createDb(url);
  }
  return db;
}

/**
 * Client Drizzle transactionnel sur le driver WebSocket Neon.
 *
 * Le driver HTTP (getDb) ne supporte PAS les transactions interactives
 * (BEGIN → SELECT ... FOR UPDATE → décision → INSERT → COMMIT) : c'est le
 * pattern recommandé par Neon — HTTP pour les requêtes one-shot, WebSocket
 * pour les transactions (ici : réservation atomique d'un crédit, cf.
 * services/credits.ts). Nécessite un WebSocket global (Node ≥ 22 — le
 * Dockerfile est sur node:24).
 */
export function createTxDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  return drizzleWs(pool, { schema });
}

export type TxDb = ReturnType<typeof createTxDb>;

let txDb: TxDb | null = null;

/** Singleton paresseux du client transactionnel (même contrat que getDb). */
export function getTxDb(): TxDb {
  if (!txDb) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL manquant — copiez apps/api/.env.example vers .env');
    }
    txDb = createTxDb(url);
  }
  return txDb;
}

export { schema };
