import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import supabase from '../lib/supabase';
import type { Profile } from '../lib/types';

interface AuthContextType {
  user: any;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ user: null, profile: null, loading: true, refreshProfile: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId?: string, email?: string) => {
    try {
      let url = '/api/profiles';
      if (userId) url += `?user_id=${encodeURIComponent(userId)}`;
      else if (email) url += `?email=${encodeURIComponent(email)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data && data.length > 0) {
        setProfile(data[0]);
      } else {
        setProfile(null);
      }
    } catch (err) {
      console.error('Fetch profile error:', err);
      setProfile(null);
    }
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id, user.email);
  };

  useEffect(() => {
    // Check existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id, session.user.email).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Listen for auth state changes (login, logout, token refresh).
    // Supabase émet un événement TOKEN_REFRESHED à chaque fois que l'onglet
    // reprend le focus (le token est simplement rafraîchi en arrière-plan,
    // rien ne change côté utilisateur/profil) : le re-fetch systématique du
    // profil sur CET événement provoquait un re-render en cascade (nouvelle
    // référence d'objet à chaque focus d'onglet) qui donnait l'impression que
    // les pages « se rafraîchissaient » tout le temps. On ne recharge donc le
    // profil que lors d'un réel changement de session (connexion/déconnexion/
    // changement d'utilisateur) — un simple TOKEN_REFRESHED est ignoré.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const newUser = session?.user ?? null;

      if (event === 'TOKEN_REFRESHED') {
        // Rien à recharger : la session reste la même, on ne touche pas au
        // state (évite tout re-render/re-fetch en cascade dans le reste de l'app).
        return;
      }

      setUser((prev: any) => (prev?.id === newUser?.id ? prev : newUser));

      if (newUser) {
        fetchProfile(newUser.id).finally(() => setLoading(false));
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
