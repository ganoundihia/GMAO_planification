import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Unite, Atelier, JourFerie } from '../lib/types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, LineChart, Line, Legend, Cell, AreaChart, Area,
} from 'recharts';
import {
  AlertTriangle, BarChart3, Calendar, Clock,
  Loader2, Play, Users, ChevronRight, Filter,
  Sliders, RotateCcw, FileText, Layers, Activity,
  Target, BarChart as BarChartIcon, LineChart as LineChartIcon,
  Zap, UserCheck, CheckCircle2, Building2,
} from 'lucide-react';

// ─── Types ───
interface DbTechnicien {
  id: number; nom: string; prenom: string; unite_id: number;
  atelier_id: number | null; statut: string; atelier_code?: string; unite_code?: string;
}
interface PlanningRow {
  id: number; titre: string; frequence: string | null; date_prevue: string;
  duree_intervention: number; temps_logistique: number;
  consignation: string; consignation_motif: string | null;
  atelier_id: number | null; plan_annuel_id: number;
  statut: string; unite_id: number;
  ateliers?: { code: string } | null;
  planning_techniciens?: { technicien_id: number; duree: number }[];
}
interface InterventionCharge {
  planning_id: number; titre: string; frequence: string; atelier_code: string;
  date_prevue: string; duree_h: number; temps_logistique_h: number; charge_h: number;
  consignation: boolean; consignation_motif: string | null;
}
interface TechnicienCharge {
  technicien_id: number; nom: string; prenom: string;
  unite_code: string; atelier_code: string;
  charge_totale_h: number; nb_interventions: number; en_surcharge: boolean;
  interventions: InterventionCharge[];
}

// ─── Constants ───
const FREQ_COLORS: Record<string, string> = {
  Quotidienne: '#3B82F6', Hebdomadaire: '#14B8A6', Bimensuelle: '#0D9488',
  Mensuelle: '#8B5CF6', Bimestrielle: '#6D28D9', Trimestrielle: '#F59E0B',
  Quadrimestrielle: '#D97706', Semestrielle: '#1D9E75', Annuelle: '#6B7280', Bisannuelle: '#84CC16',
};
const ATELIER_COLORS: Record<string, string> = {
  CFA: '#F43F5E', CFO: '#3B82F6', VOIE: '#F59E0B', LAC: '#8B5CF6',
  BO: '#10B981', BIL: '#06B6D4', MR: '#F97316',
};
const TECH_COLORS = [
  '#1e2a5e','#10B981','#F59E0B','#EF4444','#8B5CF6',
  '#EC4899','#06B6D4','#84CC16','#F97316','#6366F1',
];

type TypeAnalyse = 'charge' | 'consignation';

// ─── Palette consignation (adaptée au style SMART) ───
const CV = {
  primary:   '#7C3AED',
  secondary: '#6366F1',
  light:     '#EDE9FE',
  lighter:   '#F5F3FF',
  text:      '#6D28D9',
  border:    '#DDD6FE',
  gradStart: '#7C3AED',
  gradEnd:   '#6366F1',
};

// ─── Helpers ───
function fmtH(h: number): string {
  const hrs = Math.floor(h); const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}min` : `${hrs}h`;
}
function isAlgeriaWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + 'T00:00:00'); return d.getDay() === 5 || d.getDay() === 6;
}
function isHolidayFn(dateStr: string, holidays: JourFerie[]): boolean {
  return holidays.some(h => h.date === dateStr);
}
function countWorkingDays(debut: string, fin: string, holidays: JourFerie[]): number {
  let count = 0;
  const d = new Date(debut + 'T00:00:00'), end = new Date(fin + 'T00:00:00');
  while (d <= end) {
    const ds = d.toISOString().split('T')[0];
    if (!isAlgeriaWeekend(ds) && !isHolidayFn(ds, holidays)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}
function isConsignationOui(val: string | null | undefined): boolean {
  if (!val) return false;
  const v = String(val).trim().toLowerCase();
  return v === 'oui' || v === 'yes' || v === '1' || v === 'true';
}
function getPeriode(type: 'semaine' | 'mois' | 'trimestre' | 'semestre' | 'annee') {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  switch (type) {
    case 'semaine': {
      // Semaine ouvrée algérienne : Dimanche → Jeudi (jour 0 → jour 4)
      const d = startOf(now); const day = d.getDay();
      const sun = new Date(d); sun.setDate(d.getDate() - day);
      const thu = new Date(sun); thu.setDate(sun.getDate() + 4);
      return { date_debut: fmt(sun), date_fin: fmt(thu) };
    }
    case 'mois':
      return {
        date_debut: fmt(new Date(now.getFullYear(), now.getMonth(), 1)),
        date_fin: fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      };
    case 'trimestre': {
      const q = Math.floor(now.getMonth() / 3);
      return {
        date_debut: fmt(new Date(now.getFullYear(), q * 3, 1)),
        date_fin: fmt(new Date(now.getFullYear(), q * 3 + 3, 0)),
      };
    }
    case 'semestre': {
      const s = now.getMonth() < 6 ? 0 : 6;
      return {
        date_debut: fmt(new Date(now.getFullYear(), s, 1)),
        date_fin: fmt(new Date(now.getFullYear(), s + 6, 0)),
      };
    }
    case 'annee':
      return {
        date_debut: fmt(new Date(now.getFullYear(), 0, 1)),
        date_fin: fmt(new Date(now.getFullYear(), 11, 31)),
      };
  }
}

// ─── AnimatedNumber ───
function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start: number | null = null;
    const ease = (t: number) => 1 - Math.pow(1 - t, 4);
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / 800, 1);
      setDisplay(Math.floor(value * ease(p)));
      if (p < 1) requestAnimationFrame(step); else setDisplay(value);
    };
    requestAnimationFrame(step);
  }, [value]);
  return <span>{display.toLocaleString('fr-FR')}</span>;
}

// ─── EmptyState - SMART Style ───
function EmptyState({ icon: Icon, title, sub }: { icon: any; title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center">
        <Icon size={28} className="text-slate-300" strokeWidth={1.5} />
      </div>
      <p className="text-sm font-bold text-slate-500">{title}</p>
      <p className="text-xs text-slate-400 text-center max-w-xs">{sub}</p>
    </div>
  );
}

// ─── Custom Tooltip - SMART Style ───
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-xl shadow-lg p-3 text-xs">
      <p className="font-bold text-slate-700 mb-1.5">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-slate-600">{p.name}:</span>
          <span className="font-bold text-slate-800">{Math.round(p.value * 10) / 10}h</span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════
export default function ChargePage() {
  const { profile } = useAuth();
  const role = (profile?.role ?? '').trim().toLowerCase();
  const isAdmin = role === 'admin' || role === 'super_admin';
  const isChargeUnite = role === 'charge_unite';
  const effectiveUniteId = isAdmin ? null : (profile?.unite_id ?? null);

  const [unites, setUnites] = useState<Unite[]>([]);
  const [ateliers, setAteliers] = useState<Atelier[]>([]);
  const [techniciens, setTechniciens] = useState<DbTechnicien[]>([]);
  const [holidays, setHolidays] = useState<JourFerie[]>([]);
  const [plansAnnuels, setPlansAnnuels] = useState<{ id: number; annee: number; statut: string; unite_id: number }[]>([]);

  const [typeAnalyse, setTypeAnalyse] = useState<TypeAnalyse>('charge');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [filtreAtelier, setFiltreAtelier] = useState('');
  const [filtreUnite, setFiltreUnite] = useState('');
  const [filtrePlan, setFiltrePlan] = useState('');
  const [filtreTech, setFiltreTech] = useState('');
  const [capH, setCapH] = useState(5);
  const [showFilters, setShowFilters] = useState(true);

  const [planningRows, setPlanningRows] = useState<PlanningRow[]>([]);
  const [technicienCharges, setTechnicienCharges] = useState<TechnicienCharge[]>([]);
  const [nbJoursOuvres, setNbJoursOuvres] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAnalysed, setHasAnalysed] = useState(false);

  const [view, setView] = useState<'resume' | 'detail' | 'consignation'>('resume');
  const [selectedAtelierResume, setSelectedAtelierResume] = useState<string>('');
  const [selectedTechsDetail, setSelectedTechsDetail] = useState<Set<number>>(new Set());

  useEffect(() => {
    const p = getPeriode('mois');
    setDateDebut(p.date_debut); setDateFin(p.date_fin);
  }, []);

  // Le chargé d'unité est verrouillé sur son unique atelier, partout, y compris ici.
  useEffect(() => {
    if (isChargeUnite && profile?.atelier_id) {
      setFiltreAtelier(String(profile.atelier_id));
    }
  }, [isChargeUnite, profile?.atelier_id]);

  useEffect(() => {
    Promise.all([
      supabase.from('unites').select('*').order('code'),
      supabase.from('ateliers').select('*').order('code'),
      supabase.from('jours_feries').select('*').order('date'),
    ]).then(([{ data: u }, { data: a }, { data: h }]) => {
      if (u) setUnites(u);
      if (a) setAteliers(a);
      if (h) setHolidays(h);
    });
  }, []);

  useEffect(() => {
    let q = supabase.from('plan_annuel').select('id, annee, statut, unite_id').order('annee', { ascending: false });
    if (effectiveUniteId) q = q.eq('unite_id', effectiveUniteId);
    q.then(({ data }) => {
      if (data) {
        setPlansAnnuels(data);
        const pub = data.find(p => p.statut === 'publie') ?? data[0];
        if (pub) setFiltrePlan(String(pub.id));
      }
    });
  }, [effectiveUniteId]);

  useEffect(() => {
    let q = supabase.from('techniciens')
      .select('id, nom, prenom, unite_id, atelier_id, statut, ateliers(code), unites(code)')
      .eq('statut', 'actif').order('nom');
    if (filtreUnite) q = q.eq('unite_id', Number(filtreUnite));
    else if (effectiveUniteId) q = q.eq('unite_id', effectiveUniteId);
    if (filtreAtelier) q = q.eq('atelier_id', Number(filtreAtelier));
    q.then(({ data }) => {
      if (data) setTechniciens(data.map((t: any) => ({
        ...t, atelier_code: t.ateliers?.code || '', unite_code: t.unites?.code || '',
      })));
    });
  }, [filtreUnite, filtreAtelier, effectiveUniteId]);

  const handleChangeTypeAnalyse = (type: TypeAnalyse) => {
    setTypeAnalyse(type);
    setHasAnalysed(false);
    setPlanningRows([]);
    setTechnicienCharges([]);
    setError(null);
    setView(type === 'consignation' ? 'consignation' : 'resume');
  };

  const handleAnalyser = useCallback(async () => {
    if (!dateDebut || !dateFin) return;
    setLoading(true); setError(null); setHasAnalysed(false);
    try {
      const _nbJours = countWorkingDays(dateDebut, dateFin, holidays);
      setNbJoursOuvres(_nbJours);

      let q = supabase.from('planning').select(`
        id, titre, frequence, date_prevue,
        duree_intervention, temps_logistique,
        consignation, consignation_motif,
        atelier_id, plan_annuel_id, statut, unite_id,
        ateliers:atelier_id ( code ),
        planning_techniciens ( technicien_id, duree )
      `)
        .gte('date_prevue', dateDebut)
        .lte('date_prevue', dateFin)
        .in('statut', ['planifiee', 'en_cours', 'terminee']);

      if (filtrePlan) q = q.eq('plan_annuel_id', Number(filtrePlan));
      else if (effectiveUniteId) q = q.eq('unite_id', effectiveUniteId);
      if (filtreAtelier) q = q.eq('atelier_id', Number(filtreAtelier));

      const { data: planData, error: plErr } = await q;
      if (plErr) throw new Error('Planning: ' + plErr.message);

      const rows: PlanningRow[] = (planData ?? []).map((r: any) => ({
        ...r, consignation: r.consignation ?? 'Non', consignation_motif: r.consignation_motif ?? null,
      }));
      setPlanningRows(rows);

      let tq = supabase.from('techniciens')
        .select('id, nom, prenom, unite_id, atelier_id, statut, ateliers(code), unites(code)')
        .eq('statut', 'actif');
      if (filtreTech) tq = tq.eq('id', Number(filtreTech));
      else if (filtreAtelier) tq = tq.eq('atelier_id', Number(filtreAtelier));
      else if (filtreUnite) tq = tq.eq('unite_id', Number(filtreUnite));
      else if (effectiveUniteId) tq = tq.eq('unite_id', effectiveUniteId);

      const { data: techData, error: tErr } = await tq;
      if (tErr) throw new Error('Techniciens: ' + tErr.message);

      const allTechs: DbTechnicien[] = (techData ?? []).map((t: any) => ({
        ...t, atelier_code: t.ateliers?.code || '', unite_code: t.unites?.code || '',
      }));

      const techMap = new Map<number, TechnicienCharge>();
      allTechs.forEach(t => {
        techMap.set(t.id, {
          technicien_id: t.id, nom: t.nom, prenom: t.prenom,
          unite_code: t.unite_code ?? '', atelier_code: t.atelier_code ?? '',
          charge_totale_h: 0, nb_interventions: 0, en_surcharge: false, interventions: [],
        });
      });

      rows.forEach(p => {
        const pts = p.planning_techniciens ?? [];
        if (!pts.length) return;
        const atelierCode = (p.ateliers as any)?.code ?? '';
        // Durée de l'intervention répartie sur l'équipe + temps logistique fixe par technicien
        // (convention alignée sur api/analyse-charge.js et Dashboard.tsx).
        const chargeParTech = p.duree_intervention / pts.length + p.temps_logistique;
        const consigOui = isConsignationOui(p.consignation);
        pts.forEach(pt => {
          const tc = techMap.get(pt.technicien_id);
          if (!tc) return;
          tc.charge_totale_h += chargeParTech;
          tc.nb_interventions++;
          tc.interventions.push({
            planning_id: p.id, titre: p.titre, frequence: p.frequence ?? '—',
            atelier_code: atelierCode, date_prevue: p.date_prevue,
            duree_h: p.duree_intervention, temps_logistique_h: p.temps_logistique,
            charge_h: chargeParTech, consignation: consigOui,
            consignation_motif: p.consignation_motif,
          });
        });
      });

      const capacite = capH * _nbJours;
      const techList = Array.from(techMap.values())
        .filter(t => t.nb_interventions > 0 || Boolean(filtreTech))
        .map(t => { t.en_surcharge = t.charge_totale_h > capacite; return t; })
        .sort((a, b) => b.charge_totale_h - a.charge_totale_h);

      setTechnicienCharges(techList);
      setSelectedAtelierResume('');
      setSelectedTechsDetail(new Set());
      setHasAnalysed(true);
      setView(typeAnalyse === 'consignation' ? 'consignation' : 'resume');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [dateDebut, dateFin, filtreAtelier, filtreUnite, filtreTech, filtrePlan, capH, holidays, effectiveUniteId, typeAnalyse]);

  const techsByAtelier = useMemo(() => {
    const map: Record<string, TechnicienCharge[]> = {};
    technicienCharges.forEach(t => {
      const code = t.atelier_code || 'Autre';
      if (!map[code]) map[code] = [];
      map[code].push(t);
    });
    return map;
  }, [technicienCharges]);

  const atelierAverages = useMemo(() =>
    Object.entries(techsByAtelier).map(([code, techs]) => ({
      atelier: code,
      moyenne: techs.length > 0 ? techs.reduce((s, t) => s + t.charge_totale_h, 0) / techs.length : 0,
      count: techs.length,
    })).sort((a, b) => b.moyenne - a.moyenne),
    [techsByAtelier]
  );

  const dailyChargeData = useMemo(() => {
    const allDates = new Set<string>();
    technicienCharges.forEach(t => t.interventions.forEach(i => allDates.add(i.date_prevue)));
    return Array.from(allDates).sort().map(date => {
      const row: any = { date };
      technicienCharges.forEach(t => {
        row[`tech_${t.technicien_id}`] = Math.round(
          t.interventions.filter(i => i.date_prevue === date).reduce((s, i) => s + i.charge_h, 0) * 100
        ) / 100;
      });
      return row;
    });
  }, [technicienCharges]);

  const consignationData = useMemo(() => {
    const daily: Record<string, { consignees: number; nonConsignees: number; total: number }> = {};
    planningRows.forEach(r => {
      const d = r.date_prevue;
      if (!daily[d]) daily[d] = { consignees: 0, nonConsignees: 0, total: 0 };
      daily[d].total++;
      if (isConsignationOui(r.consignation)) daily[d].consignees++;
      else daily[d].nonConsignees++;
    });
    return Object.entries(daily)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { consignees, nonConsignees, total }]) => ({
        date,
        consignees,
        nonConsignees,
        total,
        pourcentage: total > 0 ? Math.round((consignees / total) * 100) : 0,
      }));
  }, [planningRows]);

  const consignationStats = useMemo(() => {
    const totalInterventions = planningRows.length;
    const interventionsConsignees = planningRows.filter(r => isConsignationOui(r.consignation));
    const nbConsignees = interventionsConsignees.length;
    const nbNonConsignees = totalInterventions - nbConsignees;
    const pctConsignees = totalInterventions > 0
      ? Math.round((nbConsignees / totalInterventions) * 100)
      : 0;

    const parAtelier: Record<string, { consignees: number; total: number }> = {};
    planningRows.forEach(r => {
      const code = (r.ateliers as any)?.code || 'Autre';
      if (!parAtelier[code]) parAtelier[code] = { consignees: 0, total: 0 };
      parAtelier[code].total++;
      if (isConsignationOui(r.consignation)) parAtelier[code].consignees++;
    });

    const ateliersData = Object.entries(parAtelier)
      .map(([atelier, { consignees, total }]) => ({
        atelier,
        consignees,
        nonConsignees: total - consignees,
        total,
        pourcentage: total > 0 ? Math.round((consignees / total) * 100) : 0,
      }))
      .sort((a, b) => b.consignees - a.consignees);

    const motifs: Record<string, number> = {};
    interventionsConsignees.forEach(r => {
      const m = r.consignation_motif?.trim() || 'Non précisé';
      motifs[m] = (motifs[m] || 0) + 1;
    });

    return {
      totalInterventions,
      nbConsignees,
      nbNonConsignees,
      pctConsignees,
      jours: consignationData.length,
      ateliersData,
      motifs: Object.entries(motifs).sort((a, b) => b[1] - a[1]).slice(0, 8),
    };
  }, [planningRows, consignationData]);

  const plansFiltres = useMemo(() => {
    if (!filtreUnite && !effectiveUniteId) return plansAnnuels;
    const uid = Number(filtreUnite || effectiveUniteId);
    return plansAnnuels.filter(p => p.unite_id === uid);
  }, [plansAnnuels, filtreUnite, effectiveUniteId]);

  // Catalogue d'ateliers global (pas de lien unité→atelier) : le chargé d'unité
  // est restreint à son unique atelier, tout le reste voit le catalogue complet.
  const ateliersOptions = useMemo(() => {
    if (isChargeUnite && profile?.atelier_id) {
      return ateliers.filter(a => a.id === profile.atelier_id);
    }
    return ateliers;
  }, [ateliers, isChargeUnite, profile?.atelier_id]);

  const activeFilterCount = [filtreAtelier, filtreUnite, filtreTech, filtrePlan].filter(Boolean).length;
  const capacite = capH * nbJoursOuvres;
  const isConsig = typeAnalyse === 'consignation';

  const sel = "w-full rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[#1e2a5e]/20 transition-all outline-none border border-transparent focus:border-[#1e2a5e]/30";

  return (
    <div className="bg-slate-100 min-h-[calc(100vh-60px)] p-4 lg:p-6">
      <div className="max-w-[1500px] mx-auto space-y-5">

        {/* HEADER - SMART Style */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <BarChart3 size={13} className="text-[#1e2a5e]" />
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Analytics</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-800 leading-tight">
              Analyse de la <span className="text-[#1e2a5e]">Charge</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              {isConsig ? '⚡ Mode actif : Analyse des consignations' : '📊 Mode actif : Charge des techniciens'}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {hasAnalysed && (
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-white shadow-sm">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-bold tabular-nums text-xs text-slate-700">{planningRows.length}</span>
                <span className="text-[11px] text-slate-400">interv.</span>
              </div>
            )}

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`relative flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-bold transition-all shadow-sm ${
                showFilters
                  ? isConsig
                    ? 'text-white'
                    : 'bg-[#1e2a5e] text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
              style={showFilters && isConsig ? { backgroundColor: CV.primary } : undefined}
            >
              <Filter size={13} />Filtres
              {activeFilterCount > 0 && (
                <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center ${
                  showFilters ? 'bg-white/25 text-white' : 'bg-blue-100 text-[#1e2a5e]'
                }`}>{activeFilterCount}</span>
              )}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm border-l-4 border-rose-500">
            <div className="w-10 h-10 rounded-xl bg-rose-500 flex items-center justify-center shrink-0">
              <AlertTriangle size={17} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-rose-800">Erreur</p>
              <p className="text-xs text-rose-500 truncate">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-xl transition-all">Fermer</button>
          </div>
        )}

        {/* FILTERS PANEL - SMART Style */}
        {showFilters && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-2xl flex items-center justify-center`}
                  style={{ backgroundColor: isConsig ? CV.primary : '#1e2a5e' }}>
                  <Sliders size={15} className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">Filtres & Paramètres</p>
                  <p className="text-[10px] text-slate-400">Configurez votre analyse</p>
                </div>
                {activeFilterCount > 0 && (
                  <span className="px-2 py-0.5 text-[9px] font-bold rounded-full"
                    style={{ backgroundColor: isConsig ? CV.light : '#DBEAFE', color: isConsig ? CV.text : '#1e2a5e' }}>
                    {activeFilterCount} actif{activeFilterCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {activeFilterCount > 0 && (
                <button onClick={() => { setFiltreAtelier(''); setFiltreUnite(''); setFiltreTech(''); setFiltrePlan(''); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-rose-50 text-[11px] font-bold text-slate-500 hover:text-rose-600 transition-colors">
                  <RotateCcw size={11} />Réinitialiser
                </button>
              )}
            </div>

            {/* TYPE D'ANALYSE - SMART Style */}
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <BarChart3 size={11} className="text-slate-400" />Type d'analyse
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleChangeTypeAnalyse('charge')}
                  className={`relative flex items-center gap-3 p-4 rounded-2xl text-left transition-all duration-200 ${
                    !isConsig
                      ? 'bg-blue-50 ring-2 ring-[#1e2a5e]'
                      : 'bg-slate-50 hover:bg-blue-50'
                  }`}>
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition-all ${
                    !isConsig ? 'bg-[#1e2a5e]' : 'bg-white'
                  }`}>
                    <UserCheck size={18} className={!isConsig ? 'text-white' : 'text-slate-400'} strokeWidth={2.2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold leading-tight ${!isConsig ? 'text-[#1e2a5e]' : 'text-slate-600'}`}>
                      Charge techniciens
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">Répartition & surcharges</p>
                  </div>
                  {!isConsig && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#1e2a5e] flex items-center justify-center">
                      <CheckCircle2 size={11} className="text-white" />
                    </div>
                  )}
                </button>

                <button
                  onClick={() => handleChangeTypeAnalyse('consignation')}
                  className="relative flex items-center gap-3 p-4 rounded-2xl text-left transition-all duration-200"
                  style={isConsig ? {
                    backgroundColor: CV.lighter,
                    boxShadow: `0 0 0 2px ${CV.primary}`,
                  } : {
                    backgroundColor: '#F8FAFC',
                  }}>
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition-all"
                    style={isConsig ? { backgroundColor: CV.primary } : { backgroundColor: 'white' }}>
                    <Zap size={18} style={{ color: isConsig ? 'white' : '#94A3B8' }} strokeWidth={2.2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold leading-tight" style={{ color: isConsig ? CV.text : '#475569' }}>
                      Consignation
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">Nb interventions & % vs total</p>
                  </div>
                  {isConsig && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: CV.primary }}>
                      <CheckCircle2 size={11} className="text-white" />
                    </div>
                  )}
                </button>
              </div>
            </div>

            <div className="border-t border-slate-100" />

            {/* Raccourcis période */}
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Calendar size={11} style={{ color: isConsig ? CV.primary : '#1e2a5e' }} />
                Raccourcis période
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(['semaine','mois','trimestre','semestre','annee'] as const).map(type => {
                  const p = getPeriode(type);
                  const isActive = dateDebut === p.date_debut && dateFin === p.date_fin;
                  return (
                    <button key={type}
                      onClick={() => { setDateDebut(p.date_debut); setDateFin(p.date_fin); }}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                        isActive
                          ? 'text-white shadow-sm'
                          : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                      }`}
                      style={isActive ? {
                        backgroundColor: isConsig ? CV.primary : '#1e2a5e'
                      } : undefined}>
                      {{ semaine: 'Semaine', mois: 'Mois', trimestre: 'Trimestre', semestre: 'Semestre', annee: 'Année' }[type]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sélecteur d'unité admin */}
            {isAdmin && (
              <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50/50">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-[#1e2a5e] flex items-center justify-center shrink-0">
                    <Building2 size={14} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] font-bold text-[#1e2a5e] uppercase tracking-wider">Sélection d'unité</p>
                    <p className="text-[10px] text-slate-500">Filtrez par unité pour l'analyse</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => { setFiltreUnite(''); setFiltrePlan(''); }}
                    className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all ${
                      !filtreUnite
                        ? 'bg-[#1e2a5e] text-white shadow-sm'
                        : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}>
                    <span className="flex items-center gap-1.5">
                      <Filter size={11} />Toutes
                    </span>
                  </button>
                  {unites.map(u => {
                    const isActive = filtreUnite === String(u.id);
                    return (
                      <button
                        key={u.id}
                        onClick={() => { setFiltreUnite(String(u.id)); setFiltrePlan(''); }}
                        className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all ${
                          isActive
                            ? 'bg-[#1e2a5e] text-white shadow-sm'
                            : 'bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                        title={u.nom}>
                        <span className="flex items-center gap-1.5">
                          <Building2 size={10} />{u.code}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Champs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Date début</label>
                <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} className={sel} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Date fin</label>
                <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} className={sel} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Plan annuel</label>
                <select value={filtrePlan} onChange={e => setFiltrePlan(e.target.value)} className={sel}>
                  <option value="">Tous les plans</option>
                  {plansFiltres.map(p => <option key={p.id} value={p.id}>{p.annee} ({p.statut})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Atelier</label>
                <select
                  value={filtreAtelier}
                  disabled={isChargeUnite}
                  onChange={e => setFiltreAtelier(e.target.value)}
                  className={`${sel} disabled:opacity-70 disabled:cursor-not-allowed`}>
                  {!isChargeUnite && <option value="">Tous</option>}
                  {ateliersOptions.map(a => <option key={a.id} value={a.id}>{a.code} — {a.nom}</option>)}
                </select>
              </div>
              {!isConsig && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Technicien</label>
                  <select value={filtreTech} onChange={e => setFiltreTech(e.target.value)} className={sel}>
                    <option value="">Tous</option>
                    {techniciens.map(t => (
                      <option key={t.id} value={t.id}>{t.prenom} {t.nom} {t.atelier_code && `[${t.atelier_code}]`}</option>
                    ))}
                  </select>
                </div>
              )}
              {!isConsig && (
                <div className="col-span-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Capacité / jour</label>
                    <span className="text-[11px] font-bold text-white px-2 py-0.5 rounded-lg bg-[#1e2a5e]">{capH}h/j</span>
                  </div>
                  <input type="range" min={1} max={8} step={0.5} value={capH}
                    onChange={e => setCapH(Number(e.target.value))} className="w-full accent-[#1e2a5e]" />
                  <div className="flex justify-between text-[9px] text-slate-400 mt-0.5 font-semibold">
                    <span>1h</span><span>4h</span><span>8h</span>
                  </div>
                </div>
              )}
            </div>

            {/* Bouton lancer */}
            <div className="pt-2 border-t border-slate-100">
              <button
                onClick={handleAnalyser}
                disabled={loading || !dateDebut || !dateFin}
                className={`w-full flex items-center justify-center gap-2 px-5 py-3 text-white text-sm font-bold rounded-xl shadow-sm transition-all disabled:opacity-50`}
                style={{ backgroundColor: isConsig ? CV.primary : '#1e2a5e' }}
              >
                {loading
                  ? <><Loader2 size={15} className="animate-spin" />Analyse en cours…</>
                  : <><Play size={14} strokeWidth={2.5} />
                      Lancer l'analyse{isConsig ? ' des consignations' : ' de la charge'}
                    </>
                }
              </button>
            </div>
          </div>
        )}

        {/* NOT YET ANALYSED - SMART Style */}
        {!hasAnalysed && !loading && (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl"
              style={{ backgroundColor: isConsig ? CV.primary + '10' : '#1e2a5e10' }} />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-[#1e2a5e]/5 blur-3xl" />

            <div className="relative">
              <div className={`w-20 h-20 mx-auto rounded-2xl flex items-center justify-center shadow-lg mb-4`}
                style={{ backgroundColor: isConsig ? CV.primary : '#1e2a5e' }}>
                {isConsig ? <Zap size={32} className="text-white" /> : <BarChart3 size={32} className="text-white" />}
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-1">Prêt pour l'analyse</h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto mb-5">
                {isConsig ? "Configurez la période et les filtres, puis lancez l'analyse des consignations"
                          : "Configurez la période et les filtres, puis lancez l'analyse de la charge"}
              </p>
              <button
                onClick={handleAnalyser}
                disabled={!dateDebut || !dateFin}
                className={`inline-flex items-center gap-2 px-5 py-2.5 text-white text-sm font-bold rounded-xl shadow-sm transition-all disabled:opacity-50`}
                style={{ backgroundColor: isConsig ? CV.primary : '#1e2a5e' }}>
                <Play size={14} strokeWidth={2.5} />Lancer l'analyse
              </button>
            </div>
          </div>
        )}

        {loading && (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
            <Loader2 size={32} className="mx-auto animate-spin mb-3"
              style={{ color: isConsig ? CV.primary : '#1e2a5e' }} />
            <p className="text-sm font-bold text-slate-500">Analyse en cours…</p>
          </div>
        )}

        {/* RESULTS */}
        {hasAnalysed && !loading && (
          <>
            {/* VIEW TOGGLE - SMART Style */}
            <div className="bg-white rounded-2xl shadow-sm p-1.5 flex items-center gap-1">
              {!isConsig ? (
                <>
                  {([
                    { key: 'resume' as const, label: 'Résumé Charge', icon: BarChartIcon },
                    { key: 'detail' as const, label: 'Détail Journalier', icon: LineChartIcon },
                  ]).map(v => (
                    <button key={v.key} onClick={() => setView(v.key)}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                        view === v.key
                          ? 'bg-[#1e2a5e] text-white shadow-sm'
                          : 'text-slate-500 hover:bg-slate-50'
                      }`}>
                      <v.icon size={14} /><span className="hidden sm:inline">{v.label}</span>
                    </button>
                  ))}
                </>
              ) : (
                <button
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm"
                  style={{ backgroundColor: CV.primary }}>
                  <Layers size={14} /><span className="hidden sm:inline">Analyse de consignation</span>
                </button>
              )}
            </div>

            {/* RÉSUMÉ CHARGE - SMART Style */}
            {view === 'resume' && !isConsig && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { l: 'Jours ouvrés', v: nbJoursOuvres, icon: Calendar, bg: 'bg-blue-500', isH: false },
                    { l: 'Techniciens', v: technicienCharges.length, icon: Users, bg: 'bg-emerald-500', isH: false },
                    { l: 'Charge totale', v: Math.round(technicienCharges.reduce((s,t)=>s+t.charge_totale_h,0)*10)/10, icon: Activity, bg: 'bg-[#1e2a5e]', isH: true },
                    { l: 'Surcharges', v: technicienCharges.filter(t=>t.en_surcharge).length, icon: AlertTriangle, bg: 'bg-rose-500', isH: false },
                  ].map(k => (
                    <div key={k.l} className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl ${k.bg} flex items-center justify-center shrink-0`}>
                          <k.icon size={20} className="text-white" strokeWidth={2.2} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-slate-500 font-medium leading-tight">{k.l}</p>
                          <p className="text-2xl font-bold text-slate-800 tabular-nums leading-tight">
                            {k.isH ? `${k.v}h` : <AnimatedNumber value={k.v} />}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {!filtreAtelier && atelierAverages.length > 1 && (
                  <div className="bg-white rounded-2xl shadow-sm p-5">
                    <div className="flex items-center gap-2.5 mb-4">
                      <div className="w-9 h-9 rounded-2xl bg-[#1e2a5e] flex items-center justify-center">
                        <BarChartIcon size={16} className="text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">Charge moyenne par atelier</p>
                        <p className="text-[11px] text-slate-400">Comparaison entre ateliers sur la période</p>
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={atelierAverages} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="atelier" tick={{ fontSize: 11, fill: '#64748b' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} unit="h" />
                        <ReTooltip content={<CustomTooltip />} />
                        <Bar dataKey="moyenne" name="Moy. charge" radius={[8,8,0,0]}>
                          {atelierAverages.map((e, i) => <Cell key={i} fill={ATELIER_COLORS[e.atelier] || '#6B7280'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap gap-1.5 mt-4">
                      <button onClick={() => setSelectedAtelierResume('')}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                          !selectedAtelierResume ? 'bg-[#1e2a5e] text-white shadow-sm' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                        }`}>
                        Tous
                      </button>
                      {Object.keys(techsByAtelier).map(code => (
                        <button key={code} onClick={() => setSelectedAtelierResume(selectedAtelierResume === code ? '' : code)}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                            selectedAtelierResume === code ? 'text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                          }`}
                          style={selectedAtelierResume === code ? { backgroundColor: ATELIER_COLORS[code] || '#6B7280' } : {}}>
                          {code} ({techsByAtelier[code].length})
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-2xl shadow-sm p-5">
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-9 h-9 rounded-2xl bg-violet-500 flex items-center justify-center">
                      <Users size={16} className="text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">Charge individuelle par technicien</p>
                      <p className="text-[11px] text-slate-400">Capacité : {fmtH(capH)} × {nbJoursOuvres} jours = {fmtH(capacite)}</p>
                    </div>
                  </div>
                  {Object.entries(techsByAtelier)
                    .filter(([code]) => !selectedAtelierResume || code === selectedAtelierResume)
                    .map(([code, techs]) => (
                      <div key={code} className="mb-6 last:mb-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: ATELIER_COLORS[code] || '#6B7280' }} />
                          <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{code}</p>
                          <span className="text-[10px] text-slate-400">({techs.length} tech.)</span>
                          <div className="flex-1 h-px bg-slate-100" />
                        </div>
                        <ResponsiveContainer width="100%" height={Math.max(80, techs.length * 40)}>
                          <BarChart layout="vertical"
                            data={techs.map(t => ({
                              name: `${t.prenom} ${t.nom}`,
                              charge: Math.round(t.charge_totale_h * 10) / 10,
                              capacite: Math.round(capacite * 10) / 10,
                            }))}
                            margin={{ top: 0, right: 80, left: 80, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} unit="h" domain={[0, Math.max(capacite * 1.2, 1)]} />
                            <YAxis type="category" dataKey="name" width={75} tick={{ fontSize: 11, fill: '#475569' }} />
                            <ReTooltip formatter={(v: any, name?: string | number) => [`${v}h`, name === 'charge' ? 'Charge' : 'Capacité']} />
                            <Bar dataKey="capacite" fill="#e2e8f0" radius={[0,4,4,0]} barSize={4} name="Capacité" />
                            <Bar dataKey="charge" radius={[0,6,6,0]} barSize={18} name="Charge">
                              {techs.map((t, i) => (
                                <Cell key={i} fill={
                                  t.en_surcharge ? '#EF4444'
                                  : t.charge_totale_h / capacite > 0.8 ? '#F59E0B'
                                  : ATELIER_COLORS[code] || '#1e2a5e'
                                } />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* DÉTAIL JOURNALIER - SMART Style */}
            {view === 'detail' && !isConsig && (
              <div className="space-y-4">
                <div className="bg-white rounded-2xl shadow-sm p-5">
                  <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-2xl bg-teal-500 flex items-center justify-center">
                        <LineChartIcon size={16} className="text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">Évolution de la charge journalière</p>
                        <p className="text-[11px] text-slate-400">Par technicien sur la période</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => setSelectedTechsDetail(new Set())}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                          selectedTechsDetail.size === 0 ? 'bg-[#1e2a5e] text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                        }`}>
                        Tous
                      </button>
                      {technicienCharges.slice(0, 10).map((t, idx) => {
                        const active = selectedTechsDetail.size === 0 || selectedTechsDetail.has(t.technicien_id);
                        return (
                          <button key={t.technicien_id}
                            onClick={() => {
                              setSelectedTechsDetail(prev => {
                                const next = new Set(prev);
                                if (next.has(t.technicien_id)) next.delete(t.technicien_id);
                                else next.add(t.technicien_id);
                                return next;
                              });
                            }}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                              active ? 'text-white' : 'bg-slate-50 text-slate-400'
                            }`}
                            style={active ? { backgroundColor: TECH_COLORS[idx % TECH_COLORS.length] } : {}}>
                            {t.prenom[0]}.{t.nom}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {dailyChargeData.length === 0
                    ? <EmptyState icon={LineChartIcon} title="Aucune donnée" sub="Pas d'activité sur la période" />
                    : (
                      <ResponsiveContainer width="100%" height={400}>
                        <LineChart data={dailyChargeData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} unit="h" />
                          <ReTooltip content={<CustomTooltip />} />
                          <Legend />
                          {technicienCharges
                            .filter(t => selectedTechsDetail.size === 0 || selectedTechsDetail.has(t.technicien_id))
                            .map((t, idx) => (
                              <Line key={t.technicien_id} type="monotone" dataKey={`tech_${t.technicien_id}`}
                                stroke={TECH_COLORS[idx % TECH_COLORS.length]} strokeWidth={2}
                                name={`${t.prenom} ${t.nom}`} dot={{ r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                            ))}
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                </div>

                <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-2xl bg-slate-700 flex items-center justify-center">
                      <FileText size={14} className="text-white" />
                    </div>
                    <p className="text-sm font-bold text-slate-800">Tableau détaillé</p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {technicienCharges.map(t => (
                      <details key={t.technicien_id} className="group">
                        <summary className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-slate-50 transition-colors list-none">
                          <ChevronRight size={14} className="text-slate-300 group-open:rotate-90 transition-transform" />
                          <div className="w-9 h-9 rounded-xl bg-[#1e2a5e] flex items-center justify-center text-[10px] font-bold text-white">
                            {t.prenom[0]}{t.nom[0]}
                          </div>
                          <span className="text-sm font-bold text-slate-800 flex-1">{t.prenom} {t.nom}</span>
                          <span className="text-[11px] text-slate-400">{t.nb_interventions} interv.</span>
                          <span className={`text-sm font-bold tabular-nums ${t.en_surcharge ? 'text-rose-600' : 'text-emerald-600'}`}>{fmtH(t.charge_totale_h)}</span>
                          {t.en_surcharge && <span className="text-[9px] px-2 py-0.5 bg-rose-100 text-rose-700 rounded-lg font-bold">SURCHARGE</span>}
                        </summary>
                        <div className="px-5 pb-4 border-t border-slate-100 bg-slate-50">
                          <table className="w-full text-xs mt-3">
                            <thead>
                              <tr className="bg-white rounded-lg">
                                {['Date','Titre','Atelier','Fréquence','Durée','Logist.','Charge','Consig.'].map(h => (
                                  <th key={h} className="px-3 py-2 text-left font-bold text-slate-500 uppercase tracking-wider text-[10px]">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {t.interventions.map((int, j) => (
                                <tr key={j} className="hover:bg-white"
                                  style={int.consignation ? { backgroundColor: `${CV.lighter}80` } : {}}>
                                  <td className="px-3 py-2 font-mono text-slate-500">{int.date_prevue}</td>
                                  <td className="px-3 py-2 font-semibold text-slate-800 max-w-[180px] truncate">{int.titre}</td>
                                  <td className="px-3 py-2">
                                    <span className="text-[10px] px-2 py-0.5 rounded font-semibold"
                                      style={{ backgroundColor: CV.lighter, color: CV.text }}>
                                      {int.atelier_code || '—'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2">
                                    <span className="text-[10px] px-2 py-0.5 rounded font-semibold"
                                      style={{ backgroundColor: (FREQ_COLORS[int.frequence]||'#6B7280')+'15', color: FREQ_COLORS[int.frequence]||'#6B7280' }}>
                                      {int.frequence}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 font-mono text-slate-600">{int.duree_h}h</td>
                                  <td className="px-3 py-2 font-mono text-slate-400">{int.temps_logistique_h}h</td>
                                  <td className="px-3 py-2 font-bold text-[#1e2a5e]">{Math.round(int.charge_h * 100) / 100}h</td>
                                  <td className="px-3 py-2">
                                    {int.consignation
                                      ? <span className="text-[10px] px-2 py-0.5 rounded font-bold"
                                          style={{ backgroundColor: CV.light, color: CV.text }}
                                          title={int.consignation_motif || ''}>⚡ OUI</span>
                                      : <span className="text-slate-300 text-[10px]">—</span>}
                                  </td>
                                </tr>
                              ))}
                              <tr className="bg-white border-t-2 border-slate-200">
                                <td colSpan={6} className="px-3 py-2 text-right font-bold text-slate-600 text-[11px] uppercase">Total :</td>
                                <td className={`px-3 py-2 font-bold ${t.en_surcharge ? 'text-rose-600' : 'text-emerald-700'}`}>{fmtH(t.charge_totale_h)}</td>
                                <td />
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* CONSIGNATION - SMART Style */}
            {view === 'consignation' && isConsig && (
              <div className="space-y-4">

                {/* KPIs - SMART Style */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { l: 'Interventions consignées', v: consignationStats.nbConsignees, icon: Zap,
                      bg: 'bg-violet-500',
                      subtitle: `sur ${consignationStats.totalInterventions} total` },
                    { l: 'Non consignées', v: consignationStats.nbNonConsignees, icon: CheckCircle2,
                      bg: 'bg-emerald-500',
                      subtitle: `${100 - consignationStats.pctConsignees}% du total` },
                    { l: '% Consignation', v: consignationStats.pctConsignees, icon: Target,
                      bg: 'bg-indigo-500', suffix: '%',
                      subtitle: 'ratio consignées / total' },
                    { l: 'Jours actifs', v: consignationStats.jours, icon: Calendar,
                      bg: 'bg-purple-500',
                      subtitle: `sur ${nbJoursOuvres} j. ouvrés` },
                  ].map(k => (
                    <div key={k.l} className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl ${k.bg} flex items-center justify-center shrink-0`}>
                          <k.icon size={20} className="text-white" strokeWidth={2.2} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-slate-500 font-medium leading-tight">{k.l}</p>
                          <p className="text-2xl font-bold text-slate-800 tabular-nums leading-tight">
                            <AnimatedNumber value={k.v} />{k.suffix || ''}
                          </p>
                          {k.subtitle && (
                            <p className="text-[10px] text-slate-400 mt-0.5">{k.subtitle}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Ratio global - SMART Style */}
                <div className="bg-white rounded-2xl shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-2xl flex items-center justify-center" style={{ backgroundColor: CV.primary }}>
                        <Target size={16} className="text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">Ratio de consignation global</p>
                        <p className="text-[11px] text-slate-400">
                          {consignationStats.nbConsignees} consignées / {consignationStats.totalInterventions} interventions
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-bold" style={{ color: CV.text }}>
                        {consignationStats.pctConsignees}%
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">consignées</p>
                    </div>
                  </div>

                  <div className="h-8 rounded-xl overflow-hidden flex bg-slate-100">
                    {consignationStats.nbConsignees > 0 && (
                      <div
                        className="h-full flex items-center justify-center text-white text-xs font-bold transition-all duration-500"
                        style={{
                          width: `${consignationStats.pctConsignees}%`,
                          backgroundColor: CV.primary,
                        }}
                      >
                        {consignationStats.pctConsignees >= 10 && (
                          <span className="drop-shadow-sm">⚡ {consignationStats.nbConsignees}</span>
                        )}
                      </div>
                    )}
                    {consignationStats.nbNonConsignees > 0 && (
                      <div
                        className="h-full flex items-center justify-center text-white text-xs font-bold transition-all duration-500 bg-emerald-500"
                        style={{ width: `${100 - consignationStats.pctConsignees}%` }}
                      >
                        {(100 - consignationStats.pctConsignees) >= 10 && (
                          <span className="drop-shadow-sm">✓ {consignationStats.nbNonConsignees}</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4 mt-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-md" style={{ backgroundColor: CV.primary }} />
                      <span className="text-[11px] font-semibold text-slate-600">Consignées</span>
                      <span className="text-[11px] font-bold" style={{ color: CV.text }}>
                        {consignationStats.nbConsignees} ({consignationStats.pctConsignees}%)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-md bg-emerald-500" />
                      <span className="text-[11px] font-semibold text-slate-600">Non consignées</span>
                      <span className="text-[11px] font-bold text-emerald-700">
                        {consignationStats.nbNonConsignees} ({100 - consignationStats.pctConsignees}%)
                      </span>
                    </div>
                  </div>
                </div>

                {consignationData.length === 0 ? (
                  <div className="bg-white rounded-2xl shadow-sm p-10">
                    <EmptyState icon={Layers} title="Aucune donnée sur cette période"
                      sub="Aucune intervention trouvée." />
                  </div>
                ) : (
                  <>
                    {/* Bar chart empilé */}
                    <div className="bg-white rounded-2xl shadow-sm p-5">
                      <div className="flex items-center gap-2.5 mb-4">
                        <div className="w-9 h-9 rounded-2xl flex items-center justify-center" style={{ backgroundColor: CV.primary }}>
                          <BarChartIcon size={16} className="text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">Répartition journalière</p>
                          <p className="text-[11px] text-slate-400">Interventions consignées vs non consignées</p>
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={consignationData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                          <ReTooltip
                            formatter={(v: any, name?: string | number) => {
                              const labels: Record<string, string> = {
                                consignees: 'Consignées',
                                nonConsignees: 'Non consignées',
                              };
                              const key = String(name ?? ''); return [v, labels[key] || key];
                            }}
                            contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: 11 }}
                          />
                          <Legend
                            formatter={(value: string) => {
                              const labels: Record<string, string> = {
                                consignees: '⚡ Consignées',
                                nonConsignees: '✓ Non consignées',
                              };
                              return <span className="text-xs font-semibold text-slate-600">{labels[value] || value}</span>;
                            }}
                          />
                          <Bar dataKey="consignees" name="consignees" stackId="a" fill={CV.primary} />
                          <Bar dataKey="nonConsignees" name="nonConsignees" stackId="a" radius={[6, 6, 0, 0]} fill="#10B981" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Area chart évolution % */}
                    <div className="bg-white rounded-2xl shadow-sm p-5">
                      <div className="flex items-center gap-2.5 mb-4">
                        <div className="w-9 h-9 rounded-2xl bg-indigo-500 flex items-center justify-center">
                          <LineChartIcon size={16} className="text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">Évolution du taux de consignation</p>
                          <p className="text-[11px] text-slate-400">Pourcentage de consignations par jour</p>
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height={240}>
                        <AreaChart data={consignationData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                          <defs>
                            <linearGradient id="pctGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={CV.primary} stopOpacity={0.3} />
                              <stop offset="95%" stopColor={CV.primary} stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} unit="%" domain={[0, 100]} />
                          <ReTooltip
                            formatter={(v: any) => [`${v}%`, 'Taux consignation']}
                            contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: 11 }}
                          />
                          <Area type="monotone" dataKey="pourcentage" stroke={CV.primary} strokeWidth={2.5}
                            fill="url(#pctGrad)" dot={{ r: 3, fill: CV.primary, strokeWidth: 0 }}
                            activeDot={{ r: 5, fill: CV.primary }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Répartition par atelier */}
                    {consignationStats.ateliersData.length > 0 && (
                      <div className="bg-white rounded-2xl shadow-sm p-5">
                        <div className="flex items-center gap-2.5 mb-4">
                          <div className="w-9 h-9 rounded-2xl bg-violet-600 flex items-center justify-center">
                            <Layers size={16} className="text-white" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-800">Répartition par atelier</p>
                            <p className="text-[11px] text-slate-400">Interventions avec/sans consignation par atelier</p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {consignationStats.ateliersData.map((a, i) => {
                            const atelierColor = ATELIER_COLORS[a.atelier] || '#6B7280';
                            return (
                              <div key={i} className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: atelierColor }} />
                                    <span className="text-sm font-bold text-slate-700">{a.atelier}</span>
                                    <span className="text-[10px] text-slate-400">({a.total} interv.)</span>
                                  </div>
                                  <div className="flex items-center gap-3 text-[11px] font-bold">
                                    <span style={{ color: CV.text }}>⚡ {a.consignees}</span>
                                    <span className="text-emerald-700">✓ {a.nonConsignees}</span>
                                    <span
                                      className="px-2 py-0.5 rounded-lg font-bold"
                                      style={{
                                        backgroundColor: a.pourcentage >= 50 ? CV.light : '#F0FDF4',
                                        color: a.pourcentage >= 50 ? CV.text : '#065F46',
                                      }}
                                    >
                                      {a.pourcentage}%
                                    </span>
                                  </div>
                                </div>
                                <div className="h-6 rounded-lg overflow-hidden flex bg-slate-100">
                                  {a.consignees > 0 && (
                                    <div
                                      className="h-full flex items-center justify-end px-2 text-white text-[10px] font-bold transition-all"
                                      style={{
                                        width: `${a.pourcentage}%`,
                                        backgroundColor: CV.primary,
                                      }}
                                    >
                                      {a.pourcentage >= 15 && a.consignees}
                                    </div>
                                  )}
                                  {a.nonConsignees > 0 && (
                                    <div
                                      className="h-full flex items-center justify-start px-2 text-white text-[10px] font-bold transition-all bg-emerald-500"
                                      style={{ width: `${100 - a.pourcentage}%` }}
                                    >
                                      {(100 - a.pourcentage) >= 15 && a.nonConsignees}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Motifs */}
                    {consignationStats.motifs.length > 0 && (
                      <div className="bg-white rounded-2xl shadow-sm p-5">
                        <div className="flex items-center gap-2.5 mb-3">
                          <div className="w-9 h-9 rounded-2xl flex items-center justify-center" style={{ backgroundColor: CV.primary }}>
                            <FileText size={16} className="text-white" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-800">Principaux motifs de consignation</p>
                            <p className="text-[11px] text-slate-400">Top {consignationStats.motifs.length} motifs</p>
                          </div>
                        </div>
                        <div className="space-y-2.5">
                          {consignationStats.motifs.map(([motif, count], i) => {
                            const pct = consignationStats.nbConsignees > 0
                              ? Math.round((count / consignationStats.nbConsignees) * 100) : 0;
                            return (
                              <div key={i} className="flex items-center gap-3">
                                <span className="text-xs text-slate-600 w-40 truncate font-medium" title={motif}>
                                  {motif}
                                </span>
                                <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden relative">
                                  <div className="h-full rounded-full transition-all flex items-center justify-end pr-2"
                                    style={{
                                      width: `${pct}%`,
                                      backgroundColor: CV.primary,
                                    }}>
                                    {pct >= 15 && (
                                      <span className="text-[10px] font-bold text-white">{count}</span>
                                    )}
                                  </div>
                                </div>
                                <span className="text-[11px] font-bold w-16 text-right" style={{ color: CV.text }}>
                                  {count} · {pct}%
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Table détail */}
                    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-2xl flex items-center justify-center" style={{ backgroundColor: CV.primary }}>
                            <FileText size={14} className="text-white" />
                          </div>
                          <p className="text-sm font-bold text-slate-800">Détail des consignations</p>
                        </div>
                        <span className="text-[11px] font-bold px-2 py-1 rounded-lg"
                          style={{ backgroundColor: CV.light, color: CV.text }}>
                          {consignationStats.nbConsignees} entrées
                        </span>
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 z-10 bg-slate-50">
                            <tr>
                              {['Date', 'Titre', 'Atelier', 'Fréquence', 'Motif'].map(h => (
                                <th key={h} className="px-3 py-2.5 text-left font-bold uppercase tracking-wider text-[10px]"
                                  style={{ color: CV.text }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {planningRows
                              .filter(r => isConsignationOui(r.consignation))
                              .sort((a, b) => a.date_prevue.localeCompare(b.date_prevue))
                              .map((r, i) => (
                                <tr key={i} className="transition-colors hover:bg-slate-50">
                                  <td className="px-3 py-2 font-mono text-slate-600">{r.date_prevue}</td>
                                  <td className="px-3 py-2 font-semibold text-slate-800 max-w-[220px] truncate">{r.titre}</td>
                                  <td className="px-3 py-2">
                                    <span className="text-[10px] px-2 py-0.5 rounded font-semibold"
                                      style={{ backgroundColor: CV.lighter, color: CV.text }}>
                                      {(r.ateliers as any)?.code || '—'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2">
                                    <span className="text-[10px] px-2 py-0.5 rounded font-semibold"
                                      style={{
                                        backgroundColor: (FREQ_COLORS[r.frequence || ''] || '#6B7280') + '15',
                                        color: FREQ_COLORS[r.frequence || ''] || '#6B7280',
                                      }}>
                                      {r.frequence || '—'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-slate-500 max-w-[200px] truncate">
                                    {r.consignation_motif || <span className="text-slate-300 italic">Non précisé</span>}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}