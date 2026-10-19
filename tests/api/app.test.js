// Tests d'intégration de l'application complète (sans base de données :
// on n'exerce que les chemins qui répondent avant tout appel Supabase).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Les handlers créent leur client Supabase à l'import : variables factices.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role';
process.env.NODE_ENV = 'test';

const { createApp } = await import('../../api/app.js');

let server; let base;
before(async () => {
  const app = createApp({
    env: { ...process.env, NODE_ENV: 'test' },
    rateLimits: { global: 1000, write: 1000, sensitive: 1000 },
    logger: { log() {} },
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
  const r = await fetch(`${base}/api/nope`);
  assert.equal(r.status, 404);
  assert.match((await r.json()).error, /introuvable/);
});

test('JSON invalide → 400 (et non 500)', async () => {
  const r = await post('/api/ateliers', '{pas du json', {});
  assert.equal(r.status, 400);
});

test('POST /api/profiles sans Idempotency-Key → 400 IDEMPOTENCY_KEY_REQUIRED', async () => {
  const r = await post('/api/profiles', { email: 'a@b.dz' });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).code, 'IDEMPOTENCY_KEY_REQUIRED');
});

test('POST /api/import : clé obligatoire, puis réponse rejouée à l\'identique', async () => {
  const none = await post('/api/import', { interventions: [], unite_id: 1 });
  assert.equal(none.status, 400);
  assert.equal((await none.json()).code, 'IDEMPOTENCY_KEY_REQUIRED');

  const headers = { 'Idempotency-Key': 'import-test-0001' };
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
  });
  const s = await new Promise((r) => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
  const url = `http://127.0.0.1:${s.address().port}/api/profiles`;
  const codes = [];
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `rl-test-${i}-aaaa` },
      body: JSON.stringify({}),
    });
    codes.push(r.status);
  }
  await new Promise((r) => s.close(r));
  // 2 premières passent le limiteur (400 : champs manquants), les suivantes sont bloquées
  assert.deepEqual(codes, [400, 400, 429, 429]);
});
