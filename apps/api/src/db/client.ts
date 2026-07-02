import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
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

export { schema };
