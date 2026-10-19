import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { importHubResetOnLoad } from './lib/importHub';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Planning from './pages/Planning';
import ImportExcel from './pages/ImportExcel';
import Resources from './pages/Resources';
import Users from './pages/Users';
import Notifications from './pages/Notifications';
import Holidays from './pages/Holidays';
import Charge from './pages/Charge';
import DemandesReport from './pages/DemandesReport';
import GestionConges from './pages/GestionConges';
import Cloture from './pages/Cloture';
import Home from './pages/portail/Home';
import IngenierieRoutes from './pages/portail/ingenierie/IngenierieRoutes';
import DocumentsRoutes from './pages/portail/documents/DocumentsRoutes';

// Planification keeps its own auth-gated layout exactly as before — only the
// URL prefix changed (was "/", now "/planification") so the site root can
// host the shared Home page. See README "Routing" section.
function PlanificationLayout() {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/planning" element={<Planning />} />
            <Route path="/import" element={<ProtectedRoute allowedRoles={['super_admin','admin']}><ImportExcel /></ProtectedRoute>} />
            <Route path="/conges" element={<ProtectedRoute><GestionConges /></ProtectedRoute>} />
            <Route path="/charge" element={<ProtectedRoute allowedRoles={['super_admin','admin','responsable_unite','charge_unite']}><Charge /></ProtectedRoute>} />
            <Route path="/resources" element={<ProtectedRoute allowedRoles={['super_admin','admin','responsable_unite','charge_unite']}><Resources /></ProtectedRoute>} />
            <Route path="/users" element={<ProtectedRoute allowedRoles={['super_admin']}><Users /></ProtectedRoute>} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/holidays" element={<Holidays />} />
            <Route path="/demandes-report" element={<ProtectedRoute allowedRoles={['super_admin','admin']}><DemandesReport /></ProtectedRoute>} />
            <Route path="/cloture" element={<Cloture/>} />

          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  // Ported from the legacy portal: this is used on a shared office
  // computer, so the Centre d'Import hub is wiped on every app load —
  // everyone starts blank and re-imports their own files.
  useEffect(() => {
    importHubResetOnLoad();
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* Home, Ingénierie and Documents are public — matching the access
              model of the static portal they replace (no per-user login).
              Planification keeps its existing Supabase-gated auth. */}
          <Route path="/" element={<Home />} />
          <Route path="/ingenierie/*" element={<IngenierieRoutes />} />
          <Route path="/documents/*" element={<DocumentsRoutes />} />
          <Route path="/planification/*" element={<ProtectedRoute><PlanificationLayout /></ProtectedRoute>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
