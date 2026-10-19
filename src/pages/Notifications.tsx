// src/pages/Notifications.tsx

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Bell, Check, CheckCheck, RefreshCw, AlertTriangle,
  Trash2, Filter, X, BellOff, Clock, Loader2,
  ChevronDown, Info, Search,
} from 'lucide-react';
import type { Notification } from '../lib/types';
import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<string, {
  icon:   string;
  label:  string;
  bg:     string;
  border: string;
  text:   string;
  dot:    string;
}> = {
  creation:     { icon: '🆕', label: 'Création',     bg: 'bg-green-100',   border: 'border-green-200',   text: 'text-green-700',   dot: 'bg-green-500'   },
  modification: { icon: '✏️', label: 'Modification', bg: 'bg-blue-100',    border: 'border-blue-200',    text: 'text-blue-700',    dot: 'bg-blue-500'    },
  import:       { icon: '📥', label: 'Import',       bg: 'bg-purple-100',  border: 'border-purple-200',  text: 'text-purple-700',  dot: 'bg-purple-500'  },
  delete:       { icon: '🗑️', label: 'Suppression',  bg: 'bg-red-100',     border: 'border-red-200',     text: 'text-red-700',     dot: 'bg-red-500'     },
  info:         { icon: 'ℹ️', label: 'Info',         bg: 'bg-slate-100',   border: 'border-slate-200',   text: 'text-slate-600',   dot: 'bg-slate-400'   },
  warning:      { icon: '⚠️', label: 'Alerte',       bg: 'bg-amber-100',   border: 'border-amber-200',   text: 'text-amber-700',   dot: 'bg-amber-500'   },
  planning:     { icon: '📅', label: 'Planning',     bg: 'bg-cyan-100',    border: 'border-cyan-200',    text: 'text-cyan-700',    dot: 'bg-cyan-500'    },
  system:       { icon: '⚙️', label: 'Système',      bg: 'bg-slate-100',   border: 'border-slate-200',   text: 'text-slate-600',   dot: 'bg-slate-500'   },
};

const DEFAULT_CONFIG = {
  icon: '🔔', label: 'Notification',
  bg: 'bg-slate-100', border: 'border-slate-200',
  text: 'text-slate-600', dot: 'bg-slate-400',
};

const PAGE_SIZE = 20;

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function getCfg(type: string) {
  return TYPE_CONFIG[type] ?? DEFAULT_CONFIG;
}

function formatRelative(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const min  = Math.floor(diff / 60000);
  const h    = Math.floor(min / 60);
  const d    = Math.floor(h / 24);

  if (min < 1)  return 'À l\'instant';
  if (min < 60) return `Il y a ${min} min`;
  if (h < 24)   return `Il y a ${h}h`;
  if (d === 1)  return 'Hier';
  if (d < 7)    return `Il y a ${d} jours`;

  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function formatFull(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function getGroupLabel(dateStr: string): string {
  if (!dateStr) return 'Sans date';
  const date  = new Date(dateStr);
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yest  = new Date(today); yest.setDate(yest.getDate() - 1);
  const d     = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (d.getTime() === today.getTime()) return "Aujourd'hui";
  if (d.getTime() === yest.getTime())  return 'Hier';
  if (now.getTime() - d.getTime() < 7 * 86400000) {
    return date.toLocaleDateString('fr-FR', { weekday: 'long' });
  }
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────
export default function Notifications() {
  const { profile } = useAuth();

  // ── Data ──
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  // ── UI ──
  const [filterType,   setFilterType]   = useState('');
  const [filterUnread, setFilterUnread] = useState(false);
  const [search,       setSearch]       = useState('');
  const [page,         setPage]         = useState(1);
  const [actionIds,    setActionIds]    = useState<Set<number>>(new Set());
  const [showFilters,  setShowFilters]  = useState(false);

  // ─────────────────────────────────────────────────────────
  // RÉCUPÉRER L'ID UTILISATEUR — FIABLE
  // ─────────────────────────────────────────────────────────
  const getUserId = useCallback(async (): Promise<string | null> => {
    // Priorité 1 : session Supabase Auth (UUID réel)
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) return session.user.id;
    } catch { /* */ }

    // Priorité 2 : profile.user_id
    if (profile?.user_id) return profile.user_id;

    // Priorité 3 : profile.id (peut être l'UUID auth)
    if (profile?.id) return profile.id;

    return null;
  }, [profile]);

  // ─────────────────────────────────────────────────────────
  // FETCH
  // ─────────────────────────────────────────────────────────
  const fetchNotifs = useCallback(async (opts: { refresh?: boolean } = {}) => {
    if (opts.refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const userId = await getUserId();

      if (!userId) {
        setError('Session introuvable. Veuillez vous reconnecter.');
        setNotifications([]);
        return;
      }

      const { data, error: dbErr } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(500);

      if (dbErr) {
        if (dbErr.code === 'PGRST301' || dbErr.message.toLowerCase().includes('permission')) {
          throw new Error('Accès refusé — vérifiez les politiques RLS de la table notifications.');
        }
        throw new Error(dbErr.message);
      }

      setNotifications(data ?? []);
      if (opts.refresh) setPage(1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setNotifications([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getUserId]);

  // Chargement initial
  useEffect(() => {
    if (profile) {
      fetchNotifs();
    } else {
      setLoading(false);
    }
  }, [profile, fetchNotifs]);

  // ─────────────────────────────────────────────────────────
  // REALTIME
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;

    let channelRef: ReturnType<typeof supabase.channel> | null = null;

    const setup = async () => {
      const userId = await getUserId();
      if (!userId) return;

      const channelName = `notif-${userId}-${Math.random().toString(36).slice(2)}`;

      channelRef = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event:  '*',
            schema: 'public',
            table:  'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              const n = payload.new as Notification;
              setNotifications(prev => {
                // Éviter les doublons
                if (prev.some(x => x.id === n.id)) return prev;
                return [n, ...prev];
              });
            } else if (payload.eventType === 'UPDATE') {
              const n = payload.new as Notification;
              setNotifications(prev => prev.map(x => x.id === n.id ? n : x));
            } else if (payload.eventType === 'DELETE') {
              const del = payload.old as { id: number };
              setNotifications(prev => prev.filter(x => x.id !== del.id));
            }
          }
        )
        .subscribe((status, err) => {
          if (err) console.warn('⚠️ Realtime:', err);
        });
    };

    setup();

    return () => {
      if (channelRef) supabase.removeChannel(channelRef);
    };
  }, [profile, getUserId]);

  // ─────────────────────────────────────────────────────────
  // HELPERS ACTIONS — gestion des IDs en cours de traitement
  // ─────────────────────────────────────────────────────────
  const addProcessing   = (id: number) => setActionIds(p => new Set(p).add(id));
  const removeProcessing = (id: number) => setActionIds(p => { const n = new Set(p); n.delete(id); return n; });

  // ─────────────────────────────────────────────────────────
  // ACTIONS
  // ─────────────────────────────────────────────────────────

  // Marquer comme lue
  const markRead = async (id: number) => {
    if (actionIds.has(id)) return;
    // Optimiste
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, lu: true } : n));
    addProcessing(id);
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ lu: true })
        .eq('id', id);
      if (error) throw error;
    } catch {
      // Rollback
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, lu: false } : n));
    } finally {
      removeProcessing(id);
    }
  };

  // Marquer comme non-lue
  const markUnread = async (id: number) => {
    if (actionIds.has(id)) return;
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, lu: false } : n));
    addProcessing(id);
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ lu: false })
        .eq('id', id);
      if (error) throw error;
    } catch {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, lu: true } : n));
    } finally {
      removeProcessing(id);
    }
  };

  // Tout marquer comme lu
  const markAllRead = async () => {
    const unreadIds = notifications.filter(n => !n.lu).map(n => n.id);
    if (unreadIds.length === 0) return;

    const userId = await getUserId();
    if (!userId) return;

    // Optimiste
    setNotifications(prev => prev.map(n => ({ ...n, lu: true })));

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ lu: true })
        .eq('user_id', userId)
        .eq('lu', false);
      if (error) throw error;
    } catch {
      // Rollback
      setNotifications(prev =>
        prev.map(n => unreadIds.includes(n.id) ? { ...n, lu: false } : n)
      );
    }
  };

  // Supprimer une notification
  const deleteOne = async (id: number) => {
    if (actionIds.has(id)) return;
    const backup = notifications.find(n => n.id === id);
    // Optimiste
    setNotifications(prev => prev.filter(n => n.id !== id));
    addProcessing(id);
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch {
      // Rollback
      if (backup) {
        setNotifications(prev =>
          [...prev, backup].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
        );
      }
    } finally {
      removeProcessing(id);
    }
  };

  // Supprimer toutes les lues
  const deleteAllRead = async () => {
    const readOnes = notifications.filter(n => n.lu);
    if (readOnes.length === 0) return;
    if (!confirm(`Supprimer ${readOnes.length} notification(s) lue(s) ?`)) return;

    const userId = await getUserId();
    if (!userId) return;

    // Optimiste
    setNotifications(prev => prev.filter(n => !n.lu));

    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', userId)
        .eq('lu', true);
      if (error) throw error;
    } catch {
      // Rollback
      setNotifications(prev =>
        [...prev, ...readOnes].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      );
    }
  };

  // ─────────────────────────────────────────────────────────
  // FILTRAGE + PAGINATION + GROUPEMENT
  // ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...notifications];
    if (filterType)   list = list.filter(n => n.type === filterType);
    if (filterUnread) list = list.filter(n => !n.lu);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(n => n.message.toLowerCase().includes(s));
    }
    return list;
  }, [notifications, filterType, filterUnread, search]);

  const paginated = useMemo(
    () => filtered.slice(0, page * PAGE_SIZE),
    [filtered, page]
  );

  const hasMore = paginated.length < filtered.length;

  // Groupement par date
  const grouped = useMemo(() => {
    const map = new Map<string, Notification[]>();
    paginated.forEach(n => {
      const label = getGroupLabel(n.created_at);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(n);
    });
    return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
  }, [paginated]);

  // Stats
  const unread    = notifications.filter(n => !n.lu).length;
  const typesUsed = [...new Set(notifications.map(n => n.type))];
  const hasRead   = notifications.some(n => n.lu);
  const hasFilters = !!(filterType || filterUnread || search);

  // ─────────────────────────────────────────────────────────
  // RENDER — Loading skeleton
  // ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-5 max-w-3xl mx-auto">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 bg-slate-200 rounded-lg w-48 animate-pulse"/>
            <div className="h-4 bg-slate-100 rounded w-36 animate-pulse"/>
          </div>
          <div className="h-9 w-28 bg-slate-200 rounded-lg animate-pulse"/>
        </div>
        {/* Cards skeleton */}
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className={`h-20 rounded-xl animate-pulse ${
              i % 3 === 0 ? 'bg-blue-50' : 'bg-slate-100'
            }`}/>
          ))}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────
  // RENDER PRINCIPAL
  // ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 max-w-3xl mx-auto">

      {/* ══ HEADER ══ */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
            <div className="relative">
              <Bell size={26} className="text-blue-600"/>
              {unread > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </div>
            Notifications
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {unread > 0
              ? <><span className="font-semibold text-blue-600">{unread} non lue{unread > 1 ? 's' : ''}</span> · {notifications.length} au total</>
              : <>{notifications.length} notification{notifications.length > 1 ? 's' : ''} · tout lu ✓</>
            }
          </p>
        </div>

        {/* Actions header */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {/* Rafraîchir */}
          <button
            onClick={() => fetchNotifs({ refresh: true })}
            disabled={refreshing}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40"
            title="Actualiser"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''}/>
          </button>

          {/* Tout marquer lu */}
          {unread > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors font-medium"
            >
              <CheckCheck size={15}/>
              <span>Tout lire</span>
            </button>
          )}

          {/* Supprimer lues */}
          {hasRead && (
            <button
              onClick={deleteAllRead}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 border border-red-200 rounded-lg transition-colors"
            >
              <Trash2 size={15}/>
              <span>Effacer lues</span>
            </button>
          )}
        </div>
      </div>

      {/* ══ ERREUR ══ */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5"/>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-red-800 text-sm">Erreur de chargement</p>
            <p className="text-sm text-red-600 mt-1 break-words">{error}</p>
            <button
              onClick={() => fetchNotifs()}
              className="mt-2 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-xs flex items-center gap-1 w-fit"
            >
              <RefreshCw size={11}/> Réessayer
            </button>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 shrink-0">
            <X size={16}/>
          </button>
        </div>
      )}

      {/* ══ BARRE FILTRES ══ */}
      {notifications.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {/* Ligne principale filtres */}
          <div className="flex items-center gap-2 p-3">
            {/* Recherche */}
            <div className="relative flex-1 min-w-0">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Rechercher dans les notifications…"
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={12}/>
                </button>
              )}
            </div>

            {/* Toggle non-lues */}
            <button
              onClick={() => { setFilterUnread(!filterUnread); setPage(1); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all whitespace-nowrap ${
                filterUnread
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-300 hover:border-blue-300'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${filterUnread ? 'bg-white' : 'bg-blue-500'}`}/>
              Non lues {unread > 0 ? `(${unread})` : ''}
            </button>

            {/* Toggle filtres avancés */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border transition-all ${
                showFilters || filterType
                  ? 'bg-slate-100 border-slate-300 text-slate-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
              }`}
            >
              <Filter size={12}/>
              Filtres
              <ChevronDown size={12} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`}/>
            </button>

            {/* Reset */}
            {hasFilters && (
              <button
                onClick={() => { setFilterType(''); setFilterUnread(false); setSearch(''); setPage(1); }}
                className="text-xs text-red-500 hover:text-red-700 flex items-center gap-0.5 px-1"
              >
                <X size={12}/> Tout
              </button>
            )}
          </div>

          {/* Filtres par type (accordion) */}
          {showFilters && (
            <div className="px-3 pb-3 border-t border-slate-100 pt-3 flex flex-wrap gap-2">
              <span className="text-xs text-slate-400 self-center mr-1">Type :</span>
              {typesUsed.map(type => {
                const cfg = getCfg(type);
                const count = notifications.filter(n => n.type === type).length;
                return (
                  <button
                    key={type}
                    onClick={() => { setFilterType(filterType === type ? '' : type); setPage(1); }}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                      filterType === type
                        ? `${cfg.bg} ${cfg.text} ${cfg.border} ring-1 ring-current`
                        : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                    }`}
                  >
                    <span>{cfg.icon}</span>
                    {cfg.label}
                    <span className="opacity-60">({count})</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Résumé résultats */}
          <div className="px-3 pb-2 text-xs text-slate-400">
            {hasFilters
              ? `${filtered.length} résultat(s) sur ${notifications.length}`
              : `${notifications.length} notification(s) au total`
            }
          </div>
        </div>
      )}

      {/* ══ ÉTAT VIDE — aucune notification ══ */}
      {notifications.length === 0 && !error && (
        <div className="text-center py-20 bg-white rounded-xl border border-slate-200">
          <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <BellOff size={36} className="text-blue-200"/>
          </div>
          <p className="text-lg font-semibold text-slate-600">Aucune notification</p>
          <p className="text-sm text-slate-400 mt-2 max-w-sm mx-auto leading-relaxed">
            Vous serez notifié automatiquement lors des modifications de planning,
            imports et changements de statut.
          </p>
          <button
            onClick={() => fetchNotifs({ refresh: true })}
            className="mt-4 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition-colors"
          >
            <RefreshCw size={14} className="inline mr-1.5"/>
            Actualiser
          </button>
        </div>
      )}

      {/* ══ ÉTAT VIDE — filtres sans résultat ══ */}
      {notifications.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <Filter size={32} className="mx-auto text-slate-300 mb-3"/>
          <p className="font-semibold text-slate-500">Aucune notification pour ce filtre</p>
          <button
            onClick={() => { setFilterType(''); setFilterUnread(false); setSearch(''); }}
            className="mt-3 text-sm text-blue-600 hover:underline"
          >
            Effacer les filtres
          </button>
        </div>
      )}

      {/* ══ LISTE GROUPÉE ══ */}
      {grouped.map(group => (
        <div key={group.label} className="space-y-2">

          {/* Label groupe */}
          <div className="flex items-center gap-3 sticky top-0 z-10 py-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
              {group.label}
            </span>
            <div className="flex-1 h-px bg-slate-200"/>
            <span className="text-[10px] text-slate-300">
              {group.items.length}
            </span>
          </div>

          {/* Cartes notifications */}
          {group.items.map(n => {
            const cfg     = getCfg(n.type);
            const inProc  = actionIds.has(n.id);
            const isUnread = !n.lu;

            return (
              <div
                key={n.id}
                className={`
                  relative rounded-xl border transition-all duration-200 group
                  ${inProc ? 'opacity-50 pointer-events-none' : ''}
                  ${isUnread
                    ? 'bg-blue-50/80 border-blue-200 shadow-sm shadow-blue-100'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                  }
                `}
              >
                {/* Barre indicatrice gauche */}
                {isUnread && (
                  <div className={`absolute left-0 top-4 bottom-4 w-0.5 ${cfg.dot} rounded-full`}/>
                )}

                <div className="flex items-start gap-3 p-4 pl-4">
                  {/* Icône */}
                  <div className={`
                    w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 mt-0.5
                    ${cfg.bg}
                  `}>
                    {inProc
                      ? <Loader2 size={14} className="animate-spin text-slate-400"/>
                      : <span role="img">{cfg.icon}</span>
                    }
                  </div>

                  {/* Contenu */}
                  <div className="flex-1 min-w-0">
                    {/* Badge + indicateur nouveau */}
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`
                        text-[10px] px-2 py-0.5 rounded-full font-semibold border
                        ${cfg.bg} ${cfg.text} ${cfg.border}
                      `}>
                        {cfg.label}
                      </span>
                      {isUnread && (
                        <span className="flex items-center gap-1 text-[10px] text-blue-600 font-semibold">
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}/>
                          Nouveau
                        </span>
                      )}
                    </div>

                    {/* Message */}
                    <p className={`text-sm leading-relaxed ${
                      isUnread ? 'text-slate-800 font-medium' : 'text-slate-600'
                    }`}>
                      {n.message}
                    </p>

                    {/* Temps */}
                    <div className="flex items-center gap-1 mt-1.5">
                      <Clock size={10} className="text-slate-300"/>
                      <span
                        className="text-[11px] text-slate-400"
                        title={formatFull(n.created_at)}
                      >
                        {formatRelative(n.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Boutons actions (visibles au hover ou si non-lue) */}
                  <div className={`
                    flex flex-col items-center gap-1 shrink-0 transition-opacity
                    ${isUnread ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                  `}>
                    {/* Marquer lu / non-lu */}
                    {isUnread ? (
                      <button
                        onClick={() => markRead(n.id)}
                        className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-100 rounded-lg transition-colors"
                        title="Marquer comme lu"
                      >
                        <Check size={14}/>
                      </button>
                    ) : (
                      <button
                        onClick={() => markUnread(n.id)}
                        className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Marquer comme non lu"
                      >
                        <Bell size={14}/>
                      </button>
                    )}

                    {/* Supprimer */}
                    <button
                      onClick={() => deleteOne(n.id)}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 size={14}/>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* ══ BOUTON VOIR PLUS ══ */}
      {hasMore && (
        <div className="flex items-center justify-center pt-2">
          <button
            onClick={() => setPage(p => p + 1)}
            className="flex items-center gap-2 px-6 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 hover:border-slate-400 transition-all shadow-sm"
          >
            <ChevronDown size={16}/>
            Afficher plus
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {filtered.length - paginated.length} restante{filtered.length - paginated.length > 1 ? 's' : ''}
            </span>
          </button>
        </div>
      )}

      {/* ══ TOUTES AFFICHÉES ══ */}
      {!hasMore && paginated.length > PAGE_SIZE && (
        <p className="text-center text-xs text-slate-400 py-2">
          ✓ Toutes les notifications affichées
        </p>
      )}

      {/* ══ TOAST REFRESHING ══ */}
      {refreshing && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-800 text-white text-sm px-4 py-2.5 rounded-full shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <Loader2 size={14} className="animate-spin"/>
          Actualisation…
        </div>
      )}
    </div>
  );
}