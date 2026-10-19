// pages/Dashboard.tsx
// ══════════════════════════════════════════════════════════════════════════════
//  TABLEAU DE BORD — instrument d'analyse.
//
//  Parcours : toutes les unités → comparaison → ateliers en transversal →
//  détail d'une unité. Les actions de terrain vivent sur la page Journée.
//
//  Parti pris graphique : panneaux à plat, un seul accent, densité assumée.
//  Aucun dégradé, aucun halo, aucune ombre portée.
//
//  MàJ : bandeaux de statistiques repensés (GroupBar), progression
//  hebdomadaire en vue mensuelle (cliquable → filtre la semaine), et
//  animations d'entrée lors des changements de vue / période / unité.
// ══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Building2, Wrench, RefreshCw, CalendarDays, CalendarRange, BarChart3, Activity,
  AlertTriangle, AlertOctagon, Layers, Target, Users, ListChecks,
  ChevronDown, Check, ArrowRight, ArrowLeft, Loader2, Search, X, PieChart, Gauge,
} from 'lucide-react';
import { supabase } from '../lib/supabase'
import type { Unite, JourFerie, Atelier } from '../lib/types';
import { formatISO, formatDateFR, getWeekNumInMonth, isAlgeriaWeekend } from './lib/interventionsUI';
import type { InterventionRow, DashboardTache, ViewMode, WeekFilter } from './lib/interventionsUI';
import {
  C, Panel, GroupBar, MiniSelect, Legend, GroupedBars, HorizontalBars,
  OverlapDonut, ArcGauge, LineChart, StackedRow, StatusPill, WeeklyProgress,
} from './lib/charts';
import type { SemaineStat } from './lib/charts';

const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
const MOIS_LONG = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

// ══════════════════════════════════════════════════════════════════════════
//  SÉLECTEUR D'UNITÉ — bouton en barre haute, ouvre une liste recherchable
//  avec mini-indicateurs (réalisation, retards) pour choisir vite.
// ══════════════════════════════════════════════════════════════════════════
interface UniteSwitcherItem {
  id: number;
  code: string;
  nom?: string | null;
  pct: number;
  retards: number;
  total: number;
}

function UniteSwitcher({ unites, selectedUnite, onSelect }: {
  unites: UniteSwitcherItem[];
  selectedUnite: number | null;
  onSelect: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  useEffect(() => { if (!open) setSearch(''); }, [open]);

  const current = unites.find(u => u.id === selectedUnite) || null;
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return unites;
    return unites.filter(u => u.code.toLowerCase().includes(s) || (u.nom || '').toLowerCase().includes(s));
  }, [unites, search]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 pl-2.5 pr-2 py-[7px] rounded-[9px] border text-[12px] font-semibold transition-all duration-150 ${
          current
            ? open ? 'bg-[#0a1930] border-[#0a1930] text-white' : 'bg-[#eef3f8] border-[#d7e3f0] text-[#0a1930] hover:border-[#8fb3cc]'
            : 'bg-[#0a1930] border-[#0a1930] text-white hover:bg-[#122744]'
        }`}
      >
        <Building2 size={13} className={current && !open ? 'text-[#2f6690]' : 'text-[#8fd8ec]'} />
        <span className="max-w-[170px] truncate">{current ? current.code : 'Toutes les unités'}</span>
        <ChevronDown size={12} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''} ${current && !open ? 'text-[#7b879d]' : 'text-white/60'}`} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-[calc(100%+8px)] w-[310px] bg-white border border-[#e4e8ef] rounded-[12px] shadow-[0_20px_40px_-16px_rgba(10,25,48,0.4)] overflow-hidden z-40"
          style={{ animation: 'switcher-in .16s ease both' }}
        >
          <div className="p-2 border-b border-[#eceff4]">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#c4ccdb]" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher une unité…"
                className="w-full pl-7 pr-2 py-[7px] text-[12px] border border-[#e4e8ef] rounded-md outline-none focus:border-[#2f6690] transition-colors"
              />
            </div>
          </div>

          <div className="max-h-[320px] overflow-y-auto py-1">
            <button
              onClick={() => { onSelect(null); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#f7f9fc] transition-colors ${selectedUnite === null ? 'bg-[#eef3f8]' : ''}`}
            >
              <span className="w-7 h-7 rounded-md bg-[#0a1930] flex items-center justify-center shrink-0">
                <Layers size={12} className="text-white" />
              </span>
              <span className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-[#0a1930]">Toutes les unités</p>
                <p className="text-[10px] text-[#7b879d]">Vue portefeuille</p>
              </span>
              {selectedUnite === null && <Check size={13} className="text-[#2f6690] shrink-0" />}
            </button>

            {filtered.length === 0 ? (
              <p className="text-center text-[11px] text-[#7b879d] py-6">Aucune unité trouvée</p>
            ) : filtered.map(u => (
              <button
                key={u.id}
                onClick={() => { onSelect(u.id); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#f7f9fc] transition-colors ${selectedUnite === u.id ? 'bg-[#eef3f8]' : ''}`}
              >
                <span className="w-7 h-7 rounded-md bg-[#eef3f8] flex items-center justify-center shrink-0 text-[10px] font-bold text-[#2f6690]">
                  {u.code.slice(0, 2).toUpperCase()}
                </span>
                <span className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-[#0a1930] truncate">{u.code}</p>
                  <p className="text-[10px] text-[#7b879d] truncate">{u.nom || '—'} · {u.total} interv.</p>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {u.retards > 0 && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#fdecee] text-[#c8384c] tabular-nums">{u.retards}</span>
                  )}
                  <span className={`text-[10.5px] font-bold tabular-nums w-9 text-right ${
                    u.pct >= 80 ? 'text-[#1f9d6b]' : u.pct >= 50 ? 'text-[#d99400]' : 'text-[#c8384c]'
                  }`}>
                    {u.pct}%
                  </span>
                </span>
                {selectedUnite === u.id && <Check size={13} className="text-[#2f6690] shrink-0" />}
              </button>
            ))}
          </div>

          <style>{`
            @keyframes switcher-in {
              from { opacity: 0; transform: translateY(-4px) scale(.98); }
              to   { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [interventions, setInterventions] = useState<InterventionRow[]>([]);
  const [unites, setUnites] = useState<Unite[]>([]);
  const [ateliers, setAteliers] = useState<Atelier[]>([]);
  const [holidays, setHolidays] = useState<JourFerie[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('annual');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [weekFilter, setWeekFilter] = useState<WeekFilter>('all');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [showYearComparison, setShowYearComparison] = useState(false);
  const [selectedUnite, setSelectedUnite] = useState<number | null>(null);
  const [atelierFilter, setAtelierFilter] = useState<'all' | number>('all');
  const [uniteSearch, setUniteSearch] = useState('');
  const [classement, setClassement] = useState<'total' | 'pct' | 'retards' | 'reports'>('total');

  const [uniteIndicateurs, setUniteIndicateurs] = useState<Record<number, {
    tachesOk: number; tachesNok: number; tachesTotal: number;
    interventionsAvecTaches: number; demandes: number; demandesEnAttente: number;
  }> | null>(null);
  const [indicLoading, setIndicLoading] = useState(false);

  const [analyticsTasks, setAnalyticsTasks] = useState<Record<number, DashboardTache[]> | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // ── Dernières actions (flux d'activité par unité) ──
  const [importsLog, setImportsLog] = useState<{ id: number; unite_id: number; filename: string; row_count: number; created_at: string }[]>([]);
  const [reportsLog, setReportsLog] = useState<{ id: number; unite_id: number | null; motif: string; created_at: string }[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const role = (profile?.role ?? '').trim().toLowerCase();
  const canViewAllUnits = role === 'admin' || role === 'super_admin';
  // Le chargé d'unité est verrouillé sur son unique atelier, partout (y compris le Dashboard).
  const isChargeUnite = role === 'charge_unite';

  useEffect(() => {
    if (!canViewAllUnits && profile?.unite_id && selectedUnite === null) {
      setSelectedUnite(profile.unite_id);
    }
  }, [canViewAllUnits, profile, selectedUnite]);

  useEffect(() => {
    // Le chargé d'unité reste toujours filtré sur son atelier, jamais "Tous".
    setAtelierFilter(isChargeUnite && profile?.atelier_id ? profile.atelier_id : 'all');
    setAnalyticsTasks(null);
  }, [selectedUnite, isChargeUnite, profile?.atelier_id]);
  useEffect(() => { setAnalyticsTasks(null); }, [viewMode, selectedMonth, weekFilter, atelierFilter]);
  // En changeant de mois on repart d'une semaine non filtrée
  useEffect(() => { setWeekFilter('all'); }, [selectedMonth, viewMode]);

  // ══════════════════════════════════════════════════════════════════════════
  //  CHARGEMENT
  // ══════════════════════════════════════════════════════════════════════════
  const fetchAll = useCallback(async () => {
    if (!profile) { setLoading(false); return; }
    setError(null); setLoading(true); setRefreshing(true);
    try {
      let q = supabase.from('planning').select('*').order('date_prevue', { ascending: true });
      if (!canViewAllUnits && profile.unite_id) q = q.eq('unite_id', profile.unite_id);
      if (isChargeUnite && profile.atelier_id) q = q.eq('atelier_id', profile.atelier_id);

      const [{ data: i }, { data: u }, { data: h }, { data: a }] = await Promise.all([
        q,
        supabase.from('unites').select('*').order('code'),
        supabase.from('jours_feries').select('*').order('date'),
        supabase.from('ateliers').select('*').order('code'),
      ]);
      setInterventions((i || []) as InterventionRow[]);
      setUnites(u || []);
      setHolidays(h || []);
      setAteliers((a || []) as Atelier[]);
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
      setTimeout(() => setRefreshing(false), 400);
    }
  }, [profile, canViewAllUnits, isChargeUnite]);

  useEffect(() => { if (profile) fetchAll(); }, [profile, fetchAll]);

  // ── Flux d'activité : imports Excel + demandes de report, par unité ──
  // (les clôtures sont dérivées de `interventions`, déjà chargées ci-dessus — pas de requête supplémentaire)
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    (async () => {
      setActivityLoading(true);
      try {
        let qImports = supabase.from('excel_imports')
          .select('id, unite_id, filename, row_count, created_at')
          .order('created_at', { ascending: false }).limit(30);
        let qReports = supabase.from('demandes_report')
          .select('id, unite_id, motif, created_at')
          .order('created_at', { ascending: false }).limit(30);
        if (!canViewAllUnits && profile.unite_id) {
          qImports = qImports.eq('unite_id', profile.unite_id);
          qReports = qReports.eq('unite_id', profile.unite_id);
        }
        const [{ data: imp }, { data: rep }] = await Promise.all([qImports, qReports]);
        if (cancelled) return;
        setImportsLog((imp || []) as any);
        setReportsLog((rep || []) as any);
      } catch (err) {
        console.error('Erreur chargement activité récente :', err);
      } finally {
        if (!cancelled) setActivityLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profile, canViewAllUnits, lastUpdated]);

  // Indicateurs consolidés : tâches et demandes de report, par unité
  useEffect(() => {
    if (interventions.length === 0) return;
    let cancelled = false;
    (async () => {
      setIndicLoading(true);
      try {
        const byId = new Map(interventions.map(i => [i.id, i.unite_id]));
        const ids = Array.from(byId.keys());
        const acc: Record<number, any> = {};
        const touch = (uid: number) => {
          if (!acc[uid]) acc[uid] = { tachesOk: 0, tachesNok: 0, tachesTotal: 0, interventionsAvecTaches: 0, demandes: 0, demandesEnAttente: 0 };
          return acc[uid];
        };
        const vues = new Set<number>();
        for (let k = 0; k < ids.length; k += 300) {
          const { data } = await supabase.from('planning_taches')
            .select('planning_id, ok').in('planning_id', ids.slice(k, k + 300));
          (data || []).forEach((t: any) => {
            const uid = byId.get(t.planning_id);
            if (uid == null) return;
            const e = touch(uid);
            e.tachesTotal++;
            if (t.ok === true) e.tachesOk++;
            else if (t.ok === false) e.tachesNok++;
            if (!vues.has(t.planning_id)) { vues.add(t.planning_id); e.interventionsAvecTaches++; }
          });
        }
        const { data: dr } = await supabase.from('demandes_report').select('unite_id, statut');
        (dr || []).forEach((d: any) => {
          if (d.unite_id == null) return;
          const e = touch(d.unite_id);
          e.demandes++;
          if (d.statut === 'en_attente') e.demandesEnAttente++;
        });
        if (!cancelled) setUniteIndicateurs(acc);
      } catch (err) {
        console.error('Indicateurs :', err);
        if (!cancelled) setUniteIndicateurs({});
      } finally {
        if (!cancelled) setIndicLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [interventions]);

  // ══════════════════════════════════════════════════════════════════════════
  //  PÉRIMÈTRES
  // ══════════════════════════════════════════════════════════════════════════
  const today = useMemo(() => new Date(), []);
  const todayStr = formatISO(today);
  const currentYear = today.getFullYear();

  const getDaysOverdue = useCallback((d: string) =>
    Math.max(0, Math.floor((today.getTime() - new Date(d + 'T00:00:00').getTime()) / 86400000)), [today]);

  // ── Années disponibles (déduites des interventions chargées) + année sélectionnée ──
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    interventions.forEach(i => {
      if (!i.date_prevue) return;
      years.add(new Date(i.date_prevue + 'T00:00:00').getFullYear());
    });
    years.add(currentYear);
    return Array.from(years).sort((a, b) => b - a);
  }, [interventions, currentYear]);

  // Si l'année sélectionnée n'a plus de données disponibles (changement d'unité, etc.),
  // on retombe sur l'année la plus récente disponible.
  useEffect(() => {
    if (availableYears.length && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  const atelierById = useMemo(() => new Map(ateliers.map(a => [a.id, a])), [ateliers]);
  const uniteById = useMemo(() => new Map(unites.map(u => [u.id, u])), [unites]);

  // ── Dernières actions : fusion clôtures (interventions) + imports + reports, triées par date ──
  type ActivityEvent = { id: string; unite_id: number; type: 'cloture' | 'import' | 'report'; label: string; date: string };
  const derniersActions = useMemo<ActivityEvent[]>(() => {
    const clotures: ActivityEvent[] = interventions
      .filter(i => i.statut === 'terminee' && i.updated_at)
      .map(i => ({ id: `cloture-${i.id}`, unite_id: i.unite_id, type: 'cloture', label: `Clôture — ${i.titre}`, date: i.updated_at }));
    const imports: ActivityEvent[] = importsLog
      .filter(imp => imp.unite_id != null)
      .map(imp => ({
        id: `import-${imp.id}`, unite_id: imp.unite_id, type: 'import',
        label: `Import Excel — ${imp.row_count} ligne${imp.row_count > 1 ? 's' : ''} (${imp.filename})`,
        date: imp.created_at,
      }));
    const reports: ActivityEvent[] = reportsLog
      .filter(r => r.unite_id != null)
      .map(r => ({
        id: `report-${r.id}`, unite_id: r.unite_id as number, type: 'report',
        label: `Demande de report — ${r.motif || 'motif non précisé'}`,
        date: r.created_at,
      }));
    return [...clotures, ...imports, ...reports]
      .filter(e => selectedUnite === null || e.unite_id === selectedUnite)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8);
  }, [interventions, importsLog, reportsLog, selectedUnite]);

  const uniteScoped = useMemo(
    () => selectedUnite === null ? interventions : interventions.filter(i => i.unite_id === selectedUnite),
    [interventions, selectedUnite]
  );
  const scoped = useMemo(
    () => atelierFilter === 'all' ? uniteScoped : uniteScoped.filter(i => i.atelier_id === atelierFilter),
    [uniteScoped, atelierFilter]
  );

  const periode = useMemo(() => {
    if (viewMode === 'annual') {
      return scoped.filter(i => new Date(i.date_prevue + 'T00:00:00').getFullYear() === selectedYear);
    }
    return scoped.filter(i => {
      const d = new Date(i.date_prevue + 'T00:00:00');
      if (d.getMonth() !== selectedMonth || d.getFullYear() !== selectedYear) return false;
      if (weekFilter !== 'all') return getWeekNumInMonth(i.date_prevue) === parseInt(weekFilter.replace('w', ''));
      return true;
    });
  }, [scoped, viewMode, selectedMonth, weekFilter, selectedYear]);

  const stats = useMemo(() => ({
    total: periode.length,
    plan: periode.filter(i => i.statut === 'planifiee').length,
    enCours: periode.filter(i => i.statut === 'en_cours').length,
    terminees: periode.filter(i => i.statut === 'terminee').length,
    reportees: periode.filter(i => i.statut === 'reportee').length,
  }), [periode]);

  const pct = stats.total > 0 ? Math.round((stats.terminees / stats.total) * 100) : 0;

  const duJour = useMemo(() => scoped.filter(i => i.date_prevue === todayStr), [scoped, todayStr]);
  const aCloturer = useMemo(
    () => duJour.filter(i => i.statut === 'planifiee' || i.statut === 'en_cours'), [duJour]);
  const aLancer = useMemo(
    () => duJour.filter(i => i.statut === 'planifiee' && !!i.fiche_inspection), [duJour]);
  const overdue = useMemo(() => scoped.filter(i =>
    i.statut !== 'terminee' && i.statut !== 'reportee' && i.date_prevue < todayStr), [scoped, todayStr]);
  const holidayAlerts = useMemo(() => scoped.filter(i => {
    if (!i.date_prevue) return false;
    const d = new Date(i.date_prevue + 'T00:00:00');
    return isAlgeriaWeekend(d) || holidays.some(h => h.date === i.date_prevue);
  }), [scoped, holidays]);

  // ── Unités ──
  const parUnite = useMemo(() => unites.map(u => {
    const ui = interventions.filter(i => i.unite_id === u.id);
    const total = ui.length;
    const terminees = ui.filter(i => i.statut === 'terminee').length;
    const ret = ui.filter(i => i.statut !== 'terminee' && i.statut !== 'reportee' && i.date_prevue < todayStr);
    const cumul = ret.reduce((s, i) => s + getDaysOverdue(i.date_prevue), 0);
    const ind = uniteIndicateurs?.[u.id];
    return {
      ...u, total, terminees,
      enCours: ui.filter(i => i.statut === 'en_cours').length,
      plan: ui.filter(i => i.statut === 'planifiee').length,
      reportees: ui.filter(i => i.statut === 'reportee').length,
      dujour: ui.filter(i => i.date_prevue === todayStr).length,
      pct: total > 0 ? Math.round((terminees / total) * 100) : 0,
      retards: ret.length,
      retardMoyen: ret.length > 0 ? Math.round((cumul / ret.length) * 10) / 10 : 0,
      moyTachesOk: ind && ind.interventionsAvecTaches > 0
        ? Math.round((ind.tachesOk / ind.interventionsAvecTaches) * 10) / 10 : null,
      conformite: ind && (ind.tachesOk + ind.tachesNok) > 0
        ? Math.round((ind.tachesOk / (ind.tachesOk + ind.tachesNok)) * 100) : null,
      demandes: ind?.demandes ?? null,
      enAttente: ind?.demandesEnAttente ?? 0,
    };
  }), [unites, interventions, todayStr, getDaysOverdue, uniteIndicateurs]);

  const unitesTriees = useMemo(() => {
    const s = uniteSearch.trim().toLowerCase();
    const base = s ? parUnite.filter(u =>
      u.code.toLowerCase().includes(s) || (u.nom || '').toLowerCase().includes(s)) : parUnite;
    return [...base].sort((a, b) =>
      classement === 'pct' ? b.pct - a.pct
      : classement === 'retards' ? b.retards - a.retards
      : classement === 'reports' ? (b.demandes ?? 0) - (a.demandes ?? 0)
      : b.total - a.total);
  }, [parUnite, uniteSearch, classement]);

  const portefeuille = useMemo(() => {
    const actives = parUnite.filter(u => u.total > 0);
    const tot = actives.reduce((s, u) => s + u.total, 0);
    const fin = actives.reduce((s, u) => s + u.terminees, 0);
    const pcts = actives.map(u => u.pct);
    return {
      total: tot, terminees: fin,
      retards: actives.reduce((s, u) => s + u.retards, 0),
      demandes: actives.reduce((s, u) => s + (u.demandes ?? 0), 0),
      enAttente: actives.reduce((s, u) => s + u.enAttente, 0),
      pct: tot > 0 ? Math.round((fin / tot) * 100) : 0,
      nb: actives.length,
      ecart: pcts.length > 1 ? Math.max(...pcts) - Math.min(...pcts) : 0,
    };
  }, [parUnite]);

  // ── Ateliers ──
  const parAtelier = useMemo(() => {
    const acc = new Map<number | 'none', { total: number; terminees: number; retards: number; heures: number; unites: Set<number> }>();
    interventions.forEach(i => {
      const k = (i.atelier_id ?? 'none') as number | 'none';
      if (!acc.has(k)) acc.set(k, { total: 0, terminees: 0, retards: 0, heures: 0, unites: new Set() });
      const e = acc.get(k)!;
      e.total++;
      e.heures += i.duree_intervention || 0;
      if (i.unite_id != null) e.unites.add(i.unite_id);
      if (i.statut === 'terminee') e.terminees++;
      if (i.statut !== 'terminee' && i.statut !== 'reportee' && i.date_prevue < todayStr) e.retards++;
    });
    return Array.from(acc.entries()).map(([k, v]) => ({
      id: k,
      code: k === 'none' ? 'Sans atelier' : (atelierById.get(k as number)?.code ?? `#${k}`),
      nom: k === 'none' ? '—' : (atelierById.get(k as number)?.nom ?? ''),
      total: v.total, terminees: v.terminees, retards: v.retards,
      heures: v.heures, nbUnites: v.unites.size,
      pct: v.total > 0 ? Math.round((v.terminees / v.total) * 100) : 0,
    })).sort((a, b) => b.total - a.total);
  }, [interventions, todayStr, atelierById]);

  const ateliersUnite = useMemo(() => {
    if (selectedUnite === null) return [];
    const acc = new Map<number, { total: number; terminees: number; retards: number; heures: number }>();
    uniteScoped.forEach(i => {
      if (i.atelier_id == null) return;
      if (!acc.has(i.atelier_id)) acc.set(i.atelier_id, { total: 0, terminees: 0, retards: 0, heures: 0 });
      const e = acc.get(i.atelier_id)!;
      e.total++;
      e.heures += i.duree_intervention || 0;
      if (i.statut === 'terminee') e.terminees++;
      if (i.statut !== 'terminee' && i.statut !== 'reportee' && i.date_prevue < todayStr) e.retards++;
    });
    return Array.from(acc.entries()).map(([id, v]) => ({
      id, code: atelierById.get(id)?.code ?? `#${id}`, nom: atelierById.get(id)?.nom ?? '',
      ...v, pct: v.total > 0 ? Math.round((v.terminees / v.total) * 100) : 0,
    })).sort((a, b) => b.total - a.total);
  }, [selectedUnite, uniteScoped, todayStr, atelierById]);

  const uniteOuverte = useMemo(
    () => parUnite.find(u => u.id === selectedUnite) || null, [parUnite, selectedUnite]);

  const tendance = useMemo(() => Array.from({ length: 12 }, (_, m) => {
    const mois = scoped.filter(i => {
      const d = new Date(i.date_prevue + 'T00:00:00');
      return d.getMonth() === m && d.getFullYear() === selectedYear;
    });
    return {
      label: MOIS[m],
      total: mois.length,
      done: mois.filter(i => i.statut === 'terminee').length,
      late: mois.filter(i => i.statut !== 'terminee' && i.statut !== 'reportee' && i.date_prevue < todayStr).length,
    };
  }), [scoped, selectedYear, todayStr]);

  // ── Comparaison inter-années : total d'interventions par mois, pour les années disponibles ──
  const comparisonYears = useMemo(() => {
    // L'année sélectionnée + les 2 précédentes disponibles, dans l'ordre chronologique.
    const others = availableYears.filter(y => y !== selectedYear).sort((a, b) => b - a).slice(0, 2);
    return [...others, selectedYear].sort((a, b) => a - b);
  }, [availableYears, selectedYear]);

  const comparaisonMensuelle = useMemo(() => Array.from({ length: 12 }, (_, m) => ({
    label: MOIS[m],
    values: comparisonYears.map(y => scoped.filter(i => {
      const d = new Date(i.date_prevue + 'T00:00:00');
      return d.getMonth() === m && d.getFullYear() === y;
    }).length),
  })), [scoped, comparisonYears]);

  const comparaisonParAnnee = useMemo(() => comparisonYears.map(y => {
    const ui = scoped.filter(i => new Date(i.date_prevue + 'T00:00:00').getFullYear() === y);
    const total = ui.length;
    const terminees = ui.filter(i => i.statut === 'terminee').length;
    const retards = ui.filter(i => i.statut !== 'terminee' && i.statut !== 'reportee' && i.date_prevue < todayStr).length;
    return { year: y, total, terminees, retards, pct: total > 0 ? Math.round((terminees / total) * 100) : 0 };
  }), [scoped, comparisonYears, todayStr]);

  // ── Progression hebdomadaire du mois sélectionné (vue mensuelle) ──
  const semaines = useMemo<SemaineStat[]>(() => {
    if (viewMode !== 'monthly') return [];
    const map = new Map<number, { total: number; done: number; enCours: number; plan: number; reportees: number; late: number }>();
    scoped.forEach(i => {
      const d = new Date(i.date_prevue + 'T00:00:00');
      if (d.getMonth() !== selectedMonth || d.getFullYear() !== selectedYear) return;
      const w = getWeekNumInMonth(i.date_prevue);
      if (!map.has(w)) map.set(w, { total: 0, done: 0, enCours: 0, plan: 0, reportees: 0, late: 0 });
      const e = map.get(w)!;
      e.total++;
      if (i.statut === 'terminee') e.done++;
      else if (i.statut === 'en_cours') e.enCours++;
      else if (i.statut === 'planifiee') e.plan++;
      else if (i.statut === 'reportee') e.reportees++;
      if (i.statut !== 'terminee' && i.statut !== 'reportee' && i.date_prevue < todayStr) e.late++;
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([w, v]) => ({
        semaine: w,
        label: `Semaine ${w}`,
        ...v,
        pct: v.total > 0 ? Math.round((v.done / v.total) * 100) : 0,
      }));
  }, [scoped, viewMode, selectedMonth, selectedYear, todayStr]);

  // ── Analyses fines ──
  const loadAnalytics = useCallback(async (ids: number[]) => {
    setAnalyticsLoading(true);
    try {
      const map: Record<number, DashboardTache[]> = {};
      ids.forEach(id => { map[id] = []; });
      for (let k = 0; k < ids.length; k += 200) {
        const { data } = await supabase.from('planning_taches')
          .select('id, planning_id, numero, sous_equipement, operation, ok, motif, duree_min, initial')
          .in('planning_id', ids.slice(k, k + 200));
        (data || []).forEach((t: any) => {
          if (!map[t.planning_id]) map[t.planning_id] = [];
          map[t.planning_id].push({
            id: t.id, numero: t.numero, sous_equipement: t.sous_equipement || '',
            operation: t.operation, ok: t.ok, motif: t.motif || '',
            duree_min: t.duree_min, initial: t.initial || '',
          });
        });
      }
      setAnalyticsTasks(map);
    } catch (err) {
      console.error('Analyses :', err);
      setAnalyticsTasks({});
    } finally { setAnalyticsLoading(false); }
  }, []);

  const analyse = useMemo(() => {
    const echues = periode.filter(i => i.date_prevue <= todayStr);
    const echuesFin = echues.filter(i => i.statut === 'terminee').length;
    const cumul = overdue.reduce((s, i) => s + getDaysOverdue(i.date_prevue), 0);
    const src = analyticsTasks;
    let tOk = 0, tNok = 0, tPending = 0, tTotal = 0, avecAnomalie = 0;
    const nokOp = new Map<string, number>();
    const nokSe = new Map<string, number>();
    if (src) {
      periode.forEach(i => {
        const ts = src[i.id] || [];
        if (!ts.length) return;
        tTotal += ts.length;
        let bad = false;
        ts.forEach(t => {
          if (t.ok === true) tOk++;
          else if (t.ok === false) {
            tNok++; bad = true;
            nokOp.set(t.operation, (nokOp.get(t.operation) || 0) + 1);
            const se = t.sous_equipement || 'Non renseigné';
            nokSe.set(se, (nokSe.get(se) || 0) + 1);
          } else tPending++;
        });
        if (bad) avecAnomalie++;
      });
    }
    return {
      realisation: echues.length > 0 ? Math.round((echuesFin / echues.length) * 100) : 0,
      echues: echues.length,
      retardMoyen: overdue.length > 0 ? Math.round((cumul / overdue.length) * 10) / 10 : 0,
      retardMax: overdue.reduce((m, i) => Math.max(m, getDaysOverdue(i.date_prevue)), 0),
      heuresPlan: periode.reduce((s, i) => s + (i.duree_intervention || 0), 0),
      heuresFin: periode.filter(i => i.statut === 'terminee').reduce((s, i) => s + (i.duree_intervention || 0), 0),
      tOk, tNok, tPending, tTotal, avecAnomalie,
      conformite: (tOk + tNok) > 0 ? Math.round((tOk / (tOk + tNok)) * 100) : null,
      pointage: tTotal > 0 ? Math.round(((tOk + tNok) / tTotal) * 100) : null,
      topOp: Array.from(nokOp.entries()).sort((a, b) => b[1] - a[1]).slice(0, 7),
      topSe: Array.from(nokSe.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6),
      hasTasks: src !== null,
    };
  }, [periode, overdue, analyticsTasks, todayStr, getDaysOverdue]);

  const prochaines = useMemo(
    () => scoped.filter(i => i.date_prevue >= todayStr && i.statut !== 'terminee')
      .sort((a, b) => a.date_prevue.localeCompare(b.date_prevue)).slice(0, 7),
    [scoped, todayStr]
  );

  // ══════════════════════════════════════════════════════════════════════════
  //  RENDU
  // ══════════════════════════════════════════════════════════════════════════
  if (loading) return (
    <div className="min-h-screen bg-[#f2f5fa] p-4 lg:p-5 space-y-4">
      <div className="h-12 bg-white border border-[#e4e8ef] rounded-[10px] animate-pulse" />
      <div className="h-11 bg-white border border-[#e4e8ef] rounded-[10px] animate-pulse" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[0, 1, 2].map(i => <div key={i} className="h-64 bg-white border border-[#e4e8ef] rounded-[10px] animate-pulse" />)}
      </div>
    </div>
  );

  const niveauUnite = selectedUnite !== null;
  const aTraiter = aCloturer.length + overdue.length + aLancer.length;
  const periodeLabel = viewMode === 'monthly' ? `${MOIS_LONG[selectedMonth]} ${selectedYear}` : `Année ${selectedYear}`;
  const selectedSemaine = weekFilter === 'all' ? null : parseInt(weekFilter.replace('w', ''));
  // Clé qui force le rejeu des animations d'entrée quand la période / le périmètre change
  const periodKey = `${viewMode}-${selectedMonth}-${selectedYear}-${weekFilter}-${selectedUnite ?? 'all'}-${atelierFilter}`;

  return (
    <div className="min-h-screen bg-[#f2f5fa] text-[#0a1930]">
      <style>{`
        .tbl th { font-weight:600; font-size:10.5px; color:#7b879d; text-transform:uppercase; letter-spacing:.4px; }
        .tbl td { font-size:11.5px; }
        .tbl tbody tr:hover { background:#f7f9fc; }
        .num { font-variant-numeric: tabular-nums; }

        @keyframes dash-fadein {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .dash-fadein { animation: dash-fadein .32s cubic-bezier(.22,.9,.32,1) both; }
        .dash-fadein > * { animation: dash-fadein .38s cubic-bezier(.22,.9,.32,1) both; }
        .dash-fadein > *:nth-child(1) { animation-delay: 0ms; }
        .dash-fadein > *:nth-child(2) { animation-delay: 40ms; }
        .dash-fadein > *:nth-child(3) { animation-delay: 80ms; }
        .dash-fadein > *:nth-child(4) { animation-delay: 120ms; }
        .dash-fadein > *:nth-child(5) { animation-delay: 160ms; }
        @media (prefers-reduced-motion: reduce) {
          .dash-fadein, .dash-fadein > * { animation: none; }
        }
      `}</style>

      {/* ══════════ BARRE SUPÉRIEURE ══════════ */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-[#e4e8ef] shadow-[0_1px_0_rgba(10,25,48,0.03)]">
        <div className="max-w-[1600px] mx-auto px-4 lg:px-5 h-[60px] flex items-center gap-3">

          {/* Identité du module */}
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="w-9 h-9 rounded-[10px] bg-[#0a1930] flex items-center justify-center shadow-[0_4px_10px_-4px_rgba(10,25,48,0.5)]">
              <BarChart3 size={16} className="text-[#8fd8ec]" />
            </span>
            <div className="leading-none hidden sm:block">
              <h1 className="text-[14.5px] font-bold text-[#0a1930] tracking-tight">Tableau de bord</h1>
              <p className="text-[9.5px] font-bold text-[#8fb3cc] uppercase tracking-wider mt-0.5">SETRAM · GMAO</p>
            </div>
          </div>

          <div className="h-7 w-px bg-[#e4e8ef] hidden md:block shrink-0" />

          {/* Sélecteur d'unité + filtres actifs */}
          <div className="hidden md:flex items-center gap-1.5 flex-wrap min-w-0">
            {canViewAllUnits ? (
              <UniteSwitcher unites={parUnite} selectedUnite={selectedUnite} onSelect={setSelectedUnite} />
            ) : (
              <span className="flex items-center gap-1.5 pl-2.5 pr-3 py-[7px] rounded-[9px] bg-[#eef3f8] text-[12px] font-semibold text-[#0a1930]">
                <Building2 size={12} className="text-[#2f6690]" />{uniteOuverte?.code ?? '—'}
              </span>
            )}

            {atelierFilter !== 'all' && (
              <span className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-[7px] rounded-[9px] bg-[#eaf2f9] text-[11.5px] font-semibold text-[#2f6690] transition-all"
                style={{ animation: 'chip-in .18s ease both' }}>
                <Wrench size={11} />{atelierById.get(atelierFilter as number)?.code}
                <button onClick={() => setAtelierFilter('all')} className="w-4 h-4 rounded flex items-center justify-center text-[#8fb3cc] hover:text-white hover:bg-[#2f6690] transition-colors">
                  <X size={10} />
                </button>
              </span>
            )}

            {viewMode === 'monthly' && selectedSemaine != null && (
              <span className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-[7px] rounded-[9px] bg-[#fdf3e2] text-[11.5px] font-semibold text-[#a2740f] transition-all"
                style={{ animation: 'chip-in .18s ease both' }}>
                <CalendarRange size={11} />Semaine {selectedSemaine}
                <button onClick={() => setWeekFilter('all')} className="w-4 h-4 rounded flex items-center justify-center text-[#e0c07a] hover:text-white hover:bg-[#c8901a] transition-colors">
                  <X size={10} />
                </button>
              </span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 p-1 rounded-[10px] bg-[#f4f6fa] border border-[#e9ecf3]">
              <MiniSelect
                value={selectedYear}
                onChange={v => setSelectedYear(Number(v))}
                options={availableYears.map(y => ({ value: y, label: String(y) }))}
              />
              <MiniSelect
                value={viewMode}
                onChange={v => { setViewMode(v as ViewMode); setWeekFilter('all'); }}
                options={[{ value: 'annual', label: 'Année' }, { value: 'monthly', label: 'Par mois' }]}
              />
              {viewMode === 'monthly' && (
                <MiniSelect
                  value={selectedMonth}
                  onChange={v => { setSelectedMonth(Number(v)); setWeekFilter('all'); }}
                  options={MOIS_LONG.map((m, i) => ({ value: i, label: m }))}
                />
              )}
            </div>
            <button onClick={fetchAll} disabled={refreshing}
              className="w-8 h-8 rounded-[9px] border border-[#e4e8ef] flex items-center justify-center text-[#7b879d] hover:text-[#0a1930] hover:border-[#c4ccdb] hover:bg-[#f7f9fc] transition-all disabled:opacity-50">
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-[#e4e8ef]">
              <div className="w-7 h-7 rounded-full bg-[#0a1930] text-white text-[11px] font-semibold flex items-center justify-center ring-2 ring-[#eef3f8]">
                {(profile?.prenom?.[0] ?? '') + (profile?.nom?.[0] ?? '')}
              </div>
              <div className="leading-tight">
                <p className="text-[11.5px] font-semibold">{profile?.prenom} {profile?.nom}</p>
                <p className="text-[10px] text-[#7b879d] capitalize">{role.replace('_', ' ') || '—'}</p>
              </div>
            </div>
          </div>
        </div>

        <style>{`
          @keyframes chip-in {
            from { opacity: 0; transform: translateX(-4px); }
            to   { opacity: 1; transform: translateX(0); }
          }
        `}</style>
      </header>

      <div className="max-w-[1600px] mx-auto px-4 lg:px-5 py-4 space-y-4">

        {error && (
          <div className="bg-white border border-[#f6ccd2] border-l-4 border-l-[#c8384c] rounded-[10px] px-4 py-3 flex items-center gap-3">
            <AlertTriangle size={15} className="text-[#c8384c] shrink-0" />
            <p className="flex-1 text-[12px] text-[#b32d40] truncate">{error}</p>
            <button onClick={fetchAll} className="px-3 py-1.5 bg-[#c8384c] text-white text-[11px] font-semibold rounded-md">Réessayer</button>
          </div>
        )}

        {/* ══════════ BANDEAU D'ACTION ══════════ */}
        {aTraiter > 0 && (
          <button
            onClick={() => navigate(niveauUnite ? `/planification/cloture?unite=${selectedUnite}` : '/planification/cloture')}
            className="w-full bg-[#0a1930] rounded-[10px] px-4 py-3 flex items-center gap-4 flex-wrap text-left hover:bg-[#122744] transition-colors group"
          >
            <span className="w-8 h-8 rounded-md bg-white/10 flex items-center justify-center shrink-0">
              <ListChecks size={15} className="text-[#e6b23a]" />
            </span>
            <div className="flex items-center gap-x-6 gap-y-1 flex-wrap flex-1 min-w-0">
              {aLancer.length > 0 && (
                <span className="flex items-baseline gap-1.5">
                  <span className="text-[11px] text-white/50">À imprimer :</span>
                  <b className="text-[13px] font-semibold text-white num">{aLancer.length}</b>
                </span>
              )}
              <span className="flex items-baseline gap-1.5">
                <span className="text-[11px] text-white/50">À clôturer :</span>
                <b className="text-[13px] font-semibold text-white num">{aCloturer.length}</b>
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className="text-[11px] text-white/50">En retard :</span>
                <b className={`text-[13px] font-semibold num ${overdue.length > 0 ? 'text-[#ef8090]' : 'text-white'}`}>{overdue.length}</b>
              </span>
              <span className="text-[11px] text-white/40 hidden lg:inline">
                L'impression fait basculer les fiches de « Planifiée » à « En cours »
              </span>
            </div>
            <span className="text-[11px] font-semibold text-[#e6b23a] flex items-center gap-1.5 shrink-0">
              Ouvrir la journée <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
        )}

        {/* ══════════ GROUPE 1 — VOLUME ET AVANCEMENT (rejoue son animation à chaque changement de période / périmètre) ══════════ */}
        <div key={periodKey} className="dash-fadein space-y-4">
          <GroupBar
            icon={Layers}
            title={niveauUnite && uniteOuverte ? `${uniteOuverte.code} — ${periodeLabel}` : `Portefeuille — ${periodeLabel}`}
            stats={[
              { label: 'Total', value: stats.total },
              { label: 'Clôturées', value: stats.terminees, tone: 'done' },
              { label: 'En cours', value: stats.enCours, tone: 'wip' },
              { label: 'Planifiées', value: stats.plan, tone: 'muted' },
              { label: 'Reportées', value: stats.reportees, tone: 'muted' },
              { label: 'En retard', value: overdue.length, tone: overdue.length > 0 ? 'late' : 'done' },
            ]}
          />

          {/* ── Progression hebdomadaire (uniquement en vue mensuelle) ── */}
          {viewMode === 'monthly' && (
            <Panel
              icon={CalendarRange}
              title={`Progression par semaine — ${MOIS_LONG[selectedMonth]}`}
              right={
                selectedSemaine != null ? (
                  <button onClick={() => setWeekFilter('all')}
                    className="text-[10px] font-semibold text-[#2f6690] hover:underline flex items-center gap-1">
                    <X size={10} />Réinitialiser
                  </button>
                ) : (
                  <span className="text-[10px] text-[#7b879d]">cliquez une semaine pour filtrer</span>
                )
              }
            >
              <WeeklyProgress
                data={semaines}
                selected={selectedSemaine}
                onSelect={w => setWeekFilter(w === null ? 'all' : (`w${w}` as WeekFilter))}
              />
            </Panel>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <Panel icon={Gauge} title="Taux d'achèvement" className="lg:col-span-3">
              <ArcGauge
                value={pct} label={`${pct}%`}
                sublabel={`${stats.terminees} sur ${stats.total} interventions`}
                color={pct >= 80 ? C.done : pct >= 50 ? C.wip : C.late}
              />
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div className="text-center py-2 rounded-md bg-[#f7f9fc]">
                  <p className="text-[10px] text-[#7b879d]">Réalisation échue</p>
                  <p className="text-[15px] font-semibold num">{analyse.realisation}%</p>
                </div>
                <div className="text-center py-2 rounded-md bg-[#f7f9fc]">
                  <p className="text-[10px] text-[#7b879d]">Retard moyen</p>
                  <p className="text-[15px] font-semibold num">{analyse.retardMoyen} j</p>
                </div>
              </div>
            </Panel>

            <Panel icon={Activity} title={`Interventions par mois — ${selectedYear}`} className="lg:col-span-6"
              right={<span className="text-[10px] text-[#7b879d]">cliquez un mois</span>}>
              <GroupedBars
                height={196}
                data={tendance.map(t => ({ label: t.label, values: [t.total, t.done] }))}
                series={[{ name: 'Prévues', color: C.ink }, { name: 'Clôturées', color: C.late }]}
                onBarClick={i => { setViewMode('monthly'); setSelectedMonth(i); setWeekFilter('all'); }}
              />
              <Legend items={[{ label: 'Prévues', color: C.ink }, { label: 'Clôturées', color: C.late }]} />
            </Panel>

            <Panel icon={PieChart} title="Répartition des statuts" className="lg:col-span-3">
              <OverlapDonut
                size={180}
                parts={[
                  { label: 'Clôturées', value: stats.terminees, color: C.ink },
                  { label: 'En cours', value: stats.enCours, color: C.late },
                  { label: 'Planifiées', value: stats.plan, color: '#c4ccdb' },
                ]}
              />
              <Legend items={[
                { label: 'Clôturées', color: C.ink },
                { label: 'En cours', color: C.late },
                { label: 'Planifiées', color: '#c4ccdb' },
              ]} />
            </Panel>
          </div>

          {/* ── Comparaison inter-années ── */}
          <Panel icon={CalendarRange} title="Comparaison inter-années"
            right={
              comparisonYears.length > 1 ? (
                <button onClick={() => setShowYearComparison(v => !v)}
                  className="text-[10px] font-semibold text-[#2f6690] hover:underline">
                  {showYearComparison ? 'Masquer' : 'Afficher'}
                </button>
              ) : (
                <span className="text-[10px] text-[#7b879d]">une seule année de données disponible</span>
              )
            }>
            {showYearComparison && comparisonYears.length > 1 && (
              <div className="space-y-4">
                <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${comparisonYears.length}, minmax(0,1fr))` }}>
                  {comparaisonParAnnee.map(a => (
                    <div key={a.year} className={`rounded-[10px] p-3 border ${a.year === selectedYear ? 'bg-[#eef3f8] border-[#c7dcee]' : 'bg-[#f7f9fc] border-[#eceff4]'}`}>
                      <p className="text-[11px] font-bold text-[#0a1930]">{a.year}</p>
                      <p className="text-[19px] font-semibold num mt-0.5">{a.total} <span className="text-[10px] font-normal text-[#7b879d]">interv.</span></p>
                      <div className="flex items-center gap-3 mt-1.5 text-[10.5px]">
                        <span className="text-[#1f9d6b] font-semibold num">{a.pct}% réalisé</span>
                        <span className={`font-semibold num ${a.retards > 0 ? 'text-[#c8384c]' : 'text-[#7b879d]'}`}>{a.retards} retard{a.retards > 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <LineChart
                  height={200}
                  labels={MOIS}
                  series={comparisonYears.map((y, idx) => ({
                    name: String(y),
                    color: y === selectedYear ? C.ink : [C.accent, C.gold][idx % 2],
                    dashed: y !== selectedYear,
                    values: comparaisonMensuelle.map(m => m.values[idx]),
                  }))}
                />
                <Legend items={comparisonYears.map((y, idx) => ({
                  label: String(y),
                  color: y === selectedYear ? C.ink : [C.accent, C.gold][idx % 2],
                }))} />
              </div>
            )}
          </Panel>
        </div>

        {/* ══════════ GROUPE 2 — UNITÉS ══════════ */}
        {!niveauUnite && canViewAllUnits && (
          <>
            <GroupBar
              icon={Building2}
              title="Unités"
              stats={[
                { label: 'Actives', value: portefeuille.nb },
                { label: 'Réalisation', value: `${portefeuille.pct}%`, tone: 'done' },
                { label: 'Écart', value: `${portefeuille.ecart} pts`, tone: portefeuille.ecart > 25 ? 'late' : 'muted' },
                { label: 'Reports', value: portefeuille.demandes, tone: 'wip' },
                { label: 'En attente', value: portefeuille.enAttente, tone: 'wip' },
                { label: 'Retards', value: portefeuille.retards, tone: portefeuille.retards > 0 ? 'late' : 'done' },
              ]}
            />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <Panel icon={BarChart3} title="Classement des unités" className="lg:col-span-5"
                right={
                  <MiniSelect
                    value={classement}
                    onChange={v => setClassement(v as any)}
                    options={[
                      { value: 'total', label: 'Volume' },
                      { value: 'pct', label: 'Réalisation' },
                      { value: 'retards', label: 'Retards' },
                      { value: 'reports', label: 'Reports' },
                    ]}
                  />
                }>
                <HorizontalBars
                  maxRows={9}
                  color={classement === 'retards' ? C.late : classement === 'pct' ? C.done : C.ink}
                  unit={classement === 'pct' ? '%' : ''}
                  data={unitesTriees.map(u => ({
                    key: u.id, label: u.code,
                    value: classement === 'pct' ? u.pct
                      : classement === 'retards' ? u.retards
                      : classement === 'reports' ? (u.demandes ?? 0) : u.total,
                    sub: classement === 'total' ? `${u.pct}%` : `${u.total} int.`,
                  }))}
                  onRowClick={i => setSelectedUnite(unitesTriees[i].id)}
                />
              </Panel>

              <Panel icon={Building2} title="Analyse comparative" className="lg:col-span-7" bodyClass="p-0"
                right={
                  <div className="flex items-center gap-2">
                    {indicLoading && <Loader2 size={12} className="animate-spin text-[#7b879d]" />}
                    <div className="relative">
                      <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#c4ccdb]" />
                      <input value={uniteSearch} onChange={e => setUniteSearch(e.target.value)}
                        placeholder="Filtrer…"
                        className="pl-6 pr-2 py-1 w-28 text-[11px] border border-[#e4e8ef] rounded-md outline-none focus:border-[#2f6690]" />
                    </div>
                  </div>
                }>
                <div className="overflow-x-auto">
                  <table className="w-full text-left tbl">
                    <thead className="bg-[#f7f9fc] border-b border-[#eceff4]">
                      <tr>
                        <th className="px-3 py-2">Unité</th>
                        <th className="px-2 py-2 text-right">Int.</th>
                        <th className="px-2 py-2 w-[130px]">Avancement</th>
                        <th className="px-2 py-2 text-right">Tâches OK</th>
                        <th className="px-2 py-2 text-right">Conf.</th>
                        <th className="px-2 py-2 text-right">Reports</th>
                        <th className="px-3 py-2 text-right">Retards</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f2f4f8]">
                      {unitesTriees.map(u => (
                        <tr key={u.id} onClick={() => setSelectedUnite(u.id)} className="cursor-pointer transition-colors">
                          <td className="px-3 py-2">
                            <p className="font-semibold text-[#0a1930]">{u.code}</p>
                            <p className="text-[10px] text-[#7b879d] truncate max-w-[130px]">{u.nom}</p>
                          </td>
                          <td className="px-2 py-2 text-right font-semibold num">{u.total}</td>
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-2">
                              <StackedRow height={7} parts={[
                                { value: u.terminees, color: C.done, label: 'Clôturées' },
                                { value: u.enCours, color: C.wip, label: 'En cours' },
                                { value: u.plan, color: '#c4ccdb', label: 'Planifiées' },
                                { value: u.reportees, color: C.late, label: 'Reportées' },
                              ]} />
                              <span className="w-8 text-right num text-[10.5px] font-semibold">{u.pct}%</span>
                            </div>
                          </td>
                          <td className="px-2 py-2 text-right num text-[#44537a]">{u.moyTachesOk ?? '—'}</td>
                          <td className="px-2 py-2 text-right num">
                            {u.conformite === null ? <span className="text-[#c4ccdb]">—</span> : (
                              <span className={u.conformite >= 95 ? 'text-[#1f9d6b]' : u.conformite >= 85 ? 'text-[#d99400]' : 'text-[#c8384c]'}>
                                {u.conformite}%
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right num text-[#44537a]">
                            {u.demandes ?? '—'}
                            {u.enAttente > 0 && <span className="text-[#d99400] font-semibold"> ({u.enAttente})</span>}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {u.retards > 0
                              ? <span className="num text-[#c8384c] font-semibold">{u.retards} · {u.retardMoyen}j</span>
                              : <StatusPill label="à jour" tone="done" />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {unitesTriees.length === 0 && (
                  <p className="text-center text-[12px] text-[#7b879d] py-10">Aucune unité ne correspond</p>
                )}
              </Panel>
            </div>

            {/* ══════════ GROUPE 3 — ATELIERS TRANSVERSAUX ══════════ */}
            {parAtelier.length > 0 && (
              <>
                <GroupBar
                  icon={Wrench}
                  title="Ateliers, toutes unités confondues"
                  stats={[
                    { label: 'Ateliers', value: parAtelier.length },
                    { label: 'Le plus chargé', value: parAtelier[0]?.code ?? '—' },
                    { label: 'Retards cumulés', value: parAtelier.reduce((s, a) => s + a.retards, 0), tone: 'late' },
                    { label: 'Heures', value: `${parAtelier.reduce((s, a) => s + a.heures, 0).toFixed(0)}h`, tone: 'muted' },
                  ]}
                />
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <Panel icon={BarChart3} title="Volume par atelier" className="lg:col-span-5">
                    <HorizontalBars
                      maxRows={9} color={C.accent}
                      data={parAtelier.map(a => ({ key: String(a.id), label: a.code, value: a.total, sub: `${a.pct}%` }))}
                    />
                  </Panel>
                  <Panel icon={Wrench} title="Détail par atelier" className="lg:col-span-7" bodyClass="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left tbl">
                        <thead className="bg-[#f7f9fc] border-b border-[#eceff4]">
                          <tr>
                            <th className="px-3 py-2">Atelier</th>
                            <th className="px-2 py-2 text-right">Int.</th>
                            <th className="px-2 py-2 text-right">Unités</th>
                            <th className="px-2 py-2 text-right">Heures</th>
                            <th className="px-2 py-2 w-[110px]">Avancement</th>
                            <th className="px-3 py-2 text-right">Retards</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#f2f4f8]">
                          {parAtelier.map(a => (
                            <tr key={String(a.id)}>
                              <td className="px-3 py-2">
                                <p className="font-semibold">{a.code}</p>
                                <p className="text-[10px] text-[#7b879d] truncate max-w-[150px]">{a.nom}</p>
                              </td>
                              <td className="px-2 py-2 text-right font-semibold num">{a.total}</td>
                              <td className="px-2 py-2 text-right num text-[#44537a]">{a.nbUnites}</td>
                              <td className="px-2 py-2 text-right num text-[#44537a]">{a.heures.toFixed(0)}h</td>
                              <td className="px-2 py-2">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-[7px] bg-[#f4f6fa] rounded-[3px] overflow-hidden">
                                    <div className="h-full rounded-[3px] transition-all duration-700"
                                      style={{ width: `${a.pct}%`, background: a.pct >= 80 ? C.done : a.pct >= 50 ? C.wip : C.late }} />
                                  </div>
                                  <span className="w-8 text-right num text-[10.5px] font-semibold">{a.pct}%</span>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right">
                                {a.retards > 0
                                  ? <span className="num text-[#c8384c] font-semibold">{a.retards}</span>
                                  : <StatusPill label="à jour" tone="done" />}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                </div>
              </>
            )}
          </>
        )}

        {/* ══════════ NIVEAU UNITÉ ══════════ */}
        {niveauUnite && uniteOuverte && (
          <>
            {canViewAllUnits && (
              <button onClick={() => setSelectedUnite(null)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-[#e4e8ef] hover:border-[#c4ccdb] text-[11.5px] font-semibold text-[#44537a] transition-colors">
                <ArrowLeft size={12} />Retour au portefeuille
              </button>
            )}

            {ateliersUnite.length > 0 && (
              <>
                <GroupBar
                  icon={Wrench}
                  title={`Ateliers de ${uniteOuverte.code}`}
                  stats={[
                    { label: 'Ateliers', value: ateliersUnite.length },
                    { label: 'Heures', value: `${ateliersUnite.reduce((s, a) => s + a.heures, 0).toFixed(0)}h`, tone: 'muted' },
                    { label: 'Retards', value: ateliersUnite.reduce((s, a) => s + a.retards, 0), tone: 'late' },
                  ]}
                  right={
                    isChargeUnite ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#eef3f8] text-[11.5px] font-semibold text-[#44537a]">
                        <Wrench size={11} />{ateliersUnite.find(a => a.id === atelierFilter)?.code ?? '—'}
                      </span>
                    ) : (
                      <MiniSelect
                        value={atelierFilter}
                        onChange={v => setAtelierFilter(v as any)}
                        options={[
                          { value: 'all' as const, label: `Tous (${uniteScoped.length})` },
                          ...ateliersUnite.map(a => ({ value: a.id, label: `${a.code} (${a.total})` })),
                        ]}
                      />
                    )
                  }
                />
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <Panel icon={BarChart3} title="Volume par atelier" className="lg:col-span-5">
                    <HorizontalBars
                      maxRows={9} color={C.accent}
                      data={ateliersUnite.map(a => ({ key: a.id, label: a.code, value: a.total, sub: `${a.pct}%` }))}
                      onRowClick={isChargeUnite ? undefined : i => {
                        const a = ateliersUnite[i];
                        setAtelierFilter(atelierFilter === a.id ? 'all' : a.id);
                      }}
                    />
                  </Panel>
                  <Panel icon={Activity} title="Avancement mensuel" className="lg:col-span-7">
                    <LineChart
                      height={196}
                      labels={tendance.map(t => t.label)}
                      series={[
                        { name: 'Prévues', color: '#c4ccdb', values: tendance.map(t => t.total) },
                        { name: 'Clôturées', color: C.done, values: tendance.map(t => t.done) },
                        { name: 'En retard', color: C.late, values: tendance.map(t => t.late), dashed: true },
                      ]}
                      onPointClick={i => { setViewMode('monthly'); setSelectedMonth(i); setWeekFilter('all'); }}
                    />
                    <Legend items={[
                      { label: 'Prévues', color: '#c4ccdb' },
                      { label: 'Clôturées', color: C.done },
                      { label: 'En retard', color: C.late },
                    ]} />
                  </Panel>
                </div>
              </>
            )}

            <GroupBar
              icon={Target}
              title="Qualité d'exécution"
              stats={[
                { label: 'Réalisation', value: `${analyse.realisation}%`, tone: analyse.realisation >= 80 ? 'done' : 'wip' },
                { label: 'Conformité', value: analyse.conformite === null ? '—' : `${analyse.conformite}%`, tone: 'done' },
                { label: 'Pointage', value: analyse.pointage === null ? '—' : `${analyse.pointage}%`, tone: 'muted' },
                { label: 'Anomalies', value: analyse.hasTasks ? analyse.tNok : '—', tone: 'late' },
                { label: 'Heures', value: `${analyse.heuresFin.toFixed(0)} / ${analyse.heuresPlan.toFixed(0)}h`, tone: 'muted' },
              ]}
              right={!analyse.hasTasks ? (
                <button onClick={() => loadAnalytics(periode.map(i => i.id))}
                  disabled={analyticsLoading || periode.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#0a1930] text-white text-[11px] font-semibold disabled:opacity-40 transition-colors hover:bg-[#2f6690]">
                  {analyticsLoading ? <Loader2 size={11} className="animate-spin" /> : <ListChecks size={11} />}
                  Analyser les tâches
                </button>
              ) : undefined}
            />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <Panel icon={AlertOctagon} title="Opérations les plus en défaut" className="lg:col-span-5" bodyClass="p-0">
                {!analyse.hasTasks ? (
                  <p className="text-center text-[11.5px] text-[#7b879d] py-12 px-4">
                    Lancez l'analyse des tâches pour faire apparaître les anomalies récurrentes.
                  </p>
                ) : analyse.topOp.length === 0 ? (
                  <p className="text-center text-[11.5px] text-[#1f9d6b] py-12">Aucune anomalie relevée</p>
                ) : (
                  <table className="w-full text-left tbl">
                    <tbody className="divide-y divide-[#f2f4f8]">
                      {analyse.topOp.map(([op, n], idx) => (
                        <tr key={op}>
                          <td className="px-3 py-2 w-7 text-[#c4ccdb] num">{idx + 1}</td>
                          <td className="px-1 py-2 truncate max-w-0" title={op}>{op}</td>
                          <td className="px-3 py-2 text-right"><span className="num font-semibold text-[#c8384c]">{n}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Panel>

              <Panel icon={CalendarDays} title="Prochaines interventions" className="lg:col-span-7" bodyClass="p-0">
                {prochaines.length === 0 ? (
                  <p className="text-center text-[11.5px] text-[#7b879d] py-12">Aucune intervention à venir</p>
                ) : (
                  <table className="w-full text-left tbl">
                    <thead className="bg-[#f7f9fc] border-b border-[#eceff4]">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-2 py-2">Intervention</th>
                        <th className="px-2 py-2">Atelier</th>
                        <th className="px-2 py-2 text-right">Durée</th>
                        <th className="px-3 py-2 text-right">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f2f4f8]">
                      {prochaines.map(i => {
                        const at = i.atelier_id != null ? atelierById.get(i.atelier_id) : null;
                        const tone = i.statut === 'en_cours' ? 'wip' : i.statut === 'reportee' ? 'late' : 'plan';
                        const label = i.statut === 'en_cours' ? 'En cours' : i.statut === 'reportee' ? 'Reportée' : 'Planifiée';
                        return (
                          <tr key={i.id}>
                            <td className="px-3 py-2 num whitespace-nowrap">
                              {formatDateFR(i.date_prevue, { day: '2-digit', month: 'short' })}
                              {i.date_prevue === todayStr && <span className="ml-1.5 text-[#c8384c] font-semibold">auj.</span>}
                            </td>
                            <td className="px-2 py-2 truncate max-w-0" title={i.titre}>{i.titre}</td>
                            <td className="px-2 py-2 text-[#7b879d]">{at?.code ?? '—'}</td>
                            <td className="px-2 py-2 text-right num text-[#44537a]">
                              {i.duree_intervention ? `${i.duree_intervention}h` : '—'}
                            </td>
                            <td className="px-3 py-2 text-right"><StatusPill label={label} tone={tone as any} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </Panel>
            </div>

            {analyse.hasTasks && analyse.topSe.length > 0 && (
              <Panel icon={Layers} title="Sous-équipements les plus concernés">
                <HorizontalBars maxRows={6} color={C.wip}
                  data={analyse.topSe.map(([se, n]) => ({ label: se, value: n }))} />
              </Panel>
            )}

            {holidayAlerts.length > 0 && (
              <Panel icon={AlertTriangle} title={`Interventions posées un jour non ouvré (${holidayAlerts.length})`} bodyClass="p-0">
                <table className="w-full text-left tbl">
                  <tbody className="divide-y divide-[#f2f4f8]">
                    {holidayAlerts.slice(0, 8).map(i => {
                      const d = new Date(i.date_prevue + 'T00:00:00');
                      const we = d.getDay() === 5 || d.getDay() === 6;
                      const hol = holidays.find(h => h.date === i.date_prevue);
                      return (
                        <tr key={i.id}>
                          <td className="px-3 py-2 num whitespace-nowrap">{formatDateFR(i.date_prevue)}</td>
                          <td className="px-2 py-2 truncate max-w-0" title={i.titre}>{i.titre}</td>
                          <td className="px-3 py-2 text-right">
                            <StatusPill label={we ? 'Week-end' : (hol?.nom || 'Férié')} tone="wip" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Panel>
            )}
          </>
        )}

        {!niveauUnite && !canViewAllUnits && (
          <Panel icon={Users} title="Aucune unité rattachée">
            <p className="text-center text-[12px] text-[#7b879d] py-10">
              Votre profil n'est rattaché à aucune unité. Contactez un administrateur.
            </p>
          </Panel>
        )}

        {/* ══════════ Dernières actions — dernière chose à consulter, en bas de page ══════════ */}
        <Panel icon={ListChecks} title="Dernières actions" bodyClass="p-0"
          right={activityLoading ? <Loader2 size={12} className="animate-spin text-[#7b879d]" /> : undefined}>
          {derniersActions.length === 0 ? (
            <p className="text-center text-[11.5px] text-[#7b879d] py-10">Aucune action récente</p>
          ) : (
            <table className="w-full text-left tbl">
              <thead className="bg-[#f7f9fc] border-b border-[#eceff4]">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  {!niveauUnite && <th className="px-2 py-2">Unité</th>}
                  <th className="px-2 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f2f4f8]">
                {derniersActions.map(ev => {
                  const u = uniteById.get(ev.unite_id);
                  const Icon = ev.type === 'cloture' ? Check : ev.type === 'import' ? RefreshCw : ArrowRight;
                  const tone = ev.type === 'cloture' ? '#1f9d6b' : ev.type === 'import' ? '#2f6690' : '#d99400';
                  return (
                    <tr key={ev.id}>
                      <td className="px-3 py-2 num whitespace-nowrap text-[#7b879d]">
                        {formatDateFR(ev.date.slice(0, 10), { day: '2-digit', month: 'short' })}
                      </td>
                      {!niveauUnite && (
                        <td className="px-2 py-2 whitespace-nowrap text-[#44537a] font-semibold">{u?.code ?? '—'}</td>
                      )}
                      <td className="px-2 py-2 truncate max-w-0" title={ev.label}>
                        <span className="inline-flex items-center gap-1.5">
                          <Icon size={11} style={{ color: tone }} className="shrink-0" />
                          {ev.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>

        {lastUpdated && (
          <p className="text-center text-[10.5px] text-[#a3adc0] py-2">
            Synchronisé à {lastUpdated.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        )}
      </div>
    </div>
  );
}