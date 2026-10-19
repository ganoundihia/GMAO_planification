// pages/Cloture.tsx
// ══════════════════════════════════════════════════════════════════════════════
//  CLÔTURE — surface d'action.
//
//  Deux campagnes : la journée en cours, et le rattrapage des journées passées.
//  On y pointe les tâches, on clôture à l'unité ou en lot, on demande un report.
//  Le tableau de bord ne fait qu'y renvoyer.
// ══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Building2, Wrench, RefreshCw, CalendarDays, CheckCircle2, Clock, Check, X,
  AlertTriangle, AlertOctagon, Loader2, Search, Printer, FileText, ExternalLink,
  RotateCcw, Send, Lock, Layers, ListChecks, Timer, Shield, ArrowRight, Info,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Intervention, Unite, Atelier } from '../lib/types';
import { STATUTS } from '../lib/types';
import { ficheToHttpUrl } from '../lib/Ficheurl';
import {
  DASH_CSS, AnimatedNumber, TasksPanel, DashboardTasksDetailModal,
  ReportRequestModal, PrintConfirmModal, useReveal,
  checkCompletion, formatISO, formatDateFR, statutDotClass,
} from './lib/interventionsUI';
import type {
  InterventionRow, InterventionWithTasks, DashboardTache, ReportAnalysis,
} from './lib/interventionsUI';

type Campagne = 'jour' | 'retards';

export default function Cloture() {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  useReveal();

  // ── Données ──
  const [interventions, setInterventions] = useState<InterventionRow[]>([]);
  const [unites, setUnites] = useState<Unite[]>([]);
  const [ateliers, setAteliers] = useState<Atelier[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // ── Filtres ──
  const uniteParam = searchParams.get('unite');
  const [uniteFilter, setUniteFilter] = useState<'all' | number>(
    uniteParam ? Number(uniteParam) : 'all');
  const [atelierFilter, setAtelierFilter] = useState<'all' | number>('all');
  const [campagne, setCampagne] = useState<Campagne>(
    searchParams.get('vue') === 'retards' ? 'retards' : 'jour');
  const [search, setSearch] = useState('');

  // ── Tâches ──
  const [tasksMap, setTasksMap] = useState<Record<number, DashboardTache[]>>({});
  const [tasksLoading, setTasksLoading] = useState(false);
  const [showTasksModal, setShowTasksModal] = useState(false);
  const [tasksRow, setTasksRow] = useState<InterventionWithTasks | null>(null);
  const [initialTaskIndex, setInitialTaskIndex] = useState<number | undefined>(undefined);

  // ── Actions ──
  const [closureSaving, setClosureSaving] = useState<Record<number, boolean>>({});
  const [bulkClosing, setBulkClosing] = useState(false);
  const [reportingIntervention, setReportingIntervention] = useState<Intervention | null>(null);
  const [reportSaving, setReportSaving] = useState(false);
  const [pendingReports, setPendingReports] = useState<Record<number, {
    dateDemandee: string; technicienNom: string; motif: string;
  }>>({});
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // ── Impression ──
  const [showPrintConfirm, setShowPrintConfirm] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);

  const role = (profile?.role ?? '').trim().toLowerCase();
  const canViewAllUnits = role === 'admin' || role === 'super_admin';
  const canEditTasks = ['admin', 'super_admin', 'responsable_unite', 'charge_unite'].includes(role);
  // Le chargé d'unité est verrouillé sur son unique atelier, y compris dans la Clôture.
  const isChargeUnite = role === 'charge_unite';

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Le filtre unité se reflète dans l'URL : le lien depuis le dashboard reste partageable
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (uniteFilter === 'all') next.delete('unite'); else next.set('unite', String(uniteFilter));
    if (campagne === 'jour') next.delete('vue'); else next.set('vue', campagne);
    setSearchParams(next, { replace: true });
  }, [uniteFilter, campagne]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setAtelierFilter(isChargeUnite && profile?.atelier_id ? profile.atelier_id : 'all');
  }, [uniteFilter, isChargeUnite, profile?.atelier_id]);

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

      const [{ data: i }, { data: u }, { data: a }, { data: dr }] = await Promise.all([
        q,
        supabase.from('unites').select('*').order('code'),
        supabase.from('ateliers').select('*').order('code'),
        supabase.from('demandes_report')
          .select('intervention_id, date_demandee, motif, alerte_details')
          .eq('statut', 'en_attente'),
      ]);

      setInterventions((i || []) as InterventionRow[]);
      setUnites(u || []);
      setAteliers((a || []) as Atelier[]);

      const pend: Record<number, any> = {};
      (dr || []).forEach((d: any) => {
        pend[d.intervention_id] = {
          dateDemandee: d.date_demandee,
          technicienNom: d.alerte_details?.technicien_nom ?? '',
          motif: d.motif ?? '',
        };
      });
      setPendingReports(pend);
      setTasksMap({});
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
      setTimeout(() => setRefreshing(false), 400);
    }
  }, [profile, canViewAllUnits, isChargeUnite]);

  useEffect(() => { if (profile) fetchAll(); }, [profile, fetchAll]);

  // ══════════════════════════════════════════════════════════════════════════
  //  PÉRIMÈTRES
  // ══════════════════════════════════════════════════════════════════════════
  const today = useMemo(() => new Date(), []);
  const todayStr = formatISO(today);
  const todayLong = today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const getDaysOverdue = useCallback((d: string) =>
    Math.max(0, Math.floor((today.getTime() - new Date(d + 'T00:00:00').getTime()) / 86400000)), [today]);

  const atelierById = useMemo(() => new Map(ateliers.map(a => [a.id, a])), [ateliers]);
  const uniteById = useMemo(() => new Map(unites.map(u => [u.id, u])), [unites]);

  const uniteScoped = useMemo(
    () => uniteFilter === 'all' ? interventions : interventions.filter(i => i.unite_id === uniteFilter),
    [interventions, uniteFilter]
  );

  const ateliersDisponibles = useMemo(() => {
    const counts = new Map<number, number>();
    uniteScoped.forEach(i => {
      if (i.atelier_id != null) counts.set(i.atelier_id, (counts.get(i.atelier_id) || 0) + 1);
    });
    return ateliers.filter(a => counts.has(a.id)).map(a => ({ ...a, count: counts.get(a.id) || 0 }));
  }, [ateliers, uniteScoped]);

  const scoped = useMemo(
    () => atelierFilter === 'all' ? uniteScoped : uniteScoped.filter(i => i.atelier_id === atelierFilter),
    [uniteScoped, atelierFilter]
  );

  const duJour = useMemo(
    () => scoped.filter(i => i.date_prevue === todayStr &&
      (i.statut === 'planifiee' || i.statut === 'en_cours')),
    [scoped, todayStr]
  );

  const retards = useMemo(
    () => scoped.filter(i => i.statut !== 'terminee' && i.statut !== 'reportee' && i.date_prevue < todayStr)
      .sort((a, b) => a.date_prevue.localeCompare(b.date_prevue)),
    [scoped, todayStr]
  );

  const liste = campagne === 'jour' ? duJour : retards;

  const listeFiltree = useMemo(() => {
    const s = search.trim().toLowerCase();
    return s ? liste.filter(i => i.titre.toLowerCase().includes(s)) : liste;
  }, [liste, search]);

  const fichesDisponibles = useMemo(
    () => duJour.map(i => ({ ...i, ficheUrl: ficheToHttpUrl(i.fiche_inspection) }))
      .filter(i => i.ficheUrl !== null),
    [duJour]
  );

  // Interventions encore à lancer : l'impression les fera passer « en cours »
  const aLancer = useMemo(
    () => fichesDisponibles.filter(f => f.statut === 'planifiee'),
    [fichesDisponibles]
  );
  const dejaLancees = useMemo(
    () => duJour.filter(i => i.statut === 'en_cours'),
    [duJour]
  );

  // ── Chargement groupé des tâches de la liste affichée ──
  const loadTasks = useCallback(async (ids: number[]) => {
    if (!ids.length) return;
    setTasksLoading(true);
    try {
      const map: Record<number, DashboardTache[]> = {};
      ids.forEach(id => { map[id] = []; });
      const CHUNK = 200;
      for (let k = 0; k < ids.length; k += CHUNK) {
        const { data } = await supabase.from('planning_taches')
          .select('*').in('planning_id', ids.slice(k, k + CHUNK)).order('numero', { ascending: true });
        (data || []).forEach((t: any) => {
          if (!map[t.planning_id]) map[t.planning_id] = [];
          map[t.planning_id].push({
            id: t.id, numero: t.numero, sous_equipement: t.sous_equipement || '',
            operation: t.operation, ok: t.ok, motif: t.motif || '',
            duree_min: t.duree_min, initial: t.initial || '',
          });
        });
      }
      setTasksMap(prev => ({ ...prev, ...map }));
    } catch (err) {
      console.error('Chargement des tâches :', err);
    } finally {
      setTasksLoading(false);
    }
  }, []);

  useEffect(() => {
    const manquants = liste.map(i => i.id).filter(id => tasksMap[id] === undefined);
    if (manquants.length) loadTasks(manquants);
  }, [liste, tasksMap, loadTasks]);

  // ── Bilan de la campagne ──
  const bilan = useMemo(() => {
    let pretes = 0, bloquees = 0, enAttente = 0;
    liste.forEach(i => {
      if (pendingReports[i.id]) { enAttente++; return; }
      if (checkCompletion(tasksMap[i.id]).canClose) pretes++; else bloquees++;
    });
    return { pretes, bloquees, enAttente, total: liste.length };
  }, [liste, tasksMap, pendingReports]);

  // ══════════════════════════════════════════════════════════════════════════
  //  ACTIONS
  // ══════════════════════════════════════════════════════════════════════════
  const closeOne = useCallback(async (id: number, statut: 'terminee' | 'reportee') => {
    if (pendingReports[id]) {
      setToast({ type: 'error', msg: 'Report en attente de validation — action impossible' });
      return;
    }
    if (statut === 'terminee') {
      const check = checkCompletion(tasksMap[id]);
      if (!check.canClose) {
        setToast({ type: 'error', msg: `Clôture impossible — ${check.reason}` });
        return;
      }
    }
    setClosureSaving(p => ({ ...p, [id]: true }));
    try {
      const { error } = await supabase.from('planning')
        .update({ statut, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      setInterventions(prev => prev.map(i => i.id === id ? { ...i, statut } : i));
    } catch (e: any) {
      setToast({ type: 'error', msg: 'Erreur : ' + e.message });
    } finally {
      setClosureSaving(p => ({ ...p, [id]: false }));
    }
  }, [tasksMap, pendingReports]);

  const closeAll = useCallback(async () => {
    const eligibles = liste
      .filter(i => !pendingReports[i.id] && checkCompletion(tasksMap[i.id]).canClose)
      .map(i => i.id);
    const bloquees = liste.length - eligibles.length;

    if (eligibles.length === 0) {
      setToast({ type: 'error', msg: `Aucune clôture possible : ${bloquees} intervention(s) non soldée(s)` });
      return;
    }
    const ok = window.confirm(
      `Clôturer ${eligibles.length} intervention${eligibles.length > 1 ? 's' : ''} ?\n` +
      (bloquees > 0 ? `${bloquees} sera(ont) ignorée(s) : tâches incomplètes ou report en attente.\n` : '') +
      `Leur statut passera à « Clôturée ».`
    );
    if (!ok) return;

    setBulkClosing(true);
    try {
      const { error } = await supabase.from('planning')
        .update({ statut: 'terminee', updated_at: new Date().toISOString() }).in('id', eligibles);
      if (error) throw error;
      setInterventions(prev => prev.map(i => eligibles.includes(i.id) ? { ...i, statut: 'terminee' } : i));
      setToast({
        type: 'success',
        msg: `${eligibles.length} intervention${eligibles.length > 1 ? 's' : ''} clôturée${eligibles.length > 1 ? 's' : ''}` +
             (bloquees > 0 ? ` · ${bloquees} ignorée(s)` : ''),
      });
    } catch (e: any) {
      setToast({ type: 'error', msg: 'Erreur : ' + e.message });
    } finally {
      setBulkClosing(false);
    }
  }, [liste, tasksMap, pendingReports]);

  const openTasks = useCallback((intervention: Intervention, index?: number) => {
    setTasksRow({ ...intervention, taches: tasksMap[intervention.id] || [] });
    setInitialTaskIndex(index);
    setShowTasksModal(true);
  }, [tasksMap]);

  const saveTasks = useCallback(async (rowId: number, taches: DashboardTache[]) => {
    for (const t of taches) {
      const { error } = await supabase.from('planning_taches').upsert({
        id: t.id, planning_id: rowId, numero: t.numero,
        sous_equipement: t.sous_equipement, operation: t.operation,
        ok: t.ok, motif: t.motif, duree_min: t.duree_min, initial: t.initial,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (error) throw error;
    }
    setTasksMap(prev => ({ ...prev, [rowId]: taches }));
  }, []);

  const submitReport = useCallback(async (data: {
    dateDemandee: string; motif: string; technicienId: number;
    technicienNom: string; analysis: ReportAnalysis;
  }) => {
    if (!reportingIntervention || !profile) return;
    setReportSaving(true);
    try {
      const { error } = await supabase.from('demandes_report').insert({
        intervention_id: reportingIntervention.id,
        demandeur_id: profile.user_id || profile.id,
        unite_id: reportingIntervention.unite_id,
        date_originale: reportingIntervention.date_prevue,
        date_demandee: data.dateDemandee,
        motif: data.motif,
        charge_technicien_prevue: data.analysis.chargeJour,
        conges_conflits: data.analysis.conflitsConges,
        techniciens_concernes: [data.technicienNom],
        alerte_niveau: data.analysis.niveau,
        alerte_details: {
          message: data.analysis.message,
          warnings: data.analysis.warnings,
          technicien_id: data.technicienId,
          technicien_nom: data.technicienNom,
          seuil_charge: data.analysis.chargeMax,
        },
        statut: 'en_attente',
      });
      if (error) throw error;
      setPendingReports(prev => ({
        ...prev,
        [reportingIntervention.id]: {
          dateDemandee: data.dateDemandee,
          technicienNom: data.technicienNom,
          motif: data.motif,
        },
      }));
      setToast({ type: 'success', msg: "Demande envoyée — en attente de validation" });
      setReportingIntervention(null);
    } catch (err: any) {
      setToast({ type: 'error', msg: 'Erreur : ' + err.message });
    } finally {
      setReportSaving(false);
    }
  }, [reportingIntervention, profile]);

  // ── Impression ──
  const imprimer = useCallback(async () => {
    if (!fichesDisponibles.length) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/print-fiches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session && { Authorization: `Bearer ${session.access_token}` }) },
        body: JSON.stringify({
          date: todayStr,
          fiches: fichesDisponibles.map(f => ({ id: f.id, titre: f.titre, url: f.ficheUrl })),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const win = window.open('', '_blank');
      if (win) { win.document.write(html); win.document.close(); }
    } catch (err) {
      console.error('Impression :', err);
      for (const f of fichesDisponibles) if (f.ficheUrl) window.open(f.ficheUrl, '_blank');
    }
  }, [fichesDisponibles, todayStr]);

  const printConfirm = useCallback(async () => {
    setPrintLoading(true);
    try {
      const ids = fichesDisponibles.filter(f => f.statut === 'planifiee').map(f => f.id);
      if (ids.length) {
        await supabase.from('planning')
          .update({ statut: 'en_cours', updated_at: new Date().toISOString() })
          .in('id', ids).eq('statut', 'planifiee');
        setInterventions(prev => prev.map(i =>
          ids.includes(i.id) && i.statut === 'planifiee' ? { ...i, statut: 'en_cours' } : i));
      }
      await imprimer();
      setShowPrintConfirm(false);
    } finally { setPrintLoading(false); }
  }, [fichesDisponibles, imprimer]);

  // ══════════════════════════════════════════════════════════════════════════
  //  RENDU
  // ══════════════════════════════════════════════════════════════════════════
  if (loading) return (
    <div className="dash-root min-h-screen p-4 lg:p-6 space-y-5">
      <style>{DASH_CSS}</style>
      <div className="h-36 d-band animate-pulse" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-28 d-panel animate-pulse" style={{ animationDelay: `${i * 70}ms` }} />
      ))}
    </div>
  );

  return (
    <div className="dash-root min-h-screen p-4 lg:p-6">
      <style>{DASH_CSS}</style>

      {/* MODALES */}
      {reportingIntervention && (
        <ReportRequestModal
          intervention={reportingIntervention}
          onClose={() => setReportingIntervention(null)}
          onSubmit={submitReport}
          saving={reportSaving}
        />
      )}
      {showTasksModal && (
        <DashboardTasksDetailModal
          row={tasksRow}
          initialTaskIndex={initialTaskIndex}
          onClose={() => { setShowTasksModal(false); setTasksRow(null); setInitialTaskIndex(undefined); }}
          onSaveTasks={saveTasks}
          canEdit={canEditTasks}
        />
      )}
      {showPrintConfirm && (
        <PrintConfirmModal
          fiches={fichesDisponibles}
          onConfirm={printConfirm}
          onPrintOnly={async () => { setPrintLoading(true); await imprimer(); setPrintLoading(false); setShowPrintConfirm(false); }}
          onClose={() => setShowPrintConfirm(false)}
          loading={printLoading}
        />
      )}

      <div className="max-w-[1560px] mx-auto space-y-6">

        {/* ══════════════ EN-TÊTE ══════════════ */}
        <div className="d-band px-6 lg:px-9 pt-7 pb-0">
          <div className="d-band-dots" aria-hidden="true" />
          <div className="d-glow d-glow-a" aria-hidden="true" />

          <div className="relative flex flex-col xl:flex-row xl:items-start justify-between gap-6">
            <div className="flex items-start gap-4 min-w-0">
              <div className="w-1 self-stretch rounded-full bg-gradient-to-b from-[#f0b429] via-[#2f6690] to-transparent shrink-0 mt-1" />
              <div className="min-w-0">
                <h1 className="text-[26px] lg:text-[32px] font-bold text-[#f8fbff] leading-tight tracking-tight mt-2">
                  Journée d'intervention
                </h1>
                <p className="text-[13px] text-white/60 mt-1 capitalize">{todayLong}</p>
              </div>
            </div>

            <div className="flex items-stretch gap-3 flex-wrap xl:justify-end">
              {[
                { label: 'Prêtes', value: bilan.pretes, tone: 'text-emerald-300' },
                { label: 'Bloquées', value: bilan.bloquees, tone: 'text-[#f0b429]' },
                { label: 'Report en attente', value: bilan.enAttente, tone: 'text-violet-300' },
              ].map(s => (
                <div key={s.label} className="px-4 py-3 rounded-xl bg-white/[.07] ring-1 ring-white/10 min-w-[104px]">
                  <p className="d-kicker text-white/45 leading-none">{s.label}</p>
                  <p className={`text-[26px] font-bold leading-none tabular-nums mt-2 ${s.tone}`}>
                    <AnimatedNumber value={s.value} />
                  </p>
                </div>
              ))}
              <div className="flex flex-col justify-between gap-2">
                <button onClick={closeAll} disabled={bulkClosing || bilan.pretes === 0}
                  className="d-gold flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-[11px] disabled:opacity-40 disabled:cursor-not-allowed">
                  {bulkClosing ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                  Tout clôturer ({bilan.pretes})
                </button>
                <button onClick={fetchAll} disabled={refreshing}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white/[.07] ring-1 ring-white/10 text-white/70 hover:text-white text-[11px] font-bold transition-all disabled:opacity-50">
                  <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} strokeWidth={2.5} />
                  Actualiser
                </button>
              </div>
            </div>
          </div>

          {/* Campagnes */}
          <div className="relative mt-6 flex items-center gap-2 flex-wrap">
            {([
              { key: 'jour' as const, label: "Journée en cours", count: duJour.length, icon: CalendarDays },
              { key: 'retards' as const, label: 'Journées passées', count: retards.length, icon: AlertOctagon },
            ]).map(c => {
              const I = c.icon;
              const actif = campagne === c.key;
              return (
                <button key={c.key} onClick={() => setCampagne(c.key)}
                  className={`px-4 py-2.5 rounded-full text-[12px] font-bold transition-all flex items-center gap-2 ${
                    actif ? 'bg-[#f0b429] text-[#0a1930]' : 'bg-white/[.07] ring-1 ring-white/10 text-white/60 hover:text-white'
                  }`}>
                  <I size={13} />{c.label}
                  <span className={`d-mono text-[10px] px-2 py-0.5 rounded-full ${actif ? 'bg-black/15' : 'bg-white/10'}`}>{c.count}</span>
                </button>
              );
            })}
          </div>

          <div className="relative -mx-6 lg:-mx-9 mt-6 h-9" aria-hidden="true">
            <svg viewBox="0 0 1000 44" preserveAspectRatio="none" className="w-full h-full block">
              <path d="M0,16 C100,32 200,0 320,14 C440,28 520,4 640,12 C760,20 840,34 940,18 L1000,16 L1000,44 L0,44 Z" fill="#f0f4ff" />
              <path d="M0,16 C100,32 200,0 320,14 C440,28 520,4 640,12 C760,20 840,34 940,18 L1000,16"
                fill="none" stroke="#2f6690" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-4 p-4 d-panel border-l-4 border-l-red-500">
            <AlertTriangle size={17} className="text-red-500 shrink-0" />
            <p className="flex-1 text-xs text-red-600 truncate">{error}</p>
            <button onClick={fetchAll} className="px-3 py-1.5 bg-red-500 text-white text-xs font-bold rounded-xl">Réessayer</button>
          </div>
        )}

        {/* ══════════════ FILTRES CONTEXTUELS ══════════════ */}
        <div className="flex items-center gap-2 flex-wrap">
          {canViewAllUnits && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button onClick={() => setUniteFilter('all')}
                className={`px-3.5 py-2 rounded-full text-[11px] font-bold border transition-all flex items-center gap-1.5 ${
                  uniteFilter === 'all' ? 'bg-[#0a1930] text-white border-[#0a1930]'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                }`}>
                <Layers size={11} />Toutes unités
              </button>
              {unites.map(u => {
                const actif = uniteFilter === u.id;
                const n = interventions.filter(i => i.unite_id === u.id).length;
                if (n === 0) return null;
                return (
                  <button key={u.id} onClick={() => setUniteFilter(u.id)} title={u.nom}
                    className={`px-3.5 py-2 rounded-full text-[11px] font-bold border transition-all flex items-center gap-1.5 ${
                      actif ? 'bg-[#0a1930] text-white border-[#0a1930]'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                    }`}>
                    <Building2 size={11} />{u.code}
                  </button>
                );
              })}
            </div>
          )}

          {ateliersDisponibles.length > 0 && (
            <>
              <span className="w-px h-6 bg-slate-200 mx-1" />
              {!isChargeUnite && (
                <button onClick={() => setAtelierFilter('all')}
                  className={`px-3.5 py-2 rounded-full text-[11px] font-bold border transition-all ${
                    atelierFilter === 'all' ? 'bg-[#2f6690] text-white border-[#2f6690]'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  }`}>
                  Tous ateliers
                </button>
              )}
              {ateliersDisponibles.map(a => {
                const actif = atelierFilter === a.id;
                return (
                  <button key={a.id} onClick={() => { if (!isChargeUnite) setAtelierFilter(actif ? 'all' : a.id); }} title={a.nom}
                    disabled={isChargeUnite}
                    className={`px-3.5 py-2 rounded-full text-[11px] font-bold border transition-all flex items-center gap-1.5 ${
                      actif ? 'bg-[#2f6690] text-white border-[#2f6690]'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                    } ${isChargeUnite ? 'cursor-default' : ''}`}>
                    <Wrench size={11} />{a.code}
                    <span className={`d-mono text-[10px] ${actif ? 'text-white/70' : 'text-slate-400'}`}>{a.count}</span>
                  </button>
                );
              })}
            </>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className="pl-8 pr-3 py-2 w-44 bg-white rounded-full border border-slate-200 text-[11px] text-slate-700 placeholder:text-slate-300 focus:border-[#2f6690] outline-none" />
            </div>
          </div>
        </div>

        {/* ══════════════ LANCEMENT DE LA JOURNÉE ══════════════ */}
        {campagne === 'jour' && fichesDisponibles.length > 0 && (
          <div className="d-panel overflow-hidden reveal">
            <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-[#e4edf3] to-white flex items-center gap-3 flex-wrap">
              <div className="w-11 h-11 rounded-2xl bg-[#0a1930] flex items-center justify-center shadow-sm shrink-0">
                <Printer size={19} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="d-kicker text-[#2f6690]">Étape 1 — Lancer la journée</p>
                <h3 className="text-[15px] font-bold text-[#0a1930] mt-0.5">
                  Fiches d'inspection du jour
                </h3>
              </div>
              <button
                onClick={() => setShowPrintConfirm(true)}
                disabled={printLoading}
                className="d-gold flex items-center gap-2 px-5 py-2.5 rounded-full text-[12px] disabled:opacity-50 shrink-0"
              >
                {printLoading
                  ? <><Loader2 size={14} className="animate-spin" />Impression…</>
                  : <><Printer size={14} />Imprimer {fichesDisponibles.length} fiche{fichesDisponibles.length > 1 ? 's' : ''}</>}
              </button>
            </div>

            <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-[14px] bg-sky-50 border border-sky-100">
                <p className="d-kicker text-sky-600 flex items-center gap-1.5">
                  <FileText size={11} />À lancer
                </p>
                <p className="text-[28px] font-bold text-sky-700 tabular-nums leading-none mt-2">
                  <AnimatedNumber value={aLancer.length} />
                </p>
                <p className="text-[10px] text-sky-600/75 mt-1.5">
                  {aLancer.length > 0
                    ? 'passeront « En cours » à l\'impression'
                    : 'toutes les fiches sont déjà lancées'}
                </p>
              </div>

              <div className="p-4 rounded-[14px] bg-amber-50 border border-amber-100">
                <p className="d-kicker text-amber-600 flex items-center gap-1.5">
                  <Clock size={11} />En cours
                </p>
                <p className="text-[28px] font-bold text-amber-700 tabular-nums leading-none mt-2">
                  <AnimatedNumber value={dejaLancees.length} />
                </p>
                <p className="text-[10px] text-amber-600/75 mt-1.5">interventions déjà démarrées</p>
              </div>

              <div className="p-4 rounded-[14px] bg-slate-50 border border-slate-200">
                <p className="d-kicker text-slate-500 flex items-center gap-1.5">
                  <ListChecks size={11} />Fiches disponibles
                </p>
                <p className="text-[28px] font-bold text-slate-700 tabular-nums leading-none mt-2">
                  <AnimatedNumber value={fichesDisponibles.length} />
                </p>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  sur {duJour.length} intervention{duJour.length > 1 ? 's' : ''} du jour
                </p>
              </div>
            </div>

            {/* {aLancer.length > 0 && (
              <div className="px-5 pb-5">
                <div className="p-3 rounded-xl bg-[#f0f4ff] border border-[#dbe4f7] flex items-start gap-2.5">
                  <Info size={14} className="text-[#2f6690] shrink-0 mt-0.5" />
                  <p className="text-[11px] text-[#24537a]">
                    L'impression fait basculer <b>{aLancer.length}</b> intervention{aLancer.length > 1 ? 's' : ''} de
                    « Planifiée » à « En cours ». Une confirmation vous sera demandée, et vous pourrez
                    imprimer sans changer les statuts si vous le souhaitez.
                  </p>
                </div>
              </div>
            )} */}
          </div>
        )}

        {/* ══════════════ LISTE ══════════════ */}
        {campagne === 'jour' && listeFiltree.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            <p className="d-kicker text-[#2f6690]">Étape 2 — Pointer et clôturer</p>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
        )}

        {tasksLoading && liste.length > 0 && (
          <div className="flex items-center gap-2 d-mono text-[11px] text-slate-400">
            <Loader2 size={12} className="animate-spin" />Chargement des tâches…
          </div>
        )}

        {listeFiltree.length === 0 ? (
          <div className="d-panel flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 size={30} className="text-emerald-400" />
            </div>
            <p className="text-base font-bold text-slate-600">
              {search ? 'Aucun résultat'
                : campagne === 'jour' ? 'La journée est soldée' : 'Aucun retard à rattraper'}
            </p>
            <p className="text-[11px] text-slate-400">
              {search ? 'Essayez un autre terme.' : 'Rien ne vous attend sur ce périmètre.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {listeFiltree.map(i => {
              const st = STATUTS.find(s => s.value === i.statut);
              const unite = uniteById.get(i.unite_id as number);
              const atelier = i.atelier_id != null ? atelierById.get(i.atelier_id) : null;
              const ficheUrl = ficheToHttpUrl(i.fiche_inspection);
              const tasks = tasksMap[i.id];
              const check = checkCompletion(tasks);
              const saving = closureSaving[i.id];
              const pending = pendingReports[i.id];
              const daysLate = campagne === 'retards' ? getDaysOverdue(i.date_prevue) : 0;
              const severity = daysLate >= 14 ? 'bg-red-600' : daysLate >= 7 ? 'bg-red-500'
                : daysLate >= 3 ? 'bg-orange-500' : 'bg-amber-400';

              return (
                <div key={i.id} className={`d-panel d-panel-hover overflow-hidden ${
                  pending ? 'ring-1 ring-violet-300' : check.canClose ? 'ring-1 ring-emerald-200' : ''
                }`}>
                  <div className="flex flex-col lg:flex-row">
                    {/* Identité */}
                    <div className="flex-1 min-w-0 p-4 lg:border-r border-slate-100">
                      <div className="flex items-start gap-4">
                        {campagne === 'retards' ? (
                          <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center shrink-0 ${severity}`}>
                            <span className="text-[15px] font-bold text-white leading-none">-{daysLate}</span>
                            <span className="d-mono text-[7px] text-white/90 font-bold uppercase mt-0.5">jour{daysLate > 1 ? 's' : ''}</span>
                          </div>
                        ) : (
                          <div className="w-14 h-14 rounded-2xl bg-[#e4edf3] flex flex-col items-center justify-center shrink-0">
                            <span className="d-mono text-[9px] font-bold uppercase text-[#2f6690]">
                              {new Date(i.date_prevue + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short' })}
                            </span>
                            <span className="text-[20px] font-bold leading-none text-[#0a1930]">
                              {new Date(i.date_prevue + 'T00:00:00').getDate()}
                            </span>
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              {st && (
                                <span className={`inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full font-bold ${st.color}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${statutDotClass(i.statut)}`} />
                                  {st.label}
                                </span>
                              )}
                              {pending && (
                                <span className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full font-bold bg-violet-100 text-violet-700">
                                  <Timer size={9} />Report en attente
                                </span>
                              )}
                              {!pending && check.canClose && tasks && tasks.length > 0 && (
                                <span className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full font-bold bg-emerald-50 text-emerald-700">
                                  <Check size={9} />Prête à clôturer
                                </span>
                              )}
                            </div>
                            {ficheUrl && (
                              <a href={ficheUrl} target="_blank" rel="noopener noreferrer"
                                className="group/link flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold rounded-full text-[#0a1930] bg-blue-50 hover:bg-[#0a1930] hover:text-white transition-all shrink-0">
                                <FileText size={10} /><span className="hidden sm:inline">Fiche</span>
                                <ExternalLink size={9} className="opacity-40 group-hover/link:opacity-100" />
                              </a>
                            )}
                          </div>

                          <h3 className="font-bold text-[#0a1930] text-[14px] leading-snug line-clamp-1">{i.titre}</h3>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 d-mono text-[10px]">
                            <span className="text-slate-500">{formatDateFR(i.date_prevue)}</span>
                            {i.duree_intervention && (
                              <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
                                <Clock size={10} />{i.duree_intervention}h
                              </span>
                            )}
                            {unite && (
                              <span className="inline-flex items-center gap-1 text-[#2f6690] font-bold">
                                <Building2 size={10} />{unite.code}
                              </span>
                            )}
                            {atelier && (
                              <span className="inline-flex items-center gap-1 text-violet-600 font-bold">
                                <Wrench size={10} />{atelier.code}
                              </span>
                            )}
                            {i.frequence && (
                              <span className="px-2 py-0.5 rounded-full font-bold bg-violet-50 text-violet-600">{i.frequence}</span>
                            )}
                          </div>

                          {pending && (
                            <div className="mt-2.5 p-2.5 rounded-xl bg-violet-50 border border-violet-200">
                              <p className="text-[11px] text-violet-800">
                                Report demandé au <b>{formatDateFR(pending.dateDemandee)}</b>
                                {pending.technicienNom && <> pour <b>{pending.technicienNom}</b></>}
                                {pending.motif && <> — {pending.motif}</>}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Tâches et actions */}
                    <TasksPanel
                      tasks={tasks || []}
                      loading={tasks === undefined}
                      ficheInspection={i.fiche_inspection}
                      onOpenTasks={idx => openTasks(i, idx)}
                      actions={pending ? (
                        <div className="flex items-center gap-2 justify-center">
                          <Lock size={13} className="text-violet-500" />
                          <span className="text-[11px] font-bold text-violet-700">En attente de l'administrateur</span>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {/* {!check.canClose && check.reason && (
                            <p className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 flex items-center gap-1">
                              <Lock size={9} />{check.reason}
                            </p>
                          )} */}
                          <div className="flex items-center gap-2">
                            <button onClick={() => closeOne(i.id, 'terminee')}
                              disabled={saving || bulkClosing || !check.canClose}
                              title={check.reason || 'Clôturer l\'intervention'}
                              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95">
                              {saving ? <Loader2 size={12} className="animate-spin" />
                                : check.canClose ? <CheckCircle2 size={12} /> : <Lock size={12} />}
                              Clôturer
                            </button>
                            <button onClick={() => setReportingIntervention(i)}
                              disabled={saving || bulkClosing}
                              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white border-2 border-amber-300 hover:bg-amber-50 text-amber-700 text-xs font-bold shadow-sm disabled:opacity-60 transition-all active:scale-95">
                              <RotateCcw size={12} />Reporter
                            </button>
                          </div>
                        </div>
                      )}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {lastUpdated && (
          <div className="flex items-center justify-center gap-2 py-3 d-mono text-[10px] text-slate-400">
            <Shield size={10} />
            <span>Synchronisé à {lastUpdated.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed top-6 right-6 z-[100]">
          <div className={`px-4 py-3 rounded-2xl shadow-lg text-sm font-bold flex items-center gap-2 ${
            toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
          }`}>
            {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}