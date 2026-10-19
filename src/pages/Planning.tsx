import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Atelier, JourFerie, Unite } from '../lib/types';
import { FREQUENCES } from '../lib/types';
import {
  Printer, CalendarDays, Edit2, Trash2, AlertTriangle,
  ChevronLeft, ChevronRight, RefreshCw, Clock, Wrench, MapPin,
  Shield, Moon, Sun, Search,
  Filter, X, Users, LayoutGrid, Table, CalendarRange,
  RotateCcw, Target, Sliders, Sparkles, Building2,
  Check, ClipboardCheck, ChevronDown, Loader2, ArrowRight, FileText, Plus
} from 'lucide-react';

// ─── Types ───
interface PlanningRow {
  id: number; plan_annuel_id: number; unite_id: number; atelier_id: number | null;
  equipement: string | null; code_gmao: string | null; titre: string;
  systeme: string | null; sous_systeme: string | null; frequence: string | null;
  date_prevue: string; duree_intervention: number; temps_logistique: number;
  materiel_libre: string | null; outillage_libre: string | null; fiche_inspection: string | null;
  consignation: 'Oui' | 'Non'; consignation_motif: string | null;
  jour_nuit: 'Jour' | 'Nuit'; num_shift: 1 | 2 | 3;
  statut: 'planifiee' | 'en_cours' | 'terminee' | 'reportee';
  techniciens_snapshot: string | null; created_by: string | null; created_at: string; updated_at: string;
  plan_annuel?: { annee: number; statut: string };
  ateliers?: { code: string; nom: string } | null;
  unites?: { code: string; nom: string };
  planning_techniciens?: { id: number; technicien_id: number; duree: number; techniciens: { id: number; nom: string; prenom: string; atelier_id: number | null }; }[];
}

interface DbTechnicien { id: number; nom: string; prenom: string; unite_id: number; atelier_id: number | null; specialite: string | null; statut: string; }
interface PlanAnnuel { id: number; annee: number; statut: string; unite_id: number; }

interface Filters {
  unite_id: string;
  plan_annuel_id: string;
  atelier_id: string;
  statut: string;
  frequence: string;
  search: string;
  date_start: string;
  date_end: string;
  jour_nuit: string;
}

interface Tache {
  id: number;
  numero: number;
  sous_equipement: string;
  operation: string;
  ok: boolean | null;
  motif: string;
  duree_min: number | null;
  initial: string;
}

interface InterventionWithTasks extends PlanningRow {
  taches?: Tache[];
}

// ─── Constants ───
const STATUTS = [
  { value: 'planifiee', label: 'Planifiée', color: 'bg-sky-50 text-sky-700', dot: 'bg-sky-500', solidBg: 'bg-sky-500' },
  { value: 'en_cours', label: 'En cours', color: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500', solidBg: 'bg-amber-500' },
  { value: 'terminee', label: 'Clôturée', color: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500', solidBg: 'bg-emerald-500' },
  { value: 'reportee', label: 'Reportée', color: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500', solidBg: 'bg-rose-500' },
];

const FREQ_COLORS: Record<string, string> = {
  Quotidienne: 'bg-orange-50 text-orange-600',
  Hebdomadaire: 'bg-cyan-50 text-cyan-600',
  Bimensuelle: 'bg-teal-50 text-teal-600',
  Mensuelle: 'bg-blue-50 text-blue-600',
  Bimestrielle: 'bg-indigo-50 text-indigo-600',
  Trimestrielle: 'bg-purple-50 text-purple-600',
  Quadrimestrielle: 'bg-violet-50 text-violet-600',
  Semestrielle: 'bg-pink-50 text-pink-600',
  Annuelle: 'bg-emerald-50 text-emerald-600',
  Bisannuelle: 'bg-lime-50 text-lime-600',
};

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
const WEEK_DAYS = ['Sam','Dim','Lun','Mar','Mer','Jeu','Ven'];

// ─── Helpers ───
const isAlgeriaWeekend = (d: string) => { if (!d) return false; const day = new Date(d + 'T00:00:00').getDay(); return day === 5 || day === 6; };
const isHoliday = (d: string, holidays: JourFerie[]) => holidays.some(h => h.date === d);
const formatDateFR = (iso: string) => { if (!iso) return '—'; const [y, m, dd] = iso.split('-'); return `${dd}/${m}/${y}`; };
const pad2 = (n: number) => String(n).padStart(2, '0');
const isValidISODate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d + 'T00:00:00').getTime());

// ─── Empty State ───
function EmptyState({ icon: Icon, title, sub }: { icon: any; title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="w-20 h-20 rounded-2xl bg-slate-50 flex items-center justify-center">
        <Icon size={32} className="text-slate-300" strokeWidth={1.5} />
      </div>
      <p className="text-base font-bold text-slate-500">{title}</p>
      <p className="text-xs text-slate-400 text-center max-w-sm">{sub}</p>
    </div>
  );
}

// ═══════════════════════════════════════
// EDIT MODAL
// ═══════════════════════════════════════
function EditModal({ row, onClose, onSave, readOnly }: {
  row: PlanningRow | null; onClose: () => void; onSave: (u: Partial<PlanningRow>) => Promise<void>; readOnly: boolean;
}) {
  const [form, setForm] = useState({
    statut: row?.statut ?? 'planifiee', date_prevue: row?.date_prevue ?? '',
    duree_intervention: row?.duree_intervention ?? 0, consignation: row?.consignation ?? 'Non',
    consignation_motif: row?.consignation_motif ?? '', jour_nuit: row?.jour_nuit ?? 'Jour',
    num_shift: row?.num_shift ?? 1, materiel_libre: row?.materiel_libre ?? '',
    outillage_libre: row?.outillage_libre ?? '', fiche_inspection: row?.fiche_inspection ?? '',
  });
  const [saving, setSaving] = useState(false);
  const handleSave = async () => { setSaving(true); await onSave(form); setSaving(false); };
  if (!row) return null;

  const inp = "w-full rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[#1e2a5e]/20 transition-all outline-none border border-transparent focus:border-[#1e2a5e]/30";
  const lbl = "block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-br from-[#1e2a5e] to-[#2a3875] px-6 py-5 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-blue-400/20 blur-3xl" />
          <div className="relative flex items-center justify-between">
            <div className="min-w-0 flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-sm ring-1 ring-white/20 flex items-center justify-center shrink-0">
                <Wrench size={20} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-blue-200/80 uppercase tracking-widest mb-0.5">{readOnly ? 'Détails intervention' : 'Modifier intervention'}</p>
                <h2 className="text-base font-bold text-white truncate">{row.titre}</h2>
                <p className="text-[11px] text-blue-200/60 mt-0.5 truncate">{row.code_gmao && <span className="font-mono">{row.code_gmao} — </span>}{row.equipement}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all shrink-0">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50">
          <div className="grid grid-cols-3 gap-3">
            {[
              { l: 'Atelier', v: row.ateliers?.code ?? '—', c: 'bg-blue-500', icon: Wrench },
              { l: 'Fréquence', v: row.frequence ?? '—', c: 'bg-violet-500', icon: RotateCcw },
              { l: 'Système', v: `${row.systeme ?? '—'}${row.sous_systeme ? ` / ${row.sous_systeme}` : ''}`, c: 'bg-emerald-500', icon: Sparkles }
            ].map(item => {
              const Icon = item.icon;
              return (
                <div key={item.l} className="p-3 bg-white rounded-2xl shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-7 h-7 rounded-lg ${item.c} flex items-center justify-center`}>
                      <Icon size={12} className="text-white" strokeWidth={2.5} />
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{item.l}</p>
                  </div>
                  <p className="text-sm font-bold text-slate-700 truncate">{item.v}</p>
                </div>
              );
            })}
          </div>

          {readOnly ? (
            <div className="grid grid-cols-2 gap-3">
              {[['Statut', STATUTS.find(s => s.value === form.statut)?.label ?? form.statut], ['Date prévue', formatDateFR(form.date_prevue)], ['Durée', `${form.duree_intervention}h`], ['Consignation', form.consignation], ['Jour/Nuit', `${form.jour_nuit} — Shift ${form.num_shift}`], ['Matériel', form.materiel_libre || '—'], ['Outillage', form.outillage_libre || '—'], ['Fiche', form.fiche_inspection || '—']].map(([l, v]) => (
                <div key={l as string} className="p-3 bg-white rounded-2xl shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{l}</p>
                  <p className="text-sm font-semibold text-slate-700 mt-0.5">{v}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white rounded-2xl p-5 shadow-sm">
              <div><label className={lbl}>Statut</label><select value={form.statut} onChange={e => setForm(f => ({...f, statut: e.target.value as any}))} className={inp}>{STATUTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
              <div><label className={lbl}>Date prévue</label><input type="date" value={form.date_prevue} onChange={e => setForm(f => ({...f, date_prevue: e.target.value}))} className={inp} /></div>
              <div><label className={lbl}>Durée (h)</label><input type="number" value={form.duree_intervention} min={0} step={0.5} onChange={e => setForm(f => ({...f, duree_intervention: Number(e.target.value)}))} className={inp} /></div>
              <div><label className={lbl}>Consignation</label><select value={form.consignation} onChange={e => setForm(f => ({...f, consignation: e.target.value as any}))} className={inp}><option value="Non">Non</option><option value="Oui">Oui</option></select></div>
              {form.consignation === 'Oui' && <div className="md:col-span-2"><label className={lbl}>Motif *</label><input type="text" value={form.consignation_motif} onChange={e => setForm(f => ({...f, consignation_motif: e.target.value}))} className={inp} placeholder="Motif obligatoire" /></div>}
              <div><label className={lbl}>Jour / Nuit</label><select value={form.jour_nuit} onChange={e => setForm(f => ({...f, jour_nuit: e.target.value as any}))} className={inp}><option value="Jour">Jour</option><option value="Nuit">Nuit</option></select></div>
              <div><label className={lbl}>Shift</label><select value={form.num_shift} onChange={e => setForm(f => ({...f, num_shift: Number(e.target.value) as any}))} className={inp}><option value={1}>Shift 1</option><option value={2}>Shift 2</option><option value={3}>Shift 3</option></select></div>
              <div><label className={lbl}>Matériel</label><input type="text" value={form.materiel_libre ?? ''} onChange={e => setForm(f => ({...f, materiel_libre: e.target.value}))} className={inp} /></div>
              <div><label className={lbl}>Outillage</label><input type="text" value={form.outillage_libre ?? ''} onChange={e => setForm(f => ({...f, outillage_libre: e.target.value}))} className={inp} /></div>
              <div className="md:col-span-2"><label className={lbl}>Fiche inspection</label><input type="text" value={form.fiche_inspection ?? ''} onChange={e => setForm(f => ({...f, fiche_inspection: e.target.value}))} className={`${inp} font-mono`} /></div>
            </div>
          )}

          {row.planning_techniciens && row.planning_techniciens.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-[#1e2a5e] flex items-center justify-center">
                  <Users size={14} className="text-white" />
                </div>
                <p className="text-sm font-bold text-slate-700">Techniciens assignés</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {row.planning_techniciens.map(pt => (
                  <div key={pt.id} className="flex items-center gap-2 bg-slate-50 rounded-xl pl-1 pr-3 py-1">
                    <div className="w-7 h-7 bg-[#1e2a5e] text-white rounded-lg flex items-center justify-center text-[10px] font-bold shadow-sm">{pt.techniciens.prenom[0]}{pt.techniciens.nom[0]}</div>
                    <div><p className="text-xs font-bold text-slate-700">{pt.techniciens.prenom} {pt.techniciens.nom}</p><p className="text-[10px] text-slate-400">{pt.duree}h</p></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {!readOnly && (
          <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors">Annuler</button>
            <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-[#1e2a5e] hover:bg-[#2a3875] text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-all shadow-sm">{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// INTERVENTION CARD
// ═══════════════════════════════════════
function InterventionCard({ row, holidays, canEdit, onEdit, onDelete, onPrint, onOpen, onOpenTasks }: {
  row: InterventionWithTasks;
  holidays: JourFerie[];
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onPrint: () => void;
  onStatusChange: (id: number, s: string) => void;
  onOpen: () => void;
  onOpenTasks: (taskIndex?: number) => void;
}) {
  const st = STATUTS.find(s => s.value === row.statut);
  const hol = isHoliday(row.date_prevue, holidays);
  const we = isAlgeriaWeekend(row.date_prevue);
  const isAlert = hol || we;
  const dateObj = new Date(row.date_prevue + 'T00:00:00');
  const dayNum = dateObj.getDate();
  const monthShort = MONTHS_SHORT[dateObj.getMonth()];
  const weekDay = WEEK_DAYS[((dateObj.getDay() + 1) % 7)];

  const taches = row.taches || [];
  const totalTaches = taches.length;
  const tachesRealisees = taches.filter(t => t.ok !== null).length;
  const tachesOk = taches.filter(t => t.ok === true).length;
  const tachesNok = taches.filter(t => t.ok === false).length;
  const scorePercent = totalTaches > 0 ? Math.round((tachesOk / totalTaches) * 100) : 0;

  const getBubbleStyle = (tache: Tache) => {
    if (tache.ok === true) return 'bg-emerald-500 text-white hover:bg-emerald-600';
    if (tache.ok === false) return 'bg-rose-500 text-white hover:bg-rose-600';
    return 'bg-slate-100 text-slate-500 hover:bg-slate-200';
  };

  return (
    <div className={`group bg-white rounded-2xl ring-1 ring-slate-100 hover:ring-slate-200 transition-all duration-200 overflow-hidden ${
      isAlert ? 'ring-1 ring-amber-200' : ''
    }`}>
      <div className="flex flex-col lg:flex-row">
        <div className="flex-1 min-w-0 p-4 lg:border-r border-slate-100 cursor-pointer" onClick={onOpen}>
          <div className="flex items-start gap-4">
            <div className={`relative w-16 shrink-0 flex flex-col items-center justify-center py-3 rounded-2xl ${
              isAlert ? 'bg-amber-50' : 'bg-slate-50'
            }`}>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isAlert ? 'text-amber-600' : 'text-slate-400'}`}>{weekDay}</span>
              <span className={`text-2xl font-bold leading-none mt-0.5 tabular-nums ${isAlert ? 'text-amber-700' : 'text-[#1e2a5e]'}`}>{dayNum}</span>
              <span className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${isAlert ? 'text-amber-500' : 'text-slate-400'}`}>{monthShort}</span>
              {(we || hol) && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1">
                  {we && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Week-end" />}
                  {hol && <span className="w-1.5 h-1.5 rounded-full bg-rose-500" title="Férié" />}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {st && (
                    <span className={`inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-lg font-bold ${st.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st.solidBg}`} />{st.label}
                    </span>
                  )}
                  {row.consignation === 'Oui' && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg">
                      <Shield size={10} />Consignation
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                  <button onClick={onPrint} className="p-1.5 text-slate-400 hover:text-[#1e2a5e] hover:bg-blue-50 rounded-lg transition-all" title="Imprimer">
                    <Printer size={13} />
                  </button>
                  {canEdit && (<>
                    <button onClick={onEdit} className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-all" title="Modifier">
                      <Edit2 size={13} />
                    </button>
                    <button onClick={onDelete} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all" title="Supprimer">
                      <Trash2 size={13} />
                    </button>
                  </>)}
                </div>
              </div>

              <h3 className="font-bold text-slate-800 text-[14px] leading-snug group-hover:text-[#1e2a5e] transition-colors line-clamp-1">{row.titre}</h3>
              <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                {row.systeme}{row.sous_systeme && ` / ${row.sous_systeme}`}
                {row.equipement && <span className="text-slate-500"> — {row.equipement}</span>}
              </p>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px]">
                <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                  <Clock size={11} className="text-emerald-500" />
                  <span className="font-bold text-emerald-600">{row.duree_intervention}h</span>
                </span>
                <span className={`inline-flex items-center gap-1 font-medium ${row.jour_nuit === 'Nuit' ? 'text-indigo-600' : 'text-orange-600'}`}>
                  {row.jour_nuit === 'Nuit' ? <Moon size={10} /> : <Sun size={10} />}
                  {row.jour_nuit} · S{row.num_shift}
                </span>
                {row.unites && (
                  <span className="inline-flex items-center gap-1 text-blue-600 font-medium">
                    <MapPin size={10} />{row.unites.code}
                  </span>
                )}
                {row.ateliers && (
                  <span className="inline-flex items-center gap-1 text-violet-600 font-medium">
                    <Wrench size={10} />{row.ateliers.code}
                  </span>
                )}
                {row.frequence && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${FREQ_COLORS[row.frequence] ?? 'bg-slate-50 text-slate-600'}`}>
                    {row.frequence}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {totalTaches > 0 ? (
          <div className="lg:w-[420px] shrink-0 p-4 bg-slate-50 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#1e2a5e] flex items-center justify-center">
                  <ClipboardCheck size={13} className="text-white" strokeWidth={2.5} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tâches</p>
                  <p className="text-xs font-bold text-slate-700 tabular-nums">{tachesRealisees}/{totalTaches}</p>
                </div>
              </div>
              {tachesRealisees > 0 && (
                <div className={`px-2.5 py-1 rounded-xl text-white text-xs font-bold ${
                  scorePercent >= 80 ? 'bg-emerald-500' : scorePercent >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                }`}>{scorePercent}%</div>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5 mb-3">
              {taches.map((tache, idx) => (
                <button key={tache.id} onClick={(e) => { e.stopPropagation(); onOpenTasks(idx); }}
                  className={`w-8 h-8 rounded-lg text-[11px] font-bold flex items-center justify-center transition-all hover:scale-110 active:scale-95 ${getBubbleStyle(tache)}`}
                  title={`Tâche ${tache.numero}: ${tache.operation}${tache.ok !== null ? ` — ${tache.ok ? 'OK' : 'NOK'}` : ''}`}>
                  {tache.ok === true ? <Check size={13} strokeWidth={3} /> : tache.ok === false ? <X size={13} strokeWidth={3} /> : <span className="tabular-nums">{tache.numero}</span>}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <div className="relative h-2 bg-white rounded-full overflow-hidden ring-1 ring-slate-100">
                <div className="absolute inset-y-0 left-0 flex">
                  {tachesOk > 0 && <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${(tachesOk / totalTaches) * 100}%` }} />}
                  {tachesNok > 0 && <div className="h-full bg-rose-500 transition-all duration-500" style={{ width: `${(tachesNok / totalTaches) * 100}%` }} />}
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-3">
                  {tachesOk > 0 && <span className="flex items-center gap-1 font-bold text-emerald-600"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{tachesOk} OK</span>}
                  {tachesNok > 0 && <span className="flex items-center gap-1 font-bold text-rose-600"><div className="w-1.5 h-1.5 rounded-full bg-rose-500" />{tachesNok} NOK</span>}
                  {totalTaches - tachesRealisees > 0 && <span className="flex items-center gap-1 font-bold text-slate-500"><div className="w-1.5 h-1.5 rounded-full bg-slate-400" />{totalTaches - tachesRealisees} restant</span>}
                </div>
                <button onClick={(e) => { e.stopPropagation(); onOpenTasks(); }} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#1e2a5e] hover:bg-[#2a3875] text-white text-[10px] font-bold transition-all">
                  Détails <ArrowRight size={9} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="lg:w-[420px] shrink-0 p-4 bg-slate-50 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-2">
                <FileText size={20} className="text-slate-300" />
              </div>
              <p className="text-xs font-semibold text-slate-400">Aucune tâche configurée</p>
              {row.fiche_inspection && <p className="text-[10px] text-slate-300 mt-0.5 truncate max-w-[300px]">Fichier: {row.fiche_inspection}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// TASKS DETAIL MODAL
// ═══════════════════════════════════════
function TasksDetailModal({ row, initialTaskIndex, onClose, onSaveTasks, canEdit }: {
  row: InterventionWithTasks | null;
  initialTaskIndex?: number;
  onClose: () => void;
  onSaveTasks: (rowId: number, taches: Tache[], deletedIds?: number[]) => Promise<void>;
  canEdit: boolean;
}) {
  const [taches, setTaches] = useState<Tache[]>(row?.taches || []);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [motifDrafts, setMotifDrafts] = useState<Record<number, string>>({});
  const [dureeDrafts, setDureeDrafts] = useState<Record<number, string>>({});
  const [initialDrafts, setInitialDrafts] = useState<Record<number, string>>({});
  const [deletedIds, setDeletedIds] = useState<number[]>([]);
  const tempIdRef = useRef(0);

  useEffect(() => {
    if (row?.taches) {
      setTaches(row.taches);
      const md: Record<number, string> = {};
      const dd: Record<number, string> = {};
      const id: Record<number, string> = {};
      row.taches.forEach(t => {
        md[t.id] = t.motif || '';
        dd[t.id] = t.duree_min ? String(t.duree_min) : '';
        id[t.id] = t.initial || '';
      });
      setMotifDrafts(md);
      setDureeDrafts(dd);
      setInitialDrafts(id);
      setDeletedIds([]);
    }
    if (initialTaskIndex !== undefined && row?.taches?.[initialTaskIndex]) {
      setExpandedId(row.taches[initialTaskIndex].id);
    }
  }, [row, initialTaskIndex]);

  // ── Ajout d'une tâche (id temporaire négatif, insérée en base lors de l'enregistrement) ──
  const handleAddTache = () => {
    tempIdRef.current -= 1;
    const newId = tempIdRef.current;
    const dernierGroupe = taches.length > 0 ? taches[taches.length - 1].sous_equipement : '';
    const nouvelle: Tache = {
      id: newId, numero: taches.length + 1,
      sous_equipement: dernierGroupe, operation: '',
      ok: null, motif: '', duree_min: null, initial: '',
    };
    setTaches(prev => [...prev, nouvelle]);
    setExpandedId(newId);
  };

  // ── Suppression d'une tâche : confirmation si un résultat OK/NOK a déjà été saisi ──
  const handleDeleteTache = (tacheId: number) => {
    const t = taches.find(x => x.id === tacheId);
    if (t && t.ok !== null) {
      const ok = window.confirm('Cette tâche a déjà un résultat (OK/NOK) enregistré. Le supprimer effacera définitivement ce résultat. Continuer ?');
      if (!ok) return;
    } else if (!window.confirm('Supprimer cette tâche ?')) {
      return;
    }
    setTaches(prev => prev.filter(x => x.id !== tacheId));
    if (tacheId > 0) setDeletedIds(prev => [...prev, tacheId]);
    if (expandedId === tacheId) setExpandedId(null);
  };

  const handleUpdateNouvelleTache = (tacheId: number, field: 'operation' | 'sous_equipement', value: string) => {
    setTaches(prev => prev.map(t => t.id === tacheId ? { ...t, [field]: value } : t));
  };

  if (!row) return null;

  const totalTaches = taches.length;
  const tachesRealisees = taches.filter(t => t.ok !== null).length;
  const tachesOk = taches.filter(t => t.ok === true).length;
  const tachesNok = taches.filter(t => t.ok === false).length;

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
    const nouvellesSansLibelle = taches.filter(t => t.id < 0 && !t.operation.trim());
    if (nouvellesSansLibelle.length > 0) {
      alert('Veuillez saisir un libellé pour chaque nouvelle tâche.');
      setExpandedId(nouvellesSansLibelle[0].id);
      return;
    }
    setSaving(true);
    try {
      const finalTaches = taches.map((t, idx) => ({
        ...t,
        numero: idx + 1,
        motif: motifDrafts[t.id] || t.motif,
        duree_min: dureeDrafts[t.id] ? Number(dureeDrafts[t.id]) : t.duree_min,
        initial: initialDrafts[t.id] || t.initial,
      }));
      await onSaveTasks(row.id, finalTaches, deletedIds);
      onClose();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-br from-[#1e2a5e] to-[#2a3875] px-6 py-5 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-blue-400/20 blur-3xl" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0 flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-sm ring-1 ring-white/20 flex items-center justify-center shrink-0">
                <ClipboardCheck size={20} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-blue-200/80 uppercase tracking-widest mb-0.5">Fiche d'intervention</p>
                <h2 className="text-base font-bold text-white truncate">{row.titre}</h2>
                <p className="text-[11px] text-blue-200/60 mt-0.5 truncate">
                  {row.code_gmao && <span className="font-mono">{row.code_gmao} — </span>}
                  {row.equipement} · {formatDateFR(row.date_prevue)}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all shrink-0">
              <X size={16} />
            </button>
          </div>
          <div className="relative mt-3 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="absolute inset-y-0 left-0 flex">
              {tachesOk > 0 && <div className="h-full bg-emerald-400 transition-all duration-500" style={{ width: `${(tachesOk / totalTaches) * 100}%` }} />}
              {tachesNok > 0 && <div className="h-full bg-rose-400 transition-all duration-500" style={{ width: `${(tachesNok / totalTaches) * 100}%` }} />}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 bg-slate-50 space-y-2">
          {taches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center">
                <FileText size={32} className="text-slate-300" />
              </div>
              <p className="text-base font-bold text-slate-500">Aucune tâche configurée</p>
            </div>
          ) : (
            Object.entries(
              taches.reduce((acc, t) => {
                const key = t.sous_equipement || 'Général';
                if (!acc[key]) acc[key] = [];
                acc[key].push(t);
                return acc;
              }, {} as Record<string, Tache[]>)
            ).map(([sousEquip, sousTaches]) => (
              <div key={sousEquip} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 bg-gradient-to-r from-slate-50 to-slate-100/50 border-b border-slate-100 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-[#1e2a5e] flex items-center justify-center">
                    <Wrench size={11} className="text-white" />
                  </div>
                  <p className="text-xs font-bold text-slate-700">{sousEquip}</p>
                  <span className="ml-auto text-[10px] font-bold text-slate-500 tabular-nums">{sousTaches.filter(t => t.ok !== null).length}/{sousTaches.length}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {sousTaches.map(tache => {
                    const isExpanded = expandedId === tache.id;
                    const currentMotif = motifDrafts[tache.id] ?? tache.motif ?? '';
                    const currentDuree = dureeDrafts[tache.id] ?? (tache.duree_min ? String(tache.duree_min) : '');
                    const currentInitial = initialDrafts[tache.id] ?? tache.initial ?? '';
                    return (
                      <div key={tache.id} className={`transition-all ${tache.ok === true ? 'bg-emerald-50/30' : tache.ok === false ? 'bg-rose-50/30' : ''}`}>
                        <div className="p-3 flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 shadow-sm ${
                            tache.ok === true ? 'bg-emerald-500 text-white' : tache.ok === false ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {tache.ok === true ? <Check size={14} strokeWidth={3} /> : tache.ok === false ? <X size={14} strokeWidth={3} /> : tache.numero}
                          </div>
                          <div className="flex-1 min-w-0">
                            {tache.id < 0 && canEdit ? (
                              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                                <Plus size={10} strokeWidth={3} />Nouvelle tâche
                              </p>
                            ) : null}
                            <p className={`text-sm font-semibold ${tache.ok === true ? 'text-emerald-800' : tache.ok === false ? 'text-rose-800' : 'text-slate-700'}`}>
                              {tache.id < 0 && canEdit ? (
                                <span className="italic text-slate-400">{tache.operation || 'Libellé à renseigner…'}</span>
                              ) : tache.operation}
                            </p>
                            {tache.ok === false && currentMotif && (
                              <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1">
                                <AlertTriangle size={10} /><span className="font-medium">Motif :</span> {currentMotif}
                              </p>
                            )}
                          </div>
                          {canEdit ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button onClick={() => handleSetOk(tache.id, true)} className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${tache.ok === true ? 'bg-emerald-500 text-white shadow-md' : 'bg-white text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 ring-1 ring-slate-200'}`}>
                                <Check size={12} strokeWidth={3} />OK
                              </button>
                              <button onClick={() => handleSetOk(tache.id, false)} className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${tache.ok === false ? 'bg-rose-500 text-white shadow-md' : 'bg-white text-slate-500 hover:bg-rose-50 hover:text-rose-600 ring-1 ring-slate-200'}`}>
                                <X size={12} strokeWidth={3} />NOK
                              </button>
                              {tache.ok !== null && (
                                <button onClick={() => handleReset(tache.id)} className="flex items-center justify-center w-7 h-7 rounded-xl bg-white hover:bg-slate-100 text-slate-400 hover:text-slate-600 ring-1 ring-slate-200 transition-all" title="Réinitialiser">
                                  <RotateCcw size={11} />
                                </button>
                              )}
                              <button onClick={() => setExpandedId(isExpanded ? null : tache.id)} className={`flex items-center justify-center w-7 h-7 rounded-xl transition-all ${isExpanded ? 'bg-[#1e2a5e] text-white' : 'bg-white text-slate-400 hover:text-[#1e2a5e] hover:bg-blue-50 ring-1 ring-slate-200'}`} title="Détails">
                                <ChevronDown size={12} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              </button>
                              <button onClick={() => handleDeleteTache(tache.id)} className="flex items-center justify-center w-7 h-7 rounded-xl bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 ring-1 ring-slate-200 transition-all" title="Supprimer la tâche">
                                <Trash2 size={11} />
                              </button>
                            </div>
                          ) : (
                            <span className={`text-[10px] px-2 py-1 rounded-lg font-bold ${tache.ok === true ? 'bg-emerald-100 text-emerald-700' : tache.ok === false ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>
                              {tache.ok === true ? 'OK' : tache.ok === false ? 'NOK' : 'En attente'}
                            </span>
                          )}
                        </div>
                        {isExpanded && canEdit && (
                          <div className="px-3 pb-3 pl-14 space-y-2.5 bg-slate-50/50">
                            {tache.id < 0 && (
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Sous-équipement</label>
                                  <input type="text" value={tache.sous_equipement} onChange={e => handleUpdateNouvelleTache(tache.id, 'sous_equipement', e.target.value)} placeholder="Ex: Moteur" className="w-full rounded-xl px-3 py-2 text-sm bg-white outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-[#1e2a5e]/20" />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Libellé de la tâche <span className="text-rose-500">*</span></label>
                                  <input type="text" value={tache.operation} onChange={e => handleUpdateNouvelleTache(tache.id, 'operation', e.target.value)} placeholder="Ex: Vérifier le serrage…" className={`w-full rounded-xl px-3 py-2 text-sm bg-white outline-none ${!tache.operation.trim() ? 'ring-2 ring-rose-300 focus:ring-rose-400' : 'ring-1 ring-slate-200 focus:ring-2 focus:ring-[#1e2a5e]/20'}`} />
                                </div>
                              </div>
                            )}
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                                Motif {tache.ok === false && <span className="text-rose-500">*</span>}
                              </label>
                              <textarea value={currentMotif} onChange={e => setMotifDrafts(prev => ({ ...prev, [tache.id]: e.target.value }))} placeholder={tache.ok === false ? "Motif obligatoire pour NOK…" : "Commentaire optionnel…"} rows={2}
                                className={`w-full rounded-xl px-3 py-2 text-sm bg-white outline-none transition-all resize-none ${tache.ok === false && !currentMotif.trim() ? 'ring-2 ring-rose-300 focus:ring-rose-400' : 'ring-1 ring-slate-200 focus:ring-2 focus:ring-[#1e2a5e]/20'}`} />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Durée (min)</label>
                                <input type="number" min={0} value={currentDuree} onChange={e => setDureeDrafts(prev => ({ ...prev, [tache.id]: e.target.value }))} placeholder="Ex: 15" className="w-full rounded-xl px-3 py-2 text-sm bg-white outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-[#1e2a5e]/20 tabular-nums" />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Initiales</label>
                                <input type="text" value={currentInitial} onChange={e => setInitialDrafts(prev => ({ ...prev, [tache.id]: e.target.value.toUpperCase() }))} placeholder="Ex: JD" maxLength={5} className="w-full rounded-xl px-3 py-2 text-sm bg-white outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-[#1e2a5e]/20 uppercase font-bold tracking-wider" />
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
          {canEdit && (
            <button onClick={handleAddTache} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-[#1e2a5e]/40 hover:text-[#1e2a5e] hover:bg-white transition-all text-sm font-bold">
              <Plus size={14} strokeWidth={3} />Ajouter une tâche
            </button>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-[11px]">
            <span className="font-bold text-slate-500 tabular-nums">{tachesRealisees}/{totalTaches} traitées</span>
            {tachesNok > 0 && <span className="flex items-center gap-1 font-bold text-rose-600"><AlertTriangle size={11} />{tachesNok} NOK</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors">{canEdit ? 'Annuler' : 'Fermer'}</button>
            {canEdit && (
              <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-[#1e2a5e] hover:bg-[#2a3875] text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-all shadow-sm flex items-center gap-2">
                {saving ? <><Loader2 size={14} className="animate-spin" />Enregistrement…</> : <><Check size={14} />Enregistrer</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════
export default function Planning() {
  const { profile } = useAuth();
  const role = (profile?.role ?? '').trim().toLowerCase();
  const isAdmin = role === 'admin';
  const isSuperAdmin = role === 'super_admin';
  const canViewAllUnits = isAdmin || isSuperAdmin;
  const canEdit = ['admin', 'super_admin', 'responsable_unite', 'charge_unite'].includes(role);
  const effectiveUniteId = canViewAllUnits ? null : (profile?.unite_id ?? null);
  // Le chargé d'unité est verrouillé sur son unique atelier, y compris dans le filtrage du planning.
  const isChargeUnite = role === 'charge_unite';
  const effectiveAtelierId = isChargeUnite ? (profile?.atelier_id ?? null) : null;

  const [rows, setRows] = useState<InterventionWithTasks[]>([]);
  const [ateliers, setAteliers] = useState<Atelier[]>([]);
  const [unites, setUnites] = useState<Unite[]>([]);
  const [, setTechniciens] = useState<DbTechnicien[]>([]);
  const [holidays, setHolidays] = useState<JourFerie[]>([]);
  const [plansAnnuels, setPlansAnnuels] = useState<PlanAnnuel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table' | 'calendar'>('cards');
  const [editRow, setEditRow] = useState<PlanningRow | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [printId, setPrintId] = useState<number | null>(null);
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [refreshing, setRefreshing] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  const [showTasksModal, setShowTasksModal] = useState(false);
  const [tasksRow, setTasksRow] = useState<InterventionWithTasks | null>(null);
  const [initialTaskIndex, setInitialTaskIndex] = useState<number | undefined>(undefined);

  const [filters, setFilters] = useState<Filters>({
    unite_id: '',
    plan_annuel_id: '',
    atelier_id: '',
    statut: '',
    frequence: '',
    search: '',
    date_start: '',
    date_end: '',
    jour_nuit: ''
  });

  // ✅ FIX 1 : Debounce SÉPARÉ pour dates + search (les inputs texte)
  const [debouncedDates, setDebouncedDates] = useState({
    date_start: filters.date_start,
    date_end: filters.date_end,
    search: filters.search
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedDates({
        date_start: filters.date_start,
        date_end: filters.date_end,
        search: filters.search
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [filters.date_start, filters.date_end, filters.search]);

  const updateFilters = (updater: (f: Filters) => Filters) => {
    setHasUserInteracted(true);
    setFilters(updater);
  };

  useEffect(() => {
    if (canViewAllUnits) {
      supabase.from('unites').select('*').order('code').then(({ data }) => {
        if (data) setUnites(data);
      });
    }
  }, [canViewAllUnits]);

  useEffect(() => {
    (async () => {
      let q = supabase.from('plan_annuel').select('id, annee, statut, unite_id').order('annee', { ascending: false });

      if (canViewAllUnits && filters.unite_id) {
        q = q.eq('unite_id', Number(filters.unite_id));
      } else if (!canViewAllUnits && effectiveUniteId) {
        q = q.eq('unite_id', effectiveUniteId);
      }

      const { data } = await q;
      if (data) {
        setPlansAnnuels(data);
        if (filters.plan_annuel_id) {
          const stillValid = data.some(p => String(p.id) === filters.plan_annuel_id);
          if (!stillValid) setFilters(f => ({ ...f, plan_annuel_id: '' }));
        }
        if (!filters.plan_annuel_id) {
          const defaultPlan = data.find(p => p.statut === 'publie') ?? data[0];
          if (defaultPlan) setFilters(f => ({ ...f, plan_annuel_id: String(defaultPlan.id) }));
        }
      } else {
        setPlansAnnuels([]);
      }
    })();
  }, [effectiveUniteId, canViewAllUnits, filters.unite_id]);

  useEffect(() => {
    Promise.all([
      supabase.from('ateliers').select('*').order('code'),
      supabase.from('jours_feries').select('*').order('date')
    ]).then(([{ data: a }, { data: h }]) => {
      if (a) setAteliers(a);
      if (h) setHolidays(h);
    }).catch((err) => {
      console.error('Erreur chargement ateliers/jours fériés:', err);
      setError('Erreur de chargement des données de référence.');
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!effectiveUniteId && !canViewAllUnits) return;
    let q = supabase.from('techniciens').select('id, nom, prenom, unite_id, atelier_id, specialite, statut').order('nom');
    if (effectiveUniteId) q = q.eq('unite_id', effectiveUniteId);
    q.then(({ data }) => { if (data) setTechniciens(data); });
  }, [effectiveUniteId, canViewAllUnits]);

  // ✅ FIX 2 : fetchPlanning avec dépendances explicites sur TOUS les filtres pertinents
  const fetchPlanning = useCallback(async () => {
    setError(null);
    try {
      let q = supabase.from('planning').select(`*, plan_annuel:plan_annuel_id(annee, statut), ateliers:atelier_id(code, nom), unites:unite_id(code, nom), planning_techniciens(id, technicien_id, duree, techniciens(id, nom, prenom, atelier_id))`).order('date_prevue', { ascending: true });

      if (canViewAllUnits && filters.unite_id) {
        q = q.eq('unite_id', Number(filters.unite_id));
      } else if (!canViewAllUnits && effectiveUniteId) {
        q = q.eq('unite_id', effectiveUniteId);
      }

      if (filters.plan_annuel_id) q = q.eq('plan_annuel_id', Number(filters.plan_annuel_id));
      if (effectiveAtelierId) {
        q = q.eq('atelier_id', effectiveAtelierId);
      } else if (filters.atelier_id) {
        q = q.eq('atelier_id', Number(filters.atelier_id));
      }
      if (filters.statut) q = q.eq('statut', filters.statut);
      if (filters.frequence) q = q.eq('frequence', filters.frequence);
      if (filters.jour_nuit) q = q.eq('jour_nuit', filters.jour_nuit);

      // ✅ Utilise les valeurs DEBOUNCÉES pour les dates
      if (debouncedDates.date_start && isValidISODate(debouncedDates.date_start)) {
        q = q.gte('date_prevue', debouncedDates.date_start);
      }
      if (debouncedDates.date_end && isValidISODate(debouncedDates.date_end)) {
        q = q.lte('date_prevue', debouncedDates.date_end);
      }

      const { data, error: e } = await q.limit(1000);
      if (e) throw new Error(e.message);

      let result: PlanningRow[] = data ?? [];

      // Recherche textuelle en local (avec debounce aussi)
      if (debouncedDates.search.trim()) {
        const s = debouncedDates.search.toLowerCase();
        result = result.filter(r =>
          r.titre?.toLowerCase().includes(s) ||
          r.code_gmao?.toLowerCase().includes(s) ||
          r.equipement?.toLowerCase().includes(s) ||
          r.systeme?.toLowerCase().includes(s) ||
          r.techniciens_snapshot?.toLowerCase().includes(s)
        );
      }

      const rowIds = result.map(r => r.id);
      let tachesMap: Record<number, Tache[]> = {};
      if (rowIds.length > 0) {
        const { data: tachesData } = await supabase.from('planning_taches').select('*').in('planning_id', rowIds).order('numero');
        if (tachesData) {
          tachesData.forEach((t: any) => {
            if (!tachesMap[t.planning_id]) tachesMap[t.planning_id] = [];
            tachesMap[t.planning_id].push({
              id: t.id, numero: t.numero,
              sous_equipement: t.sous_equipement || '', operation: t.operation,
              ok: t.ok, motif: t.motif || '',
              duree_min: t.duree_min, initial: t.initial || '',
            });
          });
        }
      }

      const rowsWithTasks: InterventionWithTasks[] = result.map(r => ({ ...r, taches: tachesMap[r.id] || [] }));
      setRows(rowsWithTasks);
    } catch (err: any) {
      setError(err.message);
      setRows([]);
    }
  }, [
    filters.unite_id,
    filters.plan_annuel_id,
    filters.atelier_id,
    filters.statut,
    filters.frequence,
    filters.jour_nuit,
    debouncedDates.date_start,
    debouncedDates.date_end,
    debouncedDates.search,
    effectiveUniteId,
    effectiveAtelierId,
    canViewAllUnits
  ]);

  // Le premier garde-fou («a-t-on assez de contexte pour savoir quoi charger ?») suffit :
  // le second («hasUserInteracted») empêchait tout chargement initial pour admin/
  // responsable_unite (rien ne met ce flag à true tant qu'aucun filtre n'a été touché
  // manuellement), donnant l'impression que le planning/les filtres ne fonctionnaient
  // pas — la liste restait vide jusqu'au premier changement de filtre. Seul charge_unite
  // s'en sortait, par effet de bord du verrouillage automatique de son atelier.
  useEffect(() => {
    if (!filters.plan_annuel_id && !effectiveUniteId && !canViewAllUnits) return;
    fetchPlanning();
  }, [fetchPlanning, filters.plan_annuel_id, effectiveUniteId, canViewAllUnits]);

  useEffect(() => {
    const ch = supabase.channel('planning-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'planning' }, () => fetchPlanning()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchPlanning]);

  const printFiche = (row: PlanningRow) => { setPrintId(row.id); setTimeout(() => { window.print(); setTimeout(() => setPrintId(null), 500); }, 100); };
  const handleDelete = async (id: number) => { if (!confirm('Supprimer cette intervention ?')) return; const { error: e } = await supabase.from('planning').delete().eq('id', id); if (e) { setError(e.message); return; } fetchPlanning(); };
  const handleStatusChange = async (id: number, statut: string) => { const { error: e } = await supabase.from('planning').update({ statut }).eq('id', id); if (e) { setError(e.message); return; } setRows(prev => prev.map(r => r.id === id ? { ...r, statut: statut as any } : r)); };

  const handleSave = async (updated: Partial<PlanningRow>) => {
    if (!editRow) return;
    if (updated.consignation === 'Oui' && !updated.consignation_motif?.trim()) { setError('Le motif de consignation est obligatoire.'); return; }
    const { error: e } = await supabase.from('planning').update({ statut: updated.statut, date_prevue: updated.date_prevue, duree_intervention: updated.duree_intervention, consignation: updated.consignation, consignation_motif: updated.consignation === 'Oui' ? updated.consignation_motif : null, jour_nuit: updated.jour_nuit, num_shift: updated.num_shift, materiel_libre: updated.materiel_libre || null, outillage_libre: updated.outillage_libre || null, fiche_inspection: updated.fiche_inspection || null }).eq('id', editRow.id);
    if (e) { setError(e.message); return; }
    setShowEdit(false); setEditRow(null); fetchPlanning();
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setHasUserInteracted(true);
    await fetchPlanning();
    setTimeout(() => setRefreshing(false), 500);
  };

  const handleLoadData = () => {
    setHasUserInteracted(true);
    fetchPlanning();
  };

  const handleOpenTasks = useCallback((row: InterventionWithTasks, taskIndex?: number) => {
    setTasksRow(row); setInitialTaskIndex(taskIndex); setShowTasksModal(true);
  }, []);

  const handleSaveTasks = useCallback(async (rowId: number, taches: Tache[], deletedIds: number[] = []) => {
    try {
      if (deletedIds.length > 0) {
        const { error: deleteError } = await supabase.from('planning_taches').delete().in('id', deletedIds);
        if (deleteError) throw deleteError;
      }
      for (const t of taches) {
        if (t.id < 0) {
          const { error: insertError } = await supabase.from('planning_taches').insert({
            planning_id: rowId, numero: t.numero,
            sous_equipement: t.sous_equipement, operation: t.operation,
            ok: t.ok, motif: t.motif, duree_min: t.duree_min,
            initial: t.initial, updated_at: new Date().toISOString(),
          });
          if (insertError) throw insertError;
        } else {
          const { error: upsertError } = await supabase.from('planning_taches').upsert({
            id: t.id, planning_id: rowId, numero: t.numero,
            sous_equipement: t.sous_equipement, operation: t.operation,
            ok: t.ok, motif: t.motif, duree_min: t.duree_min,
            initial: t.initial, updated_at: new Date().toISOString(),
          });
          if (upsertError) throw upsertError;
        }
      }
      fetchPlanning();
    } catch (e: any) { console.error(e); setError(e.message); }
  }, [fetchPlanning]);

  const calGrid = useMemo(() => {
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const firstDayJS = new Date(calYear, calMonth, 1).getDay();
    const jsToCol: Record<number, number> = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 0 };
    const startCol = jsToCol[firstDayJS];
    const cells: (number | null)[] = [];
    for (let i = 0; i < startCol; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calYear, calMonth]);

  const rowsByDate = useMemo(() => {
    const map: Record<string, InterventionWithTasks[]> = {};
    rows.forEach(r => {
      if (!r.date_prevue) return;
      if (!map[r.date_prevue]) map[r.date_prevue] = [];
      map[r.date_prevue].push(r);
    });
    return map;
  }, [rows]);

  const todayStr = new Date().toISOString().split('T')[0];

  const stats = useMemo(() => ({
    total: rows.length,
    plan: rows.filter(r => r.statut === 'planifiee').length,
    encours: rows.filter(r => r.statut === 'en_cours').length,
    fin: rows.filter(r => r.statut === 'terminee').length,
    reportee: rows.filter(r => r.statut === 'reportee').length,
    alertes: rows.filter(r => isAlgeriaWeekend(r.date_prevue) || isHoliday(r.date_prevue, holidays)).length,
  }), [rows, holidays]);

  const completionRate = stats.total > 0 ? Math.round((stats.fin / stats.total) * 100) : 0;

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (canViewAllUnits && filters.unite_id) c++;
    if (filters.atelier_id) c++; if (filters.statut) c++; if (filters.frequence) c++;
    if (filters.search) c++; if (filters.date_start) c++; if (filters.date_end) c++; if (filters.jour_nuit) c++;
    return c;
  }, [filters, canViewAllUnits]);

  // Catalogue d'ateliers global (un atelier n'appartient pas à une seule unité) : toutes les
  // unités couvrent tous les ateliers. Le chargé d'unité est restreint à son unique atelier.
  const ateliersOptions = useMemo(() => {
    if (isChargeUnite && profile?.atelier_id) {
      return ateliers.filter(a => a.id === profile.atelier_id);
    }
    return ateliers;
  }, [ateliers, isChargeUnite, profile?.atelier_id]);

  // Verrouille le filtre atelier sur celui du chargé d'unité, dès qu'il est connu.
  useEffect(() => {
    if (isChargeUnite && profile?.atelier_id) {
      updateFilters(f => f.atelier_id === String(profile.atelier_id) ? f : { ...f, atelier_id: String(profile.atelier_id) });
    }
  }, [isChargeUnite, profile?.atelier_id]);

  const pi = rows.find(r => r.id === printId);
  const sel = "w-full rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[#1e2a5e]/20 transition-all outline-none border border-transparent focus:border-[#1e2a5e]/30";

  const selectedUniteInfo = useMemo(() => {
    if (!canViewAllUnits || !filters.unite_id) return null;
    return unites.find(u => u.id === Number(filters.unite_id));
  }, [canViewAllUnits, filters.unite_id, unites]);

  if (loading) return (
    <div className="bg-slate-100 min-h-[calc(100vh-60px)] p-4 lg:p-6">
      <div className="max-w-[1500px] mx-auto space-y-4">
        <div className="h-20 bg-white rounded-3xl animate-pulse" />
        <div className="h-32 bg-white rounded-3xl animate-pulse" />
      </div>
    </div>
  );

  return (
    <div className="bg-slate-100 min-h-[calc(100vh-60px)] p-4 lg:p-6">
      <div className="max-w-[1500px] mx-auto space-y-5">
        {pi && (
          <div className="print-only">
            <div style={{ padding: 20, fontFamily: 'Arial, sans-serif' }}>
              <div style={{ textAlign: 'center', marginBottom: 20, borderBottom: '2px solid #1e2a5e', paddingBottom: 12 }}>
                <h1 style={{ fontSize: 16, fontWeight: 'bold', color: '#1e2a5e' }}>SETRAM — Fiche d'Intervention</h1>
                <p style={{ fontSize: 11, color: '#64748b' }}>OPPI</p>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10pt' }}><tbody>
                {[['Unité', pi.unites?.code + ' — ' + pi.unites?.nom], ['Atelier', pi.ateliers?.code ?? '—'], ['Équipement', pi.equipement ?? '—'], ['Code GMAO', pi.code_gmao ?? '—'], ['Titre', pi.titre], ['Système', `${pi.systeme ?? '—'} / ${pi.sous_systeme ?? '—'}`], ['Date', formatDateFR(pi.date_prevue)], ['Fréquence', pi.frequence ?? '—'], ['Durée', `${pi.duree_intervention}h`], ['Log.', `${pi.temps_logistique}h`], ['Consignation', pi.consignation === 'Oui' ? `OUI — ${pi.consignation_motif ?? ''}` : 'Non'], ['Jour/Shift', `${pi.jour_nuit} — S${pi.num_shift}`], ['Matériels', pi.materiel_libre ?? '—'], ['Outillage', pi.outillage_libre ?? '—'], ['Fiche', pi.fiche_inspection ?? '—'], ['Statut', STATUTS.find(s => s.value === pi.statut)?.label ?? pi.statut], ['Techniciens', pi.planning_techniciens?.map(pt => `${pt.techniciens.prenom} ${pt.techniciens.nom} (${pt.duree}h)`).join(', ') || pi.techniciens_snapshot || '—']].map(([l, v]) => (
                  <tr key={l}><td style={{ padding: '5px 8px', border: '1px solid #999', fontWeight: 'bold', background: '#f3f4f6', width: '35%' }}>{l}</td><td style={{ padding: '5px 8px', border: '1px solid #999' }}>{v}</td></tr>
                ))}
              </tbody></table>
              <div style={{ marginTop: 30, display: 'flex', justifyContent: 'space-between' }}>
                {['Signature Responsable', "Visa Chargé d'Unité", 'Signature Technicien'].map(s => (<div key={s} style={{ textAlign: 'center' }}><div style={{ borderTop: '1px solid #000', width: 180, paddingTop: 4, fontSize: '9pt' }}>{s}</div></div>))}
              </div>
            </div>
          </div>
        )}

        <div className={printId ? 'no-print' : ''}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Wrench size={13} className="text-[#1e2a5e]" />
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Planning</span>
              </div>
              <h1 className="text-2xl lg:text-3xl font-bold text-slate-800 leading-tight">
                Gestion des <span className="text-[#1e2a5e]">Interventions</span>
              </h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {hasUserInteracted && (
                <div className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-white shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-bold tabular-nums text-xs text-slate-700">{rows.length}</span>
                  <span className="text-[11px] text-slate-400">résultats</span>
                </div>
              )}
              <button onClick={handleRefresh} disabled={refreshing} className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white hover:bg-blue-50 text-slate-500 hover:text-[#1e2a5e] text-xs font-semibold transition-all shadow-sm">
                <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} strokeWidth={2.5} />
                <span className="hidden sm:inline">Actualiser</span>
              </button>
              <button onClick={() => setShowFilters(!showFilters)} className={`relative flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-bold transition-all shadow-sm ${showFilters ? 'bg-[#1e2a5e] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                <Filter size={13} />Filtres
                {activeFilterCount > 0 && (
                  <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center ${showFilters ? 'bg-white/25 text-white' : 'bg-blue-100 text-[#1e2a5e]'}`}>{activeFilterCount}</span>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm border-l-4 border-rose-500 mt-5">
              <div className="w-10 h-10 rounded-xl bg-rose-500 flex items-center justify-center shrink-0">
                <AlertTriangle size={17} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-rose-800">Erreur</p>
                <p className="text-xs text-rose-500 truncate">{error}</p>
              </div>
              <button onClick={() => { setError(null); fetchPlanning(); }} className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-xl transition-all">Réessayer</button>
            </div>
          )}

          {showFilters && (
            <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4 mt-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-[#1e2a5e] flex items-center justify-center">
                    <Sliders size={15} className="text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">Filtres avancés</p>
                    <p className="text-[10px] text-slate-400">Affinez votre recherche</p>
                  </div>
                  {activeFilterCount > 0 && (
                    <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-blue-100 text-[#1e2a5e]">
                      {activeFilterCount} actif{activeFilterCount > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                {hasUserInteracted && activeFilterCount > 0 && (
                  <button onClick={() => updateFilters(f => ({
                    unite_id: canViewAllUnits ? f.unite_id : '',
                    plan_annuel_id: f.plan_annuel_id,
                    atelier_id: '', statut: '', frequence: '', search: '',
                    date_start: '', date_end: '', jour_nuit: ''
                  }))} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-rose-50 text-[11px] font-bold text-slate-500 hover:text-rose-600 transition-colors">
                    <RotateCcw size={11} /> Réinitialiser
                  </button>
                )}
              </div>

              {canViewAllUnits && (
                <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50/50 border border-blue-100/50">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-xl bg-[#1e2a5e] flex items-center justify-center shrink-0">
                      <Building2 size={14} className="text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[11px] font-bold text-[#1e2a5e] uppercase tracking-wider">Sélection d'unité</p>
                      <p className="text-[10px] text-slate-500">Choisissez l'unité pour filtrer les plans annuels et interventions</p>
                    </div>
                    {selectedUniteInfo && <span className="px-3 py-1 rounded-lg bg-white text-[#1e2a5e] text-xs font-bold shadow-sm">{selectedUniteInfo.code}</span>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button onClick={() => updateFilters(f => ({ ...f, unite_id: '', plan_annuel_id: '' }))}
                      className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all ${!filters.unite_id ? 'bg-[#1e2a5e] text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                      <span className="flex items-center gap-1.5"><Filter size={11} />Toutes les unités</span>
                    </button>
                    {unites.map(u => {
                      const isActive = filters.unite_id === String(u.id);
                      return (
                        <button key={u.id} onClick={() => updateFilters(f => ({ ...f, unite_id: String(u.id), plan_annuel_id: '' }))}
                          className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all ${isActive ? 'bg-[#1e2a5e] text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-50'}`} title={u.nom}>
                          <span className="flex items-center gap-1.5"><Building2 size={10} />{u.code}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Plan annuel
                    {canViewAllUnits && filters.unite_id && (
                      <span className="ml-1 text-[9px] text-[#1e2a5e] font-bold">({plansAnnuels.length} pour {selectedUniteInfo?.code})</span>
                    )}
                  </label>
                  <select value={filters.plan_annuel_id} onChange={e => updateFilters(prev => ({ ...prev, plan_annuel_id: e.target.value }))} className={sel} disabled={canViewAllUnits && !filters.unite_id}>
                    <option value="">
                      {canViewAllUnits && !filters.unite_id ? '← Sélectionnez d\'abord une unité' : plansAnnuels.length === 0 ? 'Aucun plan disponible' : 'Tous les plans'}
                    </option>
                    {plansAnnuels.map(p => (<option key={p.id} value={String(p.id)}>{p.annee} — {p.statut}</option>))}
                  </select>
                </div>

                {[
                  { l: 'Atelier', v: filters.atelier_id, k: 'atelier_id', locked: isChargeUnite, opts: isChargeUnite ? ateliersOptions.map(a => ({ v: String(a.id), l: `${a.code} — ${a.nom}` })) : [{ v: '', l: 'Tous' }, ...ateliers.map(a => ({ v: String(a.id), l: `${a.code} — ${a.nom}` }))] },
                  { l: 'Statut', v: filters.statut, k: 'statut', locked: false, opts: [{ v: '', l: 'Tous' }, ...STATUTS.map(s => ({ v: s.value, l: s.label }))] },
                  { l: 'Fréquence', v: filters.frequence, k: 'frequence', locked: false, opts: [{ v: '', l: 'Toutes' }, ...FREQUENCES.map(f => ({ v: f, l: f }))] },
                ].map(f => (
                  <div key={f.k}>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{f.l}</label>
                    <select value={f.v} disabled={f.locked} onChange={e => updateFilters(prev => ({ ...prev, [f.k]: e.target.value }))} className={`${sel} disabled:opacity-70 disabled:cursor-not-allowed`}>
                      {f.opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  </div>
                ))}

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Date début</label>
                  <div className="relative">
                    <input type="date" value={filters.date_start} onChange={e => updateFilters(f => ({ ...f, date_start: e.target.value }))} max={filters.date_end || undefined} className={sel} />
                    {filters.date_start && (
                      <button type="button" onClick={() => updateFilters(f => ({ ...f, date_start: '' }))} className="absolute right-8 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500 transition-colors" title="Effacer">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Date fin</label>
                  <div className="relative">
                    <input type="date" value={filters.date_end} onChange={e => updateFilters(f => ({ ...f, date_end: e.target.value }))} min={filters.date_start || undefined} className={sel} />
                    {filters.date_end && (
                      <button type="button" onClick={() => updateFilters(f => ({ ...f, date_end: '' }))} className="absolute right-8 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500 transition-colors" title="Effacer">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Jour / Nuit</label>
                  <select value={filters.jour_nuit} onChange={e => updateFilters(f => ({ ...f, jour_nuit: e.target.value }))} className={sel}>
                    <option value="">Tous</option><option value="Jour">Jour</option><option value="Nuit">Nuit</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Recherche</label>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                    <input type="text" value={filters.search} onChange={e => updateFilters(f => ({ ...f, search: e.target.value }))} placeholder="Titre, GMAO…" className={`${sel} pl-9`} />
                  </div>
                </div>
              </div>

              {!hasUserInteracted && (
                <div className="pt-2 border-t border-slate-100">
                  <button onClick={handleLoadData} className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-[#1e2a5e] hover:bg-[#2a3875] text-white text-sm font-bold rounded-xl shadow-sm transition-all">
                    <Filter size={15} strokeWidth={2.5} />Charger les interventions
                  </button>
                  <p className="text-center text-[11px] text-slate-400 mt-2">Cliquez pour afficher les résultats selon vos critères</p>
                </div>
              )}
            </div>
          )}

          {hasUserInteracted ? (
            <>
              <div className="flex items-center gap-1 bg-white rounded-2xl shadow-sm p-1.5 mt-5">
                {[
                  { key: 'cards' as const, label: 'Cartes', icon: LayoutGrid },
                  { key: 'table' as const, label: 'Tableau', icon: Table },
                  { key: 'calendar' as const, label: 'Calendrier', icon: CalendarRange },
                ].map(v => {
                  const Icon = v.icon; const active = viewMode === v.key;
                  return (
                    <button key={v.key} onClick={() => setViewMode(v.key)} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-bold transition-all ${active ? 'bg-[#1e2a5e] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
                      <Icon size={14} strokeWidth={2} />{v.label}
                    </button>
                  );
                })}
                <span className="ml-auto pr-2 text-[11px] text-slate-400 font-medium tabular-nums">{rows.length} résultat{rows.length !== 1 ? 's' : ''}</span>
              </div>

              {viewMode === 'cards' && (
                <div className="space-y-3 mt-5">
                  {rows.length === 0 ? (
                    <div className="bg-white rounded-2xl shadow-sm">
                      <EmptyState icon={CalendarDays} title="Aucune intervention" sub="Modifiez les filtres ou importez un planning" />
                    </div>
                  ) : rows.map((row) => (
                    <InterventionCard key={row.id} row={row} holidays={holidays} canEdit={canEdit}
                      onEdit={() => { setEditRow(row); setShowEdit(true); }}
                      onDelete={() => handleDelete(row.id)}
                      onPrint={() => printFiche(row)}
                      onStatusChange={handleStatusChange}
                      onOpen={() => handleOpenTasks(row)}
                      onOpenTasks={(taskIndex) => handleOpenTasks(row, taskIndex)} />
                  ))}
                </div>
              )}

              {viewMode === 'table' && (
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden mt-5">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-slate-50 border-b border-slate-100">
                        {['Atelier','Équip.','GMAO','Titre','Date','Fréq.','Durée','J/N','Cons.','Tâches','Statut',''].map(h => (
                          <th key={h} className="px-3 py-3 text-left font-bold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody className="divide-y divide-slate-50">
                        {rows.length === 0 && <tr><td colSpan={12}><EmptyState icon={CalendarDays} title="Aucune intervention" sub="" /></td></tr>}
                        {rows.map(row => {
                          const st = STATUTS.find(s => s.value === row.statut);
                          const isAlert = isHoliday(row.date_prevue, holidays) || isAlgeriaWeekend(row.date_prevue);
                          const totalT = row.taches?.length || 0;
                          const okT = row.taches?.filter(t => t.ok === true).length || 0;
                          const scoreT = totalT > 0 ? Math.round((okT / totalT) * 100) : 0;
                          return (
                            <tr key={row.id} className={`group hover:bg-slate-50 transition-colors ${isAlert ? 'bg-amber-50/30' : ''}`}>
                              <td className="px-3 py-2.5">{row.ateliers && <span className="text-[10px] px-2 py-0.5 bg-violet-50 rounded-lg font-bold text-violet-600">{row.ateliers.code}</span>}</td>
                              <td className="px-3 py-2.5 text-slate-500 max-w-[80px] truncate">{row.equipement ?? '—'}</td>
                              <td className="px-3 py-2.5 font-mono text-slate-400 max-w-[90px] truncate text-[10px]">{row.code_gmao ?? '—'}</td>
                              <td className="px-3 py-2.5 font-bold text-slate-800 max-w-[200px] truncate cursor-pointer hover:text-[#1e2a5e]" onClick={() => handleOpenTasks(row)}>{row.titre}</td>
                              <td className="px-3 py-2.5 whitespace-nowrap"><span className={isAlert ? 'text-amber-700 font-bold' : 'text-slate-600'}>{formatDateFR(row.date_prevue)}</span>{isAlgeriaWeekend(row.date_prevue) && <AlertTriangle size={10} className="inline ml-1 text-amber-500" />}</td>
                              <td className="px-3 py-2.5">{row.frequence && <span className={`text-[10px] px-2 py-0.5 rounded-lg font-bold ${FREQ_COLORS[row.frequence] ?? 'bg-slate-50 text-slate-600'}`}>{row.frequence.substring(0, 6)}</span>}</td>
                              <td className="px-3 py-2.5 whitespace-nowrap text-emerald-600 font-bold">{row.duree_intervention}h</td>
                              <td className="px-3 py-2.5"><span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${row.jour_nuit === 'Nuit' ? 'text-indigo-500' : 'text-orange-500'}`}>{row.jour_nuit === 'Nuit' ? <Moon size={10} /> : <Sun size={10} />}S{row.num_shift}</span></td>
                              <td className="px-3 py-2.5 text-center">{row.consignation === 'Oui' ? <Shield size={12} className="text-rose-500 mx-auto" /> : <span className="text-slate-200">—</span>}</td>
                              <td className="px-3 py-2.5">
                                {totalT > 0 ? (
                                  <button onClick={() => handleOpenTasks(row)} className={`text-[10px] px-2 py-0.5 rounded-lg font-bold ${scoreT >= 80 ? 'bg-emerald-100 text-emerald-700' : scoreT >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                                    {okT}/{totalT} · {scoreT}%
                                  </button>
                                ) : <span className="text-slate-200 text-[10px]">—</span>}
                              </td>
                              <td className="px-3 py-2.5">{canEdit ? (
                                <select value={row.statut} onChange={e => handleStatusChange(row.id, e.target.value)} className={`text-[10px] px-2 py-0.5 rounded-lg font-bold outline-none cursor-pointer ${st?.color}`}>
                                  {STATUTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                </select>
                              ) : st && <span className={`text-[10px] px-2 py-0.5 rounded-lg font-bold ${st.color}`}>{st.label}</span>}</td>
                              <td className="px-3 py-2.5"><div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => printFiche(row)} className="p-1.5 text-slate-400 hover:text-[#1e2a5e] hover:bg-blue-50 rounded-lg transition-all"><Printer size={12} /></button>
                                {canEdit && (<>
                                  <button onClick={() => { setEditRow(row); setShowEdit(true); }} className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-all"><Edit2 size={12} /></button>
                                  <button onClick={() => handleDelete(row.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={12} /></button>
                                </>)}
                              </div></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {viewMode === 'calendar' && (
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden mt-5">
                  <div className="bg-gradient-to-br from-[#1e2a5e] to-[#2a3875] px-6 py-4 relative overflow-hidden">
                    <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-blue-400/20 blur-2xl" />
                    <div className="relative flex items-center justify-between">
                      <button onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }} className="p-2.5 hover:bg-white/10 rounded-xl transition-all text-white">
                        <ChevronLeft size={18} />
                      </button>
                      <div className="text-center">
                        <p className="text-[10px] font-bold text-blue-200/80 uppercase tracking-widest mb-0.5">Vue calendrier</p>
                        <h3 className="text-lg font-bold text-white">
                          {MONTHS[calMonth]} <span className="text-blue-200">{calYear}</span>
                        </h3>
                        <p className="text-[11px] text-blue-200/60 mt-0.5">
                          {rows.filter(r => r.date_prevue?.startsWith(`${calYear}-${pad2(calMonth + 1)}`)).length} intervention(s)
                        </p>
                      </div>
                      <button onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }} className="p-2.5 hover:bg-white/10 rounded-xl transition-all text-white">
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-xl overflow-hidden">
                      {WEEK_DAYS.map((d, i) => (
                        <div key={d} className={`py-2.5 text-center text-[11px] font-bold uppercase tracking-wider ${i === 0 || i === 6 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-500'}`}>{d}</div>
                      ))}
                      {calGrid.map((day, i) => {
                        if (day === null) return <div key={`empty-${i}`} className="bg-slate-50/50 min-h-[100px]" />;
                        const ds = `${calYear}-${pad2(calMonth + 1)}-${pad2(day)}`;
                        const dayRows = rowsByDate[ds] || [];
                        const we = isAlgeriaWeekend(ds);
                        const ho = isHoliday(ds, holidays);
                        const isToday = ds === todayStr;
                        const holName = holidays.find(h => h.date === ds)?.nom;
                        const col = i % 7;
                        const isWeekendCol = col === 0 || col === 6;
                        return (
                          <div key={`day-${day}`} className={`min-h-[100px] p-1.5 transition-colors ${we ? 'bg-amber-50/60' : ho ? 'bg-rose-50/40' : isWeekendCol ? 'bg-amber-50/20' : 'bg-white'} ${isToday ? 'ring-2 ring-[#1e2a5e] ring-inset' : ''}`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className={`w-6 h-6 flex items-center justify-center text-xs font-bold rounded-lg ${isToday ? 'bg-[#1e2a5e] text-white shadow-sm' : we ? 'text-amber-600' : ho ? 'text-rose-500' : 'text-slate-500'}`}>{day}</span>
                              {ho && <span title={holName} className="text-[9px]">🔴</span>}
                              {dayRows.length > 0 && <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1 rounded">{dayRows.length}</span>}
                            </div>
                            {dayRows.slice(0, 3).map(r => {
                              const rst = STATUTS.find(s => s.value === r.statut);
                              return (
                                <div key={r.id} onClick={() => handleOpenTasks(r)} title={`${r.titre} — ${rst?.label ?? r.statut}`} className={`text-[10px] rounded-lg px-1.5 py-0.5 mb-0.5 truncate cursor-pointer hover:opacity-75 transition-opacity font-medium ${rst?.color ?? 'bg-slate-50 text-slate-600'}`}>
                                  {r.ateliers?.code && <span className="font-bold mr-0.5">[{r.ateliers.code}]</span>}{r.titre}
                                </div>
                              );
                            })}
                            {dayRows.length > 3 && <div className="text-[10px] text-[#1e2a5e] text-center font-bold">+{dayRows.length - 3} autres</div>}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3 text-[10px]">
                      <span className="font-bold text-slate-500 uppercase tracking-wider">Légende :</span>
                      {STATUTS.map(s => <span key={s.value} className={`px-2 py-0.5 rounded-lg font-bold ${s.color}`}>{s.label}</span>)}
                      <span className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-600 font-bold">Weekend</span>
                      <span className="px-2 py-0.5 rounded-lg bg-rose-50 text-rose-600 font-bold">🔴 Férié</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-center gap-2 py-3 text-[10px] text-slate-400 mt-3">
                <Target size={10} />
                <span>{rows.length} interventions chargées · {stats.fin} terminées · {completionRate}% achevé</span>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm p-12 text-center relative overflow-hidden mt-5">
              <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-blue-500/5 blur-3xl" />
              <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-[#1e2a5e]/5 blur-3xl" />
              <div className="relative">
                <div className="w-20 h-20 mx-auto rounded-2xl bg-[#1e2a5e] flex items-center justify-center shadow-lg mb-4">
                  <Filter size={32} className="text-white" strokeWidth={2} />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-1">Prêt à explorer le planning</h3>
                <p className="text-sm text-slate-400 max-w-md mx-auto mb-5">
                  {canViewAllUnits ? 'Sélectionnez une unité et vos critères pour afficher les interventions' : 'Choisissez vos critères ci-dessus pour afficher les interventions correspondantes'}
                </p>
                <button onClick={handleLoadData} className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1e2a5e] hover:bg-[#2a3875] text-white text-sm font-bold rounded-xl shadow-sm transition-all">
                  <Filter size={14} strokeWidth={2.5} />Afficher toutes les interventions
                </button>
              </div>
            </div>
          )}
        </div>

        {showEdit && <EditModal row={editRow} onClose={() => { setShowEdit(false); setEditRow(null); }} onSave={handleSave} readOnly={!canEdit} />}
        {showTasksModal && (
          <TasksDetailModal row={tasksRow} initialTaskIndex={initialTaskIndex} onClose={() => { setShowTasksModal(false); setTasksRow(null); setInitialTaskIndex(undefined); }} onSaveTasks={handleSaveTasks} canEdit={canEdit} />
        )}
      </div>
    </div>
  );
}