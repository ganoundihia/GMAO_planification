// api/_lib/idempotency.js
// ═══════════════════════════════════════════════════════════════════════════
//  Idempotence des requêtes d'écriture (en-tête `Idempotency-Key`).
//
//  Problème résolu : un double-clic, un timeout suivi d'un retry ou une
//  reconnexion réseau rejouent un POST (import de 250 lignes, création d'un
//  compte…) et créent des doublons. Avec une clé d'idempotence, la première
//  requête s'exécute, les suivantes reçoivent la MÊME réponse sans réexécution.
//
//  Contrat (inspiré du brouillon IETF « Idempotency-Key Header ») :
//    - même clé + même contenu, déjà terminée   → réponse rejouée
//                                                  (en-tête `Idempotent-Replayed: true`)
//    - même clé + même contenu, encore en cours → 409 Conflict (+ Retry-After)
//    - même clé + contenu différent             → 422 Unprocessable
//    - clé absente sur une route `required`     → 400
//    - réponses 5xx ou connexion coupée         → rien n'est mémorisé (retry possible)
//
//  Limite assumée : le store par défaut est en mémoire (un seul process).
//  Derrière plusieurs instances / serverless, injecter un store partagé
//  (Redis, table Supabase…) qui respecte l'interface { get, set, delete }.
// ═══════════════════════════════════════════════════════════════════════════
import { createHash } from 'node:crypto';

const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const WRITE_METHODS = new Set(['POST', 'PATCH']);

export class MemoryIdempotencyStore {
  constructor({ ttlMs = 24 * 60 * 60 * 1000, maxEntries = 5000, sweepMs = 60 * 1000 } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.map = new Map();
    // unref : ne retient pas le process (tests, arrêt propre)
    this.timer = setInterval(() => this.sweep(), sweepMs);
    this.timer.unref?.();
  }
  get(id) {
    const e = this.map.get(id);
    if (e && e.expiresAt <= Date.now()) { this.map.delete(id); return undefined; }
    return e;
  }
  set(id, entry) {
    if (!this.map.has(id) && this.map.size >= this.maxEntries) {
      // éviction du plus ancien (Map conserve l'ordre d'insertion)
      this.map.delete(this.map.keys().next().value);
    }
    this.map.set(id, { ...entry, expiresAt: Date.now() + this.ttlMs });
  }
  delete(id) { this.map.delete(id); }
  sweep() {
    const now = Date.now();
    for (const [id, e] of this.map) if (e.expiresAt <= now) this.map.delete(id);
  }
  close() { clearInterval(this.timer); this.map.clear(); }
}

const fingerprintOf = (req) =>
  createHash('sha256')
    .update(`${req.method}\n${req.originalUrl.split('?')[0]}\n${JSON.stringify(req.body ?? null)}`)
    .digest('hex');

/**
 * @param {object}   [opts]
 * @param {object}   [opts.store]     store { get, set, delete } (défaut : mémoire)
 * @param {(req)=>boolean} [opts.required]  true → la clé est obligatoire pour cette requête
 */
export function idempotency({ store = new MemoryIdempotencyStore(), required = () => false } = {}) {
  const middleware = (req, res, next) => {
    if (!WRITE_METHODS.has(req.method)) return next();

    const key = req.get('Idempotency-Key');
    if (!key) {
      if (required(req)) {
        return res.status(400).json({
          error: "En-tête 'Idempotency-Key' obligatoire pour cette opération.",
          code: 'IDEMPOTENCY_KEY_REQUIRED',
        });
      }
      return next();
    }
    if (!KEY_PATTERN.test(key)) {
      return res.status(400).json({
        error: "'Idempotency-Key' invalide (8 à 128 caractères : lettres, chiffres, . _ : -).",
        code: 'IDEMPOTENCY_KEY_INVALID',
      });
    }

    const id = `${req.method}:${req.originalUrl.split('?')[0]}:${key}`;
    const fingerprint = fingerprintOf(req);
    const existing = store.get(id);

    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return res.status(422).json({
          error: "'Idempotency-Key' déjà utilisée avec un contenu différent.",
          code: 'IDEMPOTENCY_KEY_REUSED',
        });
      }
      if (existing.state === 'in_flight') {
        res.setHeader('Retry-After', '1');
        return res.status(409).json({
          error: 'Une requête identique est déjà en cours de traitement.',
          code: 'IDEMPOTENT_REQUEST_IN_FLIGHT',
        });
      }
      res.setHeader('Idempotent-Replayed', 'true');
      if (existing.contentType) res.setHeader('Content-Type', existing.contentType);
      return res.status(existing.status).send(existing.body);
    }

    // Première exécution : on réserve la clé AVANT de traiter (anti course concurrente).
    store.set(id, { state: 'in_flight', fingerprint });

    const originalSend = res.send.bind(res);
    res.send = (body) => {
      const status = res.statusCode;
      if (status >= 500) {
        store.delete(id); // erreur serveur : on autorise un nouvel essai
      } else {
        store.set(id, {
          state: 'done', fingerprint, status, body,
          contentType: res.getHeader('Content-Type'),
        });
      }
      return originalSend(body);
    };
    // Connexion coupée avant la réponse : libérer la réservation.
    res.on('close', () => {
      const e = store.get(id);
      if (e && e.state === 'in_flight') store.delete(id);
    });

    return next();
  };
  middleware.store = store;
  return middleware;
}
