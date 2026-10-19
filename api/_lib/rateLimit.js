// api/_lib/rateLimit.js
// ═══════════════════════════════════════════════════════════════════════════
//  Limitation de débit (rate limiting) à trois niveaux.
//
//    global     : toutes les routes /api            (défaut 600 req / min / IP)
//    write      : POST/PUT/PATCH/DELETE             (défaut  60 req / min / IP)
//    sensitive  : comptes, import, impression PDF   (défaut  10 req / min / IP)
//
//  Réglable par variables d'environnement (voir .env.example). Les réponses
//  portent les en-têtes standard `RateLimit-*` et `Retry-After`.
//
//  Limite assumée : compteurs en mémoire (par process). Pour plusieurs
//  instances, passer un `store` partagé à express-rate-limit (Redis…).
//  Derrière un proxy (Vercel, nginx), définir TRUST_PROXY pour que l'IP
//  cliente soit la vraie et non celle du proxy.
// ═══════════════════════════════════════════════════════════════════════════
import rateLimit from 'express-rate-limit';

const int = (v, d) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const build = ({ windowMs, limit, label, skip }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS' || (skip ? skip(req) : false),
    handler: (req, res, _next, options) => {
      const retryAfter = Math.ceil(options.windowMs / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        error: 'Trop de requêtes. Réessayez dans quelques instants.',
        code: 'RATE_LIMITED',
        scope: label,
        retryAfterSeconds: retryAfter,
      });
    },
  });

export function createRateLimiters(env = process.env, overrides = {}) {
  const windowMs = int(env.RATE_LIMIT_WINDOW_MS, 60_000);
  const cfg = {
    global:    int(overrides.global    ?? env.RATE_LIMIT_GLOBAL_MAX,    600),
    write:     int(overrides.write     ?? env.RATE_LIMIT_WRITE_MAX,      60),
    sensitive: int(overrides.sensitive ?? env.RATE_LIMIT_SENSITIVE_MAX,  10),
  };
  return {
    config: { windowMs, ...cfg },
    global:    build({ windowMs, limit: cfg.global,    label: 'global' }),
    write:     build({ windowMs, limit: cfg.write,     label: 'write',
                       skip: (req) => !WRITE_METHODS.has(req.method) }),
    // Les lectures (ex. GET /api/profiles à chaque connexion) ne sont pas « sensibles ».
    sensitive: build({ windowMs, limit: cfg.sensitive, label: 'sensitive',
                       skip: (req) => !WRITE_METHODS.has(req.method) }),
  };
}
