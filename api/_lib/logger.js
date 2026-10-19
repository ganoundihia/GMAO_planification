// api/_lib/logger.js
// Journal de requêtes SÛR : identifiant de corrélation, durée, et corps
// expurgé. L'ancien logger écrivait `req.body` en clair (mots de passe de
// POST /api/profiles, imports de plusieurs Mo).
import { randomUUID } from 'node:crypto';

const SENSITIVE_KEY = /pass(word)?|token|secret|authorization|api[-_]?key|apikey|service[-_]?role/i;
const MAX_STRING = 200;
const MAX_ARRAY = 5;

export function redact(value, depth = 0) {
  if (value == null || depth > 4) return value;
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…(+${value.length - MAX_STRING})` : value;
  }
  if (Array.isArray(value)) {
    const head = value.slice(0, MAX_ARRAY).map((v) => redact(v, depth + 1));
    return value.length > MAX_ARRAY ? [...head, `…(+${value.length - MAX_ARRAY} éléments)`] : head;
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SENSITIVE_KEY.test(k) ? '[REDACTED]' : redact(v, depth + 1)]),
    );
  }
  return value;
}

export function requestLogger({ logger = console, logBodies = process.env.NODE_ENV !== 'production' } = {}) {
  return (req, res, next) => {
    const id = req.get('X-Request-Id') || randomUUID();
    req.id = id;
    res.setHeader('X-Request-Id', id);
    const started = process.hrtime.bigint();

    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const line = `[${id.slice(0, 8)}] ${req.method} ${req.originalUrl} → ${res.statusCode} (${ms.toFixed(0)} ms)`;
      if (logBodies && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        logger.log(line, JSON.stringify(redact(req.body)));
      } else {
        logger.log(line);
      }
    });
    next();
  };
}
