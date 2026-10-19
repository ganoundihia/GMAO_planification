// pages/GestionConges.tsx
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Calendar, UserX, Search, AlertTriangle, CheckCircle2,
  ChevronDown, ArrowRight, Save, RotateCcw,
  Clock, Loader2, Info, UserCheck, CalendarDays, RefreshCw,
  AlertOctagon, X, Filter, Users, ArrowLeft, Sparkles, Target,
  Building2, Briefcase, FileText, ChevronsUpDown, CheckSquare,
  Square, Check, ListChecks, Zap, GitMerge, Upload, Download,
  Edit3, FileSpreadsheet, ChevronUp, AlertCircle, Shield,
  TrendingUp, BarChart3, Activity, Lock
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Unite, Atelier } from '../lib/types';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
interface Technicien {
  id: number; nom: string; prenom: string; nom_complet: string;
  unite_id: number; atelier_id: number | null;
  atelier_code: string; atelier_nom: string;
  specialite: string | null; email: string | null;
}
interface TechCharge {
  tech: Technicien;
  heuresExistantes: number;
  heuresAssignees: number;
  chargeMaxHeures: number;
  estSature: boolean;
  heuresParJour: number;
}
interface InterventionImpactee {
  planning: any;
  techIdsActuels: number[];
  techNomActuels: string[];
  techIdsNouveaux: number[];
  techNomNouveaux: string[];
  modified: boolean;
}
interface CongeExistant {
  id: number;
  technicien_id: number;
  date_debut: string;
  date_fin: string;
  motif: string;
  jours_ouvrables: number;
}
interface CongeRecord {
  id: number;
  technicien_id: number;
  unite_id: number;
  date_debut: string;
  date_fin: string;
  motif: string;
  created_at: string;
  technicien?: { nom: string; prenom: string; atelier_code?: string };
}
interface ImportRow {
  nom_complet: string;
  date_debut: string;
  date_fin: string;
  motif: string;
  matched_tech: Technicien | null;
  status: 'ok' | 'unmatched' | 'error' | 'duplicate';
  error_msg?: string;
}

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────
const CONGE_ANNUEL_MAX_JOURS = 22;
const CHARGE_MAX_HEURES_DEFAULT = 8;

const ATELIER_COLORS: Record<string, string> = {
  CFA: 'bg-red-50 text-red-700 border-red-200',
  CFO: 'bg-blue-50 text-blue-700 border-blue-200',
  VOIE: 'bg-amber-50 text-amber-700 border-amber-200',
  LAC: 'bg-purple-50 text-purple-700 border-purple-200',
  BO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  BIL: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  MR: 'bg-orange-50 text-orange-700 border-orange-200',
};
const ATELIER_GRADIENTS: Record<string, string> = {
  CFA: 'from-red-500 to-rose-600',
  CFO: 'from-blue-500 to-indigo-600',
  VOIE: 'from-amber-500 to-orange-600',
  LAC: 'from-purple-500 to-violet-600',
  BO: 'from-emerald-500 to-green-600',
  BIL: 'from-cyan-500 to-blue-600',
  MR: 'from-orange-500 to-amber-600',
};
const MOTIFS = [
  { value: 'Congé annuel', icon: '🌴', color: 'from-emerald-500 to-teal-600' },
  { value: 'Congé maladie', icon: '🏥', color: 'from-red-500 to-rose-600' },
  { value: 'Congé exceptionnel', icon: '⭐', color: 'from-amber-500 to-orange-600' },
  { value: 'Formation', icon: '🎓', color: 'from-blue-500 to-indigo-600' },
  { value: 'Mission', icon: '🚀', color: 'from-violet-500 to-purple-600' },
  { value: 'Autre', icon: '📋', color: 'from-slate-500 to-slate-600' },
];

// ─────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────
function formatDateFR(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function getDaysBetween(d: string, f: string): number {
  if (!d || !f) return 0;
  return Math.ceil((new Date(f + 'T00:00:00').getTime() - new Date(d + 'T00:00:00').getTime()) / 86400000) + 1;
}
function getWorkingDays(d: string, f: string): number {
  if (!d || !f) return 0;
  let c = 0;
  const cur = new Date(d + 'T00:00:00');
  const end = new Date(f + 'T00:00:00');
  while (cur <= end) { const day = cur.getDay(); if (day !== 5 && day !== 6) c++; cur.setDate(cur.getDate() + 1); }
  return c;
}
function parseExcelDate(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') {
    const m1 = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m1) return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  }
  if (typeof val === 'number') {
    const date = new Date((val - 25569) * 86400 * 1000);
    return date.toISOString().split('T')[0];
  }
  return '';
}
function atelierBadge(code: string) {
  const cls = ATELIER_COLORS[code] || 'bg-slate-50 text-slate-700 border-slate-200';
  return `inline-flex items-center text-[10px] px-2 py-0.5 rounded-lg font-bold border ${cls}`;
}

// ─────────────────────────────────────────────────────────────
// ANIMATED NUMBER
// ─────────────────────────────────────────────────────────────
function AnimatedNumber({ value, className = '' }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start: number | null = null;
    const ease = (t: number) => 1 - Math.pow(1 - t, 4);
    const to = value;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / 800, 1);
      setDisplay(Math.floor(to * ease(p)));
      if (p < 1) requestAnimationFrame(step); else setDisplay(to);
    };
    requestAnimationFrame(step);
  }, [value]);
  return <span className={className}>{display}</span>;
}

// ─────────────────────────────────────────────────────────────
// FORM COMPONENTS
// ─────────────────────────────────────────────────────────────
function FloatingInput({ label, value, onChange, type = 'text', required = false, icon: Icon, min, error, hint }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean; icon?: any; min?: string; error?: string; hint?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className={`relative bg-white border rounded-xl transition-all ${error ? 'border-red-300 ring-2 ring-red-100' : focused ? 'border-blue-400 ring-2 ring-blue-100 shadow-sm' : 'border-slate-200 hover:border-slate-300'}`}>
        {Icon && <div className={`absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none ${focused ? 'text-blue-500' : 'text-slate-400'}`}><Icon size={15} /></div>}
        <input type={type} value={value} min={min} onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          className={`w-full bg-transparent outline-none text-sm text-slate-800 ${Icon ? 'pl-10' : 'pl-4'} pr-4 py-3`} />
      </div>
      {error && <p className="mt-1.5 text-[11px] text-red-600 font-semibold flex items-center gap-1"><AlertTriangle size={10} />{error}</p>}
      {hint && !error && <p className="mt-1.5 text-[11px] text-slate-400 flex items-center gap-1"><Info size={10} />{hint}</p>}
    </div>
  );
}
function FloatingSelect({ label, value, onChange, options, required = false, icon: Icon, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; required?: boolean; icon?: any; placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.08em] mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className={`relative bg-white border rounded-xl transition-all ${focused ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'}`}>
        {Icon && <div className={`absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none ${focused ? 'text-blue-500' : 'text-slate-400'}`}><Icon size={15} /></div>}
        <select value={value} onChange={e => onChange(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          className={`w-full bg-transparent outline-none text-sm appearance-none cursor-pointer ${value ? 'text-slate-800' : 'text-slate-400'} ${Icon ? 'pl-10' : 'pl-4'} pr-10 py-3`}>
          <option value="">{placeholder || 'Sélectionner...'}</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronsUpDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-300" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CHARGE BAR
// ─────────────────────────────────────────────────────────────
function ChargeBar({ current, assigned, max }: { current: number; assigned: number; max: number }) {
  const total = current + assigned;
  const pctBase = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const pctAssigned = max > 0 ? Math.min((assigned / max) * 100, Math.max(0, 100 - pctBase)) : 0;
  const isFull = total >= max;
  const isNear = total >= max * 0.8;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className={`font-bold ${isFull ? 'text-red-600' : isNear ? 'text-amber-600' : 'text-slate-500'}`}>
          {total.toFixed(1)}h / {max}h
        </span>
        {isFull && <span className="flex items-center gap-0.5 text-red-600 font-black text-[9px]"><Lock size={8} />SATURÉ</span>}
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
        <div className={`h-full transition-all rounded-l-full ${isFull ? 'bg-red-500' : isNear ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${pctBase}%` }} />
        {assigned > 0 && <div className="h-full bg-indigo-400 opacity-70 transition-all" style={{ width: `${pctAssigned}%` }} />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TECH CHARGE PICKER
// ─────────────────────────────────────────────────────────────
function TechChargePicker({ techCharges, onSelect, selectedId, label }: {
  techCharges: TechCharge[]; onSelect: (t: Technicien) => void; selectedId?: number; label?: string;
}) {
  const [search, setSearch] = useState('');
  const [filterAt, setFilterAt] = useState('');
  const atelierList = useMemo(() => Array.from(new Set(techCharges.map(tc => tc.tech.atelier_code))).sort(), [techCharges]);
  const filtered = useMemo(() => {
    let list = techCharges;
    if (filterAt) list = list.filter(tc => tc.tech.atelier_code === filterAt);
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(tc => tc.tech.nom_complet.toLowerCase().includes(q) || tc.tech.atelier_code.toLowerCase().includes(q)); }
    return list;
  }, [techCharges, search, filterAt]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <TrendingUp size={13} className="text-indigo-500" />
        <p className="text-xs font-bold text-slate-700 flex-1">{label || 'Choisir un remplaçant'}</p>
        <span className="text-[10px] text-slate-400 flex items-center gap-1"><BarChart3 size={9} />Trié par charge ↑</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setFilterAt('')} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${!filterAt ? 'bg-slate-800 text-white border-transparent' : 'bg-white text-slate-500 border-slate-200'}`}>
          Tous ({techCharges.length})
        </button>
        {atelierList.map(code => (
          <button key={code} onClick={() => setFilterAt(code === filterAt ? '' : code)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all relative overflow-hidden ${filterAt === code ? 'text-white border-transparent' : `${ATELIER_COLORS[code] || 'bg-white border-slate-200'}`}`}>
            {filterAt === code && <div className={`absolute inset-0 bg-gradient-to-r ${ATELIER_GRADIENTS[code] || 'from-slate-500 to-slate-600'}`} />}
            <span className="relative">{code}</span>
          </button>
        ))}
      </div>
      <div className="relative">
        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtrer..."
          className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none" />
      </div>
      <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
        {filtered.length === 0 && <div className="text-center py-6 text-xs text-slate-400">Aucun technicien disponible</div>}
        {filtered.map(tc => {
          const isSel = tc.tech.id === selectedId;
          const isSat = tc.estSature;
          return (
            <button key={tc.tech.id} onClick={() => !isSat && onSelect(tc.tech)} disabled={isSat}
              className={`w-full p-3 rounded-xl border-2 text-left transition-all ${isSat ? 'border-red-100 bg-red-50/50 opacity-60 cursor-not-allowed' : isSel ? 'border-indigo-400 bg-indigo-50 shadow-md' : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-sm active:scale-[0.99]'}`}>
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${ATELIER_GRADIENTS[tc.tech.atelier_code] || 'from-slate-400 to-slate-500'} flex items-center justify-center text-white text-[10px] font-black shadow-sm shrink-0`}>
                  {tc.tech.prenom[0]}{tc.tech.nom[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-[12px] font-bold truncate ${isSat ? 'text-slate-400' : isSel ? 'text-indigo-900' : 'text-slate-800'}`}>{tc.tech.nom_complet}</p>
                    <span className={atelierBadge(tc.tech.atelier_code)}>{tc.tech.atelier_code}</span>
                  </div>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${tc.heuresParJour >= tc.chargeMaxHeures ? 'bg-red-100 text-red-600' : tc.heuresParJour >= tc.chargeMaxHeures * 0.7 ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                    {tc.heuresParJour.toFixed(1)}h/jour
                  </span>
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  {isSat && <span className="text-[9px] font-black px-2 py-0.5 bg-red-100 text-red-600 border border-red-200 rounded-full flex items-center gap-0.5"><Lock size={8} />Saturé</span>}
                  {tc.heuresAssignees > 0 && !isSat && <span className="text-[9px] font-bold px-2 py-0.5 bg-indigo-100 text-indigo-600 border border-indigo-200 rounded-full">+{tc.heuresAssignees.toFixed(1)}h</span>}
                  {isSel && !isSat && <Check size={14} className="text-indigo-500" />}
                </div>
              </div>
              <ChargeBar current={tc.heuresExistantes} assigned={tc.heuresAssignees} max={tc.chargeMaxHeures} />
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-4 flex-wrap text-[10px] text-slate-400">
        <div className="flex items-center gap-1"><div className="w-3 h-1.5 rounded-full bg-blue-500" /><span>Existante</span></div>
        <div className="flex items-center gap-1"><div className="w-3 h-1.5 rounded-full bg-indigo-400 opacity-70" /><span>Assignée</span></div>
        <div className="flex items-center gap-1"><div className="w-3 h-1.5 rounded-full bg-red-500" /><span>Saturé</span></div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// REPLACEMENT MODE CARD
// ─────────────────────────────────────────────────────────────
function ReplacementModeCard({ mode, setMode, onResetSelection }: {
  mode: 'quick' | 'selective'; setMode: (m: 'quick' | 'selective') => void; onResetSelection: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-3"><GitMerge size={14} className="text-indigo-500" /><p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.08em]">Mode de réaffectation</p></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <button onClick={() => { setMode('quick'); onResetSelection(); }} className={`group p-4 rounded-xl text-left border-2 transition-all active:scale-[0.98] ${mode === 'quick' ? 'border-indigo-400 bg-indigo-50/50 shadow-md ring-2 ring-indigo-100' : 'border-slate-200 bg-white hover:border-indigo-200'}`}>
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shrink-0 ${mode === 'quick' ? 'scale-110' : 'group-hover:scale-110'} transition-transform`}><Zap size={16} className="text-white" /></div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-bold ${mode === 'quick' ? 'text-indigo-900' : 'text-slate-800'}`}>Remplacement rapide</p>
              <p className="text-[11px] text-slate-500 mt-0.5">1 remplaçant → toutes (dans la limite de charge)</p>
            </div>
            {mode === 'quick' && <CheckCircle2 size={16} className="text-indigo-500 shrink-0" />}
          </div>
        </button>
        <button onClick={() => { setMode('selective'); onResetSelection(); }} className={`group p-4 rounded-xl text-left border-2 transition-all active:scale-[0.98] ${mode === 'selective' ? 'border-violet-400 bg-violet-50/50 shadow-md ring-2 ring-violet-100' : 'border-slate-200 bg-white hover:border-violet-200'}`}>
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md shrink-0 ${mode === 'selective' ? 'scale-110' : 'group-hover:scale-110'} transition-transform`}><ListChecks size={16} className="text-white" /></div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-bold ${mode === 'selective' ? 'text-violet-900' : 'text-slate-800'}`}>Remplacement sélectif</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Choisir manuellement par intervention</p>
            </div>
            {mode === 'selective' && <CheckCircle2 size={16} className="text-violet-500 shrink-0" />}
          </div>
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// INTERVENTIONS TABLE
// ─────────────────────────────────────────────────────────────
function InterventionsTable({ interventions, selectedTech, ateliers, techCharges, mode, selectedIntervIds, onToggleInterv, onSelectAll, onDeselectAll, quickRemplacant, onRemoveRemplacant, onAddRemplacant }: {
  interventions: InterventionImpactee[]; selectedTech: Technicien | null; ateliers: Atelier[];
  techCharges: TechCharge[]; mode: 'quick' | 'selective'; selectedIntervIds: Set<string>;
  onToggleInterv: (id: string) => void; onSelectAll: () => void; onDeselectAll: () => void;
  quickRemplacant: Technicien | null; onRemoveRemplacant: (idx: number, techId: number) => void;
  onAddRemplacant: (idx: number, tech: Technicien) => void;
}) {
  const allSelected = interventions.length > 0 && interventions.every(i => selectedIntervIds.has(i.planning.id));
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-blue-50/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {mode === 'selective' && (
            <>
              <button onClick={allSelected ? onDeselectAll : onSelectAll} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all active:scale-95 ${allSelected ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                {allSelected ? <CheckSquare size={12} /> : <Square size={12} />}{allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
              </button>
              {selectedIntervIds.size > 0 && <span className="text-[11px] text-indigo-600 font-bold">{selectedIntervIds.size}/{interventions.length}</span>}
            </>
          )}
        </div>
        {mode === 'quick' && quickRemplacant && <div className="flex items-center gap-1.5 text-[11px] text-indigo-600 font-bold"><Zap size={11} />→ {quickRemplacant.nom_complet}</div>}
      </div>
      <div className="max-h-[520px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-gradient-to-r from-slate-50 to-blue-50/30 z-10 border-b border-slate-100">
            <tr>
              {mode === 'selective' && <th className="px-3 py-2.5 w-10" />}
              {['Date', 'Titre', 'Atelier', 'Durée', 'Actuels', 'Remplaçant(s)', 'État'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left font-bold text-slate-400 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {interventions.map((item, idx) => {
              const nbR = item.techIdsNouveaux.length;
              const isRowSelected = selectedIntervIds.has(item.planning.id);
              const duree = item.planning.duree_intervention || 1;
              return (
                <tr key={item.planning.id}
                  className={`transition-colors hover:bg-blue-50/20 ${mode === 'selective' && isRowSelected ? 'bg-indigo-50/50' : ''} ${nbR === 0 ? 'bg-red-50/30' : item.modified ? 'bg-emerald-50/20' : ''}`}
                  onClick={() => mode === 'selective' && onToggleInterv(item.planning.id)}
                  style={{ cursor: mode === 'selective' ? 'pointer' : 'default' }}>
                  {mode === 'selective' && (
                    <td className="px-3 py-2.5">
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${isRowSelected ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300'}`}>
                        {isRowSelected && <Check size={11} className="text-white" strokeWidth={3} />}
                      </div>
                    </td>
                  )}
                  <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap">{formatDateFR(item.planning.date_prevue)}</td>
                  <td className="px-3 py-2.5 font-semibold text-slate-800 max-w-[160px] truncate" title={item.planning.titre}>{item.planning.titre}</td>
                  <td className="px-3 py-2.5">
                    <span className={atelierBadge(ateliers.find(a => a.id === item.planning.atelier_id)?.code || '')}>
                      {ateliers.find(a => a.id === item.planning.atelier_id)?.code || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-bold text-emerald-600">{duree}h</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {item.techNomActuels.map((nom, j) => (
                        <span key={j} className={`text-[10px] px-2 py-0.5 rounded-lg font-bold border ${item.techIdsActuels[j] === selectedTech?.id ? 'bg-red-50 text-red-700 line-through border-red-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{nom}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    <div className="flex flex-wrap items-center gap-1">
                      {item.techNomNouveaux.map((nom, j) => {
                        const ci = techCharges.find(tc => tc.tech.id === item.techIdsNouveaux[j]);
                        return (
                          <span key={j} className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg font-bold border ${ci?.estSature ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                            {nom}<span className="text-[8px] opacity-60">({(ci ? ci.heuresExistantes + ci.heuresAssignees : 0).toFixed(0)}h)</span>
                            {mode === 'selective' && (
                              <button onClick={e => { e.stopPropagation(); onRemoveRemplacant(idx, item.techIdsNouveaux[j]); }} className="text-emerald-500 hover:text-red-600 transition-colors"><X size={9} /></button>
                            )}
                          </span>
                        );
                      })}
                      {mode === 'selective' && (
                        <select defaultValue="" onChange={e => {
                          const tc = techCharges.find(c => c.tech.id === Number(e.target.value));
                          if (tc && !tc.estSature) { onAddRemplacant(idx, tc.tech); e.currentTarget.value = ''; }
                        }} onClick={e => e.stopPropagation()} className="text-[10px] border border-dashed border-indigo-300 rounded-lg px-2 py-1 bg-white text-indigo-600 cursor-pointer hover:bg-indigo-50 font-bold">
                          <option value="">＋ Ajouter</option>
                          {techCharges.filter(tc => !item.techIdsNouveaux.includes(tc.tech.id)).map(tc => (
                            <option key={tc.tech.id} value={tc.tech.id} disabled={tc.estSature}>
                              {tc.estSature ? '🔒 ' : ''}{tc.tech.nom_complet} [{tc.tech.atelier_code}] ({(tc.heuresExistantes + tc.heuresAssignees).toFixed(0)}h/{tc.chargeMaxHeures}h)
                            </option>
                          ))}
                        </select>
                      )}
                      {mode === 'quick' && !nbR && <span className="text-[9px] text-red-400 italic">En attente</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center whitespace-nowrap">
                    {nbR === 0 ? <span className="text-[10px] px-2 py-0.5 rounded-lg bg-red-100 text-red-700 border border-red-200 font-bold">⚠ Vide</span>
                      : item.modified ? <span className="text-[10px] px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold">✅ OK</span>
                        : <span className="text-[10px] text-slate-400">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// IMPORT PREVIEW TABLE
// ─────────────────────────────────────────────────────────────
function ImportPreviewTable({ rows }: { rows: ImportRow[] }) {
  const counts = {
    ok: rows.filter(r => r.status === 'ok').length,
    unmatched: rows.filter(r => r.status === 'unmatched').length,
    error: rows.filter(r => r.status === 'error').length,
    duplicate: rows.filter(r => r.status === 'duplicate').length,
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {[
          { v: counts.ok, l: 'OK', c: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
          { v: counts.unmatched, l: 'Non trouvés', c: 'bg-amber-50 border-amber-200 text-amber-700' },
          { v: counts.duplicate, l: 'Doublons', c: 'bg-blue-50 border-blue-200 text-blue-700' },
          { v: counts.error, l: 'Erreurs', c: 'bg-red-50 border-red-200 text-red-700' },
        ].map(s => (
          <div key={s.l} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[11px] font-bold ${s.c}`}>
            <span className="text-lg font-black">{s.v}</span><span className="opacity-80">{s.l}</span>
          </div>
        ))}
      </div>
      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="max-h-[360px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-100 z-10">
              <tr>
                {['#', 'Nom (fichier)', 'Technicien trouvé', 'Atelier', 'Début', 'Fin', 'Jours ouv.', 'Motif', 'Statut'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-bold text-slate-400 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((row, idx) => {
                const jours = row.date_debut && row.date_fin && row.date_debut <= row.date_fin ? getWorkingDays(row.date_debut, row.date_fin) : 0;
                return (
                  <tr key={idx} className={`transition-colors ${row.status === 'ok' ? 'bg-emerald-50/30 hover:bg-emerald-50/60' : row.status === 'duplicate' ? 'bg-blue-50/30 hover:bg-blue-50/60' : row.status === 'error' ? 'bg-red-50/30 hover:bg-red-50/60' : 'bg-amber-50/30 hover:bg-amber-50/60'}`}>
                    <td className="px-3 py-2 text-slate-400 font-mono">{idx + 1}</td>
                    <td className="px-3 py-2 font-semibold text-slate-800 max-w-[130px] truncate" title={row.nom_complet}>{row.nom_complet}</td>
                    <td className="px-3 py-2">
                      {row.matched_tech ? <span className="font-bold text-emerald-700">{row.matched_tech.nom_complet}</span> : <span className="text-amber-600 italic text-[10px]">Non trouvé</span>}
                    </td>
                    <td className="px-3 py-2">
                      {row.matched_tech ? <span className={atelierBadge(row.matched_tech.atelier_code)}>{row.matched_tech.atelier_code}</span> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">{formatDateFR(row.date_debut)}</td>
                    <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">{formatDateFR(row.date_fin)}</td>
                    <td className="px-3 py-2">
                      {jours > 0 ? <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">{jours}j</span> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1">
                        <span className="text-sm">{MOTIFS.find(m => m.value === row.motif)?.icon || '📋'}</span>
                        <span className="truncate max-w-[80px]">{row.motif}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {row.status === 'ok' && <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg font-bold"><Check size={9} />OK</span>}
                      {row.status === 'duplicate' && <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 border border-blue-200 rounded-lg font-bold"><AlertCircle size={9} />Doublon</span>}
                      {row.status === 'error' && <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-red-100 text-red-700 border border-red-200 rounded-lg font-bold" title={row.error_msg}><X size={9} />{row.error_msg || 'Erreur'}</span>}
                      {row.status === 'unmatched' && <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded-lg font-bold"><AlertTriangle size={9} />Introuvable</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function GestionConges() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  // ── Data ──
  const [unites, setUnites] = useState<Unite[]>([]);
  const [ateliers, setAteliers] = useState<Atelier[]>([]);
  const [techniciens, setTechniciens] = useState<Technicien[]>([]);
  const [selectedUnite, setSelectedUnite] = useState('');
  const [congesHistory, setCongesHistory] = useState<CongeRecord[]>([]);

  // ── Sélection technicien ──
  const [filterAtelier, setFilterAtelier] = useState('');
  const [searchTech, setSearchTech] = useState('');
  const [selectedTech, setSelectedTech] = useState<Technicien | null>(null);

  // ── Congés du technicien sélectionné ──
  const [congesTech, setCongesTech] = useState<CongeExistant[]>([]);
  const [loadingCongesTech, setLoadingCongesTech] = useState(false);
  const [editingCongeId, setEditingCongeId] = useState<number | null>(null);

  // ── Formulaire congé ──
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [motif, setMotif] = useState('Congé annuel');

  // ── Interventions ──
  const [interventions, setInterventions] = useState<InterventionImpactee[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [replacementMode, setReplacementMode] = useState<'quick' | 'selective'>('quick');
  const [quickRemplacant, setQuickRemplacant] = useState<Technicien | null>(null);
  const [selectedIntervIds, setSelectedIntervIds] = useState<Set<string>>(new Set());
  const [applyingAll, setApplyingAll] = useState(false);
  const [chargeMaxHeures, setChargeMaxHeures] = useState(CHARGE_MAX_HEURES_DEFAULT);
  const [sessionAssignedHeures, setSessionAssignedHeures] = useState<Record<number, number>>({});
  const [existingLoadHeures, setExistingLoadHeures] = useState<Record<number, number>>({});

  // ── Steps / UI ──
  type Step = 'declaration' | 'interventions' | 'confirmation' | 'done';
  const [step, setStep] = useState<Step>('declaration');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<'declaration' | 'import'>('declaration');

  // ── Import ──
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const effectiveUniteId = isAdmin ? selectedUnite : (profile?.unite_id ? String(profile.unite_id) : '');
  const currentYear = new Date().getFullYear();

  // ── Load data ──
  useEffect(() => {
    Promise.all([
      supabase.from('unites').select('*').order('code'),
      supabase.from('ateliers').select('*').order('code'),
    ]).then(([{ data: u }, { data: a }]) => {
      if (u) setUnites(u);
      if (a) setAteliers(a);
    });
  }, []);

  useEffect(() => {
    if (!effectiveUniteId) { setTechniciens([]); return; }
    supabase.from('techniciens')
      .select(`id, nom, prenom, unite_id, atelier_id, specialite, email, ateliers(code, nom)`)
      .eq('unite_id', Number(effectiveUniteId)).order('nom')
      .then(({ data }) => {
        if (data) setTechniciens(data.map((t: any) => ({
          id: t.id, nom: t.nom, prenom: t.prenom, nom_complet: `${t.prenom} ${t.nom}`.trim(),
          unite_id: t.unite_id, atelier_id: t.atelier_id,
          atelier_code: t.ateliers?.code || '—', atelier_nom: t.ateliers?.nom || '—',
          specialite: t.specialite, email: t.email,
        })));
      });
  }, [effectiveUniteId]);

  // ── Load history ──
  const loadHistory = useCallback(async () => {
    if (!effectiveUniteId) return;
    const { data, error: err } = await supabase
      .from('conges')
      .select('id, technicien_id, unite_id, date_debut, date_fin, motif, created_at, techniciens(nom, prenom, ateliers(code))')
      .eq('unite_id', Number(effectiveUniteId))
      .order('created_at', { ascending: false })
      .limit(200);

    if (err) { console.error('loadHistory error:', err.message, err.code); return; }
    if (data) {
      setCongesHistory(data.map((c: any) => ({
        id: c.id,
        technicien_id: c.technicien_id,
        unite_id: c.unite_id,
        date_debut: c.date_debut,
        date_fin: c.date_fin,
        motif: c.motif,
        created_at: c.created_at,
        technicien: {
          nom: c.techniciens?.nom || '',
          prenom: c.techniciens?.prenom || '',
          atelier_code: c.techniciens?.ateliers?.code || '',
        },
      })));
    }
  }, [effectiveUniteId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // ── Load congés du technicien ──
  const loadCongesTech = useCallback(async (techId: number) => {
    setLoadingCongesTech(true);
    const { data, error: err } = await supabase
      .from('conges')
      .select('id, technicien_id, date_debut, date_fin, motif')
      .eq('technicien_id', techId)
      .gte('date_debut', `${currentYear}-01-01`)
      .lte('date_fin', `${currentYear}-12-31`)
      .order('date_debut');

    if (err) { console.error('loadCongesTech error:', err.message); setLoadingCongesTech(false); return; }
    setCongesTech((data || []).map((c: any) => ({
      ...c, jours_ouvrables: getWorkingDays(c.date_debut, c.date_fin),
    })));
    setLoadingCongesTech(false);
  }, [currentYear]);

  // ── Load existing heures ──
  const loadExistingLoad = useCallback(async () => {
    if (!effectiveUniteId || !dateDebut || !dateFin) return;
    const { data } = await supabase
      .from('planning_techniciens')
      .select('technicien_id, duree, planning!inner(unite_id, date_prevue, statut, duree_intervention)')
      .eq('planning.unite_id', Number(effectiveUniteId))
      .gte('planning.date_prevue', dateDebut)
      .lte('planning.date_prevue', dateFin)
      .in('planning.statut', ['planifiee', 'en_cours']);

    const load: Record<number, number> = {};
    (data || []).forEach((row: any) => {
      const id = row.technicien_id;
      const h = row.duree || (row.planning as any)?.duree_intervention || 1;
      load[id] = (load[id] || 0) + h;
    });
    setExistingLoadHeures(load);
  }, [effectiveUniteId, dateDebut, dateFin]);

  useEffect(() => { loadExistingLoad(); }, [loadExistingLoad]);

  // ── Computed ──
  const nbJoursOuvrables = useMemo(() => Math.max(1, getWorkingDays(dateDebut, dateFin)), [dateDebut, dateFin]);

  const soldeCongeAnnuel = useMemo(() => {
    const utilises = congesTech
      .filter(c => c.motif === 'Congé annuel' && c.id !== editingCongeId)
      .reduce((sum, c) => sum + c.jours_ouvrables, 0);
    return { max: CONGE_ANNUEL_MAX_JOURS, utilises, restants: CONGE_ANNUEL_MAX_JOURS - utilises };
  }, [congesTech, editingCongeId]);

  const joursNouveauConge = useMemo(() => {
    if (!dateDebut || !dateFin || dateDebut > dateFin) return 0;
    return getWorkingDays(dateDebut, dateFin);
  }, [dateDebut, dateFin]);

  const congeAnnuelError = useMemo(() => {
    if (motif !== 'Congé annuel' || !dateDebut || !dateFin || dateDebut > dateFin) return '';
    if (joursNouveauConge > soldeCongeAnnuel.restants)
      return `Dépassement de ${joursNouveauConge - soldeCongeAnnuel.restants}j. Solde restant: ${soldeCongeAnnuel.restants}j`;
    return '';
  }, [motif, dateDebut, dateFin, joursNouveauConge, soldeCongeAnnuel]);

  const techCharges = useMemo((): TechCharge[] => {
    if (!selectedTech) return [];
    const maxPeriode = chargeMaxHeures * nbJoursOuvrables;
    return techniciens
      .filter(t => t.id !== selectedTech.id)
      .map(t => {
        const hEx = existingLoadHeures[t.id] || 0;
        const hAs = sessionAssignedHeures[t.id] || 0;
        const total = hEx + hAs;
        return {
          tech: t, heuresExistantes: hEx, heuresAssignees: hAs,
          chargeMaxHeures: maxPeriode,
          estSature: total >= maxPeriode,
          heuresParJour: nbJoursOuvrables > 0 ? total / nbJoursOuvrables : 0,
        };
      })
      .sort((a, b) => a.heuresParJour - b.heuresParJour);
  }, [techniciens, selectedTech, existingLoadHeures, sessionAssignedHeures, chargeMaxHeures, nbJoursOuvrables]);

  const filteredTech = useMemo(() => {
    let list = techniciens;
    if (filterAtelier) list = list.filter(t => t.atelier_code === filterAtelier);
    if (searchTech.trim()) { const q = searchTech.toLowerCase(); list = list.filter(t => t.nom_complet.toLowerCase().includes(q) || t.specialite?.toLowerCase().includes(q) || t.atelier_code.toLowerCase().includes(q)); }
    return list;
  }, [techniciens, filterAtelier, searchTech]);

  const atelierStats = useMemo(() => {
    const map: Record<string, { code: string; nom: string; count: number }> = {};
    techniciens.forEach(t => { if (!map[t.atelier_code]) map[t.atelier_code] = { code: t.atelier_code, nom: t.atelier_nom, count: 0 }; map[t.atelier_code].count++; });
    return Object.values(map).sort((a, b) => a.code.localeCompare(b.code));
  }, [techniciens]);

  const stats = useMemo(() => ({
    total: interventions.length,
    modified: interventions.filter(i => i.modified).length,
    sansRemplacant: interventions.filter(i => i.techIdsNouveaux.length === 0).length,
    totalHeures: interventions.reduce((s, i) => s + (i.planning.duree_intervention || 1), 0),
  }), [interventions]);

  const dateError = dateDebut && dateFin && dateDebut > dateFin ? 'Date fin avant date début' : '';
  const canSubmit = !!(selectedTech && dateDebut && dateFin && !dateError && effectiveUniteId && !congeAnnuelError);
  const importOkCount = importRows.filter(r => r.status === 'ok').length;
  const saturatedCount = techCharges.filter(tc => tc.estSature).length;
  const stepOrder: Step[] = ['declaration', 'interventions', 'confirmation', 'done'];
  const currentStepIdx = stepOrder.indexOf(step);
  const selectedMotif = MOTIFS.find(m => m.value === motif);

  // ── Handlers ──
  const handleSelectTech = (t: Technicien) => {
    setSelectedTech(t); setSearchTech('');
    setEditingCongeId(null); setDateDebut(''); setDateFin(''); setMotif('Congé annuel');
    loadCongesTech(t.id);
  };

  const handleEditConge = (c: CongeExistant) => {
    setEditingCongeId(c.id); setDateDebut(c.date_debut); setDateFin(c.date_fin); setMotif(c.motif);
  };

  const handleCancelEdit = () => {
    setEditingCongeId(null); setDateDebut(''); setDateFin(''); setMotif('Congé annuel');
  };

  // ── Save congé seulement (sans réaffectation) ──
  const saveCongeOnly = useCallback(async () => {
    if (!selectedTech || !dateDebut || !dateFin || !effectiveUniteId) { setError('Remplissez tous les champs.'); return; }
    if (congeAnnuelError) { setError(congeAnnuelError); return; }
    setSaving(true); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expirée. Reconnectez-vous.');

      if (editingCongeId) {
        // Modification
        const { error: uErr } = await supabase.from('conges')
          .update({ date_debut: dateDebut, date_fin: dateFin, motif })
          .eq('id', editingCongeId);
        if (uErr) throw new Error(`Erreur mise à jour: ${uErr.message} (${uErr.code})`);
      } else {
        // Nouveau — tenter sans created_by d'abord pour compatibilité
        const payload: Record<string, any> = {
          technicien_id: selectedTech.id,
          unite_id: Number(effectiveUniteId),
          date_debut: dateDebut,
          date_fin: dateFin,
          motif,
        };

        // Essayer avec created_by
        const { error: cErr } = await supabase.from('conges').insert({ ...payload, created_by: session.user.id });
        if (cErr) {
          console.warn('Insert with created_by failed, retrying without:', cErr.code, cErr.message);
          // Retenter sans created_by
          const { error: cErr2 } = await supabase.from('conges').insert(payload);
          if (cErr2) throw new Error(`Erreur insertion: ${cErr2.message} (${cErr2.code}) — hint: ${cErr2.hint || 'none'} — details: ${cErr2.details || 'none'}`);
        }
      }

      const action = editingCongeId ? 'modifié' : 'enregistré';
      setSuccessMsg(`✅ Congé ${action}: ${selectedTech.nom_complet} · ${formatDateFR(dateDebut)} → ${formatDateFR(dateFin)} · ${motif}`);
      await loadHistory();
      await loadCongesTech(selectedTech.id);
      setEditingCongeId(null); setDateDebut(''); setDateFin(''); setMotif('Congé annuel');
    } catch (err: any) {
      console.error('saveCongeOnly error:', err);
      setError(err.message || 'Erreur inconnue lors de l\'enregistrement');
    } finally { setSaving(false); }
  }, [selectedTech, dateDebut, dateFin, motif, effectiveUniteId, editingCongeId, congeAnnuelError, loadHistory, loadCongesTech]);

  // ── Find impacted interventions ──
  const findImpacted = useCallback(async () => {
    if (!selectedTech || !dateDebut || !dateFin || !effectiveUniteId) { setError('Remplissez tous les champs.'); return; }
    if (dateDebut > dateFin) { setError('Date fin avant date début.'); return; }
    setLoadingSearch(true); setError('');
    try {
      const { data: ptRows } = await supabase.from('planning_techniciens').select('planning_id').eq('technicien_id', selectedTech.id);
      if (!ptRows?.length) { setInterventions([]); setSessionAssignedHeures({}); setStep('interventions'); return; }

      const { data: planRows } = await supabase.from('planning')
        .select('*').eq('unite_id', Number(effectiveUniteId))
        .in('id', ptRows.map(r => r.planning_id))
        .gte('date_prevue', dateDebut).lte('date_prevue', dateFin)
        .in('statut', ['planifiee', 'en_cours']);

      if (!planRows?.length) { setInterventions([]); setSessionAssignedHeures({}); setStep('interventions'); return; }

      const { data: allPT } = await supabase.from('planning_techniciens')
        .select('planning_id, technicien_id, duree, techniciens(id, nom, prenom)')
        .in('planning_id', planRows.map(p => p.id));

      const impactees: InterventionImpactee[] = planRows.map(p => {
        const techs = (allPT || []).filter(pt => pt.planning_id === p.id).map(pt => ({
          id: pt.technicien_id,
          nom: `${(pt.techniciens as any)?.prenom || ''} ${(pt.techniciens as any)?.nom || ''}`.trim(),
          duree: pt.duree,
        }));
        return {
          planning: { ...p },
          techIdsActuels: techs.map(t => t.id),
          techNomActuels: techs.map(t => t.nom),
          techIdsNouveaux: techs.filter(t => t.id !== selectedTech.id).map(t => t.id),
          techNomNouveaux: techs.filter(t => t.id !== selectedTech.id).map(t => t.nom),
          modified: false,
        };
      });

      setInterventions(impactees.sort((a, b) => a.planning.date_prevue.localeCompare(b.planning.date_prevue)));
      setSessionAssignedHeures({});
      await loadExistingLoad();
      setStep('interventions');
    } catch (err: any) { setError(err.message); }
    finally { setLoadingSearch(false); }
  }, [selectedTech, dateDebut, dateFin, effectiveUniteId, loadExistingLoad]);

  // ── Apply quick (avec vrai enregistrement) ──
  const applyQuickToAll = useCallback(() => {
    if (!quickRemplacant) return;
    const tc = techCharges.find(t => t.tech.id === quickRemplacant.id);
    if (tc?.estSature) { setError(`${quickRemplacant.nom_complet} est saturé(e).`); return; }

    const maxH = tc ? tc.chargeMaxHeures : chargeMaxHeures * nbJoursOuvrables;
    const dejaH = (existingLoadHeures[quickRemplacant.id] || 0) + (sessionAssignedHeures[quickRemplacant.id] || 0);
    let restantes = maxH - dejaH;
    let added = 0;

    setApplyingAll(true);
    const updated = interventions.map(it => {
      if (it.techIdsNouveaux.includes(quickRemplacant.id)) return it;
      const duree = it.planning.duree_intervention || 1;
      if (restantes >= duree) {
        restantes -= duree; added += duree;
        return { ...it, techIdsNouveaux: [...it.techIdsNouveaux, quickRemplacant.id], techNomNouveaux: [...it.techNomNouveaux, quickRemplacant.nom_complet], modified: true };
      }
      return it;
    });
    setInterventions(updated);
    if (added > 0) setSessionAssignedHeures(prev => ({ ...prev, [quickRemplacant.id]: (prev[quickRemplacant.id] || 0) + added }));
    if (restantes <= 0 && updated.some(u => !u.modified && !u.techIdsNouveaux.includes(quickRemplacant.id))) setError(`⚠ ${quickRemplacant.nom_complet} a atteint sa limite. Certaines interventions non affectées.`);
    setApplyingAll(false);
  }, [quickRemplacant, techCharges, interventions, chargeMaxHeures, nbJoursOuvrables, existingLoadHeures, sessionAssignedHeures]);

  const addRemplacant = useCallback((idx: number, tech: Technicien) => {
    const tc = techCharges.find(t => t.tech.id === tech.id);
    if (tc?.estSature) { setError(`${tech.nom_complet} est saturé(e).`); return; }
    const duree = interventions[idx]?.planning.duree_intervention || 1;
    const currentLoad = (existingLoadHeures[tech.id] || 0) + (sessionAssignedHeures[tech.id] || 0);
    const maxH = chargeMaxHeures * nbJoursOuvrables;
    if (currentLoad + duree > maxH) { setError(`${tech.nom_complet} n'a plus assez de capacité (${currentLoad.toFixed(1)}h + ${duree}h > ${maxH}h).`); return; }
    setInterventions(prev => prev.map((it, i) => i !== idx || it.techIdsNouveaux.includes(tech.id) ? it : { ...it, techIdsNouveaux: [...it.techIdsNouveaux, tech.id], techNomNouveaux: [...it.techNomNouveaux, tech.nom_complet], modified: true }));
    setSessionAssignedHeures(prev => ({ ...prev, [tech.id]: (prev[tech.id] || 0) + duree }));
  }, [techCharges, interventions, existingLoadHeures, sessionAssignedHeures, chargeMaxHeures, nbJoursOuvrables]);

  const removeRemplacant = useCallback((idx: number, techId: number) => {
    const duree = interventions[idx]?.planning.duree_intervention || 1;
    setInterventions(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const pos = it.techIdsNouveaux.indexOf(techId);
      if (pos === -1) return it;
      const ids = [...it.techIdsNouveaux]; ids.splice(pos, 1);
      const noms = [...it.techNomNouveaux]; noms.splice(pos, 1);
      return { ...it, techIdsNouveaux: ids, techNomNouveaux: noms, modified: true };
    }));
    setSessionAssignedHeures(prev => ({ ...prev, [techId]: Math.max(0, (prev[techId] || 0) - duree) }));
  }, [interventions]);

  const toggleInterv = useCallback((id: string) => setSelectedIntervIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }), []);
  const selectAllInterv = useCallback(() => setSelectedIntervIds(new Set(interventions.map(i => i.planning.id))), [interventions]);
  const deselectAllInterv = useCallback(() => setSelectedIntervIds(new Set()), []);

  // ── Save avec réaffectation ──
  const saveChanges = useCallback(async () => {
    setSaving(true); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expirée. Reconnectez-vous.');

      let congeId: number;

      if (editingCongeId) {
        const { error: uErr } = await supabase.from('conges')
          .update({ date_debut: dateDebut, date_fin: dateFin, motif })
          .eq('id', editingCongeId);
        if (uErr) throw new Error(`Erreur mise à jour congé: ${uErr.message} (${uErr.code})`);
        congeId = editingCongeId;
        await supabase.from('conges_interventions').delete().eq('conge_id', congeId);
      } else {
        const payload: Record<string, any> = {
          technicien_id: selectedTech!.id,
          unite_id: Number(effectiveUniteId),
          date_debut: dateDebut,
          date_fin: dateFin,
          motif,
        };
        // Tenter avec created_by
        const { data: congeData, error: cErr } = await supabase.from('conges')
          .insert({ ...payload, created_by: session.user.id })
          .select('id').single();

        if (cErr) {
          console.warn('Insert with created_by failed:', cErr.code, '— retrying without');
          const { data: congeData2, error: cErr2 } = await supabase.from('conges')
            .insert(payload).select('id').single();
          if (cErr2) throw new Error(`Erreur insertion congé: ${cErr2.message} (${cErr2.code})`);
          if (!congeData2) throw new Error('Aucun ID retourné après insertion.');
          congeId = congeData2.id;
        } else {
          if (!congeData) throw new Error('Aucun ID retourné après insertion.');
          congeId = congeData.id;
        }
      }

      const modified = interventions.filter(i => i.modified);
      let successCount = 0, errCount = 0;

      for (const item of modified) {
        const pid = item.planning.id;
        try {
          await supabase.from('planning_techniciens').delete().eq('planning_id', pid).eq('technicien_id', selectedTech!.id);
          const existing = item.techIdsActuels.filter(id => id !== selectedTech!.id);
          const toInsert = item.techIdsNouveaux.filter(id => !existing.includes(id)).map(id => ({ planning_id: pid, technicien_id: id, duree: item.planning.duree_intervention || 1 }));
          if (toInsert.length) await supabase.from('planning_techniciens').insert(toInsert);
          await supabase.from('planning').update({ techniciens: item.techNomNouveaux.join(', ') || null }).eq('id', pid);
          await supabase.from('conges_interventions').insert({
            conge_id: congeId, planning_id: pid,
            techniciens_avant: item.techNomActuels.join(', '),
            techniciens_apres: item.techNomNouveaux.join(', '),
            remplacant_id: item.techIdsNouveaux[0] ?? null,
          }).then(({ error: ciErr }) => { if (ciErr) console.warn('conges_interventions insert warn:', ciErr.message); });
          successCount++;
        } catch (e) { console.error(`Error processing planning ${pid}:`, e); errCount++; }
      }

      const action = editingCongeId ? 'modifié' : 'enregistré';
      const resultPart = modified.length > 0 ? ` · ${successCount} intervention(s) réaffectée(s)${errCount > 0 ? ` (${errCount} erreur(s))` : ''}` : '';
      setSuccessMsg(`✅ Congé ${action}: ${selectedTech!.nom_complet} (${formatDateFR(dateDebut)} → ${formatDateFR(dateFin)})${resultPart}`);
      await loadHistory();
      setStep('done');
    } catch (err: any) {
      console.error('saveChanges error:', err);
      setError(err.message || 'Erreur inconnue');
    } finally { setSaving(false); }
  }, [interventions, selectedTech, effectiveUniteId, dateDebut, dateFin, motif, loadHistory, editingCongeId]);

  // ── Import Excel ──
  const handleFileUpload = useCallback(async (file: File) => {
    if (!techniciens.length) { setError('Sélectionnez d\'abord une unité.'); return; }
    setImportLoading(true); setError(''); setImportRows([]);
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
      if (raw.length < 2) throw new Error('Fichier vide ou entête manquant.');

      const headers: string[] = (raw[0] || []).map((h: any) => String(h).toLowerCase().trim());
      const ci = {
        nom: headers.findIndex(h => h.includes('nom') || h.includes('agent') || h.includes('employe') || h.includes('technicien')),
        debut: headers.findIndex(h => h.includes('debut') || h.includes('début') || h.includes('start')),
        fin: headers.findIndex(h => h.includes('fin') || h.includes('end') || h.includes('retour')),
        motif: headers.findIndex(h => h.includes('motif') || h.includes('type') || h.includes('nature')),
        atelier: headers.findIndex(h => h.includes('atelier')),
      };
      if (ci.nom === -1) throw new Error(`Colonne "Nom" introuvable. Entêtes: ${headers.join(', ')}`);
      if (ci.debut === -1) throw new Error(`Colonne "Date Début" introuvable.`);
      if (ci.fin === -1) throw new Error(`Colonne "Date Fin" introuvable.`);

      const existingKeys = new Set(congesHistory.map(c => `${c.technicien_id}_${c.date_debut}_${c.date_fin}`));
      const rows: ImportRow[] = [];

      for (let i = 1; i < raw.length; i++) {
        const row = raw[i];
        if (!row || !row[ci.nom]) continue;
        const nomRaw = String(row[ci.nom]).trim();
        const db = parseExcelDate(row[ci.debut]);
        const df = parseExcelDate(row[ci.fin]);
        const mot = ci.motif >= 0 && row[ci.motif] ? String(row[ci.motif]).trim() : 'Congé annuel';
        const atelierHint = ci.atelier >= 0 && row[ci.atelier] ? String(row[ci.atelier]).trim().toUpperCase() : '';

        if (!db || !df) { rows.push({ nom_complet: nomRaw, date_debut: db, date_fin: df, motif: mot, matched_tech: null, status: 'error', error_msg: 'Dates invalides' }); continue; }
        if (db > df) { rows.push({ nom_complet: nomRaw, date_debut: db, date_fin: df, motif: mot, matched_tech: null, status: 'error', error_msg: 'Fin < Début' }); continue; }

        const nl = nomRaw.toLowerCase().replace(/\s+/g, ' ');
        let matched: Technicien | null = null;

        // Matching avec hint atelier
        if (atelierHint) {
          matched = techniciens.find(t => {
            const f = t.nom_complet.toLowerCase(); const n = t.nom.toLowerCase(); const p = t.prenom.toLowerCase();
            return t.atelier_code.toUpperCase() === atelierHint && (f === nl || n === nl || f.includes(nl) || nl.includes(n) || `${p} ${n}` === nl || `${n} ${p}` === nl);
          }) || null;
        }
        // Fallback sans atelier
        if (!matched) {
          matched = techniciens.find(t => {
            const f = t.nom_complet.toLowerCase(); const n = t.nom.toLowerCase(); const p = t.prenom.toLowerCase();
            return f === nl || n === nl || f.includes(nl) || nl.includes(n) || `${p} ${n}` === nl || `${n} ${p}` === nl;
          }) || null;
        }

        const key = matched ? `${matched.id}_${db}_${df}` : '';
        rows.push({ nom_complet: nomRaw, date_debut: db, date_fin: df, motif: mot, matched_tech: matched, status: matched ? (existingKeys.has(key) ? 'duplicate' : 'ok') : 'unmatched' });
      }
      setImportRows(rows);
    } catch (err: any) { setError(err.message); }
    setImportLoading(false);
  }, [techniciens, congesHistory]);

  const confirmImport = useCallback(async () => {
    const toImport = importRows.filter(r => r.status === 'ok' && r.matched_tech);
    if (!toImport.length) { setError('Aucune ligne valide à importer.'); return; }
    setImportSaving(true); setError('');
    try {
      const inserts = toImport.map(r => ({
        technicien_id: r.matched_tech!.id,
        unite_id: Number(effectiveUniteId),
        date_debut: r.date_debut,
        date_fin: r.date_fin,
        motif: r.motif,
      }));
      const { error: err } = await supabase.from('conges').insert(inserts);
      if (err) throw new Error(`Erreur import: ${err.message} (${err.code})`);
      setSuccessMsg(`✅ ${toImport.length} congé(s) importé(s) avec succès.`);
      setImportRows([]);
      await loadHistory();
    } catch (err: any) { setError(err.message); }
    setImportSaving(false);
  }, [importRows, effectiveUniteId, loadHistory]);

  const reset = () => {
    setSelectedTech(null); setDateDebut(''); setDateFin('');
    setMotif('Congé annuel'); setSearchTech(''); setFilterAtelier('');
    setInterventions([]); setStep('declaration');
    setError(''); setSuccessMsg('');
    setReplacementMode('quick'); setQuickRemplacant(null);
    setSelectedIntervIds(new Set()); setSessionAssignedHeures({});
    setEditingCongeId(null); setCongesTech([]);
  };

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="bg-slate-100 min-h-[calc(100vh-60px)] p-4 lg:p-6">
      <div className="max-w-[1500px] mx-auto space-y-5">

        {/* ── HEADER ── */}
        <div className="bg-gradient-to-br from-[#1e2a5e] to-[#0c1530] rounded-3xl p-5 lg:p-6 shadow-md">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
                <CalendarDays size={22} className="text-cyan-300" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Gestion des Congés</h1>
                <p className="text-xs text-slate-300">Import Excel · Ajouter · Modifier · Suivi de charge horaire</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {selectedTech && step !== 'done' && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-white border border-white/10">
                  <UserCheck size={11} />
                  <span className="font-bold text-[11px]">{selectedTech.nom_complet}</span>
                  <span className={atelierBadge(selectedTech.atelier_code)}>{selectedTech.atelier_code}</span>
                  {editingCongeId && <span className="text-[9px] font-black px-1.5 py-0.5 bg-amber-400/90 text-amber-950 rounded-full">✏️ Modification</span>}
                </div>
              )}
              {step !== 'declaration' && (
                <button onClick={reset} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all active:scale-95">
                  <RotateCcw size={13} strokeWidth={2.5} /><span className="hidden sm:inline">Nouvelle déclaration</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── TABS ── */}
        {step === 'declaration' && (
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm w-fit">
            {([{ key: 'declaration', label: 'Déclaration', icon: UserX }, { key: 'import', label: 'Import Excel', icon: FileSpreadsheet }] as const).map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-bold transition-all ${activeTab === tab.key ? 'bg-[#1e2a5e] text-white shadow-sm' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                <tab.icon size={13} />{tab.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Error / Success ── */}
        {error && (
          <div className="flex items-center gap-4 p-4 bg-red-50 border border-red-100 rounded-2xl">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shrink-0"><AlertTriangle size={17} className="text-white" /></div>
            <div className="flex-1 min-w-0"><p className="text-sm font-bold text-red-800">Erreur</p><p className="text-xs text-red-500 break-all">{error}</p></div>
            <button onClick={() => setError('')} className="px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-xl active:scale-95 shrink-0">Fermer</button>
          </div>
        )}
        {successMsg && (
          <div className="flex items-center gap-4 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
            <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
            <p className="text-sm font-semibold text-emerald-800 flex-1">{successMsg}</p>
            <button onClick={() => setSuccessMsg('')} className="text-emerald-400 hover:text-emerald-600 shrink-0"><X size={14} /></button>
          </div>
        )}

        {/* ════════════ TAB: IMPORT ════════════ */}
        {step === 'declaration' && activeTab === 'import' && (
          <div className="space-y-5">
            {isAdmin && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <FloatingSelect label="Unité" value={selectedUnite} onChange={v => { setSelectedUnite(v); setImportRows([]); }}
                  options={unites.map(u => ({ value: String(u.id), label: `${u.code} — ${u.nom}` }))} required icon={Building2} placeholder="Sélectionner..." />
              </div>
            )}

            {/* Info format */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-start gap-3">
                <Info size={15} className="text-blue-500 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-800 space-y-1">
                  <p className="font-bold">Format attendu (première ligne = entêtes) :</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-2">
                    <p>• <strong>Nom Agent / Technicien</strong> — nom complet <span className="text-red-500">*</span></p>
                    <p>• <strong>Unité</strong> — code unité (optionnel, ignoré)</p>
                    <p>• <strong>Atelier</strong> — code atelier (aide au matching)</p>
                    <p>• <strong>Date Début</strong> — JJ/MM/AAAA <span className="text-red-500">*</span></p>
                    <p>• <strong>Date Fin</strong> — JJ/MM/AAAA <span className="text-red-500">*</span></p>
                    <p>• <strong>Motif</strong> — nature du congé (optionnel)</p>
                  </div>
                  <p className="text-blue-600 font-semibold mt-2">💡 Téléchargez le modèle pré-rempli avec vos {techniciens.length} techniciens</p>
                </div>
              </div>
            </div>

            {/* Drop zone */}
            <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f); }}
              className="border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer group"
              onClick={() => fileInputRef.current?.click()}>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ''; }} />
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[#1e2a5e] to-[#0c1530] flex items-center justify-center shadow-lg mb-4 group-hover:scale-110 transition-transform">
                {importLoading ? <Loader2 size={28} className="text-white animate-spin" /> : <FileSpreadsheet size={28} className="text-white" />}
              </div>
              <p className="text-base font-bold text-slate-700">{importLoading ? 'Analyse en cours...' : 'Glisser le fichier Excel ici'}</p>
              <p className="text-sm text-slate-400 mt-1">ou cliquer · .xlsx, .xls, .csv</p>
            </div>

            {/* Download template */}
            <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center gap-3">
                <FileSpreadsheet size={18} className="text-slate-400" />
                <div>
                  <p className="text-sm font-bold text-slate-700">Modèle Excel</p>
                  <p className="text-[11px] text-slate-400">Avec Nom, Unité, Atelier, Dates, Motif</p>
                </div>
              </div>
              <button onClick={async () => {
                try {
                  const XLSX = await import('xlsx');
                  const uniteName = unites.find(u => u.id === Number(effectiveUniteId))?.code || 'UNITE';
                  const templateData: any[][] = [['Nom Agent', 'Unité', 'Atelier', 'Date Début', 'Date Fin', 'Motif']];

                  if (techniciens.length > 0) {
                    techniciens.forEach(t => {
                      templateData.push([t.nom_complet, uniteName, t.atelier_code, '', '', 'Congé annuel']);
                    });
                  } else {
                    templateData.push(
                      ['DUPONT Jean', uniteName, 'CFA', '01/01/2025', '15/01/2025', 'Congé annuel'],
                      ['MARTIN Sophie', uniteName, 'CFO', '05/02/2025', '12/02/2025', 'Formation'],
                    );
                  }

                  const ws = XLSX.utils.aoa_to_sheet(templateData);
                  ws['!cols'] = [{ wch: 25 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 20 }];

                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, 'Congés');

                  const motifsWs = XLSX.utils.aoa_to_sheet([
                    ['Motifs disponibles'],
                    ...MOTIFS.map(m => [m.value]),
                  ]);
                  motifsWs['!cols'] = [{ wch: 22 }];
                  XLSX.utils.book_append_sheet(wb, motifsWs, 'Motifs');

                  XLSX.writeFile(wb, `conges_${uniteName}_${currentYear}.xlsx`);
                } catch (e) { console.error('Template error:', e); }
              }}
                className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-all active:scale-95">
                <Download size={13} />{techniciens.length > 0 ? `Télécharger (${techniciens.length} tech.)` : 'Télécharger modèle'}
              </button>
            </div>

            {/* Preview */}
            {importRows.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-800">Aperçu ({importRows.length} lignes)</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setImportRows([])} className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs text-slate-600 hover:bg-slate-50">Annuler</button>
                    <button onClick={confirmImport} disabled={importSaving || importOkCount === 0}
                      className="flex items-center gap-2 px-4 py-2 bg-[#1e2a5e] hover:bg-[#2a3875] text-white rounded-xl text-xs font-bold shadow-sm disabled:opacity-50 active:scale-95">
                      {importSaving ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}Importer {importOkCount} congé(s)
                    </button>
                  </div>
                </div>
                <ImportPreviewTable rows={importRows} />
              </div>
            )}
          </div>
        )}

        {/* ════════════ TAB: DÉCLARATION ════════════ */}
        {step === 'declaration' && activeTab === 'declaration' && (
          <div className="space-y-5">
            {/* Stepper */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400" />
              <div className="flex items-center justify-between flex-wrap gap-2">
                {['Déclaration', 'Interventions', 'Confirmation', 'Terminé'].map((label, idx) => {
                  const icons = [UserX, AlertTriangle, Save, CheckCircle2];
                  const Icon = icons[idx];
                  const active = currentStepIdx === idx; const done = currentStepIdx > idx;
                  return (
                    <div key={idx} className="flex items-center gap-2 flex-1 min-w-0">
                      <div className={`relative w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${active ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-blue-200 scale-110' : done ? 'bg-gradient-to-br from-emerald-500 to-green-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                        <Icon size={15} strokeWidth={2.5} />
                        {active && <div className="absolute inset-0 rounded-xl bg-blue-400/30 animate-ping" />}
                      </div>
                      <div className="hidden lg:block min-w-0">
                        <p className={`text-[10px] font-bold uppercase tracking-wider ${active || done ? 'text-slate-700' : 'text-slate-300'}`}>Étape {idx + 1}</p>
                        <p className={`text-[11px] font-semibold truncate ${active ? 'text-blue-600' : done ? 'text-emerald-600' : 'text-slate-400'}`}>{label}</p>
                      </div>
                      {idx < 3 && <div className={`hidden lg:block h-0.5 flex-1 rounded-full ${done ? 'bg-emerald-400' : 'bg-slate-100'}`} />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 1. Unité */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden relative">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-400 to-indigo-400" />
              <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50/50 to-blue-50/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-md shadow-blue-200/50"><Building2 size={17} className="text-white" /></div>
                  <div><h2 className="text-base font-bold text-slate-800">1. Unité</h2><p className="text-[11px] text-slate-400">Sélectionnez l'unité concernée</p></div>
                </div>
              </div>
              <div className="p-6">
                {isAdmin ? (
                  <FloatingSelect label="Unité" value={selectedUnite} onChange={v => { setSelectedUnite(v); setFilterAtelier(''); setSelectedTech(null); setCongesTech([]); setEditingCongeId(null); }}
                    options={unites.map(u => ({ value: String(u.id), label: `${u.code} — ${u.nom}` }))} required icon={Building2} />
                ) : (
                  <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <CheckCircle2 size={15} className="text-emerald-500" />
                    <p className="text-sm font-bold text-emerald-900">{unites.find(u => u.id === Number(effectiveUniteId))?.code ?? '—'} — {unites.find(u => u.id === Number(effectiveUniteId))?.nom ?? '—'}</p>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Technicien */}
            {effectiveUniteId && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm relative">
                <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl bg-gradient-to-r from-indigo-400 to-violet-400" />
                <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50/50 to-indigo-50/30 rounded-t-2xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center shadow-md shadow-indigo-200/50"><UserX size={17} className="text-white" /></div>
                    <div><h2 className="text-base font-bold text-slate-800">2. Technicien</h2><p className="text-[11px] text-slate-400">Filtrez ou recherchez</p></div>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => setFilterAtelier('')} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all active:scale-95 ${!filterAtelier ? 'bg-[#1e2a5e] text-white border-transparent shadow-sm' : 'bg-white text-slate-500 border-slate-200'}`}>
                      <Users size={10} />Tous<span className={`ml-0.5 text-[9px] px-1 py-0.5 rounded font-black ${!filterAtelier ? 'bg-white/20' : 'bg-slate-100'}`}>{techniciens.length}</span>
                    </button>
                    {atelierStats.map(a => (
                      <button key={a.code} onClick={() => setFilterAtelier(a.code === filterAtelier ? '' : a.code)}
                        className={`relative flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all active:scale-95 overflow-hidden ${filterAtelier === a.code ? 'text-white border-transparent shadow-sm' : `${ATELIER_COLORS[a.code] || 'bg-white border-slate-200'}`}`}>
                        {filterAtelier === a.code && <div className={`absolute inset-0 bg-gradient-to-r ${ATELIER_GRADIENTS[a.code] || 'from-slate-500 to-slate-600'}`} />}
                        <span className="relative">{a.code} ({a.count})</span>
                      </button>
                    ))}
                  </div>

                  {selectedTech ? (
                    <div className="flex items-center gap-3 p-3.5 bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${ATELIER_GRADIENTS[selectedTech.atelier_code] || 'from-indigo-500 to-violet-600'} flex items-center justify-center text-white text-xs font-black shadow-md shrink-0`}>{selectedTech.prenom[0]}{selectedTech.nom[0]}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap"><p className="text-sm font-bold text-indigo-900">{selectedTech.nom_complet}</p><span className={atelierBadge(selectedTech.atelier_code)}>{selectedTech.atelier_code}</span></div>
                        {selectedTech.specialite && <p className="text-[11px] text-indigo-500 mt-0.5 flex items-center gap-1"><Briefcase size={9} />{selectedTech.specialite}</p>}
                      </div>
                      <button onClick={() => { setSelectedTech(null); setSearchTech(''); setCongesTech([]); setEditingCongeId(null); setDateDebut(''); setDateFin(''); }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-indigo-300 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"><X size={13} /></button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input type="text" value={searchTech} onChange={e => setSearchTech(e.target.value)}
                          placeholder={`Chercher parmi ${techniciens.length} techniciens...`}
                          className="w-full pl-9 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 focus:bg-white outline-none" />
                        {searchTech && <button onClick={() => setSearchTech('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500"><X size={13} /></button>}
                      </div>
                      {filteredTech.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200"><Search size={20} className="text-slate-300" /><p className="text-xs text-slate-400">Aucun technicien trouvé</p></div>
                      ) : (
                        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                          <div className="overflow-y-auto" style={{ maxHeight: '260px' }}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-slate-100">
                              {filteredTech.map(t => (
                                <button key={t.id} onClick={() => handleSelectTech(t)}
                                  className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-indigo-50/50 transition-colors text-left group">
                                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${ATELIER_GRADIENTS[t.atelier_code] || 'from-slate-400 to-slate-500'} flex items-center justify-center text-white text-[11px] font-black shadow-sm group-hover:scale-110 transition-transform shrink-0`}>{t.prenom[0]}{t.nom[0]}</div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-bold text-slate-800 group-hover:text-indigo-700 truncate">{t.nom_complet}</p>
                                    <p className="text-[10px] text-slate-400 truncate">{t.specialite || '—'}</p>
                                  </div>
                                  <span className={`${atelierBadge(t.atelier_code)} shrink-0`}>{t.atelier_code}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 3. Congés existants + Solde */}
            {selectedTech && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400" />
                <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50/50 to-amber-50/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-md shadow-amber-200/50"><CalendarDays size={17} className="text-white" /></div>
                      <div><h2 className="text-base font-bold text-slate-800">Congés de {selectedTech.prenom} — {currentYear}</h2><p className="text-[11px] text-slate-400">Solde congé annuel · Historique</p></div>
                    </div>
                    {editingCongeId && (
                      <button onClick={handleCancelEdit} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-xl text-[11px] font-bold border border-slate-200 hover:border-red-200 transition-all active:scale-95">
                        <X size={11} />Annuler modif.
                      </button>
                    )}
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  {/* Jauge solde annuel */}
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-bold text-[#1e2a5e] uppercase tracking-wider flex items-center gap-1.5">🌴 Solde congé annuel</p>
                      <span className={`text-sm font-black tabular-nums ${soldeCongeAnnuel.restants <= 0 ? 'text-red-600' : soldeCongeAnnuel.restants <= 5 ? 'text-amber-600' : 'text-[#1e2a5e]'}`}>
                        {soldeCongeAnnuel.restants}j restant{soldeCongeAnnuel.restants > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="h-3 bg-white rounded-full overflow-hidden border border-blue-100 flex">
                      <div className="h-full bg-[#1e2a5e] rounded-l-full transition-all duration-500"
                        style={{ width: `${Math.min((soldeCongeAnnuel.utilises / soldeCongeAnnuel.max) * 100, 100)}%` }} />
                      {motif === 'Congé annuel' && joursNouveauConge > 0 && (
                        <div className={`h-full transition-all duration-300 ${congeAnnuelError ? 'bg-red-400 opacity-70' : 'bg-indigo-300 opacity-60'}`}
                          style={{ width: `${Math.min((joursNouveauConge / soldeCongeAnnuel.max) * 100, Math.max(0, 100 - (soldeCongeAnnuel.utilises / soldeCongeAnnuel.max) * 100))}%` }} />
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-2 text-[10px]">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1"><div className="w-2 h-1.5 rounded-full bg-[#1e2a5e]" />Utilisés: <strong>{soldeCongeAnnuel.utilises}j</strong></span>
                        {motif === 'Congé annuel' && joursNouveauConge > 0 && (
                          <span className={`flex items-center gap-1 ${congeAnnuelError ? 'text-red-600' : 'text-indigo-500'}`}>
                            <div className={`w-2 h-1.5 rounded-full ${congeAnnuelError ? 'bg-red-400' : 'bg-indigo-300'}`} />Nouveau: <strong>{joursNouveauConge}j</strong>
                          </span>
                        )}
                      </div>
                      <span className="text-slate-400">Max: {soldeCongeAnnuel.max}j/an</span>
                    </div>
                    {congeAnnuelError && (
                      <div className="mt-3 flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-xl">
                        <AlertOctagon size={13} className="text-red-500 shrink-0 mt-0.5" />
                        <div className="text-[11px] text-red-700">
                          <p className="font-bold">Congé annuel insuffisant</p>
                          <p className="mt-0.5">{congeAnnuelError}</p>
                          <p className="mt-1 text-red-500">Choisissez un autre type de congé (maladie, exceptionnel…)</p>
                        </div>
                      </div>
                    )}
                    {motif === 'Congé annuel' && !congeAnnuelError && joursNouveauConge > 0 && (
                      <div className="mt-3 flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-700">
                        <CheckCircle2 size={12} className="shrink-0" />
                        <span>Solde suffisant · Après: <strong>{soldeCongeAnnuel.restants - joursNouveauConge}j</strong> restant(s)</span>
                      </div>
                    )}
                  </div>

                  {/* Liste congés existants */}
                  {loadingCongesTech ? (
                    <div className="flex items-center justify-center py-6"><Loader2 size={18} className="animate-spin text-blue-500" /></div>
                  ) : congesTech.length === 0 ? (
                    <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500">
                      <Info size={12} className="shrink-0" /><span>Aucun congé déclaré cette année pour {selectedTech.nom_complet}</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{congesTech.length} congé(s) — {currentYear}</p>
                        <p className="text-[10px] text-slate-400">Total: <strong>{congesTech.reduce((s, c) => s + c.jours_ouvrables, 0)}j</strong> ouvrables</p>
                      </div>
                      {congesTech.map(c => {
                        const motifInfo = MOTIFS.find(m => m.value === c.motif);
                        const isEditing = editingCongeId === c.id;
                        return (
                          <div key={c.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${isEditing ? 'border-violet-300 bg-violet-50 ring-2 ring-violet-100 shadow-sm' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${motifInfo?.color || 'from-slate-400 to-slate-500'} flex items-center justify-center text-base shadow-sm shrink-0`}>{motifInfo?.icon || '📋'}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-[12px] font-bold text-slate-800">{c.motif}</p>
                                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{c.jours_ouvrables}j ouv.</span>
                                {isEditing && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-violet-100 text-violet-600 border border-violet-200 rounded-full animate-pulse">En modification</span>}
                              </div>
                              <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1"><Calendar size={9} />{formatDateFR(c.date_debut)} → {formatDateFR(c.date_fin)}</p>
                            </div>
                            <button onClick={() => isEditing ? handleCancelEdit() : handleEditConge(c)}
                              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${isEditing ? 'text-violet-600 bg-violet-100 hover:bg-violet-200' : 'text-slate-400 hover:text-violet-600 hover:bg-violet-50'}`}
                              title={isEditing ? 'Annuler' : 'Modifier'}>
                              {isEditing ? <X size={13} /> : <Edit3 size={13} />}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {editingCongeId && (
                    <div className="flex items-center gap-2 p-3 bg-violet-50 border border-violet-200 rounded-xl text-[11px] text-violet-700">
                      <Edit3 size={12} className="shrink-0" />
                      <span>Mode <strong>modification</strong> — Remplissez les nouvelles dates/motif ci-dessous puis confirmez.</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 4. Période */}
            {selectedTech && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden relative">
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-400 to-cyan-400" />
                <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50/50 to-emerald-50/30">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-200/50"><CalendarDays size={17} className="text-white" /></div>
                    <div><h2 className="text-base font-bold text-slate-800">{editingCongeId ? '3. Modifier la période' : '3. Période d\'absence'}</h2><p className="text-[11px] text-slate-400">Dates de début et de fin</p></div>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FloatingInput label="Date début" value={dateDebut} onChange={setDateDebut} type="date" required icon={Calendar} />
                    <FloatingInput label="Date fin" value={dateFin} onChange={setDateFin} type="date" required icon={Calendar} min={dateDebut} error={dateError} />
                  </div>
                  {dateDebut && dateFin && !dateError && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3">
                        <Calendar size={16} className="text-blue-500 shrink-0" />
                        <div><p className="text-xl font-black text-blue-900 tabular-nums">{getDaysBetween(dateDebut, dateFin)}</p><p className="text-[10px] text-blue-600 font-bold uppercase mt-0.5">Jours calendaires</p></div>
                      </div>
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
                        <Clock size={16} className="text-emerald-500 shrink-0" />
                        <div><p className="text-xl font-black text-emerald-900 tabular-nums">{joursNouveauConge}</p><p className="text-[10px] text-emerald-600 font-bold uppercase mt-0.5">Jours ouvrables</p></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 5. Motif */}
            {selectedTech && dateDebut && dateFin && !dateError && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden relative">
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-violet-400 to-pink-400" />
                <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50/50 to-violet-50/30">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-md shadow-violet-200/50"><FileText size={17} className="text-white" /></div>
                    <div><h2 className="text-base font-bold text-slate-800">4. Motif</h2><p className="text-[11px] text-slate-400">Nature de l'absence</p></div>
                  </div>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                    {MOTIFS.map(m => {
                      const active = motif === m.value;
                      const isAnnuelBloque = m.value === 'Congé annuel' && soldeCongeAnnuel.restants <= 0 && !editingCongeId;
                      return (
                        <button key={m.value} onClick={() => !isAnnuelBloque && setMotif(m.value)} disabled={isAnnuelBloque}
                          className={`group p-3.5 rounded-xl text-left border transition-all ${isAnnuelBloque ? 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed' : active ? 'border-violet-300 bg-violet-50 shadow-md ring-2 ring-violet-200' : 'border-slate-200 bg-white hover:border-violet-200 hover:shadow-sm'} active:scale-95`}>
                          <div className="flex items-center gap-2.5">
                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${m.color} flex items-center justify-center text-lg shadow-sm shrink-0 ${active && !isAnnuelBloque ? 'scale-110' : 'group-hover:scale-110'} transition-transform`}>{m.icon}</div>
                            <div className="min-w-0">
                              <p className={`text-[12px] font-bold ${active ? 'text-violet-900' : isAnnuelBloque ? 'text-slate-400' : 'text-slate-700'}`}>{m.value}</p>
                              {active && !isAnnuelBloque && <p className="text-[10px] text-violet-600 flex items-center gap-1"><CheckCircle2 size={10} />Sélectionné</p>}
                              {isAnnuelBloque && <p className="text-[10px] text-red-500 flex items-center gap-1"><Lock size={9} />Solde épuisé</p>}
                              {m.value === 'Congé annuel' && !isAnnuelBloque && !active && <p className="text-[10px] text-blue-500">{soldeCongeAnnuel.restants}j restant(s)</p>}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 6. Seuil horaire */}
            {selectedTech && dateDebut && dateFin && !dateError && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-sm"><Activity size={15} className="text-white" /></div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-800">Seuil de charge horaire journalière</p>
                    <p className="text-[11px] text-slate-400">Max {chargeMaxHeures}h/jour → {chargeMaxHeures * nbJoursOuvrables}h sur {nbJoursOuvrables} j. ouvrables</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setChargeMaxHeures(m => Math.max(1, m - 1))} className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm active:scale-95">−</button>
                    <span className="w-10 text-center font-black text-slate-800 tabular-nums">{chargeMaxHeures}h</span>
                    <button onClick={() => setChargeMaxHeures(m => Math.min(24, m + 1))} className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm active:scale-95">+</button>
                  </div>
                </div>
              </div>
            )}

            {/* 7. Récap + Actions */}
            {canSubmit && (
              <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 rounded-2xl border border-indigo-200 p-5 relative overflow-hidden">
                <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-indigo-500/10 blur-3xl" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-3"><Sparkles size={14} className="text-indigo-500" /><p className="text-[11px] font-bold text-indigo-700 uppercase tracking-[0.12em]">{editingCongeId ? '✏️ Modification du congé' : '➕ Nouveau congé'}</p></div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {[
                      { l: 'Technicien', v: selectedTech!.nom_complet, icon: UserX },
                      { l: 'Période', v: `${formatDateFR(dateDebut)} → ${formatDateFR(dateFin)}`, icon: Calendar },
                      { l: 'Durée', v: `${joursNouveauConge} j. ouvrables`, icon: Clock },
                      { l: 'Motif', v: motif, icon: FileText },
                    ].map(({ l, v, icon: Icon }) => (
                      <div key={l} className="p-3 bg-white/70 rounded-xl border border-white/50">
                        <div className="flex items-center gap-1.5 mb-1"><Icon size={10} className="text-indigo-400" /><p className="text-[10px] font-bold text-indigo-500 uppercase">{l}</p></div>
                        <p className="text-xs font-bold text-indigo-900 truncate">{v}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button onClick={saveCongeOnly} disabled={saving}
                      className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-white border-2 border-indigo-300 text-indigo-700 rounded-xl text-sm font-bold hover:bg-indigo-50 transition-all active:scale-[0.98] disabled:opacity-50">
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      {editingCongeId ? 'Modifier sans réaffectation' : 'Enregistrer sans réaffectation'}
                    </button>
                    <button onClick={findImpacted} disabled={loadingSearch}
                      className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-[#1e2a5e] hover:bg-[#2a3875] text-white rounded-xl text-sm font-bold shadow-md disabled:opacity-50 transition-all active:scale-[0.98]">
                      {loadingSearch ? <><Loader2 size={14} className="animate-spin" />Recherche…</> : <><Search size={14} />Chercher interventions & réaffecter <ArrowRight size={14} /></>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Historique global */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <button onClick={() => setShowHistory(!showHistory)} className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center shadow-sm"><Clock size={16} className="text-white" /></div>
                  <div><p className="text-sm font-bold text-slate-800">Historique des congés</p><p className="text-[11px] text-slate-400">{congesHistory.length} déclaration(s) enregistrée(s)</p></div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={e => { e.stopPropagation(); loadHistory(); }} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-500 transition-all" title="Rafraîchir">
                    <RefreshCw size={13} />
                  </button>
                  <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg font-bold">{congesHistory.length}</span>
                  {showHistory ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </div>
              </button>
              {showHistory && (
                <div className="border-t border-slate-100">
                  {congesHistory.length === 0 ? (
                    <div className="flex flex-col items-center py-10 gap-3">
                      <CalendarDays size={32} className="text-slate-200" />
                      <p className="text-sm text-slate-400 font-semibold">Aucun congé enregistré</p>
                      <p className="text-[11px] text-slate-300">Les congés apparaîtront ici après enregistrement</p>
                    </div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gradient-to-r from-slate-50 to-blue-50/30 sticky top-0 z-10 border-b border-slate-100">
                          <tr>
                            {['Technicien', 'Atelier', 'Début', 'Fin', 'Durée', 'Motif', 'Déclaré le'].map(h => (
                              <th key={h} className="px-3 py-2.5 text-left font-bold text-slate-400 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {congesHistory.map(c => {
                            const motifInfo = MOTIFS.find(m => m.value === c.motif);
                            return (
                              <tr key={c.id} className="hover:bg-blue-50/20 transition-colors">
                                <td className="px-3 py-2.5 font-semibold text-slate-800 whitespace-nowrap">{c.technicien?.prenom} {c.technicien?.nom}</td>
                                <td className="px-3 py-2.5">
                                  {c.technicien?.atelier_code && <span className={atelierBadge(c.technicien.atelier_code)}>{c.technicien.atelier_code}</span>}
                                </td>
                                <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap">{formatDateFR(c.date_debut)}</td>
                                <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap">{formatDateFR(c.date_fin)}</td>
                                <td className="px-3 py-2.5">
                                  <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-lg">{getWorkingDays(c.date_debut, c.date_fin)}j</span>
                                </td>
                                <td className="px-3 py-2.5">
                                  <span className="flex items-center gap-1.5">
                                    <span className="text-sm">{motifInfo?.icon || '📋'}</span>
                                    <span className="font-medium text-slate-700 truncate max-w-[100px]">{c.motif}</span>
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-slate-400 text-[10px] whitespace-nowrap">
                                  {new Date(c.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════ STEP: INTERVENTIONS ════════════ */}
        {step === 'interventions' && (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-indigo-50 via-violet-50 to-purple-50 border border-indigo-200 rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-indigo-400 to-purple-400" />
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${ATELIER_GRADIENTS[selectedTech?.atelier_code || ''] || 'from-indigo-600 to-violet-700'} flex items-center justify-center text-white text-sm font-black shadow-md`}>{selectedTech?.prenom[0]}{selectedTech?.nom[0]}</div>
                  <div>
                    <p className="text-sm font-bold text-indigo-900 flex items-center gap-2 flex-wrap">{selectedTech?.nom_complet}<span className={atelierBadge(selectedTech?.atelier_code || '')}>{selectedTech?.atelier_code}</span></p>
                    <p className="text-[11px] text-indigo-600 mt-0.5 flex items-center gap-2"><Calendar size={10} />{formatDateFR(dateDebut)} → {formatDateFR(dateFin)} · {selectedMotif?.icon} {motif}</p>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { v: stats.total, l: 'Impactées', c: 'bg-white border-blue-200 text-blue-700' },
                    { v: stats.totalHeures, l: 'Heures', c: 'bg-white border-violet-200 text-violet-700', suffix: 'h' },
                    { v: stats.modified, l: 'Modifiées', c: 'bg-white border-emerald-200 text-emerald-700' },
                    { v: stats.sansRemplacant, l: 'Sans tech.', c: stats.sansRemplacant > 0 ? 'bg-white border-red-200 text-red-700' : 'bg-white border-emerald-200 text-emerald-700' },
                  ].map(s => (
                    <div key={s.l} className={`text-center px-3 py-1.5 rounded-xl border shadow-sm ${s.c}`}>
                      <p className="text-lg font-black tabular-nums leading-none"><AnimatedNumber value={s.v} />{'suffix' in s && s.suffix}</p>
                      <p className="text-[9px] font-bold uppercase tracking-wider mt-1">{s.l}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {interventions.length === 0 ? (
              <div className="bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200 rounded-2xl p-10 text-center">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg mb-3"><CheckCircle2 size={28} className="text-white" /></div>
                <p className="text-base font-bold text-emerald-800">Aucune intervention dans cette période 🎉</p>
                <p className="text-sm text-emerald-600 mt-1">Le congé a été enregistré. Aucune réaffectation nécessaire.</p>
                <button onClick={reset} className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl text-sm font-bold shadow-sm active:scale-95"><RefreshCw size={14} />Nouvelle déclaration</button>
              </div>
            ) : (
              <>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex gap-2.5">
                  <Info size={14} className="shrink-0 mt-0.5 text-amber-500" />
                  <span>Remplaçants de <strong>tous les ateliers</strong>, triés par <strong>charge horaire/jour croissante</strong>. Seuil: <strong>{chargeMaxHeures}h/jour</strong> ({chargeMaxHeures * nbJoursOuvrables}h total). 🔒 = saturé.</span>
                </div>

                <ReplacementModeCard mode={replacementMode} setMode={setReplacementMode}
                  onResetSelection={() => {
                    setQuickRemplacant(null); setSelectedIntervIds(new Set()); setSessionAssignedHeures({});
                    setInterventions(prev => prev.map(it => ({
                      ...it,
                      techIdsNouveaux: it.techIdsActuels.filter(id => id !== selectedTech!.id),
                      techNomNouveaux: it.techNomActuels.filter((_, j) => it.techIdsActuels[j] !== selectedTech!.id),
                      modified: false,
                    })));
                  }} />

                {/* QUICK */}
                {replacementMode === 'quick' && (
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                    <TechChargePicker techCharges={techCharges} selectedId={quickRemplacant?.id}
                      onSelect={t => setQuickRemplacant(t)} label="Choisir un remplaçant (tous ateliers, trié par charge h/jour)" />
                    {quickRemplacant && (
                      <div className="mt-4 flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${ATELIER_GRADIENTS[quickRemplacant.atelier_code] || 'from-slate-400 to-slate-500'} flex items-center justify-center text-white text-[10px] font-black shadow-sm`}>{quickRemplacant.prenom[0]}{quickRemplacant.nom[0]}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-indigo-900">{quickRemplacant.nom_complet}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={atelierBadge(quickRemplacant.atelier_code)}>{quickRemplacant.atelier_code}</span>
                            {quickRemplacant.specialite && <span className="text-[10px] text-indigo-500">{quickRemplacant.specialite}</span>}
                          </div>
                        </div>
                        <button onClick={() => {
                          setQuickRemplacant(null); setSessionAssignedHeures({});
                          setInterventions(prev => prev.map(it => ({
                            ...it,
                            techIdsNouveaux: it.techIdsActuels.filter(id => id !== selectedTech!.id),
                            techNomNouveaux: it.techNomActuels.filter((_, j) => it.techIdsActuels[j] !== selectedTech!.id),
                            modified: false,
                          })));
                        }} className="w-7 h-7 flex items-center justify-center text-indigo-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><X size={12} /></button>
                        <button onClick={applyQuickToAll} disabled={applyingAll}
                          className="flex items-center gap-1.5 px-4 py-2 bg-[#1e2a5e] hover:bg-[#2a3875] text-white rounded-xl text-xs font-bold shadow-sm disabled:opacity-50 active:scale-95">
                          {applyingAll ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} strokeWidth={2.5} />}Appliquer à tout
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* SELECTIVE: charge overview */}
                {replacementMode === 'selective' && (
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-3"><BarChart3 size={14} className="text-indigo-500" /><p className="text-[10px] font-bold text-slate-500 uppercase">Charge horaire — Seuil: {chargeMaxHeures}h/j ({chargeMaxHeures * nbJoursOuvrables}h total)</p></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[240px] overflow-y-auto">
                      {techCharges.slice(0, 15).map(tc => (
                        <div key={tc.tech.id} className={`p-3 rounded-xl border ${tc.estSature ? 'border-red-200 bg-red-50/50' : 'border-slate-200 bg-white'}`}>
                          <div className="flex items-center gap-2 mb-2">
                            <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${ATELIER_GRADIENTS[tc.tech.atelier_code] || 'from-slate-400 to-slate-500'} flex items-center justify-center text-white text-[9px] font-black shrink-0`}>{tc.tech.prenom[0]}{tc.tech.nom[0]}</div>
                            <div className="flex-1 min-w-0"><p className="text-[11px] font-bold truncate text-slate-700">{tc.tech.nom_complet}</p><span className={atelierBadge(tc.tech.atelier_code)}>{tc.tech.atelier_code}</span></div>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${tc.heuresParJour >= chargeMaxHeures ? 'bg-red-100 text-red-600' : tc.heuresParJour >= chargeMaxHeures * 0.7 ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>{tc.heuresParJour.toFixed(1)}h/j</span>
                          </div>
                          <ChargeBar current={tc.heuresExistantes} assigned={tc.heuresAssignees} max={tc.chargeMaxHeures} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <InterventionsTable interventions={interventions} selectedTech={selectedTech} ateliers={ateliers}
                  techCharges={techCharges} mode={replacementMode} selectedIntervIds={selectedIntervIds}
                  onToggleInterv={toggleInterv} onSelectAll={selectAllInterv} onDeselectAll={deselectAllInterv}
                  quickRemplacant={quickRemplacant} onRemoveRemplacant={removeRemplacant} onAddRemplacant={addRemplacant} />

                <div className="flex items-center justify-between flex-wrap gap-3">
                  <button onClick={() => setStep('declaration')} className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors"><ArrowLeft size={14} />Retour</button>
                  <div className="flex items-center gap-3">
                    {stats.sansRemplacant > 0 && <p className="text-xs text-red-600 flex items-center gap-1.5 font-bold"><AlertOctagon size={12} />{stats.sansRemplacant} sans remplaçant</p>}
                    <button onClick={() => setStep('confirmation')} disabled={stats.modified === 0}
                      className="flex items-center gap-2 px-5 py-2.5 bg-[#1e2a5e] hover:bg-[#2a3875] text-white rounded-xl text-sm font-bold shadow-sm disabled:opacity-50 active:scale-95">
                      Confirmer ({stats.modified}) <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ════════════ STEP: CONFIRMATION ════════════ */}
        {step === 'confirmation' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-400 to-teal-400" />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-md"><Save size={17} className="text-white" /></div>
                <div><h3 className="text-base font-bold text-slate-800">Récapitulatif final</h3><p className="text-[11px] text-slate-400">Vérifiez avant validation</p></div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Technicien', val: selectedTech?.nom_complet || '', c: 'from-indigo-500 to-violet-600', icon: UserX },
                  { label: 'Période', val: `${formatDateFR(dateDebut)} → ${formatDateFR(dateFin)}`, c: 'from-blue-500 to-indigo-600', icon: Calendar },
                  { label: 'Motif', val: motif, c: 'from-violet-500 to-purple-600', icon: FileText },
                  { label: 'Heures', val: `${stats.totalHeures}h à réaffecter`, c: 'from-emerald-500 to-teal-600', icon: Clock },
                ].map(({ label, val, c, icon: Icon }) => (
                  <div key={label} className="p-3 bg-slate-50 rounded-xl border border-slate-100 relative overflow-hidden">
                    <div className={`absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r ${c}`} />
                    <div className="flex items-center gap-1.5 mb-1"><Icon size={10} className="text-slate-400" /><p className="text-[10px] font-bold text-slate-400 uppercase">{label}</p></div>
                    <p className="text-sm font-bold text-slate-800 truncate">{val}</p>
                  </div>
                ))}
              </div>
              {techCharges.some(tc => tc.heuresAssignees > 0) && (
                <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
                  <p className="text-[10px] font-bold text-indigo-600 uppercase mb-2 flex items-center gap-1.5"><BarChart3 size={10} />Charge des remplaçants</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {techCharges.filter(tc => tc.heuresAssignees > 0).map(tc => (
                      <div key={tc.tech.id} className="p-2.5 bg-white rounded-xl border border-indigo-100">
                        <div className="flex items-center gap-2 mb-1.5">
                          <p className="text-[11px] font-bold text-slate-700 flex-1 truncate">{tc.tech.nom_complet}</p>
                          <span className={atelierBadge(tc.tech.atelier_code)}>{tc.tech.atelier_code}</span>
                          <span className="text-[9px] font-black px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full">+{tc.heuresAssignees.toFixed(1)}h</span>
                        </div>
                        <ChargeBar current={tc.heuresExistantes} assigned={tc.heuresAssignees} max={tc.chargeMaxHeures} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="rounded-xl border border-slate-100 overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0 border-b border-slate-100">
                    <tr>{['Date', 'Titre', 'Durée', 'Avant', 'Après'].map(h => <th key={h} className="px-3 py-2.5 text-left font-bold text-slate-400 uppercase text-[10px]">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {interventions.filter(i => i.modified).map(item => (
                      <tr key={item.planning.id} className="hover:bg-blue-50/20">
                        <td className="px-3 py-2 font-mono text-slate-600">{formatDateFR(item.planning.date_prevue)}</td>
                        <td className="px-3 py-2 font-semibold text-slate-800 max-w-[140px] truncate">{item.planning.titre}</td>
                        <td className="px-3 py-2 font-bold text-emerald-600">{item.planning.duree_intervention || 1}h</td>
                        <td className="px-3 py-2 text-red-600 line-through">{item.techNomActuels.join(', ')}</td>
                        <td className="px-3 py-2 text-emerald-700 font-bold">{item.techNomNouveaux.join(', ') || '⚠ Vide'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <button onClick={() => setStep('interventions')} className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors"><ArrowLeft size={14} />Retour</button>
              <button onClick={saveChanges} disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 text-white rounded-xl text-sm font-bold shadow-sm disabled:opacity-50 active:scale-95">
                {saving ? <><Loader2 size={14} className="animate-spin" />Sauvegarde…</> : <><Save size={14} />{editingCongeId ? 'Modifier' : 'Enregistrer'} & réaffecter {stats.modified} intervention(s)</>}
              </button>
            </div>
          </div>
        )}

        {/* ════════════ STEP: DONE ════════════ */}
        {step === 'done' && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-emerald-500/10 blur-3xl" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-green-500/10 blur-3xl" />
            <div className="relative">
              <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-200/60 ring-4 ring-white"><CheckCircle2 size={36} className="text-white" /></div>
              <h3 className="text-2xl font-extrabold text-slate-800 tracking-tight mt-4">Congé enregistré ! 🎉</h3>
              <p className="text-slate-500 text-sm mt-2 max-w-lg mx-auto">{successMsg}</p>
              <div className="flex items-center justify-center gap-3 pt-6 flex-wrap">
                <button onClick={() => { setShowHistory(true); setStep('declaration'); setActiveTab('declaration'); }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border-2 border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-600 rounded-xl text-sm font-bold transition-all active:scale-95">
                  <CalendarDays size={14} />Voir l'historique
                </button>
                <button onClick={reset}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1e2a5e] hover:bg-[#2a3875] text-white rounded-xl text-sm font-bold shadow-sm transition-all active:scale-95">
                  <RefreshCw size={14} strokeWidth={2.5} />Nouvelle déclaration
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 py-3 text-[10px] text-slate-400">
          <Shield size={10} />
          <span>
            {step === 'declaration' && `${techniciens.length} tech. · ${atelierStats.length} ateliers · ${congesHistory.length} congé(s) · Seuil: ${chargeMaxHeures}h/jour`}
            {step === 'interventions' && `${stats.total} impactées · ${stats.totalHeures}h · ${stats.modified} modifiées · ${saturatedCount} saturé(s)`}
            {step === 'confirmation' && `${stats.modified} modifications · ${stats.totalHeures}h à réaffecter`}
            {step === 'done' && `${congesHistory.length} congé(s) dans l'historique`}
          </span>
        </div>

      </div>
    </div>
  );
}