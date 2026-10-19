import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import supabase from '../lib/supabase';
import type { Role } from '../lib/types';

interface Props {
  children: React.ReactNode;
  allowedRoles?: Role[];
}

export default function ProtectedRoute({ children, allowedRoles }: Props) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">Chargement de votre session...</p>
        </div>
      </div>
    );
  }

  // Not logged in → redirect to login, save the intended destination
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // Logged in but no profile (account not set up)
  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center p-8 bg-white rounded-xl shadow-lg max-w-md">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <p className="text-lg font-semibold text-slate-800">Profil non configuré</p>
          <p className="text-slate-500 mt-2">Votre compte n'a pas encore de profil associé. Contactez l'administrateur pour activer votre compte.</p>
          <button onClick={() => supabase.auth.signOut()} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Se déconnecter</button>
        </div>
      </div>
    );
  }

  // Role not allowed → redirect to dashboard
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/planification" replace />;
  }

  return <>{children}</>;
}
