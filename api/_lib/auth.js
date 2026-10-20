// api/_lib/auth.js
// ═══════════════════════════════════════════════════════════════════════════
//  Authentification + contrôle de rôle des routes /api/*.
//
//  Chaque appel doit porter le JWT Supabase de l'utilisateur connecté :
//    Authorization: Bearer <access_token>
//  Le jeton est vérifié auprès de Supabase, puis le profil (table `profiles`)
//  fournit le rôle. Résultat mis en cache 60 s par jeton pour ne pas
//  interroger Supabase à chaque requête.
//
//  Règles :
//    - GET /api/fichiers/fiches reste public : la fiche s'ouvre par un simple
//      lien (<a href>, window.open), qui ne peut pas transmettre d'en-tête.
//      La route est confinée à FICHES_ROOT (voir fichiers.js).
//    - /api/profiles : lecture de SON propre profil pour tout utilisateur
//      connecté ; liste, création, modification et suppression réservées au
//      super_admin (même règle que la page Utilisateurs).
//    - /api/import : admin et super_admin (même règle que la page Import).
//    - toute autre route : utilisateur connecté ayant un profil.
// ═══════════════════════════════════════════════════════════════════════════

const PUBLIC_ROUTES = [
  { method: 'GET', path: '/api/fichiers/fiches' },
];

const ADMIN_ROLES = ['admin', 'super_admin'];

function deny(res, status, code, error) {
  return res.status(status).json({ error, code });
}

function bearerToken(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

/** Vérificateur par défaut : jeton → { user, profile } via Supabase (service_role). */
export function supabaseVerifier() {
  let clientPromise;
  const client = () => (clientPromise ||= import('../db-client.js').then((m) => m.default));
  return async (token) => {
    const supabase = await client();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return null;
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, user_id, email, role, unite_id, atelier_id')
      .eq('user_id', data.user.id)
      .maybeSingle();
    return { user: data.user, profile: profile ?? null };
  };
}

/** Cache mémoire jeton → identité, avec expiration et taille bornée. */
function cached(verify, { ttlMs = 60_000, maxEntries = 1000 } = {}) {
  const map = new Map();
  return async (token) => {
    const hit = map.get(token);
    if (hit && hit.expiresAt > Date.now()) return hit.identity;
    const identity = await verify(token);
    if (identity) {
      if (map.size >= maxEntries) map.delete(map.keys().next().value);
      map.set(token, { identity, expiresAt: Date.now() + ttlMs });
    }
    return identity;
  };
}

function isOwnProfileRead(req, identity) {
  if (req.method !== 'GET') return false;
  const { user_id, email } = req.query ?? {};
  if (user_id) return user_id === identity.user.id;
  if (email) return String(email).toLowerCase() === String(identity.user.email || '').toLowerCase();
  return false;
}

export function authenticate({ verifyToken = supabaseVerifier(), cacheTtlMs } = {}) {
  const verify = cached(verifyToken, { ttlMs: cacheTtlMs });

  return async (req, res, next) => {
    if (req.method === 'OPTIONS') return next();
    const path = req.originalUrl.split('?')[0];
    if (PUBLIC_ROUTES.some((r) => r.method === req.method && r.path === path)) return next();

    const token = bearerToken(req);
    if (!token) return deny(res, 401, 'AUTH_REQUIRED', 'Authentification requise');

    let identity;
    try {
      identity = await verify(token);
    } catch (err) {
      return next(err);
    }
    if (!identity) return deny(res, 401, 'AUTH_INVALID', 'Session invalide ou expirée');

    // Lecture de son propre profil : autorisée même sans profil (premier login).
    if (path === '/api/profiles' && isOwnProfileRead(req, identity)) {
      req.auth = identity;
      return next();
    }

    const role = identity.profile?.role;
    if (!role) return deny(res, 403, 'PROFILE_REQUIRED', 'Aucun profil associé à ce compte');

    if (path === '/api/profiles' && role !== 'super_admin') {
      return deny(res, 403, 'FORBIDDEN', 'Réservé au super administrateur');
    }
    if (path === '/api/import' && !ADMIN_ROLES.includes(role)) {
      return deny(res, 403, 'FORBIDDEN', 'Réservé aux administrateurs');
    }

    req.auth = identity;
    return next();
  };
}
