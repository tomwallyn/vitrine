// Test live auth+DB : crée un user Clerk de test, forge un JWT de session,
// appelle GET /me et vérifie la création de la boutique. Temp (non commité).
const SECRET = process.env.CLERK_SECRET_KEY;
const API = 'https://api.clerk.com/v1';
const h = { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' };

const email = `vitrine-test-${Date.now()}@example.com`;
const password = `Vitr!ne-${Date.now()}-Aa9`;

let r = await fetch(`${API}/users`, {
  method: 'POST', headers: h,
  body: JSON.stringify({ email_address: [email], password }),
});
let user = await r.json();
if (!r.ok) { console.error('CREATE USER FAIL', r.status, JSON.stringify(user).slice(0, 400)); process.exit(1); }
console.log('user     :', user.id);

r = await fetch(`${API}/sessions`, { method: 'POST', headers: h, body: JSON.stringify({ user_id: user.id }) });
let session = await r.json();
if (!r.ok) { console.error('CREATE SESSION FAIL', r.status, JSON.stringify(session).slice(0, 400)); process.exit(1); }
console.log('session  :', session.id);

r = await fetch(`${API}/sessions/${session.id}/tokens`, { method: 'POST', headers: h });
let tok = await r.json();
if (!r.ok) { console.error('TOKEN FAIL', r.status, JSON.stringify(tok).slice(0, 400)); process.exit(1); }
console.log('jwt      : len', tok.jwt.length);

r = await fetch('http://localhost:8080/me', { headers: { Authorization: `Bearer ${tok.jwt}` } });
const me = await r.json();
console.log('GET /me  :', r.status, JSON.stringify(me));

// Deuxième appel : doit renvoyer la MÊME boutique (upsert idempotent)
r = await fetch('http://localhost:8080/me', { headers: { Authorization: `Bearer ${tok.jwt}` } });
const me2 = await r.json();
console.log('GET /me#2:', r.status, 'même shop id =', me2?.id === me?.id);

console.log('AUTH_ID=' + user.id);
