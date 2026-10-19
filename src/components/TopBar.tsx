// components/TopBar.tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Bell, Search, ChevronDown, Sparkles, Calendar,
  HelpCircle, Settings, LogOut, User, Command, Sun, Zap,
  CheckCircle2, Inbox
} from 'lucide-react';

const ROUTE_LABELS: Record<string, { label: string; parent?: string }> = {
  '/': { label: 'Tableau de bord' },
  '/planning': { label: 'Planning' },
  '/charge': { label: 'Charge Techniciens' },
  '/import': { label: 'Import Excel' },
  '/conges': { label: 'Congés' },
  '/resources': { label: 'Ressources' },
  '/users': { label: 'Utilisateurs' },
  '/notifications': { label: 'Notifications' },
  '/holidays': { label: 'Jours Fériés' },
};

export default function TopBar() {
  const { profile } = useAuth();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [search, setSearch] = useState('');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [time, setTime] = useState(new Date());
  const profileRef = useRef<HTMLDivElement>(null);

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  // Close profile menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    if (showProfileMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showProfileMenu]);

  const getUserId = useCallback(async (): Promise<string | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) return session.user.id;
    } catch { /* */ }
    if (profile?.user_id) return profile.user_id;
    if (profile?.id) return profile.id;
    return null;
  }, [profile]);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const userId = await getUserId();
      if (!userId) return;
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('lu', false);
      if (!error && count !== null) setUnreadCount(count);
    } catch (err) { console.warn(err); }
  }, [getUserId]);

  useEffect(() => { if (profile) fetchUnreadCount(); }, [profile, fetchUnreadCount]);

  useEffect(() => {
    if (!profile) return;
    let channelRef: ReturnType<typeof supabase.channel> | null = null;
    const setup = async () => {
      const userId = await getUserId();
      if (!userId) return;
      channelRef = supabase.channel(`topbar-notif-${userId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
          () => setUnreadCount(prev => prev + 1))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
          (payload) => {
            const oldRow = payload.old as { lu?: boolean };
            const newRow = payload.new as { lu?: boolean };
            if (!oldRow.lu && newRow.lu) setUnreadCount(prev => Math.max(0, prev - 1));
            else if (oldRow.lu && !newRow.lu) setUnreadCount(prev => prev + 1);
          })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
          (payload) => {
            const oldRow = payload.old as { lu?: boolean };
            if (!oldRow.lu) setUnreadCount(prev => Math.max(0, prev - 1));
          })
        .subscribe();
    };
    setup();
    const poll = setInterval(fetchUnreadCount, 30000);
    return () => { if (channelRef) supabase.removeChannel(channelRef); clearInterval(poll); };
  }, [profile, getUserId, fetchUnreadCount]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const roleLabel: Record<string, string> = {
    admin: 'Admin DG',
    responsable_unite: 'Responsable',
    charge_unite: "Chargé d'Unité",
    technicien: 'Technicien',
  };

  const roleBadgeColor: Record<string, string> = {
    admin: 'from-amber-400 to-orange-500',
    responsable_unite: 'from-blue-500 to-indigo-600',
    charge_unite: 'from-cyan-500 to-blue-600',
    technicien: 'from-slate-400 to-slate-500',
  };

  const currentRoute = ROUTE_LABELS[location.pathname] ?? { label: 'Page' };
  const timeLabel = time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const dateLabel = time.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const role = profile?.role || 'technicien';

  return (
    <header className="relative bg-white border-b border-slate-200/70 px-4 lg:px-6 py-2.5 flex items-center gap-4 no-print sticky top-0 z-30">

      {/* Subtle gradient bottom line */}
      <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-200/50 to-transparent" />

      {/* ═══ LEFT: Breadcrumb / Page title ═══ */}
      <div className="pl-12 lg:pl-0 flex items-center gap-3 min-w-0">
        {/* Page indicator */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-700 flex items-center justify-center shadow-md shadow-blue-200/50 shrink-0">
              <Sparkles size={15} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-white animate-pulse" />
          </div>

          <div className="hidden sm:flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.12em]">SETRAM · OPPI</span>
              <ChevronDown size={9} className="text-slate-300 -rotate-90" />
              <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider truncate">{currentRoute.label}</span>
            </div>
            <h2 className="text-[14px] font-extrabold text-slate-800 leading-tight tracking-tight truncate">
              {currentRoute.label}
            </h2>
          </div>
        </div>
      </div>

      {/* ═══ CENTER: Search (premium style) ═══ */}
      <div className="flex-1 max-w-md mx-auto hidden md:block">
        <div className="relative group">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 rounded-xl blur-md opacity-0 group-focus-within:opacity-100 transition-opacity" />
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" strokeWidth={2.5} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher interventions, techniciens, ateliers…"
              className="w-full pl-10 pr-16 py-2 bg-slate-50/80 border border-slate-200 rounded-xl text-[12px] text-slate-700 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-500/15 focus:border-blue-400 outline-none transition-all"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold text-slate-400 bg-white border border-slate-200 rounded shadow-sm">
                <Command size={9} strokeWidth={3} />K
              </kbd>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ RIGHT: Actions ═══ */}
      <div className="flex items-center gap-1.5 ml-auto">

        {/* Live clock card */}
        <div className="hidden lg:flex items-center gap-3 px-3 py-1.5 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-xl shadow-sm">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
            <Sun size={13} className="text-white" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none">
              {dateLabel.split(' ').slice(0, 2).join(' ')}
            </p>
            <p className="text-[12px] font-black text-slate-800 leading-tight mt-0.5 tabular-nums">
              {timeLabel}
              <span className="ml-1.5 inline-flex items-center gap-1 text-[8px] font-black text-emerald-600">
                <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />LIVE
              </span>
            </p>
          </div>
        </div>

        {/* Quick action buttons */}
        <button className="hidden sm:flex w-9 h-9 items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-transparent hover:border-blue-100 hover:shadow-sm hover:scale-105 active:scale-95" title="Aide">
          <HelpCircle size={15} strokeWidth={2} />
        </button>

        <button className="hidden sm:flex w-9 h-9 items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-transparent hover:border-blue-100 hover:shadow-sm hover:scale-105 active:scale-95" title="Paramètres">
          <Settings size={15} strokeWidth={2} />
        </button>

        {/* Notifications */}
        <Link
          to="/planification/notifications"
          className="relative w-9 h-9 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-transparent hover:border-blue-100 hover:shadow-sm hover:scale-105 active:scale-95 group"
          title={unreadCount > 0 ? `${unreadCount} non lue(s)` : 'Notifications'}
        >
          <Bell size={15} className={unreadCount > 0 ? 'group-hover:animate-[ring_0.5s_ease-in-out]' : ''} strokeWidth={2} />
          {unreadCount > 0 && (
            <>
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 bg-gradient-to-r from-red-500 to-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center shadow-sm ring-2 ring-white z-10">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
              <span className="absolute -top-0.5 -right-0.5 w-[16px] h-[16px] bg-red-500 rounded-full animate-ping opacity-40" />
            </>
          )}
        </Link>

        {/* Divider */}
        <div className="hidden sm:block w-px h-7 bg-gradient-to-b from-transparent via-slate-200 to-transparent mx-1.5" />

        {/* User profile */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className={`flex items-center gap-2.5 pl-1 pr-2 py-1 rounded-xl border transition-all group ${
              showProfileMenu
                ? 'bg-blue-50 border-blue-200 shadow-sm'
                : 'border-transparent hover:bg-slate-50 hover:border-slate-200'
            }`}
          >
            <div className="relative shrink-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-[13px] shadow-md shadow-blue-200/60 ring-2 ring-white group-hover:scale-105 transition-transform">
                {profile?.prenom?.[0]?.toUpperCase()}{profile?.nom?.[0]?.toUpperCase()}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400 ring-2 ring-white" />
              </span>
            </div>
            <div className="hidden md:block text-left">
              <p className="text-[12px] font-bold text-slate-800 leading-tight">{profile?.prenom} {profile?.nom}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <span className={`inline-block w-1.5 h-1.5 rounded-full bg-gradient-to-br ${roleBadgeColor[role]}`} />
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{roleLabel[role]}</p>
              </div>
            </div>
            <ChevronDown size={12} className={`hidden md:block text-slate-300 group-hover:text-slate-500 transition-all duration-200 ${showProfileMenu ? 'rotate-180 text-blue-500' : ''}`} strokeWidth={3} />
          </button>

          {/* Dropdown menu */}
          {showProfileMenu && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-2xl shadow-slate-400/20 border border-slate-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              {/* Header */}
              <div className="bg-gradient-to-br from-[#0b1222] via-[#101d3d] to-[#0d1630] p-4 relative overflow-hidden">
                <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(rgba(148,163,184,.5) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-blue-500/30 blur-2xl" />
                <div className="absolute -bottom-8 -left-8 w-20 h-20 rounded-full bg-indigo-500/30 blur-2xl" />

                <div className="relative flex items-center gap-3">
                  <div className="relative shrink-0">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-base shadow-lg ring-1 ring-white/10">
                      {profile?.prenom?.[0]?.toUpperCase()}{profile?.nom?.[0]?.toUpperCase()}
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-[#0b1222]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{profile?.prenom} {profile?.nom}</p>
                    <div className={`inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-gradient-to-r ${roleBadgeColor[role]} text-white shadow-sm`}>
                      <Zap size={8} strokeWidth={3} />{roleLabel[role]}
                    </div>
                  </div>
                </div>
              </div>

              {/* Mini stats */}
              <div className="grid grid-cols-2 gap-2 p-3 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-100">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-red-500 to-rose-500 flex items-center justify-center">
                    <Inbox size={12} className="text-white" />
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Non lues</p>
                    <p className="text-[13px] font-black text-slate-800 tabular-nums leading-none">{unreadCount}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-100">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center">
                    <CheckCircle2 size={12} className="text-white" />
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Statut</p>
                    <p className="text-[11px] font-black text-emerald-600 leading-none mt-0.5">Actif</p>
                  </div>
                </div>
              </div>

              {/* Menu items */}
              <div className="p-2 space-y-0.5">
                <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[12px] font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-colors group">
                  <User size={13} className="group-hover:scale-110 transition-transform" />
                  <span className="flex-1 text-left">Mon profil</span>
                  <ChevronDown size={11} className="text-slate-300 -rotate-90" />
                </button>
                <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[12px] font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-colors group">
                  <Settings size={13} className="group-hover:scale-110 transition-transform" />
                  <span className="flex-1 text-left">Paramètres</span>
                  <ChevronDown size={11} className="text-slate-300 -rotate-90" />
                </button>
                <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[12px] font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-colors group">
                  <HelpCircle size={13} className="group-hover:scale-110 transition-transform" />
                  <span className="flex-1 text-left">Centre d'aide</span>
                  <ChevronDown size={11} className="text-slate-300 -rotate-90" />
                </button>
              </div>

              <div className="p-2 border-t border-slate-100">
                <button onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[12px] font-bold text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors group">
                  <LogOut size={13} className="group-hover:translate-x-0.5 group-hover:rotate-[-8deg] transition-transform" />
                  <span className="flex-1 text-left">Déconnexion</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Custom animations */}
      <style>{`
        @keyframes ring {
          0%, 100% { transform: rotate(0deg); }
          15%, 45% { transform: rotate(-12deg); }
          30%, 60% { transform: rotate(12deg); }
        }
      `}</style>
    </header>
  );
}