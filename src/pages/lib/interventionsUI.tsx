// lib/interventionsUI.tsx
// ══════════════════════════════════════════════════════════════════════════════
//  Socle commun aux pages Dashboard (analyse) et Clôture (opérations) :
//  types métier, helpers de dates et de charge, règle de clôture, composants
//  d'interface et feuille de style de la charte SETRAM.
// ══════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  ClipboardList, CheckCircle2, Clock, AlertTriangle, Building2,
  RefreshCw, CalendarDays, Printer, FileText, ExternalLink,
  Activity, Zap, ChevronRight, Sun, Moon, Coffee,
  Shield, Search, Target, TrendingUp,
  ChevronLeft, Settings, RotateCcw, Layers,
  CalendarRange, BarChart3, X, Loader2, AlertOctagon,
  Timer, Hash, AlertCircle, Users, Sparkles, Gauge, Lock,
  MapPin, ArrowRight, ThumbsUp, ArrowLeft, XCircle, Check,
  MessageSquare, Send, CalendarCheck, UserCheck, Info, ChevronDown, Wrench,
  PieChart, TrendingDown, Percent, ListChecks,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Intervention, Unite, JourFerie, Notification, Atelier } from '../../lib/types';
import { STATUTS, FREQ_JO, nbOccurrences, joursOuvres } from '../../lib/types';
import type { Frequence } from '../../lib/types';
import { ficheToHttpUrl } from '../../lib/Ficheurl';
import { MOTIFS_REPORT, MAX_HOURS_PER_DAY, LOGISTICS_H } from '../../lib/types';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════
export type ViewMode = 'annual' | 'monthly';
export type WeekFilter = 'all' | 'w1' | 'w2' | 'w3' | 'w4' | 'w5';

export interface EndOfDayAction {
  interventionId: number;
  action: 'replanifier' | 'lisser' | null;
  newDate?: string;
}

export interface DateSuggestion {
  date: string;
  charge: number;
  dayLabel: string;
}

export interface ReportAnalysis {
  chargeJour: number;
  chargeMax: number;
  technicienNoms: string[];
  conflitsConges: Array<{
    technicienNom: string;
    dateDebut: string;
    dateFin: string;
    motif: string;
  }>;
  niveau: 'none' | 'low' | 'medium' | 'high' | 'critical';
  message: string;
  warnings: string[];
}

// ─── Technicien avec sa charge sur la période ───
export interface TechnicienCharge {
  id: number;
  nom: string;
  prenom: string;
  chargeTotale: number;
  nbInterventions: number;
  joursConge: number;
  joursDisponibles: number;
  chargeMoyenne: number;
  isAffecte: boolean;       // déjà affecté à cette intervention ?
  chargeJourCible: number;  // charge sur le jour cible demandé
}

// ─── Tâches (même structure que Planning.tsx) ───
export interface DashboardTache {
  id: number;
  numero: number;
  sous_equipement: string;
  operation: string;
  ok: boolean | null;
  motif: string;
  duree_min: number | null;
  initial: string;
}

export interface InterventionWithTasks extends Intervention {
  taches?: DashboardTache[];
}

// La table `planning` porte un atelier_id qui n'est pas toujours dans le type partagé
export type InterventionRow = Intervention & { atelier_id?: number | null };

// ═══════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════
export const SETTINGS_KEY_CHARGE = 'charge_max_jour_technicien';
export const CHARGE_FILTER_MAX = 5;   // charge moyenne max (h/jour) pour proposer un technicien
export const MAX_SPREAD_DAYS = 10;

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
export const isAlgeriaWeekend = (d: Date) => d.getDay() === 5 || d.getDay() === 6;
export const isHoliday = (d: Date, holidays: JourFerie[]) =>
  holidays.some(h => h.date === formatISO(d));
export const isWorkingDay = (d: Date, holidays: JourFerie[]) =>
  !isAlgeriaWeekend(d) && !isHoliday(d, holidays);

export function formatISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDateFR(iso: string, options?: Intl.DateTimeFormatOptions): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', options || { weekday: 'short', day: '2-digit', month: 'short' });
}

export function getWeekNumInMonth(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
  return Math.ceil((d.getDate() + firstDay.getDay()) / 7);
}

export function buildCandidateDays(fromDate: Date, spreadDays: number, holidays: JourFerie[]): string[] {
  const dates: string[] = [];
  const cur = new Date(fromDate);
  let checked = 0;
  const cap = Math.min(spreadDays, MAX_SPREAD_DAYS);
  while (dates.length < cap && checked < cap * 4) {
    cur.setDate(cur.getDate() + 1);
    checked++;
    if (isWorkingDay(cur, holidays)) dates.push(formatISO(cur));
  }
  return dates;
}

export function computeChargeMap(
  allInterventions: Intervention[],
  candidateDates: string[],
  uniteId: number | null
): Record<string, number> {
  const map: Record<string, number> = {};
  candidateDates.forEach(d => {
    map[d] = allInterventions.filter(
      i =>
        i.date_prevue === d &&
        i.statut !== 'terminee' &&
        (uniteId == null || i.unite_id === uniteId)
    ).length;
  });
  return map;
}

export function pickLeastLoadedDay(
  candidates: string[],
  simulatedCharge: Record<string, number>
): DateSuggestion | null {
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestCharge = simulatedCharge[best] ?? 0;
  for (const d of candidates) {
    const c = simulatedCharge[d] ?? 0;
    if (c < bestCharge) { bestCharge = c; best = d; }
  }
  return { date: best, charge: bestCharge, dayLabel: formatDateFR(best) };
}

export function getChargeLevel(charge: number): { label: string; color: string; bg: string } {
  if (charge === 0) return { label: 'Libre', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' };
  if (charge <= 2) return { label: 'Faible', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' };
  if (charge <= 5) return { label: 'Modérée', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' };
  return { label: 'Élevée', color: 'text-red-700', bg: 'bg-red-50 border-red-200' };
}

// ─── Apparition progressive des sections au défilement (purement visuel) ───
export function useReveal() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll('.reveal:not(.is-visible)'));
    if (nodes.length === 0) return;
    if (!('IntersectionObserver' in window)) {
      nodes.forEach(n => n.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    nodes.forEach(n => io.observe(n));
    return () => io.disconnect();
  });
}

// ─── Règle métier : une intervention ne peut être clôturée que si TOUTES ses
//     tâches sont renseignées (OK, ou NOK accompagné d'un motif) ───
export interface CompletionCheck {
  canClose: boolean;
  total: number;
  done: number;
  pending: number;
  nokSansMotif: number;
  reason: string | null;
}

export function checkCompletion(taches: DashboardTache[] | undefined): CompletionCheck {
  if (taches === undefined) {
    return { canClose: false, total: 0, done: 0, pending: 0, nokSansMotif: 0, reason: 'Tâches en cours de chargement…' };
  }
  const total = taches.length;
  if (total === 0) {
    // Aucune tâche configurée : rien à contrôler
    return { canClose: true, total: 0, done: 0, pending: 0, nokSansMotif: 0, reason: null };
  }
  const pending = taches.filter(t => t.ok === null).length;
  const nokSansMotif = taches.filter(t => t.ok === false && !(t.motif || '').trim()).length;
  const done = total - pending;

  let reason: string | null = null;
  if (pending > 0 && nokSansMotif > 0) {
    reason = `${pending} tâche(s) non renseignée(s) et ${nokSansMotif} NOK sans motif`;
  } else if (pending > 0) {
    reason = `${pending} tâche(s) restent à pointer OK ou NOK`;
  } else if (nokSansMotif > 0) {
    reason = `${nokSansMotif} tâche(s) NOK sans motif`;
  }

  return { canClose: reason === null, total, done, pending, nokSansMotif, reason };
}

// ─── Pastille de statut (remplace st.solidBg qui n'existe pas) ───
export function statutDotClass(statut: string): string {
  if (statut === 'planifiee') return 'bg-sky-500';
  if (statut === 'en_cours') return 'bg-amber-500';
  if (statut === 'terminee') return 'bg-emerald-500';
  return 'bg-rose-500';
}

// ─── Color map pour Tailwind ───
export const colorMap: Record<string, {
  bg: string; border: string; iconBg: string; text: string; badge: string;
}> = {
  emerald: {
    bg: 'bg-emerald-50', border: 'border-emerald-100',
    iconBg: 'bg-emerald-500', text: 'text-emerald-700', badge: 'text-emerald-500',
  },
  amber: {
    bg: 'bg-amber-50', border: 'border-amber-100',
    iconBg: 'bg-amber-500', text: 'text-amber-700', badge: 'text-amber-500',
  },
  sky: {
    bg: 'bg-sky-50', border: 'border-sky-100',
    iconBg: 'bg-sky-500', text: 'text-sky-700', badge: 'text-sky-500',
  },
  rose: {
    bg: 'bg-rose-50', border: 'border-rose-100',
    iconBg: 'bg-rose-500', text: 'text-rose-700', badge: 'text-rose-500',
  },
};

// ═══ AnimatedNumber ═══
export function AnimatedNumber({ value, className = '' }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current;
    const to = value;
    prev.current = value;
    if (from === to) { setDisplay(to); return; }
    let start: number | null = null;
    const ease = (t: number) => 1 - Math.pow(1 - t, 4);
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / 800, 1);
      setDisplay(Math.floor(from + (to - from) * ease(p)));
      if (p < 1) requestAnimationFrame(step);
      else setDisplay(to);
    };
    const id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [value]);
  return <span className={className}>{display.toLocaleString('fr-FR')}</span>;
}

// ═══ KPI Card ═══
export function KPICard({ label, value, icon: Icon, iconBg, sub, tone = 'accent', progress, hint }: {
  label: string;
  value: number | string;
  icon: any;
  iconBg?: string;
  sub?: string;
  tone?: 'accent' | 'emerald' | 'gold' | 'rose';
  progress?: number;
  hint?: string;
}) {
  const TONES = {
    accent:  { bar: 'from-[#2f6690] to-[#8fd8ec]', chip: 'bg-[#e4edf3] text-[#24537a]', ring: 'ring-[#2f6690]/15' },
    emerald: { bar: 'from-emerald-500 to-emerald-300', chip: 'bg-emerald-50 text-emerald-700', ring: 'ring-emerald-500/15' },
    gold:    { bar: 'from-[#f0b429] to-[#ffd97a]', chip: 'bg-amber-50 text-amber-700', ring: 'ring-[#f0b429]/20' },
    rose:    { bar: 'from-rose-500 to-rose-300', chip: 'bg-rose-50 text-rose-700', ring: 'ring-rose-500/15' },
  }[tone];

  return (
    <div className={`d-panel d-panel-hover relative overflow-hidden p-5 ring-1 ${TONES.ring}`}>
      {/* Filet coloré supérieur */}
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${TONES.bar}`} />

      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-xl ${iconBg || 'bg-[#0a1930]'} flex items-center justify-center shrink-0 shadow-sm`}>
          <Icon size={21} className="text-white" strokeWidth={2.2} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="d-kicker text-slate-400">{label}</p>
          <p className="text-[30px] font-bold text-[#0a1930] leading-none tabular-nums mt-1.5">
            {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
          </p>
          {sub && <p className="text-[11px] text-slate-500 mt-1.5 font-medium">{sub}</p>}
        </div>
        {hint && (
          <span className={`d-mono text-[10px] font-bold px-2 py-1 rounded-lg shrink-0 ${TONES.chip}`}>{hint}</span>
        )}
      </div>

      {typeof progress === 'number' && (
        <div className="mt-4 h-1.5 bg-[#e8eefb] rounded-full overflow-hidden">
          <div className={`h-full rounded-full bg-gradient-to-r ${TONES.bar} transition-all duration-1000`}
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
    </div>
  );
}

// ═══ Jauge segmentée — pastilles pleines puis contours pointillés ═══
export function SegmentedGauge({ value, max, segments = 8, tone = 'navy', className = '' }: {
  value: number;
  max: number;
  segments?: number;
  tone?: 'navy' | 'gold' | 'emerald' | 'rose' | 'light';
  className?: string;
}) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const filled = Math.round(ratio * segments);

  const FILL = {
    navy: 'bg-[#0a1930]',
    gold: 'bg-[#f0b429]',
    emerald: 'bg-emerald-500',
    rose: 'bg-rose-500',
    light: 'bg-[#f0b429]',
  }[tone];
  const EMPTY = tone === 'light'
    ? 'border-white/25'
    : 'border-slate-300';

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {Array.from({ length: segments }, (_, i) => (
        <div
          key={i}
          className={`h-7 flex-1 rounded-full transition-all duration-500 ${
            i < filled ? FILL : `border border-dashed ${EMPTY}`
          }`}
          style={{ transitionDelay: `${i * 45}ms` }}
        />
      ))}
    </div>
  );
}

// ═══ Print Confirm Modal ═══
export function PrintConfirmModal({ fiches, onConfirm, onPrintOnly, onClose, loading }: {
  fiches: (Intervention & { ficheUrl: string | null })[];
  onConfirm: () => void;
  onPrintOnly: () => void;
  onClose: () => void;
  loading: boolean;
}) {
  const planifieeCount = fiches.filter(f => f.statut === 'planifiee').length;
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="bg-gradient-to-br from-[#0a1930] to-[#2f6690] px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
              <Printer size={22} className="text-white" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-widest mb-0.5">Confirmation</p>
              <h2 className="text-base font-bold text-white">
                Imprimer {fiches.length} fiche{fiches.length > 1 ? 's' : ''}
              </h2>
            </div>
            <button onClick={onClose} disabled={loading} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded-xl">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {planifieeCount > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center shrink-0">
                <AlertCircle size={16} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-amber-800">Changement de statut</p>
                <p className="text-xs text-amber-700 mt-1">
                  <strong>{planifieeCount}</strong> intervention{planifieeCount > 1 ? 's' : ''} passera au statut <strong>En cours</strong>.
                </p>
              </div>
            </div>
          )}

          <div className="max-h-[200px] overflow-y-auto space-y-1">
            {fiches.map((f, idx) => {
              const st = STATUTS.find(s => s.value === f.statut);
              const willChange = f.statut === 'planifiee';
              return (
                <div key={f.id} className={`flex items-center gap-2.5 p-2.5 rounded-xl ${willChange ? 'bg-amber-50/60' : 'bg-slate-50'}`}>
                  <span className="w-6 h-6 rounded-lg bg-slate-200 text-[10px] font-bold text-slate-500 flex items-center justify-center shrink-0">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-slate-700 truncate">{f.titre}</p>
                  </div>
                  {st && <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${st.color}`}>{st.label}</span>}
                  {willChange && (
                    <>
                      <ChevronRight size={10} className="text-amber-400" />
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-700">En cours</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <button onClick={onClose} disabled={loading} className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-white disabled:opacity-50">
            Annuler
          </button>
          <div className="flex items-center gap-2">
            {planifieeCount > 0 && (
              <button onClick={onPrintOnly} disabled={loading} className="px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-white disabled:opacity-50 flex items-center gap-2">
                <Printer size={13} />Imprimer seulement
              </button>
            )}
            <button onClick={onConfirm} disabled={loading} className="px-5 py-2.5 bg-[#0a1930] hover:bg-[#2f6690] text-white rounded-xl text-sm font-bold shadow-sm disabled:opacity-50 flex items-center gap-2">
              {loading
                ? <><Loader2 size={14} className="animate-spin" />Impression…</>
                : <><CheckCircle2 size={14} />{planifieeCount > 0 ? 'Confirmer & Imprimer' : 'Imprimer'}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══ End Of Day Modal ═══
export function EndOfDayModal({
  interventions, allInterventions, holidays, spreadDays,
  onClose, onApply, canManageSettings, onSpreadDaysChange, saving, unites,
}: {
  interventions: Intervention[];
  allInterventions: Intervention[];
  holidays: JourFerie[];
  spreadDays: number;
  onClose: () => void;
  onApply: (actions: EndOfDayAction[]) => void;
  canManageSettings: boolean;
  onSpreadDaysChange: (v: number) => void;
  saving: boolean;
  unites: Unite[];
}) {
  const [actions, setActions] = useState<EndOfDayAction[]>(
    interventions.map(i => ({ interventionId: i.id, action: null }))
  );
  const [localSpread, setLocalSpread] = useState(Math.min(spreadDays, MAX_SPREAD_DAYS));
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const candidatesByUnite = useMemo(() => {
    const map = new Map<number | null, string[]>();
    interventions.forEach(it => {
      const key = it.unite_id ?? null;
      if (!map.has(key))
        map.set(key, buildCandidateDays(new Date(it.date_prevue + 'T00:00:00'), localSpread, holidays));
    });
    return map;
  }, [interventions, localSpread, holidays]);

  const externalChargeByUnite = useMemo(() => {
    const map = new Map<number | null, Record<string, number>>();
    candidatesByUnite.forEach((dates, uniteId) =>
      map.set(uniteId, computeChargeMap(allInterventions, dates, uniteId))
    );
    return map;
  }, [candidatesByUnite, allInterventions]);

  const getTopSuggestions = useCallback((inter: Intervention): DateSuggestion[] => {
    const key = inter.unite_id ?? null;
    const candidates = candidatesByUnite.get(key) || [];
    const charge = externalChargeByUnite.get(key) || {};
    return candidates
      .map(d => ({ date: d, charge: charge[d] ?? 0, dayLabel: formatDateFR(d) }))
      .sort((a, b) => a.charge - b.charge)
      .slice(0, 3);
  }, [candidatesByUnite, externalChargeByUnite]);

  const individualSuggestion = useCallback((inter: Intervention): DateSuggestion | null => {
    const top = getTopSuggestions(inter);
    return top[0] || null;
  }, [getTopSuggestions]);

  const lisserGroupSuggestions = useMemo(() => {
    const result: Record<number, DateSuggestion> = {};
    const groupItems = interventions.filter(
      it => actions.find(a => a.interventionId === it.id)?.action === 'lisser'
    );
    const byUnite = new Map<number | null, Intervention[]>();
    groupItems.forEach(it => {
      const key = it.unite_id ?? null;
      if (!byUnite.has(key)) byUnite.set(key, []);
      byUnite.get(key)!.push(it);
    });
    byUnite.forEach((items, uniteId) => {
      const candidates = candidatesByUnite.get(uniteId) || [];
      const simulated = { ...(externalChargeByUnite.get(uniteId) || {}) };
      items.forEach(it => {
        const sugg = pickLeastLoadedDay(candidates, simulated);
        if (sugg) { result[it.id] = sugg; simulated[sugg.date] = (simulated[sugg.date] ?? 0) + 1; }
      });
    });
    return result;
  }, [interventions, actions, candidatesByUnite, externalChargeByUnite]);

  const setAction = (id: number, action: 'replanifier' | 'lisser') => {
    setActions(prev => prev.map(a => {
      if (a.interventionId !== id) return a;
      if (action === 'replanifier') {
        const inter = interventions.find(i => i.id === id);
        const sugg = inter ? individualSuggestion(inter) : null;
        return { ...a, action: 'replanifier', newDate: sugg?.date };
      }
      return { ...a, action: 'lisser', newDate: undefined };
    }));
  };

  const applyAutoProposal = () => {
    setActions(prev => prev.map(a => {
      const inter = interventions.find(i => i.id === a.interventionId);
      if (!inter) return a;
      const sugg = individualSuggestion(inter);
      return { ...a, action: 'replanifier' as const, newDate: sugg?.date };
    }));
  };

  const handleApply = () => {
    const final = actions.map(a =>
      a.action === 'lisser'
        ? { ...a, newDate: lisserGroupSuggestions[a.interventionId]?.date }
        : a
    );
    onApply(final.filter(a => a.action !== null));
  };

  const allDecided = actions.every(a => a.action !== null);
  const decidedCount = actions.filter(a => a.action).length;
  const totalCount = Math.max(1, interventions.length);

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="bg-gradient-to-br from-[#0a1930] to-[#2f6690] px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center shadow-lg">
              <AlertOctagon size={22} className="text-white" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-widest mb-1">Fin de journée</p>
              <h2 className="text-lg font-bold text-white">
                Reporter {interventions.length} intervention{interventions.length > 1 ? 's' : ''}
              </h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded-xl">
              <X size={16} />
            </button>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400 transition-all" style={{ width: `${(decidedCount / totalCount) * 100}%` }} />
            </div>
            <span className="text-[11px] font-bold text-white tabular-nums">{decidedCount}/{interventions.length}</span>
          </div>
        </div>

        {canManageSettings && (
          <div className="px-6 py-3 bg-amber-50 border-b border-amber-100">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Settings size={14} className="text-amber-600" />
                <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Fenêtre de report</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { const v = Math.max(1, localSpread - 1); setLocalSpread(v); onSpreadDaysChange(v); }} className="w-7 h-7 rounded-lg bg-white border border-amber-300 text-amber-700 font-bold hover:bg-amber-100">−</button>
                <span className="w-8 text-center font-bold text-amber-700 tabular-nums">{localSpread}</span>
                <button onClick={() => { const v = Math.min(MAX_SPREAD_DAYS, localSpread + 1); setLocalSpread(v); onSpreadDaysChange(v); }} className="w-7 h-7 rounded-lg bg-white border border-amber-300 text-amber-700 font-bold hover:bg-amber-100">+</button>
                <span className="text-xs font-bold text-amber-600">jours ouvrés</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50">
          <button onClick={applyAutoProposal} className="w-full flex items-center justify-center gap-2 p-3.5 rounded-2xl border-2 border-dashed border-[#0a1930]/30 bg-white hover:bg-blue-50 text-[#0a1930] text-sm font-bold transition-all">
            <Sparkles size={15} />Proposition automatique pour toutes
          </button>

          {interventions.map(inter => {
            const act = actions.find(a => a.interventionId === inter.id);
            const uniteName = unites.find(u => u.id === inter.unite_id)?.code;
            const topSuggs = getTopSuggestions(inter);
            const currentSugg =
              act?.action === 'lisser' ? lisserGroupSuggestions[inter.id] :
              act?.action === 'replanifier' && act.newDate
                ? topSuggs.find(s => s.date === act.newDate) || { date: act.newDate, charge: 0, dayLabel: formatDateFR(act.newDate) }
                : null;
            const isExpanded = expandedId === inter.id;
            const chargeLevel = currentSugg ? getChargeLevel(currentSugg.charge) : null;

            return (
              <div key={inter.id} className={`rounded-2xl bg-white transition-all overflow-hidden shadow-sm ${
                act?.action === 'replanifier' ? 'ring-2 ring-blue-200' :
                act?.action === 'lisser' ? 'ring-2 ring-violet-200' : ''
              }`}>
                <div className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-[#0a1930] flex items-center justify-center text-white text-[10px] font-bold shrink-0">#{inter.id}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{inter.titre}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                          <CalendarDays size={9} />{formatDateFR(inter.date_prevue)}
                        </span>
                        {uniteName && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#e8eefb] text-slate-600 font-bold flex items-center gap-0.5">
                            <Building2 size={8} />{uniteName}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-lg font-bold bg-amber-100 text-amber-700 shrink-0">En cours</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setAction(inter.id, 'replanifier')} className={`flex items-center gap-2 p-3 rounded-xl text-left transition-all ${act?.action === 'replanifier' ? 'bg-blue-100' : 'bg-slate-50 hover:bg-blue-50'}`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${act?.action === 'replanifier' ? 'bg-blue-500' : 'bg-white'}`}>
                        <RotateCcw size={14} className={act?.action === 'replanifier' ? 'text-white' : 'text-slate-400'} />
                      </div>
                      <div>
                        <p className={`text-xs font-bold ${act?.action === 'replanifier' ? 'text-blue-800' : 'text-slate-700'}`}>Replanifier</p>
                        <p className="text-[10px] text-slate-400">Choix libre</p>
                      </div>
                    </button>
                    <button onClick={() => setAction(inter.id, 'lisser')} className={`flex items-center gap-2 p-3 rounded-xl text-left transition-all ${act?.action === 'lisser' ? 'bg-violet-100' : 'bg-slate-50 hover:bg-violet-50'}`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${act?.action === 'lisser' ? 'bg-violet-500' : 'bg-white'}`}>
                        <Layers size={14} className={act?.action === 'lisser' ? 'text-white' : 'text-slate-400'} />
                      </div>
                      <div>
                        <p className={`text-xs font-bold ${act?.action === 'lisser' ? 'text-violet-800' : 'text-slate-700'}`}>Lisser</p>
                        <p className="text-[10px] text-slate-400">Auto (groupe)</p>
                      </div>
                    </button>
                  </div>
                </div>

                {(act?.action === 'replanifier' || act?.action === 'lisser') && currentSugg && chargeLevel && (
                  <div className="border-t border-slate-100 bg-slate-50/60 p-4 space-y-3">
                    <div className={`flex items-center gap-3 p-3 rounded-xl border ${chargeLevel.bg}`}>
                      <div className="w-10 h-10 rounded-xl bg-white flex flex-col items-center justify-center shrink-0">
                        <span className="text-[8px] font-bold text-slate-400 uppercase">
                          {new Date(currentSugg.date + 'T00:00:00').toLocaleDateString('fr-FR', { month: 'short' })}
                        </span>
                        <span className="text-sm font-bold text-slate-700 leading-none">
                          {new Date(currentSugg.date + 'T00:00:00').getDate()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-bold ${chargeLevel.color}`}>{currentSugg.dayLabel}</p>
                        <span className={`text-[10px] font-bold ${chargeLevel.color} flex items-center gap-1`}>
                          <Gauge size={10} />Charge {chargeLevel.label.toLowerCase()} · {currentSugg.charge} prévue{currentSugg.charge !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {act.action === 'replanifier' && (
                        <button onClick={() => setExpandedId(isExpanded ? null : inter.id)} className="text-[10px] font-bold text-slate-500 px-2 py-1 rounded-lg hover:bg-white flex items-center gap-1">
                          {isExpanded ? 'Masquer' : 'Alternatives'}
                          <ChevronRight size={10} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        </button>
                      )}
                    </div>

                    {act.action === 'replanifier' && isExpanded && topSuggs.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {topSuggs.map((s, idx) => {
                            const level = getChargeLevel(s.charge);
                            const isSelected = act.newDate === s.date;
                            return (
                              <button key={s.date} onClick={() => setActions(prev => prev.map(a => a.interventionId === inter.id ? { ...a, newDate: s.date } : a))}
                                className={`p-2.5 rounded-xl text-left transition-all ${isSelected ? 'bg-blue-100 ring-2 ring-blue-300' : level.bg}`}>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`w-5 h-5 rounded-md text-[10px] font-bold flex items-center justify-center ${
                                    idx === 0 ? 'bg-emerald-500 text-white' : idx === 1 ? 'bg-blue-500 text-white' : 'bg-slate-400 text-white'
                                  }`}>{idx + 1}</span>
                                  <span className={`text-[11px] font-bold truncate ${isSelected ? 'text-blue-700' : level.color}`}>{s.dayLabel}</span>
                                  {isSelected && <CheckCircle2 size={12} className="text-blue-500 shrink-0 ml-auto" />}
                                </div>
                                <p className={`text-[10px] font-semibold ${level.color}`}>
                                  {s.charge === 0 ? '🎉 Libre' : `📊 ${s.charge} prévue${s.charge > 1 ? 's' : ''}`}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-2 pt-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Date personnalisée :</label>
                          <input type="date" value={act.newDate || ''} onChange={e => setActions(prev => prev.map(a => a.interventionId === inter.id ? { ...a, newDate: e.target.value } : a))}
                            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-700 bg-white outline-none flex-1" />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-white flex items-center justify-between gap-3">
          <span className="text-[11px] font-bold text-slate-500">{decidedCount}/{interventions.length} décidée{decidedCount > 1 ? 's' : ''}</span>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">Annuler</button>
            <button onClick={handleApply} disabled={!allDecided || saving} className="px-5 py-2 bg-[#0a1930] hover:bg-[#2f6690] text-white rounded-xl text-sm font-bold shadow-sm disabled:opacity-50 flex items-center gap-2">
              {saving
                ? <><Loader2 size={14} className="animate-spin" />Application…</>
                : <><CheckCircle2 size={14} />Appliquer les {decidedCount} report{decidedCount > 1 ? 's' : ''}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// REPORT REQUEST MODAL — ① Date → ② Technicien → ③ Motif → ④ Confirmation
//
// Le seuil de charge n'est plus réglable ici : il est défini par
// l'administrateur depuis la page « Demandes de report reçues ».
// ═══════════════════════════════════════════════════════════

export interface TechDispo {
  id: number;
  nom: string;
  prenom: string;
  isAffecte: boolean;
  chargeJour: number;      // heures déjà planifiées à la date visée
  chargeApres: number;     // après ajout de l'intervention reportée
  pct: number;             // % du seuil
  nbInterJour: number;
  enConge: boolean;
  eligible: boolean;       // sous le seuil et pas en congé
  chargeTotale: number;    // charge cumulée sur toute la période (départage)
}

export interface DateDispo {
  date: string;
  dayLabel: string;
  nbDispo: number;
  nbTotal: number;
  affecteDispo: boolean;   // le technicien actuel est-il libre ce jour-là ?
  niveau: 'ideal' | 'possible' | 'tendu' | 'impossible';
}

export interface ReportScan {
  note: string;
  techs: Array<{ id: number; nom: string; prenom: string; isAffecte: boolean }>;
  candidateDates: string[];
  chargeParTechParJour: Record<number, Record<string, number>>;
  nbInterParTechParJour: Record<number, Record<string, number>>;
  congesParTechParJour: Record<number, Set<string>>;
  chargeTotaleParTech: Record<number, number>;
  dureeIntervention: number;
}

export const NIVEAU_DATE = {
  ideal: { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', ring: 'ring-emerald-300', label: 'Large choix' },
  possible: { dot: 'bg-blue-500', text: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', ring: 'ring-blue-300', label: 'Disponible' },
  tendu: { dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', ring: 'ring-amber-300', label: 'Tendu' },
  impossible: { dot: 'bg-rose-500', text: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200', ring: 'ring-rose-300', label: 'Complet' },
};

export function ReportRequestModal({
  intervention, onClose, onSubmit, saving,
}: {
  intervention: Intervention;
  onClose: () => void;
  onSubmit: (data: {
    dateDemandee: string;
    motif: string;
    technicienId: number;
    technicienNom: string;
    analysis: ReportAnalysis;
  }) => void;
  saving: boolean;
}) {
  const [step, setStep] = useState<'date' | 'technicien' | 'motif' | 'confirm'>('date');
  const [motif, setMotif] = useState('');
  const [motifDetail, setMotifDetail] = useState('');
  const [techSearch, setTechSearch] = useState('');
  const [showAllDates, setShowAllDates] = useState(false);

  const [chargeThreshold, setChargeThreshold] = useState<number>(MAX_HOURS_PER_DAY);
  const [scan, setScan] = useState<ReportScan | null>(null);
  const [loadingScan, setLoadingScan] = useState(true);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTechId, setSelectedTechId] = useState<number | null>(null);

  const scanEndDate = useMemo(() => new Date(new Date().getFullYear(), 11, 31), []);

  // ── Seuil défini par l'admin (lecture seule ici) ──
  useEffect(() => {
    let cancelled = false;
    supabase.from('settings').select('value').eq('key', SETTINGS_KEY_CHARGE).maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const v = parseFloat(data?.value ?? '');
        setChargeThreshold(Number.isFinite(v) && v > 0 ? v : MAX_HOURS_PER_DAY);
      });
    return () => { cancelled = true; };
  }, []);

  // ── Scan : techniciens de l'unité, charge et congés jusqu'au 31 décembre ──
  useEffect(() => {
    let cancelled = false;

    async function loadScan() {
      setLoadingScan(true);
      try {
        // 1) Techniciens de l'unité (repli sur tous les actifs si l'unité est vide)
        // On dégrade progressivement les filtres : certains schémas n'ont pas
        // de colonne `actif`, et une unité peut ne déclarer aucun technicien.
        let techRows: any[] = [];
        let techLoadNote = '';

        const tryLoad = async (build: (q: any) => any) => {
          const { data, error } = await build(
            supabase.from('techniciens').select('id, nom, prenom')
          );
          if (error) { console.warn('techniciens:', error.message); return null; }
          return data || [];
        };

        if (intervention.unite_id != null) {
          techRows = (await tryLoad((q: any) =>
            q.eq('actif', true).eq('unite_id', intervention.unite_id).order('nom'))) || [];
          if (techRows.length === 0) {
            techRows = (await tryLoad((q: any) =>
              q.eq('unite_id', intervention.unite_id).order('nom'))) || [];
          }
        }
        if (techRows.length === 0) {
          techRows = (await tryLoad((q: any) => q.eq('actif', true).order('nom'))) || [];
          if (techRows.length > 0 && intervention.unite_id != null) {
            techLoadNote = "Aucun technicien rattaché à cette unité : toute l'équipe est proposée.";
          }
        }
        if (techRows.length === 0) {
          techRows = (await tryLoad((q: any) => q.order('nom'))) || [];
          if (techRows.length > 0) techLoadNote = 'Le filtre « actif » a été ignoré (colonne absente).';
        }

        // 2) Techniciens déjà affectés à cette intervention
        const { data: ptData } = await supabase
          .from('planning_techniciens').select('technicien_id')
          .eq('planning_id', intervention.id);
        const affectedIds = new Set((ptData || []).map((t: any) => t.technicien_id));

        const techs = techRows.map((t: any) => ({
          id: t.id, nom: t.nom, prenom: t.prenom, isAffecte: affectedIds.has(t.id),
        }));
        const techIds = techs.map(t => t.id);
        const dureeIntervention = (intervention.duree_intervention || 1) + LOGISTICS_H;

        // 3) Jours ouvrés restants
        const { data: holidaysData } = await supabase
          .from('jours_feries').select('date')
          .gte('date', formatISO(new Date())).lte('date', formatISO(scanEndDate));
        const holidayDates = new Set((holidaysData || []).map((h: any) => h.date));

        const candidateDates: string[] = [];
        const cursor = new Date();
        cursor.setHours(0, 0, 0, 0);
        while (cursor < scanEndDate) {
          cursor.setDate(cursor.getDate() + 1);
          const iso = formatISO(cursor);
          const day = cursor.getDay();
          if (day !== 5 && day !== 6 && !holidayDates.has(iso)) candidateDates.push(iso);
        }

        const empty: ReportScan = {
          note: '', techs, candidateDates, chargeParTechParJour: {}, nbInterParTechParJour: {},
          congesParTechParJour: {}, chargeTotaleParTech: {}, dureeIntervention,
        };
        if (candidateDates.length === 0 || techIds.length === 0) {
          if (!cancelled) { setScan(empty); setLoadingScan(false); }
          return;
        }

        const minDate = candidateDates[0];
        const maxDate = candidateDates[candidateDates.length - 1];

        // 4) Charge jour par jour
        const { data: chargeRows } = await supabase
          .from('planning_techniciens')
          .select('technicien_id, duree, planning!inner(id, date_prevue, duree_intervention, statut)')
          .in('technicien_id', techIds)
          .gte('planning.date_prevue', minDate).lte('planning.date_prevue', maxDate)
          .in('planning.statut', ['planifiee', 'en_cours']);

        const chargeParTechParJour: Record<number, Record<string, number>> = {};
        const nbInterParTechParJour: Record<number, Record<string, number>> = {};
        const chargeTotaleParTech: Record<number, number> = {};
        techIds.forEach(id => {
          chargeParTechParJour[id] = {};
          nbInterParTechParJour[id] = {};
          chargeTotaleParTech[id] = 0;
        });

        (chargeRows || []).forEach((r: any) => {
          const date = r.planning?.date_prevue;
          if (!date || !chargeParTechParJour[r.technicien_id]) return;
          if (r.planning?.id === intervention.id) return; // l'intervention reportée va bouger
          const h = r.duree || r.planning?.duree_intervention || 1;
          chargeParTechParJour[r.technicien_id][date] = (chargeParTechParJour[r.technicien_id][date] || 0) + h;
          nbInterParTechParJour[r.technicien_id][date] = (nbInterParTechParJour[r.technicien_id][date] || 0) + 1;
          chargeTotaleParTech[r.technicien_id] += h;
        });

        // 5) Congés
        const { data: congesRows } = await supabase
          .from('conges').select('technicien_id, date_debut, date_fin')
          .in('technicien_id', techIds).lte('date_debut', maxDate).gte('date_fin', minDate);

        const congesParTechParJour: Record<number, Set<string>> = {};
        techIds.forEach(id => { congesParTechParJour[id] = new Set(); });
        const datesSet = new Set(candidateDates);
        (congesRows || []).forEach((c: any) => {
          const dStart = new Date(c.date_debut + 'T00:00:00');
          const dEnd = new Date(c.date_fin + 'T00:00:00');
          for (let d = new Date(dStart); d <= dEnd; d.setDate(d.getDate() + 1)) {
            const iso = formatISO(d);
            if (datesSet.has(iso) && congesParTechParJour[c.technicien_id]) {
              congesParTechParJour[c.technicien_id].add(iso);
            }
          }
        });

        if (!cancelled) {
          setScan({
            techs, candidateDates, chargeParTechParJour, nbInterParTechParJour,
            congesParTechParJour, chargeTotaleParTech, dureeIntervention, note: techLoadNote,
          });
          setLoadingScan(false);
        }
      } catch (err) {
        console.error('Erreur chargement disponibilités:', err);
        if (!cancelled) { setScan(null); setLoadingScan(false); }
      }
    }

    loadScan();
    return () => { cancelled = true; };
  }, [intervention, scanEndDate]);

  // ── ① Disponibilité par date ──
  // L'intervention pèse-t-elle à elle seule plus que le seuil ? Dans ce cas
  // aucune date ne pourrait le respecter : on retient alors les techniciens
  // dont la journée est encore libre, et on le signale explicitement.
  const horsGabarit = scan ? scan.dureeIntervention > chargeThreshold : false;
  const capaciteEffective = horsGabarit && scan ? scan.dureeIntervention : chargeThreshold;

  const datesDispo = useMemo<DateDispo[]>(() => {
    if (!scan) return [];
    const { techs, candidateDates, chargeParTechParJour, congesParTechParJour, dureeIntervention } = scan;
    const nbTotal = techs.length;

    return candidateDates.map(date => {
      let nbDispo = 0;
      let affecteDispo = false;
      techs.forEach(t => {
        const enConge = congesParTechParJour[t.id]?.has(date);
        const charge = chargeParTechParJour[t.id]?.[date] || 0;
        const ok = !enConge && charge + dureeIntervention <= capaciteEffective;
        if (ok) {
          nbDispo++;
          if (t.isAffecte) affecteDispo = true;
        }
      });

      const ratio = nbTotal > 0 ? nbDispo / nbTotal : 0;
      const niveau: DateDispo['niveau'] =
        nbDispo === 0 ? 'impossible'
        : affecteDispo && ratio >= 0.4 ? 'ideal'
        : ratio >= 0.4 ? 'ideal'
        : ratio >= 0.15 ? 'possible' : 'tendu';

      return {
        date,
        dayLabel: formatDateFR(date, { weekday: 'long', day: '2-digit', month: 'long' }),
        nbDispo, nbTotal, affecteDispo, niveau,
      };
    });
  }, [scan, chargeThreshold, capaciteEffective]);

  const datesSelectionnables = useMemo(() => datesDispo.filter(d => d.nbDispo > 0), [datesDispo]);

  // Un changement de date invalide le technicien retenu
  useEffect(() => { setSelectedTechId(null); }, [selectedDate, chargeThreshold]);

  // ── ② Techniciens disponibles à la date retenue ──
  const techsDispo = useMemo<TechDispo[]>(() => {
    if (!scan || !selectedDate) return [];
    const { techs, chargeParTechParJour, nbInterParTechParJour, congesParTechParJour, chargeTotaleParTech, dureeIntervention } = scan;

    return techs.map(t => {
      const enConge = congesParTechParJour[t.id]?.has(selectedDate) || false;
      const chargeJour = chargeParTechParJour[t.id]?.[selectedDate] || 0;
      const chargeApres = chargeJour + dureeIntervention;
      return {
        id: t.id, nom: t.nom, prenom: t.prenom, isAffecte: t.isAffecte,
        chargeJour, chargeApres,
        pct: Math.round((chargeApres / chargeThreshold) * 100),
        nbInterJour: nbInterParTechParJour[t.id]?.[selectedDate] || 0,
        enConge,
        eligible: !enConge && chargeApres <= capaciteEffective,
        chargeTotale: chargeTotaleParTech[t.id] || 0,
      };
    }).sort((a, b) => {
      // Le technicien actuel passe en tête s'il est disponible
      if (a.isAffecte && a.eligible && !(b.isAffecte && b.eligible)) return -1;
      if (b.isAffecte && b.eligible && !(a.isAffecte && a.eligible)) return 1;
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return a.chargeApres - b.chargeApres
        || a.chargeTotale - b.chargeTotale
        || a.nom.localeCompare(b.nom);
    });
  }, [scan, selectedDate, chargeThreshold]);

  const techsFiltres = useMemo(() => {
    if (!techSearch.trim()) return techsDispo;
    const s = techSearch.toLowerCase();
    return techsDispo.filter(t => `${t.prenom} ${t.nom} ${t.nom} ${t.prenom}`.toLowerCase().includes(s));
  }, [techsDispo, techSearch]);

  const techsEligibles = useMemo(() => techsFiltres.filter(t => t.eligible), [techsFiltres]);
  const techsIndispo = useMemo(() => techsFiltres.filter(t => !t.eligible), [techsFiltres]);

  const techActuel = useMemo(() => techsDispo.find(t => t.isAffecte) || null, [techsDispo]);
  const selectedTech = useMemo(() => techsDispo.find(t => t.id === selectedTechId) || null, [techsDispo, selectedTechId]);
  const selectedDateInfo = useMemo(() => datesDispo.find(d => d.date === selectedDate) || null, [datesDispo, selectedDate]);

  // Présélection du technicien actuel dès qu'il est disponible à la date choisie
  useEffect(() => {
    if (step === 'technicien' && selectedTechId === null && techActuel?.eligible) {
      setSelectedTechId(techActuel.id);
    }
  }, [step, selectedTechId, techActuel]);

  // ── Analyse jointe à la demande ──
  const analysis = useMemo<ReportAnalysis | null>(() => {
    if (!selectedTech || !selectedDate) return null;
    const nomComplet = `${selectedTech.prenom} ${selectedTech.nom}`;
    const warnings: string[] = [];
    let niveau: ReportAnalysis['niveau'] = 'none';
    let message = '';

    if (selectedTech.pct <= 50) {
      niveau = 'none';
      message = `✅ ${nomComplet} est largement disponible — charge à ${selectedTech.pct}%`;
    } else if (selectedTech.pct <= 75) {
      niveau = 'low';
      message = `📊 ${nomComplet} peut prendre l'intervention — charge à ${selectedTech.pct}%`;
    } else {
      niveau = 'medium';
      message = `⚡ Journée serrée pour ${nomComplet} — charge à ${selectedTech.pct}%`;
      warnings.push(`Charge à ${selectedTech.pct}% du seuil (${chargeThreshold}h)`);
    }

    warnings.push(
      `${nomComplet} : ${selectedTech.chargeJour.toFixed(1)}h déjà planifiées ce jour-là` +
      ` → ${selectedTech.chargeApres.toFixed(1)}h après report`
    );
    if (selectedTech.nbInterJour > 0) {
      warnings.push(`${selectedTech.nbInterJour} autre(s) intervention(s) le même jour`);
    }
    if (!selectedTech.isAffecte) {
      warnings.push(`Changement de technicien : ${techActuel ? `${techActuel.prenom} ${techActuel.nom} n'est pas disponible` : 'aucun technicien n\'était affecté'}`);
    }

    return {
      chargeJour: selectedTech.chargeApres,
      chargeMax: chargeThreshold,
      technicienNoms: [nomComplet],
      conflitsConges: [],
      niveau, message, warnings,
    };
  }, [selectedTech, selectedDate, chargeThreshold, techActuel]);

  const handleSubmit = () => {
    if (!analysis || !selectedDate || !selectedTech) return;
    onSubmit({
      dateDemandee: selectedDate,
      motif: motif === 'Autre' && motifDetail ? motifDetail : motif,
      technicienId: selectedTech.id,
      technicienNom: `${selectedTech.prenom} ${selectedTech.nom}`,
      analysis,
    });
  };

  const STEPS = ['date', 'technicien', 'motif', 'confirm'] as const;
  const DATES_PREVIEW = 12;

  // ── Bandeau du seuil, en lecture seule ──
  const thresholdBanner = (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-[#e8eefb] rounded-xl">
      <Gauge size={13} className="text-slate-400 shrink-0" />
      <span className="text-[11px] font-semibold text-slate-500">
        Seuil de charge : <strong className="text-slate-700">{chargeThreshold}h / jour / technicien</strong>
      </span>
      <span className="ml-auto text-[10px] font-bold text-slate-400 flex items-center gap-1 shrink-0">
        <Lock size={9} />Réglé par l'admin
      </span>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* HEADER */}
        <div className="bg-gradient-to-br from-amber-500 to-orange-500 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
              <RotateCcw size={22} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-orange-100 uppercase tracking-widest">Demande de report</p>
              <h2 className="text-base font-bold text-white truncate">{intervention.titre}</h2>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <p className="text-xs text-orange-100">Date actuelle : <strong>{formatDateFR(intervention.date_prevue)}</strong></p>
                <p className="text-xs text-orange-100">
                  Durée : <strong>{intervention.duree_intervention || 1}h</strong> + {LOGISTICS_H}h logistique
                </p>
              </div>
            </div>
            <button onClick={onClose} disabled={saving} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded-xl">
              <X size={16} />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2">
            {STEPS.map((s, idx) => (
              <div key={s} className="flex-1">
                <div className={`h-1.5 rounded-full ${STEPS.indexOf(step) >= idx ? 'bg-white' : 'bg-white/20'}`} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-3 text-[10px] text-orange-100 font-semibold flex-wrap">
            <span className={step === 'date' ? 'text-white font-bold' : ''}>① Date</span>
            <span className={step === 'technicien' ? 'text-white font-bold' : ''}>② Technicien</span>
            <span className={step === 'motif' ? 'text-white font-bold' : ''}>③ Motif</span>
            <span className={step === 'confirm' ? 'text-white font-bold' : ''}>④ Confirmation</span>
          </div>
        </div>

        {/* CONTENU */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">

          {/* ── ÉTAPE 1 : DATE ── */}
          {step === 'date' && (
            <div className="space-y-4">
              {thresholdBanner}

              {loadingScan ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <Loader2 size={32} className="text-amber-500 animate-spin" />
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-700">Recherche des dates disponibles…</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Analyse jusqu'au 31 décembre {scanEndDate.getFullYear()}
                    </p>
                  </div>
                </div>
              ) : datesSelectionnables.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-rose-100 flex items-center justify-center">
                    <XCircle size={36} className="text-rose-500" />
                  </div>
                  <div className="text-center max-w-sm">
                    <p className="text-sm font-bold text-slate-700">Aucune date disponible</p>
                    {(scan?.techs.length ?? 0) === 0 ? (
                      <p className="text-xs text-slate-500 mt-2">
                        Aucun technicien n'a pu être chargé. Vérifiez que la table <code>techniciens</code>
                        contient bien des lignes{intervention.unite_id != null ? ' pour cette unité' : ''},
                        et que la colonne <code>actif</code> existe et vaut <code>true</code>.
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500 mt-2">
                        Sur les {scan?.candidateDates.length ?? 0} jours ouvrés restants, aucun des
                        {' '}{scan?.techs.length} technicien(s) ne reste sous {chargeThreshold}h.
                        L'administrateur peut relever le seuil depuis la page des demandes de report.
                      </p>
                    )}
                  </div>

                  {/* Diagnostic chiffré, pour comprendre d'un coup d'œil */}
                  <div className="w-full max-w-sm grid grid-cols-3 gap-2">
                    {[
                      { label: 'Techniciens', value: scan?.techs.length ?? 0 },
                      { label: 'Jours ouvrés', value: scan?.candidateDates.length ?? 0 },
                      { label: 'Poids interv.', value: `${(scan?.dureeIntervention ?? 0).toFixed(1)}h` },
                    ].map(x => (
                      <div key={x.label} className="p-2.5 rounded-xl bg-white border border-slate-200 text-center">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{x.label}</p>
                        <p className="text-sm font-bold text-slate-800 tabular-nums mt-0.5">{x.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {horsGabarit && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                      <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={16} />
                      <div>
                        <p className="text-xs font-bold text-amber-800">
                          Cette intervention dépasse à elle seule le seuil
                        </p>
                        <p className="text-[11px] text-amber-700 mt-0.5">
                          Elle pèse {(scan?.dureeIntervention ?? 0).toFixed(1)}h pour un seuil de {chargeThreshold}h.
                          Aucune date ne peut respecter le seuil : seuls les techniciens dont la journée est
                          encore libre vous sont proposés.
                        </p>
                      </div>
                    </div>
                  )}
                  {scan?.note && (
                    <div className="p-3 bg-[#e8eefb] border border-slate-200 rounded-2xl flex items-start gap-2.5">
                      <Info className="text-slate-500 shrink-0 mt-0.5" size={14} />
                      <p className="text-[11px] text-slate-600">{scan.note}</p>
                    </div>
                  )}
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-start gap-3">
                    <Info className="text-blue-500 shrink-0 mt-0.5" size={16} />
                    <div>
                      <p className="text-xs font-bold text-blue-800">
                        {datesSelectionnables.length} date{datesSelectionnables.length > 1 ? 's' : ''} avec au moins un technicien disponible
                      </p>
                      <p className="text-[11px] text-blue-600 mt-0.5">
                        Choisissez d'abord la date : les techniciens dont la charge reste sous le seuil
                        ce jour-là vous seront ensuite proposés, du moins chargé au plus chargé.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    {(['ideal', 'possible', 'tendu', 'impossible'] as const).map(k => (
                      <div key={k} className="flex items-center gap-1.5 text-[10px]">
                        <div className={`w-2.5 h-2.5 rounded-full ${NIVEAU_DATE[k].dot}`} />
                        <span className={`font-bold ${NIVEAU_DATE[k].text}`}>{NIVEAU_DATE[k].label}</span>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(showAllDates ? datesSelectionnables : datesSelectionnables.slice(0, DATES_PREVIEW)).map(d => {
                      const style = NIVEAU_DATE[d.niveau];
                      const isSel = selectedDate === d.date;
                      const dd = new Date(d.date + 'T00:00:00');
                      return (
                        <button
                          key={d.date}
                          onClick={() => setSelectedDate(d.date)}
                          className={`w-full p-3.5 rounded-2xl text-left transition-all ${
                            isSel
                              ? `${style.bg} border-2 ${style.border} ring-2 ${style.ring} shadow-md`
                              : 'bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 ${isSel ? style.bg : 'bg-slate-50'}`}>
                              <span className={`text-[8px] font-bold uppercase ${isSel ? style.text : 'text-slate-400'}`}>
                                {dd.toLocaleDateString('fr-FR', { month: 'short' })}
                              </span>
                              <span className={`text-lg font-bold leading-none ${isSel ? style.text : 'text-slate-700'}`}>{dd.getDate()}</span>
                              <span className={`text-[8px] font-semibold ${isSel ? style.text : 'text-slate-400'}`}>
                                {dd.toLocaleDateString('fr-FR', { weekday: 'short' })}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-bold ${isSel ? style.text : 'text-slate-700'}`}>{d.dayLabel}</p>
                              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg flex items-center gap-1 ${style.bg} ${style.text}`}>
                                  <Users size={9} />{d.nbDispo}/{d.nbTotal} dispo
                                </span>
                                {d.affecteDispo && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 flex items-center gap-1">
                                    <UserCheck size={9} />Technicien actuel libre
                                  </span>
                                )}
                              </div>
                              <div className="mt-2 h-1.5 bg-[#e8eefb] rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${style.dot}`}
                                  style={{ width: `${Math.max(6, d.nbTotal > 0 ? (d.nbDispo / d.nbTotal) * 100 : 0)}%` }} />
                              </div>
                            </div>
                            <div className="shrink-0 mt-1">
                              {isSel ? <CheckCircle2 size={18} className={style.text} />
                                : <div className="w-5 h-5 rounded-full border-2 border-slate-200" />}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {datesSelectionnables.length > DATES_PREVIEW && (
                    <button
                      type="button"
                      onClick={() => setShowAllDates(v => !v)}
                      className="text-[11px] font-bold text-amber-600 hover:text-amber-700"
                    >
                      {showAllDates ? 'Réduire' : `+ ${datesSelectionnables.length - DATES_PREVIEW} autre(s) date(s)`}
                    </button>
                  )}

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                    <label className="text-[10px] font-bold text-slate-400 uppercase shrink-0">Date précise :</label>
                    <input
                      type="date"
                      value={selectedDate || ''}
                      min={formatISO(new Date())}
                      onChange={e => setSelectedDate(e.target.value || null)}
                      className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-700 bg-white outline-none flex-1 focus:border-amber-400"
                    />
                  </div>
                  {selectedDate && !datesDispo.some(d => d.date === selectedDate) && (
                    <p className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center gap-1.5">
                      <AlertTriangle size={11} />
                      Cette date n'est pas un jour ouvré : aucun technicien ne sera proposé.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── ÉTAPE 2 : TECHNICIEN ── */}
          {step === 'technicien' && selectedDate && (
            <div className="space-y-4">
              {/* Rappel de la date */}
              <div className="p-4 bg-white border-2 border-amber-200 rounded-2xl flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shrink-0">
                  <CalendarCheck size={17} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date retenue</p>
                  <p className="text-sm font-bold text-slate-800 truncate">
                    {formatDateFR(selectedDate, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                  </p>
                  {selectedDateInfo && (
                    <p className="text-[10px] text-slate-500">
                      {selectedDateInfo.nbDispo} technicien(s) sous le seuil sur {selectedDateInfo.nbTotal}
                    </p>
                  )}
                </div>
                <button onClick={() => setStep('date')} className="text-[10px] font-bold text-amber-600 hover:text-amber-700 px-2 py-1 rounded-lg hover:bg-amber-50">
                  Changer
                </button>
              </div>

              {thresholdBanner}

              {/* Sort du technicien actuel */}
              {techActuel && (
                techActuel.eligible ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-2.5">
                    <UserCheck className="text-emerald-500 shrink-0 mt-0.5" size={15} />
                    <p className="text-[11px] text-emerald-700">
                      <strong>{techActuel.prenom} {techActuel.nom}</strong>, déjà affecté, reste sous le seuil à cette date
                      ({techActuel.chargeApres.toFixed(1)}h / {chargeThreshold}h). Il est proposé par défaut.
                    </p>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5">
                    <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={15} />
                    <p className="text-[11px] text-amber-700">
                      <strong>{techActuel.prenom} {techActuel.nom}</strong> ne peut pas prendre cette date
                      {techActuel.enConge
                        ? ' (il est en congé)'
                        : ` (${techActuel.chargeApres.toFixed(1)}h dépasseraient le seuil de ${chargeThreshold}h)`}.
                      Choisissez un autre technicien ci-dessous.
                    </p>
                  </div>
                )
              )}

              {/* Recherche */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                <input
                  type="text" value={techSearch} onChange={e => setTechSearch(e.target.value)}
                  placeholder="Rechercher un technicien…"
                  className="w-full pl-9 pr-4 py-2.5 bg-white rounded-xl border border-slate-200 text-sm text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-amber-200 outline-none"
                />
              </div>

              {techsEligibles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-[#e8eefb] flex items-center justify-center">
                    <Users size={36} className="text-slate-300" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-700">
                      {techSearch ? 'Aucun technicien trouvé' : 'Aucun technicien disponible ce jour-là'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {techSearch ? 'Essayez un autre terme.' : 'Revenez à l\'étape précédente pour choisir une autre date.'}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Disponibles ({techsEligibles.length}) — du moins chargé au plus chargé
                  </p>
                  <div className="space-y-2">
                    {techsEligibles.map((t, idx) => (
                      <TechnicienDispoCard
                        key={t.id} tech={t} rang={idx + 1} seuil={chargeThreshold}
                        selected={selectedTechId === t.id}
                        onSelect={() => setSelectedTechId(t.id)}
                      />
                    ))}
                  </div>
                </>
              )}

              {techsIndispo.length > 0 && (
                <div className="pt-2">
                  <p className="text-[11px] font-bold text-rose-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    Indisponibles ({techsIndispo.length})
                  </p>
                  <div className="space-y-2 opacity-60">
                    {techsIndispo.slice(0, 5).map(t => (
                      <TechnicienDispoCard key={t.id} tech={t} rang={0} seuil={chargeThreshold} selected={false} onSelect={() => {}} disabled />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ÉTAPE 3 : MOTIF ── */}
          {step === 'motif' && selectedDate && selectedTech && (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl border-2 bg-amber-50 border-amber-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shrink-0">
                    <CalendarCheck size={17} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-amber-800">
                      {formatDateFR(selectedDate, { weekday: 'long', day: '2-digit', month: 'long' })}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {selectedTech.prenom} {selectedTech.nom}
                      {selectedTech.isAffecte && ' · technicien actuel'}
                    </p>
                    <p className="text-[10px] text-amber-700 mt-0.5">
                      {selectedTech.chargeApres.toFixed(1)}h / {chargeThreshold}h ({selectedTech.pct}%)
                    </p>
                  </div>
                  <button onClick={() => setStep('technicien')} className="text-[10px] font-bold text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-white">
                    Changer
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  <span className="flex items-center gap-1.5"><MessageSquare size={12} />Motif du report *</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {MOTIFS_REPORT.map(m => (
                    <button
                      key={m} type="button" onClick={() => setMotif(m)}
                      className={`p-3 rounded-xl text-xs font-bold transition-all text-left ${
                        motif === m ? 'bg-amber-500 text-white shadow-md' : 'bg-white text-slate-600 hover:bg-amber-50 border border-slate-200'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                {motif === 'Autre' && (
                  <textarea
                    value={motifDetail} onChange={e => setMotifDetail(e.target.value)}
                    placeholder="Précisez le motif…" rows={3}
                    className="w-full mt-2 px-4 py-3 bg-white rounded-xl border-2 border-slate-200 focus:border-amber-400 outline-none text-sm text-slate-800 resize-none"
                  />
                )}
              </div>
            </div>
          )}

          {/* ── ÉTAPE 4 : CONFIRMATION ── */}
          {step === 'confirm' && analysis && selectedDate && selectedTech && (
            <div className="text-center space-y-4 py-6">
              <div className="w-20 h-20 mx-auto rounded-2xl bg-amber-500 flex items-center justify-center shadow-lg">
                <Send size={32} className="text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Envoyer la demande ?</h3>
                <p className="text-sm text-slate-500 mt-1">
                  L'intervention restera <strong>en attente d'acceptation</strong> jusqu'à la validation de l'administrateur.
                </p>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl text-left space-y-2 max-w-md mx-auto">
                {([
                  ['Intervention', intervention.titre],
                  ['Date actuelle', formatDateFR(intervention.date_prevue)],
                  ['Nouvelle date', formatDateFR(selectedDate, { weekday: 'long', day: '2-digit', month: 'long' })],
                  ['Technicien', `${selectedTech.prenom} ${selectedTech.nom}${selectedTech.isAffecte ? ' (actuel)' : ' (remplacement)'}`],
                  ['Charge après report', `${selectedTech.chargeApres.toFixed(1)}h / ${chargeThreshold}h (${selectedTech.pct}%)`],
                  ['Motif', motif === 'Autre' ? motifDetail : motif],
                ] as Array<[string, string]>).map(([label, value]) => (
                  <div key={label} className="flex justify-between text-xs gap-3">
                    <span className="text-slate-500 shrink-0">{label} :</span>
                    <span className="font-bold text-slate-800 text-right truncate">{value}</span>
                  </div>
                ))}
              </div>

              {analysis.warnings.length > 0 && (
                <div className="p-3 bg-amber-50 rounded-xl text-left max-w-md mx-auto">
                  <ul className="space-y-1">
                    {analysis.warnings.map((w, i) => (
                      <li key={i} className="text-[11px] text-amber-700 flex items-start gap-2">
                        <span>•</span><span>{w}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="px-6 py-4 border-t border-slate-100 bg-white flex items-center justify-between gap-3">
          <button
            onClick={() => {
              if (step === 'date') onClose();
              else if (step === 'technicien') setStep('date');
              else if (step === 'motif') setStep('technicien');
              else setStep('motif');
            }}
            disabled={saving}
            className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 font-semibold disabled:opacity-50"
          >
            {step === 'date' ? 'Annuler' : '← Retour'}
          </button>

          {step === 'date' && (
            <button
              onClick={() => setStep('technicien')}
              disabled={!selectedDate}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              Voir les techniciens <ArrowRight size={14} />
            </button>
          )}
          {step === 'technicien' && (
            <button
              onClick={() => setStep('motif')}
              disabled={!selectedTech}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              Continuer <ArrowRight size={14} />
            </button>
          )}
          {step === 'motif' && (
            <button
              onClick={() => setStep('confirm')}
              disabled={!motif || (motif === 'Autre' && !motifDetail.trim())}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              Continuer <ArrowRight size={14} />
            </button>
          )}
          {step === 'confirm' && (
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <><Loader2 size={14} className="animate-spin" />Envoi…</> : <><Send size={14} />Envoyer la demande</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══ Carte technicien pour une date donnée ═══
export function TechnicienDispoCard({ tech, rang, seuil, selected, onSelect, disabled = false }: {
  tech: TechDispo;
  rang: number;
  seuil: number;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  const rangColor = rang === 1 ? 'bg-emerald-500' : rang === 2 ? 'bg-blue-500' : rang === 3 ? 'bg-amber-500' : 'bg-slate-400';
  const pctColor = tech.pct <= 50 ? 'bg-emerald-500' : tech.pct <= 75 ? 'bg-blue-500' : tech.pct <= 100 ? 'bg-amber-500' : 'bg-rose-500';

  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={`w-full p-4 rounded-2xl text-left transition-all ${
        disabled
          ? 'bg-rose-50 border border-rose-200 cursor-not-allowed'
          : selected
          ? 'bg-amber-50 border-2 border-amber-300 ring-2 ring-amber-200 shadow-md'
          : 'bg-white border border-slate-200 hover:border-amber-200 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl ${disabled ? 'bg-rose-400' : rangColor} flex flex-col items-center justify-center shrink-0 shadow-sm`}>
          {disabled
            ? <Lock size={14} className="text-white" />
            : <>
                <span className="text-[8px] font-bold text-white/80 uppercase leading-none">#{rang}</span>
                <Users size={13} className="text-white mt-0.5" />
              </>}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-sm font-bold ${selected ? 'text-amber-800' : 'text-slate-800'}`}>
              {tech.prenom} {tech.nom}
            </p>
            {tech.isAffecte && (
              <span className="text-[9px] px-2 py-0.5 rounded-lg font-bold bg-blue-100 text-blue-700 flex items-center gap-0.5">
                <UserCheck size={9} />Technicien actuel
              </span>
            )}
            {!disabled && rang === 1 && !tech.isAffecte && (
              <span className="text-[9px] px-2 py-0.5 rounded-lg font-bold bg-emerald-100 text-emerald-700">Moins chargé</span>
            )}
            {tech.enConge && (
              <span className="text-[9px] px-2 py-0.5 rounded-lg font-bold bg-rose-100 text-rose-700">En congé</span>
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg flex items-center gap-1 ${
              tech.pct <= 50 ? 'bg-emerald-50 text-emerald-700'
              : tech.pct <= 75 ? 'bg-blue-50 text-blue-700'
              : tech.pct <= 100 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
            }`}>
              <Gauge size={9} />{tech.chargeApres.toFixed(1)}h / {seuil}h
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-[#e8eefb] text-slate-600 flex items-center gap-1">
              <ClipboardList size={9} />{tech.nbInterJour} interv. ce jour
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-[#e8eefb] text-slate-500 flex items-center gap-1">
              <Activity size={9} />{tech.chargeTotale.toFixed(0)}h au total
            </span>
          </div>

          {disabled ? (
            <p className="text-[10px] text-rose-600 mt-1.5 flex items-center gap-1 font-semibold">
              <AlertTriangle size={9} />
              {tech.enConge ? 'En congé ce jour-là' : `Dépasse le seuil de ${seuil}h`}
            </p>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-[#e8eefb] rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${pctColor}`} style={{ width: `${Math.min(100, Math.max(4, tech.pct))}%` }} />
              </div>
              <span className="text-[9px] font-bold text-slate-400 tabular-nums shrink-0">{tech.pct}%</span>
            </div>
          )}
        </div>

        <div className="shrink-0 mt-1">
          {selected ? <UserCheck size={18} className="text-amber-600" />
            : disabled ? <Lock size={14} className="text-rose-400" />
            : <div className="w-5 h-5 rounded-full border-2 border-slate-200" />}
        </div>
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// TASKS PANEL — panneau de tâches façon page Planning
// ═══════════════════════════════════════════════════════════
export function TasksPanel({ tasks, loading, onOpenTasks, actions, ficheInspection }: {
  tasks: DashboardTache[];
  loading: boolean;
  onOpenTasks: (index?: number) => void;
  actions?: ReactNode;
  ficheInspection?: string | null;
}) {
  const totalTaches = tasks.length;
  const tachesRealisees = tasks.filter(t => t.ok !== null).length;
  const tachesOk = tasks.filter(t => t.ok === true).length;
  const tachesNok = tasks.filter(t => t.ok === false).length;
  const scorePercent = totalTaches > 0 ? Math.round((tachesOk / totalTaches) * 100) : 0;

  const getBubbleStyle = (tache: DashboardTache) => {
    if (tache.ok === true) return 'bg-emerald-500 text-white hover:bg-emerald-600';
    if (tache.ok === false) return 'bg-rose-500 text-white hover:bg-rose-600';
    return 'bg-[#e8eefb] text-slate-500 hover:bg-slate-200';
  };

  if (loading) {
    return (
      <div className="lg:w-[420px] shrink-0 flex items-center justify-center p-8 gap-2 bg-slate-50 border-t lg:border-t-0 border-slate-100">
        <Loader2 size={18} className="text-slate-400 animate-spin" />
        <span className="text-xs text-slate-400">Chargement des tâches…</span>
      </div>
    );
  }

  if (totalTaches === 0) {
    return (
      <div className="lg:w-[420px] shrink-0 p-4 bg-slate-50 border-t lg:border-t-0 border-slate-100 flex flex-col items-center justify-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-[#e8eefb] flex items-center justify-center">
          <FileText size={20} className="text-slate-300" />
        </div>
        <p className="text-xs font-semibold text-slate-400">Aucune tâche configurée</p>
        {ficheInspection && (
          <p className="text-[10px] text-slate-300 truncate max-w-[300px]">Fichier : {ficheInspection}</p>
        )}
        {actions && <div className="w-full">{actions}</div>}
      </div>
    );
  }

  return (
    <div className="lg:w-[420px] shrink-0 p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 border-t lg:border-t-0 border-slate-100 flex flex-col gap-3">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[#0a1930] flex items-center justify-center shadow-sm">
            <ClipboardList size={13} className="text-white" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tâches</p>
            <p className="text-xs font-bold text-slate-700 tabular-nums">{tachesRealisees}/{totalTaches}</p>
          </div>
        </div>
        {tachesRealisees > 0 && (
          <div className={`px-2.5 py-1 rounded-xl text-white text-xs font-bold shadow-sm ${
            scorePercent >= 80 ? 'bg-emerald-500' : scorePercent >= 50 ? 'bg-amber-500' : 'bg-rose-500'
          }`}>{scorePercent}%</div>
        )}
      </div>

      {/* Bulles de tâches */}
      <div className="flex flex-wrap gap-1.5">
        {tasks.map((tache, idx) => (
          <button
            key={tache.id}
            onClick={e => { e.stopPropagation(); onOpenTasks(idx); }}
            className={`w-8 h-8 rounded-lg text-[11px] font-bold flex items-center justify-center transition-all hover:scale-110 active:scale-95 shadow-sm ${getBubbleStyle(tache)}`}
            title={`Tâche ${tache.numero} : ${tache.operation}${tache.ok !== null ? ` — ${tache.ok ? 'OK' : 'NOK'}` : ''}`}
          >
            {tache.ok === true ? <Check size={13} strokeWidth={3} />
              : tache.ok === false ? <X size={13} strokeWidth={3} />
              : <span className="tabular-nums">{tache.numero}</span>}
          </button>
        ))}
      </div>

      {/* Progression */}
      <div className="space-y-2">
        <div className="relative h-2 bg-white rounded-full overflow-hidden shadow-inner">
          <div className="absolute inset-y-0 left-0 flex">
            {tachesOk > 0 && <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-500" style={{ width: `${(tachesOk / totalTaches) * 100}%` }} />}
            {tachesNok > 0 && <div className="h-full bg-gradient-to-r from-rose-400 to-rose-500 transition-all duration-500" style={{ width: `${(tachesNok / totalTaches) * 100}%` }} />}
          </div>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-3 flex-wrap">
            {tachesOk > 0 && <span className="flex items-center gap-1 font-bold text-emerald-600"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{tachesOk} OK</span>}
            {tachesNok > 0 && <span className="flex items-center gap-1 font-bold text-rose-600"><div className="w-1.5 h-1.5 rounded-full bg-rose-500" />{tachesNok} NOK</span>}
            {totalTaches - tachesRealisees > 0 && (
              <span className="flex items-center gap-1 font-bold text-slate-500">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />{totalTaches - tachesRealisees} restant
              </span>
            )}
          </div>
          <button
            onClick={e => { e.stopPropagation(); onOpenTasks(); }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#0a1930] hover:bg-[#2f6690] text-white text-[10px] font-bold transition-all"
          >
            Détails <ArrowRight size={9} />
          </button>
        </div>
      </div>

      {actions && <div className="pt-2 border-t border-slate-200">{actions}</div>}
    </div>
  );
}

// ═══ Dashboard Tasks Detail Modal ═══
export function DashboardTasksDetailModal({ row, initialTaskIndex, onClose, onSaveTasks, canEdit }: {
  row: InterventionWithTasks | null;
  initialTaskIndex?: number;
  onClose: () => void;
  onSaveTasks: (rowId: number, taches: DashboardTache[]) => Promise<void>;
  canEdit: boolean;
}) {
  const [taches, setTaches] = useState<DashboardTache[]>(row?.taches || []);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [motifDrafts, setMotifDrafts] = useState<Record<number, string>>({});
  const [dureeDrafts, setDureeDrafts] = useState<Record<number, string>>({});
  const [initialDrafts, setInitialDrafts] = useState<Record<number, string>>({});

  useEffect(() => {
    if (row?.taches) {
      setTaches(row.taches);
      const md: Record<number, string> = {};
      const dd: Record<number, string> = {};
      const ini: Record<number, string> = {};
      row.taches.forEach(t => {
        md[t.id] = t.motif || '';
        dd[t.id] = t.duree_min ? String(t.duree_min) : '';
        ini[t.id] = t.initial || '';
      });
      setMotifDrafts(md);
      setDureeDrafts(dd);
      setInitialDrafts(ini);
    }
    if (initialTaskIndex !== undefined && row?.taches?.[initialTaskIndex]) {
      setExpandedId(row.taches[initialTaskIndex].id);
    }
  }, [row, initialTaskIndex]);

  if (!row) return null;

  const totalTaches = taches.length;
  const tachesOk = taches.filter(t => t.ok === true).length;
  const tachesNok = taches.filter(t => t.ok === false).length;
  const tachesRealisees = taches.filter(t => t.ok !== null).length;

  const handleSetOk = (tacheId: number, value: boolean) => {
    setTaches(prev => prev.map(t => {
      if (t.id !== tacheId) return t;
      return { ...t, ok: value, motif: value ? '' : (motifDrafts[tacheId] || t.motif) };
    }));
    if (value === false) setExpandedId(tacheId);
  };

  const handleReset = (tacheId: number) => {
    setTaches(prev => prev.map(t => t.id === tacheId ? { ...t, ok: null, motif: '' } : t));
    setMotifDrafts(prev => ({ ...prev, [tacheId]: '' }));
  };

  const handleSave = async () => {
    const nokSansMotif = taches.filter(t => t.ok === false && !((motifDrafts[t.id] || t.motif || '').trim()));
    if (nokSansMotif.length > 0) {
      alert(`Veuillez saisir un motif pour ${nokSansMotif.length} tâche(s) NOK`);
      setExpandedId(nokSansMotif[0].id);
      return;
    }
    setSaving(true);
    try {
      const finalTaches = taches.map(t => ({
        ...t,
        motif: motifDrafts[t.id] ?? t.motif,
        duree_min: dureeDrafts[t.id] ? Number(dureeDrafts[t.id]) : t.duree_min,
        initial: initialDrafts[t.id] ?? t.initial,
      }));
      await onSaveTasks(row.id, finalTaches);
      onClose();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  // Regroupement par sous-équipement
  const grouped = taches.reduce((acc, t) => {
    const key = t.sous_equipement || 'Général';
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {} as Record<string, DashboardTache[]>);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="bg-gradient-to-br from-[#0a1930] to-[#2f6690] px-6 py-5 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-blue-400/20 blur-3xl" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-sm ring-1 ring-white/20 flex items-center justify-center shrink-0">
                <ClipboardList size={20} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-blue-200/80 uppercase tracking-widest mb-0.5">Fiche d'intervention — Tâches</p>
                <h2 className="text-base font-bold text-white truncate">{row.titre}</h2>
                <p className="text-[11px] text-blue-200/60 mt-0.5">
                  {row.date_prevue} · {tachesRealisees}/{totalTaches} traitées
                </p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded-xl shrink-0">
              <X size={16} />
            </button>
          </div>
          <div className="relative mt-3 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="absolute inset-y-0 left-0 flex">
              {tachesOk > 0 && (
                <div className="h-full bg-emerald-400 transition-all duration-500"
                  style={{ width: `${(tachesOk / Math.max(totalTaches, 1)) * 100}%` }} />
              )}
              {tachesNok > 0 && (
                <div className="h-full bg-rose-400 transition-all duration-500"
                  style={{ width: `${(tachesNok / Math.max(totalTaches, 1)) * 100}%` }} />
              )}
            </div>
          </div>
        </div>

        {/* Contenu */}
        <div className="flex-1 overflow-y-auto p-5 bg-slate-50 space-y-2">
          {taches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-20 h-20 rounded-2xl bg-[#e8eefb] flex items-center justify-center">
                <ClipboardList size={32} className="text-slate-300" />
              </div>
              <p className="text-base font-bold text-slate-500">Aucune tâche configurée</p>
            </div>
          ) : (
            Object.entries(grouped).map(([sousEquip, sousTaches]) => (
              <div key={sousEquip} className="d-panel overflow-hidden">
                <div className="px-4 py-2.5 bg-gradient-to-r from-slate-50 to-slate-100/50 border-b border-slate-100 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-[#0a1930] flex items-center justify-center">
                    <ClipboardList size={11} className="text-white" />
                  </div>
                  <p className="text-xs font-bold text-slate-700">{sousEquip}</p>
                  <span className="ml-auto text-[10px] font-bold text-slate-500 tabular-nums">
                    {sousTaches.filter(t => t.ok !== null).length}/{sousTaches.length}
                  </span>
                </div>

                <div className="divide-y divide-slate-100">
                  {sousTaches.map(tache => {
                    const isExpanded = expandedId === tache.id;
                    const currentMotif = motifDrafts[tache.id] ?? tache.motif ?? '';
                    const currentDuree = dureeDrafts[tache.id] ?? (tache.duree_min ? String(tache.duree_min) : '');
                    const currentInitial = initialDrafts[tache.id] ?? tache.initial ?? '';

                    return (
                      <div key={tache.id} className={`transition-all ${
                        tache.ok === true ? 'bg-emerald-50/30' : tache.ok === false ? 'bg-rose-50/30' : ''
                      }`}>
                        <div className="p-3 flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 shadow-sm ${
                            tache.ok === true ? 'bg-emerald-500 text-white'
                            : tache.ok === false ? 'bg-rose-500 text-white'
                            : 'bg-[#e8eefb] text-slate-500'
                          }`}>
                            {tache.ok === true ? <Check size={14} strokeWidth={3} />
                              : tache.ok === false ? <X size={14} strokeWidth={3} />
                              : tache.numero}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold ${
                              tache.ok === true ? 'text-emerald-800'
                              : tache.ok === false ? 'text-rose-800'
                              : 'text-slate-700'
                            }`}>
                              {tache.operation}
                            </p>
                            {tache.ok === false && currentMotif && (
                              <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1">
                                <AlertTriangle size={10} />
                                <span className="font-medium">Motif :</span> {currentMotif}
                              </p>
                            )}
                          </div>

                          {canEdit ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => handleSetOk(tache.id, true)}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                                  tache.ok === true
                                    ? 'bg-emerald-500 text-white shadow-md'
                                    : 'bg-white text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 ring-1 ring-slate-200'
                                }`}>
                                <Check size={12} strokeWidth={3} />OK
                              </button>
                              <button
                                onClick={() => handleSetOk(tache.id, false)}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                                  tache.ok === false
                                    ? 'bg-rose-500 text-white shadow-md'
                                    : 'bg-white text-slate-500 hover:bg-rose-50 hover:text-rose-600 ring-1 ring-slate-200'
                                }`}>
                                <X size={12} strokeWidth={3} />NOK
                              </button>
                              {tache.ok !== null && (
                                <button
                                  onClick={() => handleReset(tache.id)}
                                  className="flex items-center justify-center w-7 h-7 rounded-xl bg-white hover:bg-[#e8eefb] text-slate-400 hover:text-slate-600 ring-1 ring-slate-200 transition-all"
                                  title="Réinitialiser">
                                  <RotateCcw size={11} />
                                </button>
                              )}
                              <button
                                onClick={() => setExpandedId(isExpanded ? null : tache.id)}
                                className={`flex items-center justify-center w-7 h-7 rounded-xl transition-all ${
                                  isExpanded
                                    ? 'bg-[#0a1930] text-white'
                                    : 'bg-white text-slate-400 hover:text-[#0a1930] hover:bg-blue-50 ring-1 ring-slate-200'
                                }`}>
                                <ChevronDown size={12} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              </button>
                            </div>
                          ) : (
                            <span className={`text-[10px] px-2 py-1 rounded-lg font-bold ${
                              tache.ok === true ? 'bg-emerald-100 text-emerald-700'
                              : tache.ok === false ? 'bg-rose-100 text-rose-700'
                              : 'bg-[#e8eefb] text-slate-500'
                            }`}>
                              {tache.ok === true ? 'OK' : tache.ok === false ? 'NOK' : 'En attente'}
                            </span>
                          )}
                        </div>

                        {isExpanded && canEdit && (
                          <div className="px-3 pb-3 pl-14 space-y-2.5 bg-slate-50/50">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                                Motif {tache.ok === false && <span className="text-rose-500">*</span>}
                              </label>
                              <textarea
                                value={currentMotif}
                                onChange={e => setMotifDrafts(prev => ({ ...prev, [tache.id]: e.target.value }))}
                                placeholder={tache.ok === false ? 'Motif obligatoire pour NOK…' : 'Commentaire optionnel…'}
                                rows={2}
                                className={`w-full rounded-xl px-3 py-2 text-sm bg-white outline-none transition-all resize-none ${
                                  tache.ok === false && !currentMotif.trim()
                                    ? 'ring-2 ring-rose-300 focus:ring-rose-400'
                                    : 'ring-1 ring-slate-200 focus:ring-2 focus:ring-[#0a1930]/20'
                                }`}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Durée (min)</label>
                                <input
                                  type="number" min={0} value={currentDuree}
                                  onChange={e => setDureeDrafts(prev => ({ ...prev, [tache.id]: e.target.value }))}
                                  placeholder="Ex: 15"
                                  className="w-full rounded-xl px-3 py-2 text-sm bg-white outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-[#0a1930]/20 tabular-nums"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Initiales</label>
                                <input
                                  type="text" value={currentInitial}
                                  onChange={e => setInitialDrafts(prev => ({ ...prev, [tache.id]: e.target.value.toUpperCase() }))}
                                  placeholder="Ex: JD" maxLength={5}
                                  className="w-full rounded-xl px-3 py-2 text-sm bg-white outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-[#0a1930]/20 uppercase font-bold tracking-wider"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-[11px]">
            <span className="font-bold text-slate-500 tabular-nums">{tachesRealisees}/{totalTaches} traitées</span>
            {tachesNok > 0 && (
              <span className="flex items-center gap-1 font-bold text-rose-600">
                <AlertTriangle size={11} />{tachesNok} NOK
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors">
              {canEdit ? 'Annuler' : 'Fermer'}
            </button>
            {canEdit && (
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 bg-[#0a1930] hover:bg-[#2f6690] text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-all shadow-sm flex items-center gap-2">
                {saving
                  ? <><Loader2 size={14} className="animate-spin" />Enregistrement…</>
                  : <><Check size={14} />Enregistrer</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


// ═══ Feuille de style commune aux pages Dashboard et Clôture ═══
export const DASH_CSS = `
          /* ════════ Charte SETRAM ════════ */
          .dash-root{
            --d-bg:#f0f4ff; --d-panel:#ffffff; --d-line:#e2e8f4;
            --d-text:#0a1930; --d-muted:#44537a;
            --d-accent:#2f6690; --d-accent-dim:#e4edf3;
            --d-navy:#0a1930; --d-gold:#f0b429; --d-cyan:#8fd8ec;
            --d-mono: ui-monospace,"SF Mono","JetBrains Mono",Consolas,monospace;
            background:var(--d-bg);
            color:var(--d-text);
          }

          /* Micro-libellés en mono, signature du portail */
          .d-kicker{
            font-family:var(--d-mono); font-size:10px; font-weight:700;
            letter-spacing:1.4px; text-transform:uppercase;
          }
          .d-mono{ font-family:var(--d-mono); }

          /* Panneau standard */
          .d-panel{
            background:var(--d-panel);
            border:1px solid var(--d-line);
            border-radius:14px;
          }
          .d-panel-hover{ transition:box-shadow .2s ease, transform .2s ease, border-color .2s ease; }
          .d-panel-hover:hover{
            box-shadow:0 18px 38px -22px rgba(10,25,48,.45);
            border-color:#cfdcf0;
            transform:translateY(-2px);
          }

          /* Titre de section à soulignement animé */
          .d-section{ position:relative; display:inline-block; }
          .d-section::after{
            content:""; position:absolute; left:0; bottom:-8px;
            height:3px; width:0; border-radius:3px;
            background:linear-gradient(90deg,var(--d-accent),var(--d-cyan));
            transition:width .8s cubic-bezier(.22,.9,.32,1) .1s;
          }
          .reveal.is-visible .d-section::after, .d-section.is-visible::after{ width:56px; }

          /* Bandeau sombre */
          .d-band{
            position:relative; overflow:hidden;
            background:linear-gradient(135deg,#0a1930 18%,#2f6690 130%);
            border-radius:14px;
          }
          .d-band-dots{
            position:absolute; inset:0; pointer-events:none;
            background-image:radial-gradient(rgba(255,255,255,.08) 1px,transparent 1px);
            background-size:22px 22px;
            -webkit-mask-image:radial-gradient(120% 100% at 12% 15%,#000 30%,transparent 82%);
            mask-image:radial-gradient(120% 100% at 12% 15%,#000 30%,transparent 82%);
          }
          .d-glow{ position:absolute; border-radius:50%; filter:blur(70px); pointer-events:none;
            animation:d-drift 11s ease-in-out infinite; }
          .d-glow-a{ width:300px; height:300px; left:-60px; top:-140px; background:#2f6690; opacity:.5; }
          .d-glow-b{ width:280px; height:280px; right:2%; top:-120px; background:#8fd8ec; opacity:.16; animation-delay:-5s; }
          @keyframes d-drift{ 0%,100%{transform:translate(0,0) scale(1);} 50%{transform:translate(20px,14px) scale(1.09);} }

          /* Pastille pulsée */
          .d-pulse{
            width:7px; height:7px; border-radius:50%; background:var(--d-cyan); flex:none;
            box-shadow:0 0 0 0 rgba(143,216,236,.55);
            animation:d-pulse 2.4s ease-out infinite;
          }
          @keyframes d-pulse{
            0%{ box-shadow:0 0 0 0 rgba(143,216,236,.55); }
            70%{ box-shadow:0 0 0 8px rgba(143,216,236,0); }
            100%{ box-shadow:0 0 0 0 rgba(143,216,236,0); }
          }

          /* Carte navy façon portail, avec balayage lumineux */
          .d-navcard{
            position:relative; overflow:hidden;
            background:linear-gradient(160deg,#0a1930 8%,#2f6690 135%);
            border:1px solid rgba(255,255,255,.12);
            border-radius:14px;
            box-shadow:0 10px 24px -14px rgba(10,25,48,.55);
            transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease;
          }
          .d-navcard::before{
            content:""; position:absolute; inset:0; pointer-events:none;
            background:linear-gradient(115deg,transparent 40%,rgba(255,255,255,.13) 50%,transparent 60%);
            background-size:220% 220%; background-position:120% 120%;
            transition:background-position .75s ease;
          }
          .d-navcard:hover{
            transform:translateY(-3px);
            box-shadow:0 24px 44px -18px rgba(10,25,48,.7);
            border-color:var(--d-cyan);
          }
          .d-navcard:hover::before{ background-position:-20% -20%; }

          /* Bouton or */
          .d-gold{
            background:var(--d-gold); color:#0a1930; font-weight:700;
            box-shadow:0 12px 22px -12px rgba(240,180,41,.8);
            transition:background .15s, transform .15s;
          }
          .d-gold:hover{ background:#e0a418; transform:translateY(-1px); }

          /* Apparition au défilement */
          .reveal{ opacity:0; transform:translateY(18px);
            transition:opacity .55s ease, transform .55s ease; }
          .reveal.is-visible{ opacity:1; transform:none; }

          /* Barre de progression striée */
          .d-stripe{
            background-image:linear-gradient(45deg,rgba(255,255,255,.22) 25%,transparent 25%,
              transparent 50%,rgba(255,255,255,.22) 50%,rgba(255,255,255,.22) 75%,transparent 75%);
            background-size:14px 14px;
            animation:d-stripe 1.1s linear infinite;
          }
          @keyframes d-stripe{ from{background-position:0 0;} to{background-position:14px 0;} }

          /* Onglets */
          .d-tab{ position:relative; transition:color .15s ease; }
          .d-tab::after{
            content:""; position:absolute; left:8px; right:8px; bottom:0;
            height:3px; border-radius:3px 3px 0 0;
            background:linear-gradient(90deg,var(--d-accent),var(--d-cyan));
            transform:scaleX(0); transform-origin:left; transition:transform .25s ease;
          }
          .d-tab.is-active::after{ transform:scaleX(1); }

          /* Scrollbars discrètes */
          .dash-root ::-webkit-scrollbar{ width:9px; height:9px; }
          .dash-root ::-webkit-scrollbar-thumb{ background:#c9d6ec; border-radius:6px; }
          .dash-root ::-webkit-scrollbar-thumb:hover{ background:#a9bcdc; }
          .dash-root ::-webkit-scrollbar-track{ background:transparent; }

          @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
          .shimmer { animation: shimmer 2.5s ease-in-out infinite; }

          @media (prefers-reduced-motion: reduce){
            .reveal{ opacity:1; transform:none; transition:none; }
            .d-glow, .d-pulse, .d-stripe{ animation:none; }
          }
        `;