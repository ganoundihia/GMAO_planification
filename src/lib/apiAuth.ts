// src/lib/apiAuth.ts
// Ajoute automatiquement le jeton Supabase de l'utilisateur connecté
// (Authorization: Bearer …) à chaque appel vers l'API de l'application
// (/api/* sur la même origine, ou sur VITE_FICHES_SERVER). L'API refuse
// toute requête sans jeton valide : voir api/_lib/auth.js.
import supabase from './supabase';

const API_ORIGINS = [
  window.location.origin,
  import.meta.env.VITE_FICHES_SERVER as string | undefined,
]
  .filter((o): o is string => Boolean(o))
  .map((o) => new URL(o, window.location.origin).origin);

function isApiRequest(url: URL): boolean {
  return API_ORIGINS.includes(url.origin) && url.pathname.startsWith('/api/');
}

export function installApiAuth(): void {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = input instanceof Request ? input.url : input.toString();
    const url = new URL(raw, window.location.origin);
    if (!isApiRequest(url)) return nativeFetch(input, init);

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.has('Authorization')) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) headers.set('Authorization', `Bearer ${session.access_token}`);
    }
    return nativeFetch(input, { ...init, headers });
  };
}
