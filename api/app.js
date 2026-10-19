// api/app.js
// Fabrique de l'application Express. Séparée de `server.js` (qui fait
// seulement `listen`) pour pouvoir la tester sans ouvrir de port.
import express from 'express';
import cors from 'cors';

import { createRateLimiters } from './_lib/rateLimit.js';
import { idempotency } from './_lib/idempotency.js';
import { requestLogger } from './_lib/logger.js';

import chargeHandler from './charge.js';
import atelier from './ateliers.js';
import interventions from './interventions.js';
import occurrences from './occurrences.js';
import techniciens from './techniciens.js';
import materiel from './materiels.js';
import outillage from './outillages.js';
import permisHandler from './permis-travail.js';
import notificationsHandler from './notifications.js';
import joursFeries from './jours-feries.js';
import analyseChargeHandler from './analyse-charge.js';
import unites from './unites.js';
import profilesHandler from './profiles.js';
import technicienCongesHandler from './technicien-conges.js';
import importHandler from './import.js';
import fichiers from './fichiers.js';
import printFiches from './print-fiches.js';

const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://localhost:3001',
];

// Opérations qui créent des données non rejouables : la clé d'idempotence y est exigée.
const KEY_REQUIRED = [
  { method: 'POST', path: '/api/import' },
  { method: 'POST', path: '/api/profiles' },
];

export function createApp({ env = process.env, rateLimits, idempotencyStore, logger } = {}) {
  const app = express();
  app.disable('x-powered-by');

  // Derrière un proxy, l'IP cliente (donc le rate limiting) dépend de ce réglage.
  if (env.TRUST_PROXY) {
    const n = Number(env.TRUST_PROXY);
    app.set('trust proxy', Number.isInteger(n) ? n : env.TRUST_PROXY);
  }

  const origins = env.CORS_ORIGINS
    ? env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_ORIGINS;

  // ── 1. Traçabilité + CORS ────────────────────────────────────────────────
  app.use(requestLogger({ logger }));
  app.use(cors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'apikey', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['RateLimit', 'RateLimit-Policy', 'Retry-After', 'Idempotent-Replayed', 'X-Request-Id'],
  }));

  // ── 2. Rate limiting AVANT le parsing : un flood ne coûte pas de CPU/RAM de parsing ──
  const limiters = createRateLimiters(env, rateLimits);
  app.use('/api', limiters.global);
  app.use('/api', limiters.write);
  for (const p of ['/api/profiles', '/api/import', '/api/print-fiches']) {
    app.use(p, limiters.sensitive);
  }

  // ── 3. Parsing : 50 Mo seulement pour l'import, 5 Mo ailleurs ────────────
  app.use('/api/import', express.json({ limit: '50mb' }));
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));

  // ── 4. Idempotence des écritures ─────────────────────────────────────────
  app.use('/api', idempotency({
    store: idempotencyStore,
    required: (req) => KEY_REQUIRED.some(
      (r) => r.method === req.method && req.originalUrl.split('?')[0] === r.path,
    ),
  }));

  // ── Santé (utile aux sondes de déploiement ; non limitée par les routes métier) ──
  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

  // ── Routes ───────────────────────────────────────────────────────────────
  app.use('/api/fichiers',     fichiers);
  app.use('/api/print-fiches', printFiches);

  app.all('/api/profiles',          profilesHandler);
  app.all('/api/charge',            chargeHandler);
  app.all('/api/ateliers',          atelier);
  app.all('/api/interventions',     interventions);
  app.all('/api/occurrences',       occurrences);
  app.all('/api/techniciens',       techniciens);
  app.all('/api/materiels',         materiel);
  app.all('/api/outillages',        outillage);
  app.all('/api/permis-travail',    permisHandler);
  app.all('/api/notifications',     notificationsHandler);
  app.all('/api/jours-feries',      joursFeries);
  app.all('/api/analyse-charge',    analyseChargeHandler);
  app.all('/api/unites',            unites);
  app.all('/api/technicien-conges', technicienCongesHandler);
  app.post('/api/import',           importHandler);

  // ── 404 ──────────────────────────────────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({ error: `Route "${req.method} ${req.originalUrl}" introuvable` });
  });

  // ── Erreurs (JSON invalide, corps trop gros, imprévus) ───────────────────
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(`[${req.id?.slice(0, 8)}] Unhandled error:`, err);
    const messages = { 400: 'Requête invalide', 413: 'Corps de requête trop volumineux' };
    res.status(status).json({
      error: status >= 500 ? 'Erreur serveur' : (messages[status] || err.message),
      ...(env.NODE_ENV !== 'production' && status >= 500 ? { details: err.message } : {}),
    });
  });

  app.locals.limiters = limiters;
  return app;
}
