# GMAO Planification — SETRAM

Plateforme de **planification de la maintenance** (OPPI) du tramway : import des plans annuels
depuis Excel, génération des occurrences, gestion des congés et de la charge des techniciens,
clôture des interventions, tableaux de bord. Elle regroupe aussi le portail public
Ingénierie / Documents de SETRAM.

| Couche      | Technologies                                                        |
|-------------|---------------------------------------------------------------------|
| Frontend    | React 19, TypeScript, Vite 7, Tailwind CSS 4, React Router 7, Recharts |
| API         | Node ≥ 20, Express 5, `express-rate-limit`                           |
| Données     | Supabase (PostgreSQL + Auth + Realtime)                              |
| Déploiement | Vercel (frontend + fonctions `api/`), ou serveur Node auto-hébergé   |

## Démarrage rapide

```bash
git clone <url-du-dépôt> && cd GMAO_planification
npm ci
cp .env.example .env        # puis renseigner les clés Supabase (voir le fichier)

npm run dev:api             # API       → http://localhost:3000   (terminal 1)
npm run dev                 # Frontend  → http://localhost:5173   (terminal 2)
```

Vite proxifie `/api/*` vers l'API : **les deux serveurs doivent tourner** (sans l'API, la
récupération du profil après connexion échoue).

## Scripts

| Commande              | Rôle                                                       |
|-----------------------|------------------------------------------------------------|
| `npm run dev`         | Frontend en mode développement                             |
| `npm run dev:api`     | API avec rechargement automatique                          |
| `npm run start:api`   | API en mode production                                     |
| `npm run build`       | Typecheck + build de production (`dist/`)                  |
| `npm run typecheck`   | Vérification TypeScript seule                              |
| `npm test`            | Tests de l'API (idempotence, rate limiting, logs)          |
| `npm run lint`        | ESLint (dette existante : 313 erreurs, hors CI pour l'instant) |
| `npm run check:db`    | Vérifie la connexion Supabase (n'affiche aucune donnée)    |

## Structure du dépôt

```
.
├── api/                    API Express (une route = un fichier)
│   ├── app.js              fabrique de l'application (middlewares + routes), testable
│   ├── server.js           point d'entrée : listen + arrêt propre
│   ├── _lib/               middlewares transverses
│   │   ├── rateLimit.js    limitation de débit (global / écriture / sensible)
│   │   ├── idempotency.js  idempotence via l'en-tête Idempotency-Key
│   │   └── logger.js       journal de requêtes avec expurgation des secrets
│   ├── db-client.js        client Supabase service_role (serveur uniquement)
│   └── *.js                handlers métier (profiles, import, interventions…)
├── src/                    application React
│   ├── pages/              pages Planification (Dashboard, Planning, Import Excel…)
│   │   └── portail/        portail public Home / Ingénierie / Documents
│   ├── components/         Sidebar, TopBar, composants partagés (`ui/`, `shell/`)
│   ├── contexts/           AuthContext (session Supabase + profil)
│   └── lib/                types, utilitaires, accès données
├── public/                 assets statiques (+ `legacy/` : outils HTML historiques, `pdc_model.xlsx` téléchargeable)
├── tests/api/              tests Node (runner natif, sans dépendance)
├── scripts/                scripts d'exploitation (check-db…)
├── docs/
│   ├── API.md              rate limiting, idempotence, journalisation, limites connues
│   ├── PORTAIL.md          notes de conception du portail (design system, hero, legacy)
│   └── samples/            classeurs Excel d'exemple pour tester l'import
└── .github/workflows/      CI (typecheck, tests, build)
```

## Rôles et accès

| Rôle                | Périmètre                                                         |
|---------------------|-------------------------------------------------------------------|
| `super_admin`       | toutes unités/ateliers + gestion des utilisateurs et mots de passe |
| `admin`             | toutes unités et tous les ateliers                                |
| `responsable_unite` | tous les ateliers d'**une** unité                                 |
| `charge_unite`      | **un** atelier d'**une** unité                                    |

## Fiabilité de l'API

Toutes les routes `/api/*` sont protégées par un **rate limiting** à trois niveaux, et les
créations non rejouables (`POST /api/import`, `POST /api/profiles`) exigent un en-tête
**`Idempotency-Key`** : un retry ou un double-clic ne crée jamais de doublon.
Détails, codes d'erreur et limites : [`docs/API.md`](docs/API.md).

## Sécurité — à lire avant la mise en ligne

- Les secrets vivent **uniquement** dans `.env` (ignoré par git) ou dans les variables
  d'environnement de l'hébergeur — jamais dans `vercel.json` ni dans le code.
  `SUPABASE_SERVICE_ROLE_KEY` contourne la RLS : ne jamais la préfixer par `VITE_`.
- **L'API n'authentifie pas encore les appels** (voir `docs/API.md`). C'est le prochain chantier
  de sécurité : vérifier le JWT Supabase et le rôle sur les routes d'écriture.
- Si une clé a déjà été commitée dans un autre dépôt ou une ancienne branche, la **régénérer**
  dans Supabase (Project Settings → API) : la supprimer du code ne l'efface pas de l'historique.

## Contribuer

1. Créer une branche depuis `main` (`feat/…`, `fix/…`).
2. `npm run typecheck && npm test` doivent passer (le CI les exécute).
3. Messages de commit au format [Conventional Commits](https://www.conventionalcommits.org/)
   (`feat:`, `fix:`, `docs:`, `chore:`…).
