# API — garanties de fiabilité

Le serveur Express (`api/app.js`) applique, dans cet ordre, sur toutes les routes `/api/*` :

```
requestLogger → CORS → rate limit (global, écriture, sensible) → parsing JSON
              → idempotence → routes → 404 → gestionnaire d'erreurs
```

Le rate limiting passe **avant** le parsing : un flot de requêtes (ou un corps de 50 Mo
répété) est rejeté sans coût de parsing.

## Rate limiting

Implémenté avec [`express-rate-limit`](https://github.com/express-rate-limit/express-rate-limit)
(`api/_lib/rateLimit.js`). Fenêtre glissante par IP, réglable par variables d'environnement.

| Niveau      | Portée                                                        | Défaut     | Variable                    |
|-------------|---------------------------------------------------------------|------------|-----------------------------|
| `global`    | toutes les requêtes `/api`                                    | 600 / min  | `RATE_LIMIT_GLOBAL_MAX`     |
| `write`     | `POST` `PUT` `PATCH` `DELETE`                                 | 60 / min   | `RATE_LIMIT_WRITE_MAX`      |
| `sensitive` | écritures sur `/api/profiles`, `/api/import`, `/api/print-fiches` | 10 / min | `RATE_LIMIT_SENSITIVE_MAX`  |

- Les préflights `OPTIONS` (CORS) ne sont jamais comptés.
- Les lectures (`GET`) ne sont pas soumises aux niveaux `write` et `sensitive`
  (ex. `GET /api/profiles` à chaque connexion).
- Dépassement → `429` avec `Retry-After` et en-têtes standard `RateLimit` / `RateLimit-Policy` :

```json
{ "error": "Trop de requêtes. Réessayez dans quelques instants.",
  "code": "RATE_LIMITED", "scope": "sensitive", "retryAfterSeconds": 60 }
```

**Derrière un proxy** (Vercel, nginx, Cloudflare) : définir `TRUST_PROXY` (nombre de proxys de
confiance, ex. `1`). Sans cela, toutes les requêtes semblent venir de l'IP du proxy et partagent
un seul compteur.

## Idempotence (`Idempotency-Key`)

Implémentée dans `api/_lib/idempotency.js`. Elle évite les doublons quand une requête d'écriture
est rejouée (double-clic, retry après timeout, reconnexion).

Le client envoie un en-tête `Idempotency-Key: <identifiant unique>` (8–128 caractères
`A-Za-z0-9._:-`, typiquement un UUID) sur un `POST` ou `PATCH`.

| Situation                                     | Réponse                                                     |
|-----------------------------------------------|-------------------------------------------------------------|
| 1ʳᵉ requête avec cette clé                    | exécutée normalement, résultat mémorisé 24 h                |
| même clé, **même** corps, déjà terminée       | **réponse d'origine rejouée**, en-tête `Idempotent-Replayed: true`, handler non réexécuté |
| même clé, même corps, **en cours**            | `409 IDEMPOTENT_REQUEST_IN_FLIGHT` + `Retry-After: 1`       |
| même clé, corps **différent**                 | `422 IDEMPOTENCY_KEY_REUSED`                                |
| clé absente sur une route qui l'exige         | `400 IDEMPOTENCY_KEY_REQUIRED`                              |
| clé mal formée                                | `400 IDEMPOTENCY_KEY_INVALID`                               |
| réponse `5xx` ou connexion coupée             | rien n'est mémorisé → un retry s'exécute vraiment           |

**Routes où la clé est obligatoire** (créent des données non rejouables) :
`POST /api/import` et `POST /api/profiles`. Ailleurs elle est optionnelle mais honorée.
Le formulaire « Nouvel utilisateur » (`src/pages/Users.tsx`) l'envoie déjà.

Le fingerprint d'une requête est `SHA-256(méthode + chemin + corps JSON)`.

### Limites connues

- Le store par défaut (`MemoryIdempotencyStore`) et les compteurs du rate limiter sont **en
  mémoire, par process**. Avec plusieurs instances ou en serverless, chaque instance a ses
  propres compteurs : injecter un store partagé (Redis, table Supabase) via
  `createApp({ idempotencyStore })` et l'option `store` d'`express-rate-limit`.
- `PUT` et `DELETE` ne passent pas par ce mécanisme : ils sont idempotents par construction
  (mise à jour / suppression par `id`).

## Journalisation

`api/_lib/logger.js` écrit une ligne par requête (`[id] MÉTHODE url → statut (durée)`) et
propage un `X-Request-Id`. Hors production, le corps des écritures est journalisé **expurgé** :
les clés `password`, `token`, `secret`, `authorization`, `apikey`, `service_role` sont masquées
et les gros tableaux tronqués. En production (`NODE_ENV=production`) aucun corps n'est journalisé.

## Authentification et rôles

Chaque appel `/api/*` doit porter le jeton de session Supabase de l'utilisateur connecté :
`Authorization: Bearer <access_token>`. Le front l'ajoute automatiquement à tous les appels
vers l'API (`src/lib/apiAuth.ts`). Le serveur vérifie le jeton auprès de Supabase, lit le rôle
dans `profiles`, et garde le résultat en cache 60 s (`api/_lib/auth.js`).

| Route | Accès |
|---|---|
| `GET /api/fichiers/fiches` | public : la fiche s'ouvre par un simple lien, qui ne peut pas porter d'en-tête. Lecture confinée à `FICHES_ROOT`. |
| `GET /api/profiles?user_id=…` ou `?email=…` | tout utilisateur connecté, pour **son propre** profil |
| `/api/profiles` (liste, création, modification, suppression) | `super_admin` |
| `POST /api/import` | `admin`, `super_admin` |
| toutes les autres routes | utilisateur connecté ayant un profil |

| Code | Statut | Cause |
|---|---|---|
| `AUTH_REQUIRED` | 401 | pas d'en-tête `Authorization` |
| `AUTH_INVALID` | 401 | jeton expiré ou invalide |
| `PROFILE_REQUIRED` | 403 | compte sans profil |
| `FORBIDDEN` | 403 | rôle insuffisant |

## Tests

```bash
npm test
```

`tests/api/middleware.test.js` (idempotence, rate limiting, expurgation) et
`tests/api/app.test.js` (application complète, sans base de données).
