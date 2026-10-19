// Tests des middlewares d'idempotence, de rate limiting et d'expurgation des logs.
// Lancer : npm test   (runner natif Node, aucune dépendance de test supplémentaire)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { idempotency, MemoryIdempotencyStore } from '../../api/_lib/idempotency.js';
import { createRateLimiters } from '../../api/_lib/rateLimit.js';
import { redact } from '../../api/_lib/logger.js';

// ── utilitaires ─────────────────────────────────────────────────────────────
async function serve(app) {
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}
const post = (url, body, headers = {}) => fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function idemApp({ required, handler } = {}) {
  const store = new MemoryIdempotencyStore();
  const calls = { n: 0 };
  const app = express();
  app.use(express.json());
  app.use(idempotency({ store, required }));
  app.post('/create', handler ?? (async (req, res) => {
    calls.n += 1;
    res.status(201).json({ id: calls.n, echo: req.body });
  }));
  app.get('/read', (_req, res) => { calls.n += 1; res.json({ ok: true }); });
  return { app, calls, store };
}

// ── Idempotence ─────────────────────────────────────────────────────────────
test('idempotence : même clé + même corps → exécuté une seule fois, réponse rejouée', async () => {
  const { app, calls, store } = idemApp();
  const s = await serve(app);
  const headers = { 'Idempotency-Key': 'key-aaaaaaaa-1' };

  const r1 = await post(`${s.base}/create`, { a: 1 }, headers);
  const r2 = await post(`${s.base}/create`, { a: 1 }, headers);

  assert.equal(r1.status, 201);
  assert.equal(r2.status, 201);
  assert.equal(r1.headers.get('idempotent-replayed'), null);
  assert.equal(r2.headers.get('idempotent-replayed'), 'true');
  assert.deepEqual(await r2.json(), await r1.json());
  assert.equal(calls.n, 1, 'le handler ne doit s\'exécuter qu\'une fois');
  store.close(); await s.close();
});

test('idempotence : même clé + corps différent → 422', async () => {
  const { app, calls, store } = idemApp();
  const s = await serve(app);
  const headers = { 'Idempotency-Key': 'key-bbbbbbbb-2' };

  await post(`${s.base}/create`, { a: 1 }, headers);
  const r = await post(`${s.base}/create`, { a: 2 }, headers);

  assert.equal(r.status, 422);
  assert.equal((await r.json()).code, 'IDEMPOTENCY_KEY_REUSED');
  assert.equal(calls.n, 1);
  store.close(); await s.close();
});

test('idempotence : requêtes concurrentes identiques → une seule exécution, l\'autre reçoit 409', async () => {
  let executions = 0;
  const { app, store } = idemApp({
    handler: async (_req, res) => { executions += 1; await sleep(150); res.status(201).json({ ok: true }); },
  });
  const s = await serve(app);
  const headers = { 'Idempotency-Key': 'key-cccccccc-3' };

  const [a, b] = await Promise.all([
    post(`${s.base}/create`, { x: 1 }, headers),
    post(`${s.base}/create`, { x: 1 }, headers),
  ]);

  assert.deepEqual([a.status, b.status].sort(), [201, 409]);
  assert.equal(executions, 1);
  store.close(); await s.close();
});

test('idempotence : une erreur 5xx n\'est pas mémorisée (le retry s\'exécute)', async () => {
  let n = 0;
  const { app, store } = idemApp({
    handler: (_req, res) => { n += 1; res.status(n === 1 ? 500 : 201).json({ attempt: n }); },
  });
  const s = await serve(app);
  const headers = { 'Idempotency-Key': 'key-dddddddd-4' };

  const r1 = await post(`${s.base}/create`, {}, headers);
  const r2 = await post(`${s.base}/create`, {}, headers);

  assert.equal(r1.status, 500);
  assert.equal(r2.status, 201);
  assert.equal(r2.headers.get('idempotent-replayed'), null);
  store.close(); await s.close();
});

test('idempotence : clé obligatoire absente → 400 ; clé mal formée → 400 ; GET ignoré', async () => {
  const { app, calls, store } = idemApp({ required: () => true });
  const s = await serve(app);

  const missing = await post(`${s.base}/create`, {});
  assert.equal(missing.status, 400);
  assert.equal((await missing.json()).code, 'IDEMPOTENCY_KEY_REQUIRED');

  const bad = await post(`${s.base}/create`, {}, { 'Idempotency-Key': 'court' });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).code, 'IDEMPOTENCY_KEY_INVALID');

  const get = await fetch(`${s.base}/read`);
  assert.equal(get.status, 200);
  assert.equal(calls.n, 1);
  store.close(); await s.close();
});

test('idempotence : la clé expire après le TTL', async () => {
  const store = new MemoryIdempotencyStore({ ttlMs: 50 });
  const { app, calls } = idemApp();
  // on remplace le store par un store à TTL court
  const app2 = express();
  app2.use(express.json());
  app2.use(idempotency({ store }));
  app2.post('/create', (_req, res) => { calls.n += 1; res.status(201).json({ n: calls.n }); });
  const s = await serve(app2);
  const headers = { 'Idempotency-Key': 'key-eeeeeeee-5' };

  await post(`${s.base}/create`, {}, headers);
  await sleep(80);
  await post(`${s.base}/create`, {}, headers);

  assert.equal(calls.n, 2);
  store.close(); await s.close(); void app;
});

// ── Rate limiting ───────────────────────────────────────────────────────────
test('rate limit : le limiteur « sensitive » renvoie 429 + Retry-After après le seuil, sans toucher aux GET', async () => {
  const limiters = createRateLimiters({}, { global: 100, write: 100, sensitive: 3 });
  const app = express();
  app.use('/api', limiters.global);
  app.use('/api/profiles', limiters.sensitive);
  app.all('/api/profiles', (_req, res) => res.json({ ok: true }));
  const s = await serve(app);

  const statuses = [];
  for (let i = 0; i < 5; i++) statuses.push((await post(`${s.base}/api/profiles`, {})).status);
  assert.deepEqual(statuses, [200, 200, 200, 429, 429]);

  const blocked = await post(`${s.base}/api/profiles`, {});
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  const body = await blocked.json();
  assert.equal(body.code, 'RATE_LIMITED');
  assert.equal(body.scope, 'sensitive');

  // les lectures ne sont pas concernées par le limiteur sensible
  for (let i = 0; i < 6; i++) assert.equal((await fetch(`${s.base}/api/profiles`)).status, 200);
  await s.close();
});

test('rate limit : le limiteur global plafonne toutes les requêtes et ignore OPTIONS', async () => {
  const limiters = createRateLimiters({}, { global: 4, write: 100, sensitive: 100 });
  const app = express();
  app.use('/api', limiters.global);
  app.get('/api/x', (_req, res) => res.json({ ok: true }));
  const s = await serve(app);

  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${s.base}/api/x`, { method: 'OPTIONS' });
    assert.notEqual(r.status, 429, 'OPTIONS (préflight CORS) ne doit jamais être limité');
  }
  const statuses = [];
  for (let i = 0; i < 6; i++) statuses.push((await fetch(`${s.base}/api/x`)).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 429, 429]);
  await s.close();
});

// ── Logs ────────────────────────────────────────────────────────────────────
test('logs : les secrets sont expurgés et les gros corps tronqués', () => {
  const out = redact({
    email: 'a@b.dz',
    password: 'hunter2',
    nested: { token: 'abc', apiKey: 'k', Authorization: 'Bearer x', keep: 'ok' },
    interventions: Array.from({ length: 300 }, (_, i) => ({ i })),
    long: 'x'.repeat(1000),
  });
  assert.equal(out.password, '[REDACTED]');
  assert.equal(out.nested.token, '[REDACTED]');
  assert.equal(out.nested.apiKey, '[REDACTED]');
  assert.equal(out.nested.Authorization, '[REDACTED]');
  assert.equal(out.nested.keep, 'ok');
  assert.equal(out.email, 'a@b.dz');
  assert.equal(out.interventions.length, 6); // 5 + marqueur
  assert.ok(out.long.length < 300);
  assert.ok(!JSON.stringify(out).includes('hunter2'));
});
