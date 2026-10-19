// components/Sidebar.tsx
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  LayoutDashboard, ClipboardList, FileUp, Wrench, Users,
  Bell, CalendarDays, LogOut, ChevronLeft, Menu, BarChart3,
  X, Search, RotateCcw, Lock
} from 'lucide-react';
import { useEffect, useState } from 'react';
 
// ─────────────────────────────────────────────────────────────
// NAVIGATION ITEMS
// ─────────────────────────────────────────────────────────────
const navItems = [
  // ── Principal ──
  {
    to: '/planification',
    icon: LayoutDashboard,
    label: 'Tableau de bord',
    roles: ['super_admin', 'admin', 'responsable_unite', 'charge_unite'],
    group: 'main',
  },
  {
    to: '/planification/planning',
    icon: ClipboardList,
    label: 'Planning',
    roles: ['super_admin', 'admin', 'responsable_unite', 'charge_unite'],
    group: 'main',
  },
  {
    to: '/planification/charge',
    icon: BarChart3,
    label: 'Analyse',
    roles: ['super_admin', 'admin', 'responsable_unite', 'charge_unite'],
    group: 'main',
  },
  {
    to: '/planification/cloture',
    icon: Lock,
    label: 'Clôture',
    roles: ['super_admin', 'admin', 'responsable_unite', 'charge_unite'],
    group: 'main',
  },

  // ── Gestion ──
  {
    to: '/planification/import',
    icon: FileUp,
    label: 'Import Excel',
    roles: ['super_admin', 'admin'],
    group: 'gestion',
  },
  {
    to: '/planification/conges',
    icon: CalendarDays,
    label: 'Congés',
    roles: ['super_admin', 'admin', 'responsable_unite', 'charge_unite'],
    group: 'gestion',
  },
  {
    to: '/planification/resources',
    icon: Wrench,
    label: 'Ressources',
    roles: ['super_admin', 'admin', 'responsable_unite', 'charge_unite'],
    group: 'gestion',
  },
 
  // ── Administration ──
  {
    to: '/planification/demandes-report',
    icon: RotateCcw,
    label: 'Demandes de report',
    roles: ['super_admin', 'admin'],
    group: 'admin',
  },
  {
    to: '/planification/users',
    icon: Users,
    label: 'Utilisateurs',
    roles: ['super_admin'],
    group: 'admin',
  },
  {
    to: '/planification/notifications',
    icon: Bell,
    label: 'Notifications',
    roles: ['super_admin', 'admin', 'responsable_unite', 'charge_unite'],
    group: 'admin',
  },
  {
    to: '/planification/holidays',
    icon: CalendarDays,
    label: 'Jours Fériés',
    roles: ['super_admin', 'admin', 'responsable_unite', 'charge_unite'],
    group: 'admin',
  },
];
 
const GROUP_LABELS: Record<string, string> = {
  main:    'Principal',
  gestion: 'Gestion',
  admin:   'Administration',
};
 
const ROLE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  super_admin:       { label: 'Super Admin',    color: 'from-rose-400 to-red-500',     icon: '⭐' },
  admin:             { label: 'Administrateur', color: 'from-sky-400 to-blue-500',     icon: '🛡️' },
  responsable_unite: { label: 'Responsable',    color: 'from-emerald-400 to-teal-500', icon: '🏢' },
  charge_unite:      { label: "Chargé d'Unité", color: 'from-amber-400 to-orange-500', icon: '📋' },
};
 
export default function Sidebar() {
  const { profile } = useAuth();
  const navigate    = useNavigate();
  const [collapsed,  setCollapsed]  = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search,     setSearch]     = useState('');
  const [notificationsCount, setNotificationsCount] = useState(0);
  const [pendingReportsCount, setPendingReportsCount] = useState(0);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };
 
  // ⚠️  Lecture du rôle — on normalise pour éviter tout problème de casse / espace
  const rawRole    = (profile?.role ?? '').trim().toLowerCase();
  const role       = rawRole || 'charge_unite';
  const roleConfig = ROLE_CONFIG[role] ?? ROLE_CONFIG['charge_unite'];
  const isUnitRole = role === 'responsable_unite' || role === 'charge_unite';
useEffect(() => {
  const fetchNotificationsCount = async () => {
    if (!profile) {
      setNotificationsCount(0);
      return;
    }
 
    // ⚠️ Doit reproduire exactement les mêmes filtres que Notifications.tsx :
    // on ne compte que les notifications non lues de l'utilisateur courant.
    const userId = profile.user_id || profile.id;
    if (!userId) {
      setNotificationsCount(0);
      return;
    }

    const query = supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('lu', false);

    const { count, error } = await query;
 
    if (error) {
      console.error('Erreur chargement compteur notifications :', error);
      setNotificationsCount(0);
      return;
    }
 
    setNotificationsCount(count ?? 0);
  };
 
  fetchNotificationsCount();

  const userId = profile?.user_id || profile?.id;
  if (!userId) return;

  const channel = supabase
    .channel(`sidebar-notifications-count-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      () => {
        fetchNotificationsCount();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [profile?.id, role]);

  // ── Compteur des demandes de report en attente (admin uniquement) ──
  useEffect(() => {
    const isAdminRole = role === 'super_admin' || role === 'admin';
    if (!isAdminRole) { setPendingReportsCount(0); return; }

    const fetchPendingReports = async () => {
      const { count, error } = await supabase
        .from('demandes_report')
        .select('id', { count: 'exact', head: true })
        .eq('statut', 'en_attente');
      if (error) { console.error('Erreur chargement demandes de report :', error); setPendingReportsCount(0); return; }
      setPendingReportsCount(count ?? 0);
    };

    fetchPendingReports();

    const channel = supabase
      .channel('sidebar-demandes-report-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'demandes_report' }, () => fetchPendingReports())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [role]);

  // ── Filtre items selon le rôle réel ──
  const filteredItems = navItems.filter(item => {
    const hasRole = item.roles.includes(role);
    const matchSearch = search
      ? item.label.toLowerCase().includes(search.toLowerCase())
      : true;
    return hasRole && matchSearch;
  });
 
  const grouped = filteredItems.reduce((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {} as Record<string, typeof filteredItems>);
 
  const userInitials = ((profile as any)?.full_name || profile?.email || 'U')
    .split(' ')
    .map((s: string) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
 
  // ─────────────────────────────────────────────────────────────
  const sidebarContent = (
    <div className="flex flex-col h-full relative overflow-hidden">
 
      {/* ── Backgrounds ── */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0c1530] via-[#0f1a3a] to-[#0a1228]" />
      <div className="absolute -top-40 -right-24 w-80 h-80 rounded-full bg-blue-500/[0.09]   blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3  -left-24  w-72 h-72 rounded-full bg-sky-400/[0.06]   blur-[110px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-20 w-80 h-80 rounded-full bg-indigo-500/[0.08] blur-[120px] pointer-events-none" />
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-sky-300/30 to-transparent" />
      <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-blue-400/10 to-transparent" />
 
      {/* ═══ LOGO HEADER ═══ */}
      <div className="relative px-5 pt-6 pb-5">
        <div className={`relative flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
          <div className={`relative flex items-center ${collapsed ? '' : 'gap-3'}`}>
 

          </div>
 
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden text-white/40 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition"
          >
            <X size={16} />
          </button>
        </div>
 

 
        <div className="mt-4 h-px bg-gradient-to-r from-transparent via-blue-300/15 to-transparent" />
      </div>

      {/* ═══ RETOUR AU PORTAIL ═══ */}
      <div className="relative px-3 pb-3">
        <Link
          to="/"
          onClick={() => setMobileOpen(false)}
          title="Retour au portail SETRAM"
          className={`group flex items-center gap-3 rounded-2xl bg-white/[0.05] px-4 py-2.5 text-[12.5px] font-semibold
            text-blue-100/70 transition-all duration-300 hover:bg-white/[0.1] hover:text-white
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400
            ${collapsed ? 'justify-center' : ''}`}
        >
          <ChevronLeft size={16} strokeWidth={2} className="shrink-0 transition-transform duration-300 group-hover:-translate-x-0.5" />
          {!collapsed && <span>Portail SETRAM</span>}
        </Link>
      </div>

      {/* ═══ SEARCH ═══
      {!collapsed && (
        <div className="relative px-3 pb-3">
          <Search size={12} className="absolute left-6 top-1/2 -translate-y-1/2 text-blue-200/30 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="w-full pl-7 pr-3 py-2 bg-white/[0.05] border border-white/[0.07] rounded-xl text-[12px] text-blue-100/80 placeholder:text-blue-200/25 focus:outline-none focus:border-sky-400/40 focus:bg-white/[0.07] transition-all"
          />
        </div>
      )} */}
 
      {/* ═══ NAVIGATION ═══ */}
      <nav className="relative flex-1 px-3 pt-1 pb-3 space-y-5 overflow-y-auto scrollbar-thin">
 
        {/* ── Debug banner (retirez en prod) ── */}
        {/* {!collapsed && (
          <div className="mx-1 mb-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
            <p className="text-[9px] text-blue-200/40 font-mono">
              rôle détecté : <span className="text-sky-300/80 font-bold">{role}</span>
            </p>
          </div>
        )} */}
 
        {Object.entries(grouped).map(([groupKey, items]) => (
          <div key={groupKey}>
            {!collapsed && (
              <div className="flex items-center gap-2.5 px-4 mb-2">
                <span className="w-1 h-1 rounded-full bg-sky-400/60" />
                <p className="text-[9.5px] font-bold text-blue-200/50 uppercase tracking-[0.22em]">
                  {GROUP_LABELS[groupKey]}
                </p>
                <div className="flex-1 h-px bg-gradient-to-r from-blue-400/15 via-blue-400/5 to-transparent" />
              </div>
            )}
            {collapsed && <div className="mx-4 h-px bg-white/[0.06] mb-2.5" />}
 
            <div className="space-y-2">
              {items.map(item => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to + item.label}
                    to={item.to}
                    end={item.to === '/planification'}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 px-4 py-3 rounded-2xl text-[13px] font-semibold transition-all duration-300 ${
                        isActive
                          ? 'bg-white text-[#0c1530] shadow-md'
                          : 'bg-white/[0.05] text-blue-100/70 hover:bg-white/[0.1] hover:text-white'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <div className="relative shrink-0 transition-transform duration-300 group-hover:scale-105">
                          <Icon
                            size={collapsed ? 19 : 17}
                            strokeWidth={isActive ? 2.3 : 1.85}
                          />
                         {item.label === 'Notifications' && notificationsCount > 0 && (
                            <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1.5 rounded-full bg-[#F5A623] text-white text-[8.5px] font-bold flex items-center justify-center ring-2 ring-[#0c1530] animate-in zoom-in duration-300">
                              {notificationsCount}
                            </span>
                          )}
                          {item.label === 'Demandes de report' && pendingReportsCount > 0 && (
                            <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1.5 rounded-full bg-rose-500 text-white text-[8.5px] font-bold flex items-center justify-center ring-2 ring-[#0c1530] animate-in zoom-in duration-300">
                              {pendingReportsCount}
                            </span>
                          )}
                        </div>
 
                        {!collapsed && (
                          <span className="flex-1 truncate relative tracking-[0.01em]">{item.label}</span>
                        )}
 
                        {collapsed && (
                          <span className="absolute left-full ml-4 px-3 py-2 bg-[#0c1530] text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 shadow-2xl border border-blue-400/20 z-50">
                            {item.label}
                            <span className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-[#0c1530]" />
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
 
        {!collapsed && search && filteredItems.length === 0 && (
          <div className="text-center py-10 px-4">
            <Search size={20} className="text-blue-200/40 mx-auto mb-3" />
            <p className="text-[12px] text-blue-100/60 font-medium">Aucun résultat pour « {search} »</p>
          </div>
        )}
      </nav>
 
      {/* ═══ FOOTER ═══ */}
      <div className="relative border-t border-white/[0.06]">
        {collapsed && profile && (
          <div className="flex justify-center pt-3 pb-1">
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${roleConfig.color} flex items-center justify-center text-white text-[11px] font-black shadow-md`}>
              {userInitials}
            </div>
          </div>
        )}
        <div className="px-3 pb-4 pt-2">
          <button
            onClick={handleLogout}
            className="group relative flex items-center gap-3 px-4 py-3 rounded-2xl text-[13px] font-semibold text-blue-100/70 hover:text-white hover:bg-white/[0.08] w-full transition-all duration-300"
          >
            <LogOut size={collapsed ? 19 : 17} strokeWidth={1.85} className="shrink-0 group-hover:translate-x-0.5 transition-transform duration-300" />
            {!collapsed && <span className="flex-1 text-left">Déconnexion</span>}
            {collapsed && (
              <span className="absolute left-full ml-4 px-3 py-2 bg-[#0c1530] text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all shadow-xl z-50 border border-white/10">
                Déconnexion
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
 
  return (
    <>
      <style>{`
        .scrollbar-thin::-webkit-scrollbar { width: 4px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, rgba(125,211,252,0.2), rgba(96,165,250,0.15));
          border-radius: 4px;
        }
        @keyframes slide-in-left {
          from { transform: translateX(-100%); opacity: 0.5; }
          to   { transform: translateX(0);     opacity: 1; }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .anim-slide { animation: slide-in-left 0.35s cubic-bezier(0.32,0.72,0,1); }
        .anim-fade  { animation: fade-in 0.25s ease-out; }
      `}</style>
 
      {/* Mobile button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 bg-gradient-to-br from-[#101d3d] to-[#0a1428] text-white p-2.5 rounded-xl shadow-lg border border-blue-400/15 no-print active:scale-95 transition-transform"
      >
        <Menu size={18} />
      </button>
 
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="w-72 h-full shadow-2xl anim-slide">{sidebarContent}</div>
          <div className="flex-1 bg-black/60 backdrop-blur-sm anim-fade" onClick={() => setMobileOpen(false)} />
        </div>
      )}
 
      {/* Desktop */}
      <aside className={`hidden lg:flex flex-col h-screen sticky top-0 transition-all duration-500 no-print relative ${collapsed ? 'w-20' : 'w-72'}`}>
        {sidebarContent}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-28 z-50 bg-[#4C6EF5] text-white w-7 h-7 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-all duration-300 ring-2 ring-[#0c1530]"
          title={collapsed ? 'Étendre' : 'Réduire'}
        >
          <ChevronLeft size={14} className={`transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} strokeWidth={2.8} />
        </button>
      </aside>
    </>
  );
}