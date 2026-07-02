import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    // Requis uniquement pour db:migrate / studio — db:generate fonctionne hors-ligne.
    url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/vitrine',
  },
});
