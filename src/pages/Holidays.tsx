// src/pages/Holidays.tsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  fetchAlgerianHolidays,
  clearHolidayCache,
  getHolidayCacheStats,
  getAvailableFallbackYears,
} from '../lib/algerianHolidays';
import type { JourFerie, HolidayType } from '../lib/types';
import {
  Plus, Edit2, Trash2, CalendarDays, AlertTriangle,
  Search, Filter, X, Calendar, Loader2, CheckCircle2,
  Database, RefreshCw, Wifi, WifiOff, Info,
  Sparkles, Globe, Target
} from 'lucide-react';

// ─── Constants ───
const TYPE_COLORS: Record<string, string> = {
  national: 'bg-blue-50 text-blue-700 border-blue-200',
  religieux: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  local: 'bg-slate-50 text-slate-700 border-slate-200',
};
const TYPE_LABELS: Record<string, string> = {
  national: '🏛️ National',
  religieux: '🕌 Religieux',
  local: '📍 Local',
};
const TYPE_ICONS: Record<string, string> = {
  national: '🏛️', religieux: '🕌', local: '📍',
};
const TYPE_GRADIENTS: Record<string, string> = {
  national: 'from-blue-500 to-indigo-600',
  religieux: 'from-emerald-500 to-teal-600',
  local: 'from-slate-500 to-slate-600',
};
const SOURCE_COLORS: Record<string, string> = {
  api: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  local: 'bg-amber-50 text-amber-600 border-amber-200',
  manual: 'bg-violet-50 text-violet-600 border-violet-200',
  supabase: 'bg-blue-50 text-blue-600 border-blue-200',
};

// ─── Helpers ───
function formatDateFR(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' });
}
function isAlgeriaWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + 'T00:00:00');
  return d.getDay() === 5 || d.getDay() === 6;
}
function getDayName(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'long' });
}

// ─── Animated Number ───
function AnimatedNumber({ value, className = '' }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start: number | null = null;
    const from = 0; const to = value;
    const ease = (t: number) => 1 - Math.pow(1 - t, 4);
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / 800, 1);
      setDisplay(Math.floor(from + (to - from) * ease(p)));
      if (p < 1) requestAnimationFrame(step); else setDisplay(to);
    };
    requestAnimationFrame(step);
  }, [value]);
  return <span className={className}>{display}</span>;
}

// ═══════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════
export default function Holidays() {
  const { profile } = useAuth();
  const canEdit = ['super_admin', 'admin', 'responsable_unite', 'charge_unite'].includes(profile?.role ?? '');

  const [apiHolidays, setApiHolidays] = useState<JourFerie[]>([]);
  const [manualHolidays, setManualHolidays] = useState<JourFerie[]>([]);
  const [apiSource, setApiSource] = useState('');
  const [loading, setLoading] = useState(true);
  const [apiLoading, setApiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<JourFerie | null>(null);
  const [form, setForm] = useState({ date: '', nom: '', type: 'national' as HolidayType });
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [filterType, setFilterType] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [showCacheInfo, setShowCacheInfo] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const yearOptions = Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 1 + i);

  const loadHolidays = useCallback(async (year: number, forceRefresh = false) => {
    setApiLoading(true);
    setError(null);
    try {
      if (forceRefresh) clearHolidayCache(year);
      const { holidays: apiH, source } = await fetchAlgerianHolidays(year);
      setApiHolidays(apiH);
      setApiSource(source);
      const { data: manualData, error: dbErr } = await supabase
        .from('jours_feries').select('*')
        .gte('date', `${year}-01-01`).lte('date', `${year}-12-31`)
        .order('date');
      if (dbErr) { console.warn(dbErr.message); setManualHolidays([]); }
      else setManualHolidays((manualData ?? []).map(h => ({ ...h, source: 'manual' as const })));
    } catch (err: any) {
      setError(`Erreur chargement : ${err.message}`);
    } finally {
      setApiLoading(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadHolidays(selectedYear); }, [selectedYear, loadHolidays]);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(t);
  }, [success]);

  const allHolidays = useMemo(() => {
    const merged = new Map<string, JourFerie>();
    apiHolidays.forEach(h => merged.set(h.date, { ...h, source: h.source || 'api' }));
    manualHolidays.forEach(h => {
      const existing = merged.get(h.date);
      if (existing) merged.set(h.date, { ...h, source: 'manual' });
      else merged.set(h.date, { ...h, source: 'manual' });
    });
    return Array.from(merged.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((h, idx) => ({ ...h, id: h.id || idx + 1 }));
  }, [apiHolidays, manualHolidays]);

  const filtered = useMemo(() => {
    let list = [...allHolidays];
    if (filterType) list = list.filter(h => h.type === filterType);
    if (filterSource) {
      list = list.filter(h => {
        if (filterSource === 'api') return h.source === 'api' || h.source === 'local';
        if (filterSource === 'manual') return h.source === 'manual';
        return true;
      });
    }
    if (filterSearch) {
      const s = filterSearch.toLowerCase();
      list = list.filter(h => h.nom.toLowerCase().includes(s) || h.date.includes(s));
    }
    return list;
  }, [allHolidays, filterType, filterSource, filterSearch]);

  const stats = useMemo(() => ({
    total: allHolidays.length,
    aVenir: allHolidays.filter(h => h.date >= today).length,
    passes: allHolidays.filter(h => h.date < today).length,
    national: allHolidays.filter(h => h.type === 'national').length,
    religieux: allHolidays.filter(h => h.type === 'religieux').length,
    local: allHolidays.filter(h => h.type === 'local').length,
    conflitsWE: allHolidays.filter(h => isAlgeriaWeekend(h.date)).length,
    fromApi: allHolidays.filter(h => h.source === 'api' || h.source === 'local').length,
    fromManual: allHolidays.filter(h => h.source === 'manual').length,
  }), [allHolidays, today]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      if (editItem) {
        const { error: upErr } = await supabase.from('jours_feries')
          .update({ date: form.date, nom: form.nom, type: form.type }).eq('id', editItem.id);
        if (upErr) throw new Error(upErr.message);
        setSuccess(`✅ "${form.nom}" modifié avec succès.`);
      } else {
        const existsInAll = allHolidays.some(h => h.date === form.date);
        if (existsInAll) {
          const existing = allHolidays.find(h => h.date === form.date);
          throw new Error(`Un jour férié existe déjà pour le ${form.date} : "${existing?.nom}" (source: ${existing?.source}).`);
        }
        const { error: insErr } = await supabase.from('jours_feries').insert({ date: form.date, nom: form.nom, type: form.type });
        if (insErr) throw new Error(insErr.message);
        setSuccess(`✅ "${form.nom}" ajouté avec succès.`);
      }
      setShowForm(false); setEditItem(null);
      setForm({ date: '', nom: '', type: 'national' });
      loadHolidays(selectedYear);
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (item: JourFerie) => {
    if (item.source !== 'manual') {
      setError('Seuls les jours fériés ajoutés manuellement peuvent être supprimés. Les jours venant de l\'API sont automatiques.');
      return;
    }
    if (!confirm(`Supprimer "${item.nom}" (${item.date}) ?`)) return;
    setError(null);
    try {
      const { error: delErr } = await supabase.from('jours_feries').delete().eq('id', item.id);
      if (delErr) throw new Error(delErr.message);
      setSuccess(`✅ "${item.nom}" supprimé.`);
      loadHolidays(selectedYear);
    } catch (err: any) { setError(err.message); }
  };

  const openEdit = (item: JourFerie) => {
    if (item.source !== 'manual') {
      setError('Les jours fériés de l\'API ne peuvent pas être modifiés. Ajoutez un nouveau jour si nécessaire.');
      return;
    }
    setEditItem(item);
    setForm({ date: item.date, nom: item.nom, type: item.type as HolidayType });
    setShowForm(true); setError(null);
  };

  const openNew = () => {
    setEditItem(null);
    setForm({ date: '', nom: '', type: 'national' });
    setShowForm(true); setError(null);
  };

  const syncToSupabase = async () => {
    if (!confirm(`Synchroniser ${apiHolidays.length} jours fériés de l'API vers Supabase pour ${selectedYear} ?\nCela n'écrasera pas vos entrées manuelles existantes.`)) return;
    setSaving(true); setError(null);
    try {
      let inserted = 0;
      for (const h of apiHolidays) {
        const { data: existing } = await supabase.from('jours_feries').select('id').eq('date', h.date).maybeSingle();
        if (!existing) {
          const { error: insErr } = await supabase.from('jours_feries').insert({ date: h.date, nom: h.nom, type: h.type });
          if (!insErr) inserted++;
        }
      }
      setSuccess(`✅ ${inserted} jour(s) férié(s) synchronisé(s) vers Supabase.`);
      loadHolidays(selectedYear);
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  const cacheStats = useMemo(() => getHolidayCacheStats(), [allHolidays]);

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (filterType) c++; if (filterSearch) c++; if (filterSource) c++;
    return c;
  }, [filterType, filterSearch, filterSource]);

  const sel = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all outline-none";

  if (loading) return (
    <div className="bg-slate-50 min-h-[calc(100vh-60px)] p-4 lg:p-6 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-12 flex flex-col items-center gap-4">
        <Loader2 size={32} className="text-blue-500 animate-spin" />
        <p className="text-sm font-semibold text-slate-500">Chargement des jours fériés algériens…</p>
      </div>
    </div>
  );

  return (
    <div className="bg-slate-50 min-h-[calc(100vh-60px)] p-4 lg:p-6">
      <div className="max-w-[1500px] mx-auto space-y-5">

        {/* ═══════════════════════════════
            HEADER + LIGNE DESSOUS
        ═══════════════════════════════ */}
        <div className="pb-5 border-b border-slate-200/80 relative">
          <div className="absolute bottom-0 left-0 w-32 h-[3px] bg-gradient-to-r from-blue-600 via-indigo-500 to-transparent rounded-full" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-800 leading-tight tracking-tight">
                Jours Fériés{' '}
                <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 bg-clip-text text-transparent">
                  Algériens
                </span>
              </h1>
             
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border bg-emerald-50 text-emerald-600 border-emerald-200 shadow-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="font-black tabular-nums text-[11px]">{stats.aVenir}</span>
                <span className="text-[11px] opacity-70">à venir</span>
              </div>
              {stats.conflitsWE > 0 && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border bg-amber-50 text-amber-600 border-amber-200 shadow-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <span className="font-black tabular-nums text-[11px]">{stats.conflitsWE}</span>
                  <span className="text-[11px] opacity-70">sur WE</span>
                </div>
              )}

              <button onClick={() => loadHolidays(selectedYear, true)} disabled={apiLoading}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-500 hover:text-blue-600 text-xs font-semibold transition-all active:scale-95 shadow-sm disabled:opacity-50">
                <RefreshCw size={13} className={apiLoading ? 'animate-spin' : ''} strokeWidth={2.5} />
                <span className="hidden sm:inline">Actualiser</span>
              </button>

              {canEdit && (
                <button onClick={openNew}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-blue-200 transition-all active:scale-95">
                  <Plus size={14} strokeWidth={2.5} />Ajouter
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════
            API STATUS BANNER
        ═══════════════════════════════ */}
        <div className={`relative overflow-hidden rounded-2xl border p-4 ${
          apiLoading ? 'bg-blue-50 border-blue-200'
            : apiSource.includes('API') ? 'bg-emerald-50 border-emerald-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400" />

          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-md ${
                apiLoading ? 'bg-gradient-to-br from-blue-500 to-indigo-600 shadow-blue-200/50'
                  : apiSource.includes('API') ? 'bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-200/50'
                  : 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-200/50'
              }`}>
                {apiLoading ? <Loader2 size={18} className="text-white animate-spin" />
                  : apiSource.includes('API') ? <Wifi size={18} className="text-white" />
                  : <WifiOff size={18} className="text-white" />}
              </div>
              <div>
                <p className={`text-sm font-bold ${
                  apiLoading ? 'text-blue-800' :
                  apiSource.includes('API') ? 'text-emerald-800' : 'text-amber-800'
                }`}>
                  {apiLoading
                    ? `Chargement des jours fériés ${selectedYear}…`
                    : `📅 ${stats.fromApi} jour(s) depuis l'API + ${stats.fromManual} manuel(s)`}
                </p>
                {!apiLoading && apiSource && (
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[11px] text-slate-500 font-medium">Source : {apiSource}</span>
                    {cacheStats.apiKeys.abstract && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-bold border border-emerald-200">
                        <span className="w-1 h-1 rounded-full bg-emerald-500" />Abstract API
                      </span>
                    )}
                    {cacheStats.apiKeys.calendarific && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-bold border border-blue-200">
                        <span className="w-1 h-1 rounded-full bg-blue-500" />Calendarific
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowCacheInfo(!showCacheInfo)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 rounded-lg text-xs font-semibold text-slate-600 hover:text-blue-600 transition-all shadow-sm active:scale-95">
                <Info size={12} />Cache
              </button>
              {canEdit && stats.fromApi > 0 && (
                <button onClick={syncToSupabase} disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-violet-300 hover:bg-violet-50 rounded-lg text-xs font-bold text-slate-600 hover:text-violet-600 transition-all shadow-sm active:scale-95 disabled:opacity-50">
                  <Database size={12} />Sync DB
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Cache info expanded */}
        {showCacheInfo && (
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5 space-y-3 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-slate-400 via-blue-400 to-indigo-400" />
            <div className="flex items-center gap-2 mb-2">
              <Database size={14} className="text-blue-500" />
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.12em]">Détails du cache</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { l: 'Clé Abstract API', v: cacheStats.apiKeys.abstract ? '✅ Configurée' : '❌ Manquante', ok: cacheStats.apiKeys.abstract },
                { l: 'Clé Calendarific', v: cacheStats.apiKeys.calendarific ? '✅ Configurée' : '⚠️ Optionnel', ok: cacheStats.apiKeys.calendarific },
                { l: 'En mémoire', v: `${cacheStats.memory.length} année(s)`, ok: true },
                { l: 'localStorage', v: `${cacheStats.localStorage.length} année(s)`, ok: true },
              ].map(s => (
                <div key={s.l} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{s.l}</p>
                  <p className={`text-sm font-bold mt-1 ${s.ok ? 'text-emerald-600' : 'text-red-500'}`}>{s.v}</p>
                </div>
              ))}
            </div>
            {cacheStats.memory.length > 0 && (
              <div className="mt-2 p-3 bg-blue-50/50 border border-blue-100 rounded-xl">
                {cacheStats.memory.map(m => (
                  <p key={m.year} className="text-[11px] text-blue-700">
                    <span className="font-mono font-black">{m.year}</span> : {m.count} jours — {m.source} — {m.ageMinutes}min
                  </p>
                ))}
              </div>
            )}
            <p className="text-[10px] text-slate-400">
              Fallback local disponible : <strong className="text-slate-600">{getAvailableFallbackYears().join(', ')}</strong>
            </p>
          </div>
        )}

      

        {/* Messages */}
        {error && (
          <div className="flex items-center gap-4 p-4 bg-red-50 border border-red-100 rounded-2xl">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shrink-0 shadow-sm">
              <AlertTriangle size={17} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-red-800">Erreur</p>
              <p className="text-xs text-red-500 truncate">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl active:scale-95 transition-all">Fermer</button>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shrink-0 shadow-sm">
              <CheckCircle2 size={17} className="text-white" />
            </div>
            <p className="text-sm font-semibold text-emerald-800 flex-1">{success}</p>
          </div>
        )}

        {/* ═══════════════════════════════
            KPI CARDS
        ═══════════════════════════════ */}
        {/* <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { l: 'Total', v: stats.total, sub: `année ${selectedYear}`, iconBg: 'from-blue-500 to-indigo-600', icon: Calendar },
            { l: 'À venir', v: stats.aVenir, sub: 'jours fériés', iconBg: 'from-emerald-500 to-green-600', icon: Sparkles },
            { l: 'Sur week-end', v: stats.conflitsWE, sub: 'à anticiper', iconBg: stats.conflitsWE > 0 ? 'from-amber-500 to-orange-600' : 'from-emerald-500 to-green-600', icon: AlertTriangle, alert: stats.conflitsWE > 0 },
            { l: 'Manuels', v: stats.fromManual, sub: 'ajoutés à la main', iconBg: 'from-violet-500 to-purple-600', icon: Edit2 },
          ].map(k => {
            const Icon = k.icon;
            return (
              <div key={k.l} className="group bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all relative overflow-hidden cursor-default">
                <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full bg-gradient-to-br ${k.iconBg} opacity-5 group-hover:opacity-10 blur-2xl transition-all`} />
                <div className="relative">
                  <div className="flex items-center justify-between mb-3">
                    <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${k.iconBg} flex items-center justify-center shadow-md transition-transform group-hover:scale-110`}>
                      <Icon size={17} className="text-white" />
                    </div>
                    {k.alert && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-200 animate-pulse">
                        ⚠ Alerte
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{k.l}</p>
                  <AnimatedNumber value={k.v} className="text-2xl font-black text-slate-800 tracking-tight leading-none tabular-nums block mt-1" />
                  <p className="text-[10px] text-slate-400 mt-1.5 font-medium">{k.sub}</p>
                </div>
              </div>
            );
          })}
        </div> */}

        {/* ═══════════════════════════════
            FILTERS
        ═══════════════════════════════ */}
        

        {/* ═══════════════════════════════
            TYPE BREAKDOWN CARDS
        ═══════════════════════════════ */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-sm shadow-violet-200/50">
                <Globe size={16} className="text-white" strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">Répartition {selectedYear}</p>
                <p className="text-[11px] text-slate-400">Cliquez pour filtrer par type</p>
              </div>
            </div>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(['national', 'religieux', 'local'] as const).map(type => {
              const typeHols = allHolidays.filter(h => h.type === type);
              const upcoming = typeHols.filter(h => h.date >= today);
              const isActive = filterType === type;
              return (
                <button key={type} onClick={() => setFilterType(filterType === type ? '' : type)}
                  className={`group p-4 rounded-2xl border text-left transition-all hover:shadow-md hover:-translate-y-0.5 relative overflow-hidden ${
                    isActive
                      ? `bg-gradient-to-br from-white to-slate-50 border-blue-300 ring-2 ring-blue-200 shadow-sm`
                      : 'bg-white border-slate-100 hover:border-slate-200'
                  }`}>
                  <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full bg-gradient-to-br ${TYPE_GRADIENTS[type]} opacity-5 group-hover:opacity-10 blur-2xl transition-all`} />
                  <div className="relative">
                    <div className="flex items-center justify-between mb-3">
                      <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${TYPE_GRADIENTS[type]} flex items-center justify-center shadow-md text-xl group-hover:scale-110 transition-transform`}>
                        <span>{TYPE_ICONS[type]}</span>
                      </div>
                      <span className="text-2xl font-black text-slate-800 tabular-nums">{typeHols.length}</span>
                    </div>
                    <p className="text-sm font-bold text-slate-800">{TYPE_LABELS[type]?.replace(/[🏛️🕌📍]\s*/, '')}</p>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500 font-semibold">
                      <span className="text-emerald-600">{upcoming.length} à venir</span>
                      <span className="text-slate-300">·</span>
                      <span>{typeHols.length - upcoming.length} passé(s)</span>
                    </div>
                    {typeHols.length > 0 && (
                      <div className="mt-3 space-y-0.5 pt-2 border-t border-slate-100">
                        {typeHols.slice(0, 3).map(h => (
                          <p key={h.date} className="text-[10px] text-slate-500 truncate">
                            <span className="font-mono text-slate-400">{h.date}</span> — {h.nom}
                          </p>
                        ))}
                        {typeHols.length > 3 && (
                          <p className="text-[10px] text-slate-400 italic">…et {typeHols.length - 3} autre(s)</p>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ═══════════════════════════════
            MAIN TABLE
        ═══════════════════════════════ */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gradient-to-r from-slate-50 to-blue-50/30 border-b border-slate-100">
                  {['Date', 'Jour', 'Nom', 'Type', 'Source', 'Statut', 'WE', canEdit && ''].filter(Boolean).map(h => (
                    <th key={h as string} className="px-3 py-3 text-left font-bold text-slate-400 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={canEdit ? 8 : 7} className="py-16">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center">
                          <CalendarDays size={28} className="text-slate-300" strokeWidth={1.5} />
                        </div>
                        <p className="text-sm font-semibold text-slate-400">Aucun jour férié trouvé pour {selectedYear}</p>
                        {!cacheStats.apiKeys.abstract && !cacheStats.apiKeys.calendarific && (
                          <p className="text-xs text-slate-400 text-center max-w-md">
                            💡 Configurez <code className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono text-[10px]">VITE_ABSTRACT_API_KEY</code> pour charger automatiquement
                          </p>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {filtered.map(h => {
                  const isPast = h.date < today;
                  const isToday = h.date === today;
                  const isWE = isAlgeriaWeekend(h.date);
                  const isManual = h.source === 'manual';

                  return (
                    <tr key={`${h.date}-${h.id}`}
                      className={`group hover:bg-blue-50/20 transition-colors relative ${
                        isToday ? 'bg-blue-50/40' : isPast ? 'opacity-50 hover:opacity-100' : ''
                      }`}>
                      {isToday && (
                        <td className="absolute left-0 inset-y-0 w-[3px] bg-gradient-to-b from-blue-500 to-indigo-600 rounded-r-full" />
                      )}

                      <td className="px-3 py-2.5 font-mono font-bold text-slate-700 whitespace-nowrap">{h.date}</td>
                      <td className="px-3 py-2.5 capitalize text-slate-500 text-[11px]">{getDayName(h.date)}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-800">
                        {isToday && <span className="mr-1.5">📌</span>}
                        {h.nom}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-lg font-bold border ${TYPE_COLORS[h.type] ?? TYPE_COLORS.local}`}>
                          {TYPE_LABELS[h.type] ?? h.type}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-lg font-bold border ${SOURCE_COLORS[h.source ?? 'api'] ?? SOURCE_COLORS.api}`}>
                          {h.source === 'manual' ? '✏️ Manuel' :
                            h.source === 'local' ? '💾 Local' :
                              h.source === 'api' ? '🌐 API' : '📡 Auto'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {isToday ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg font-bold shadow-sm">
                            <span className="w-1 h-1 rounded-full bg-white animate-pulse" />Aujourd'hui
                          </span>
                        ) : isPast ? (
                          <span className="text-[10px] text-slate-400 font-medium">Passé</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />À venir
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {isWE ? (
                          <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 font-bold" title="Tombe un week-end (Ven/Sam)">
                            ⚠ WE
                          </span>
                        ) : (
                          <span className="text-emerald-500 font-bold">✓</span>
                        )}
                      </td>
                      {canEdit && (
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {isManual ? (
                              <>
                                <button onClick={() => openEdit(h)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="Modifier">
                                  <Edit2 size={13} />
                                </button>
                                <button onClick={() => handleDelete(h)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Supprimer">
                                  <Trash2 size={13} />
                                </button>
                              </>
                            ) : (
                              <span className="text-[10px] text-slate-300 italic px-2 font-medium">auto</span>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 py-3 text-[10px] text-slate-400 mt-3">
          <Target size={10} />
          <span>{stats.total} jours fériés · {stats.aVenir} à venir · {stats.fromManual} ajoutés manuellement</span>
        </div>

        {/* ═══════════════════════════════
            FORM MODAL
        ═══════════════════════════════ */}
        {showForm && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowForm(false); setError(null); }}>
            <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-slate-100 max-h-[90vh]">
              {/* Header */}
              <div className="relative overflow-hidden bg-gradient-to-br from-[#0b1222] via-[#101d3d] to-[#0d1630] px-6 py-5">
                <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(rgba(148,163,184,.5) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-blue-500/30 blur-3xl" />
                <div className="relative flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-blue-200/60 uppercase tracking-widest mb-1">
                      {editItem ? 'Modifier le jour férié' : 'Nouveau jour férié'}
                    </p>
                    <h2 className="text-base font-bold text-white">
                      {editItem ? editItem.nom : 'Ajout manuel'}
                    </h2>
                  </div>
                  <button onClick={() => { setShowForm(false); setError(null); }} className="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-all">
                    <X size={16} />
                  </button>
                </div>
              </div>

              <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Info card */}
                <div className="p-3 bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-200 rounded-xl text-xs text-violet-700 flex items-start gap-2">
                  <Info size={14} className="shrink-0 mt-0.5 text-violet-500" />
                  <span>Les jours ajoutés manuellement complètent ceux chargés automatiquement depuis l'API. Idéal pour les jours fériés locaux ou les corrections.</span>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.08em] mb-1.5">Date *</label>
                  <input type="date" value={form.date} required
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className={sel} />
                  {form.date && (
                    <p className="text-xs text-slate-500 mt-2 flex items-center gap-1.5 flex-wrap">
                      <Calendar size={11} className="text-blue-500" />
                      <span>{formatDateFR(form.date)}</span>
                      {isAlgeriaWeekend(form.date) && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded font-bold">⚠ Week-end</span>
                      )}
                      {allHolidays.some(h => h.date === form.date && !editItem) && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded font-bold">⚠ Date déjà utilisée</span>
                      )}
                    </p>
                  )}
                </div>

                {/* Nom */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.08em] mb-1.5">Nom *</label>
                  <input type="text" value={form.nom} required
                    onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                    placeholder="Ex: Fête locale de Wilaya"
                    className={sel} />
                </div>

                {/* Type */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.08em] mb-1.5">Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['national', 'religieux', 'local'] as const).map(t => (
                      <button key={t} type="button" onClick={() => setForm(f => ({ ...f, type: t }))}
                        className={`group relative p-3 rounded-xl text-xs font-bold border transition-all overflow-hidden ${
                          form.type === t
                            ? 'border-blue-300 bg-blue-50 shadow-sm ring-2 ring-blue-200'
                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300'
                        }`}>
                        <div className={`absolute -top-4 -right-4 w-12 h-12 rounded-full bg-gradient-to-br ${TYPE_GRADIENTS[t]} opacity-${form.type === t ? '10' : '0'} blur-xl`} />
                        <div className="relative">
                          <div className="text-lg mb-1">{TYPE_ICONS[t]}</div>
                          <div className={`text-[10px] uppercase tracking-wider ${form.type === t ? 'text-blue-700' : 'text-slate-500'}`}>
                            {TYPE_LABELS[t]?.replace(/[🏛️🕌📍]\s*/, '')}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preview */}
                {form.date && form.nom && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Aperçu</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Calendar size={14} className="text-blue-500" />
                      <span className="text-sm font-bold text-slate-800">{form.nom}</span>
                      <span className="text-[11px] text-slate-500">{formatDateFR(form.date)}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-lg border font-bold ${TYPE_COLORS[form.type]}`}>
                        {TYPE_LABELS[form.type]}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-lg border font-bold ${SOURCE_COLORS.manual}`}>
                        ✏️ Manuel
                      </span>
                    </div>
                  </div>
                )}

                {/* Error inside modal */}
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex gap-2">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
              </form>

              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
                <button type="button" onClick={() => { setShowForm(false); setError(null); }}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-100 transition-colors">
                  Annuler
                </button>
                <button type="submit" onClick={handleSave} disabled={saving}
                  className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-sm font-bold shadow-sm shadow-blue-200 disabled:opacity-50 transition-all active:scale-95 flex items-center gap-2">
                  {saving ? <><Loader2 size={14} className="animate-spin" />Enregistrement…</> : <><CheckCircle2 size={14} strokeWidth={2.5} />{editItem ? 'Modifier' : 'Ajouter'}</>}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}