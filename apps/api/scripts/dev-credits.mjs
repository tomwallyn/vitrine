// Outil DEV — gérer les crédits des boutiques (via ledger).
//   node --env-file=.env scripts/dev-credits.mjs list
//   node --env-file=.env scripts/dev-credits.mjs grant <montant> [shopId]
// Sans shopId, crédite la boutique la plus récemment créée (probablement la tienne).
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const [cmd, arg1, arg2] = process.argv.slice(2);

async function list() {
  const rows = await sql`
    SELECT s.name, s.city, s.id, s.auth_id, s.created_at,
      COALESCE((SELECT SUM(delta) FROM credits_ledger l WHERE l.shop_id = s.id), 0) AS solde
    FROM shops s ORDER BY s.created_at DESC`;
  if (rows.length === 0) return console.log('Aucune boutique. Connecte-toi d’abord dans l’app (GET /me la crée).');
  console.table(rows.map((r) => ({ name: r.name, ville: r.city, solde: Number(r.solde), id: r.id, créée: r.created_at })));
}

async function grant(amount, shopId) {
  if (!Number.isFinite(amount)) return console.log('Montant invalide. Ex : grant 50');
  if (!shopId) {
    const [latest] = await sql`SELECT id, name FROM shops ORDER BY created_at DESC LIMIT 1`;
    if (!latest) return console.log('Aucune boutique. Connecte-toi d’abord dans l’app.');
    shopId = latest.id;
    console.log(`→ boutique la plus récente : ${latest.name} (${shopId})`);
  }
  await sql`INSERT INTO credits_ledger (shop_id, delta, reason) VALUES (${shopId}, ${amount}, 'bonus')`;
  const [{ solde }] = await sql`SELECT COALESCE(SUM(delta), 0) AS solde FROM credits_ledger WHERE shop_id = ${shopId}`;
  console.log(`✅ +${amount} crédits → nouveau solde : ${Number(solde)}`);
}

if (cmd === 'grant') await grant(Number(arg1), arg2);
else await list();
