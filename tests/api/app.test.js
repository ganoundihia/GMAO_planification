// Tests d'intégration de l'application complète (sans base de données :
// on n'exerce que les chemins qui répondent avant tout appel Supabase).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Les handlers créent leur client Supabase à l'import : variables factices.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role';
process.env.NODE_ENV = 'test';

const { createApp } = await import('../../api/app.js');

// Vérificateur factice : jeton → identité (aucun appel Supabase).
const IDENTITIES = {
  'tok-super':  { user: { id: 'u-super', email: 'super@setram.dz' },  profile: { role: 'super_admin' } },
  'tok-admin':  { user: { id: 'u-admin', email: 'admin@setram.dz' },  profile: { role: 'admin' } },
  'tok-charge': { user: { id: 'u-charge', email: 'charge@setram.dz' }, profile: { role: 'charge_unite' } },
  'tok-noprof': { user: { id: 'u-new', email: 'new@setram.dz' },      profile: null },
};
const verifyToken = async (t) => IDENTITIES[t] ?? null;
const auth = (t) => ({ Authorization: `Bearer ${t}` });

let server; let base;
before(async () => {
  const app = createApp({
    env: { ...process.env, NODE_ENV: 'test' },
    rateLimits: { global: 1000, write: 1000, sensitive: 1000 },
    logger: { log() {} },
    verifyToken,
  });
  server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((r) => server.close(r)));

const post = (path, body, headers = {}) => fetch(`${base}${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('GET /healthz → 200 + X-Request-Id', async () => {
  const r = await fetch(`${base}/healthz`);
  assert.equal(r.status, 200);
  assert.ok(r.headers.get('x-request-id'));
  assert.equal(r.headers.get('x-powered-by'), null);
});

test('route inconnue → 404 JSON', async () => {
  const r = await fetch(`${base}/api/nope`, { headers: auth('tok-charge') });
  assert.equal(r.status, 404);
  assert.match((await r.json()).error, /introuvable/);
});

test('JSON invalide → 400 (et non 500)', async () => {
  const r = await post('/api/ateliers', '{pas du json', auth('tok-charge'));
  assert.equal(r.status, 400);
});

test('POST /api/profiles sans Idempotency-Key → 400 IDEMPOTENCY_KEY_REQUIRED', async () => {
  const r = await post('/api/profiles', { email: 'a@b.dz' }, auth('tok-super'));
  assert.equal(r.status, 400);
  assert.equal((await r.json()).code, 'IDEMPOTENCY_KEY_REQUIRED');
});

test('POST /api/import : clé obligatoire, puis réponse rejouée à l\'identique', async () => {
  const none = await post('/api/import', { interventions: [], unite_id: 1 }, auth('tok-admin'));
  assert.equal(none.status, 400);
  assert.equal((await none.json()).code, 'IDEMPOTENCY_KEY_REQUIRED');

  const headers = { 'Idempotency-Key': 'import-test-0001', ...auth('tok-admin') };
  const first = await post('/api/import', { interventions: [], unite_id: 1 }, headers);
  const second = await post('/api/import', { interventions: [], unite_id: 1 }, headers);
  assert.equal(first.status, 400);                       // « Aucune intervention fournie »
  assert.equal(second.status, 400);
  assert.equal(second.headers.get('idempotent-replayed'), 'true');
});

test('rate limiting branché sur l\'app : /api/profiles (écriture) plafonné', async () => {
  const app = createApp({
    env: { ...process.env, NODE_ENV: 'test' },
    rateLimits: { global: 1000, write: 1000, sensitive: 2 },
    logger: { log() {} },
    verifyToken,
  });
  const s = await new Promise((r) => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
  const url = `http://127.0.0.1:${s.address().port}/api/profiles`;
  const codes = [];
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `rl-test-${i}-aaaa`, ...auth('tok-super') },
      body: JSON.stringify({}),
    });
    codes.push(r.status);
  }
  await new Promise((r) => s.close(r));
  // 2 premières passent le limiteur (400 : champs manquants), les suivantes sont bloquées
  assert.deepEqual(codes, [400, 400, 429, 429]);
});

// ── Authentification et rôles ───────────────────────────────────────────────

test('sans jeton → 401 AUTH_REQUIRED', async () => {
  const r = await fetch(`${base}/api/ateliers`);
  assert.equal(r.status, 401);
  assert.equal((await r.json()).code, 'AUTH_REQUIRED');
});

test('jeton invalide → 401 AUTH_INVALID', async () => {
  const r = await fetch(`${base}/api/ateliers`, { headers: auth('tok-faux') });
  assert.equal(r.status, 401);
  assert.equal((await r.json()).code, 'AUTH_INVALID');
});

test('compte sans profil → 403 sur les routes métier', async () => {
  const r = await fetch(`${base}/api/ateliers`, { headers: auth('tok-noprof') });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).code, 'PROFILE_REQUIRED');
});

test('/api/profiles : écriture refusée à un admin (réservée au super_admin)', async () => {
  const r = await post('/api/profiles', { email: 'x@y.dz' }, { ...auth('tok-admin'), 'Idempotency-Key': 'prof-admin-0001' });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).code, 'FORBIDDEN');
});

test('/api/profiles : liste complète refusée hors super_admin', async () => {
  const r = await fetch(`${base}/api/profiles`, { headers: auth('tok-charge') });
  assert.equal(r.status, 403);
});

test('/api/profiles : profil d’un autre utilisateur refusé', async () => {
  const r = await fetch(`${base}/api/profiles?user_id=u-super`, { headers: auth('tok-charge') });
  assert.equal(r.status, 403);
});

test('/api/import refusé à un charge_unite', async () => {
  const r = await post('/api/import', { interventions: [] }, { ...auth('tok-charge'), 'Idempotency-Key': 'import-charge-01' });
  assert.equal(r.status, 403);
});

test('GET /api/fichiers/fiches reste public (lien direct) mais confiné', async () => {
  const r = await fetch(`${base}/api/fichiers/fiches?path=../package.json`);
  assert.equal(r.status, 403);
  assert.match((await r.json()).error, /Chemin non autorisé/);
});

test('/api/fichiers/fiches-list exige un jeton', async () => {
  const r = await fetch(`${base}/api/fichiers/fiches-list`);
  assert.equal(r.status, 401);
});
