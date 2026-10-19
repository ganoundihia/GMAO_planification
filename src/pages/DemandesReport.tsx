// src/pages/DemandesReport.tsx
// Page d'administration : approbation / refus des demandes de report d'intervention.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  RotateCcw, CheckCircle2, XCircle, Clock, AlertTriangle, Users,
  MessageSquare, Loader2, RefreshCw, Search, Building2, User,
  X, Send, Info, ThumbsDown, CalendarClock, ChevronDown,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { DemandeReport, Unite } from '../lib/types';
import { MAX_HOURS_PER_DAY } from '../lib/types';
import { notifyInterventionReported, notifySelf } from '../lib/notifications';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
interface InterventionLite {
  id: number;
  titre: string;
  code_gmao: string;
  equipement: string;
  duree_intervention: number;
  unite_id: number;
  atelier_id: number | null;
  frequence: string;
  statut: string;
}

interface ProfileLite {
  id: string;
  user_id: string;
  nom: string;
  prenom: string;
  email?: string;
}

interface EnrichedDemande extends DemandeReport {
  intervention?: InterventionLite | null;
  uniteNom?: string;
  demandeurNom?: string;
  adminNom?: string;
}

type TabKey = 'en_attente' | 'approuvee' | 'refusee' | 'annulee' | 'toutes';

// ─────────────────────────────────────────────────────────────
// CONFIG VISUELLE
// ─────────────────────────────────────────────────────────────
const STATUT_STYLES: Record<string, { bg: string; text: string; border: string; label: string; icon: any }> = {
  en_attente: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'En attente', icon: Clock },
  approuvee:  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Approuvée', icon: CheckCircle2 },
  refusee:    { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', label: 'Refusée', icon: XCircle },
  annulee:    { bg: 'bg-slate-100', text: 'text-slate-500', border: 'border-slate-200', label: 'Annulée', icon: X },
};

const NIVEAU_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  none:     { bg: 'bg-slate-100', text: 'text-slate-500', label: 'Aucune alerte' },
  low:      { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Faible' },
  medium:   { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Modérée' },
  high:     { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Élevée' },
  critical: { bg: 'bg-rose-100', text: 'text-rose-700', label: 'Critique' },
};

const TABS: { key: TabKey; label: string }[] = [
  { key: 'en_attente', label: 'En attente' },
  { key: 'approuvee', label: 'Approuvées' },
  { key: 'refusee', label: 'Refusées' },
  { key: 'annulee', label: 'Annulées' },
  { key: 'toutes', label: 'Toutes' },
];

function fmtDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function fmtDateTime(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' · ' + new Date(dateStr).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

// ═══════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════
export default function DemandesReport() {
  const { profile } = useAuth();

  const [rows, setRows] = useState<EnrichedDemande[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<TabKey>('en_attente');
  const [uniteFilter, setUniteFilter] = useState<number | 'all'>('all');
  const [unites, setUnites] = useState<Unite[]>([]);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const [actionModal, setActionModal] = useState<{ type: 'approve' | 'reject'; row: EnrichedDemande } | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [actionSaving, setActionSaving] = useState(false);

  // ── Chargement des données ──
  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const { data: demandes, error } = await supabase
        .from('demandes_report')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const list = demandes || [];
      const interventionIds = [...new Set(list.map((d: any) => d.intervention_id).filter(Boolean))];
      const profileIds = [...new Set(list.flatMap((d: any) => [d.demandeur_id, d.admin_id]).filter(Boolean))];

      const [interventionsRes, unitesRes, profByUserId, profById] = await Promise.all([
        interventionIds.length
          ? supabase.from('planning').select('id, titre, code_gmao, equipement, duree_intervention, unite_id, atelier_id, frequence, statut').in('id', interventionIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from('unites').select('*').order('code'),
        profileIds.length
          ? supabase.from('profiles').select('id, user_id, nom, prenom, email').in('user_id', profileIds)
          : Promise.resolve({ data: [] as any[] }),
        profileIds.length
          ? supabase.from('profiles').select('id, user_id, nom, prenom, email').in('id', profileIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const interventionsById: Record<number, InterventionLite> = {};
      ((interventionsRes as any).data || []).forEach((it: InterventionLite) => { interventionsById[it.id] = it; });

      const unitesData: Unite[] = (unitesRes as any).data || [];
      const unitesById: Record<number, Unite> = {};
      unitesData.forEach(u => { unitesById[u.id] = u; });
      setUnites(unitesData);

      const profilesById: Record<string, ProfileLite> = {};
      [...((profByUserId as any).data || []), ...((profById as any).data || [])].forEach((p: ProfileLite) => {
        if (p.user_id) profilesById[p.user_id] = p;
        if (p.id) profilesById[p.id] = p;
      });

      const enriched: EnrichedDemande[] = list.map((d: any) => {
        const intervention = interventionsById[d.intervention_id] || null;
        const unite = unitesById[d.unite_id ?? intervention?.unite_id ?? -1];
        const demandeur = d.demandeur_id ? profilesById[d.demandeur_id] : undefined;
        const admin = d.admin_id ? profilesById[d.admin_id] : undefined;
        return {
          ...d,
          intervention,
          uniteNom: unite ? `${unite.code} — ${unite.nom}` : undefined,
          demandeurNom: demandeur ? `${demandeur.prenom} ${demandeur.nom}` : undefined,
          adminNom: admin ? `${admin.prenom} ${admin.nom}` : undefined,
        };
      });

      setRows(enriched);
    } catch (err: any) {
      console.error('Erreur chargement demandes de report:', err);
      setToast({ type: 'error', msg: 'Erreur de chargement : ' + err.message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Realtime : rafraîchir sur tout changement ──
  useEffect(() => {
    const channel = supabase
      .channel('demandes-report-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'demandes_report' }, () => fetchAll(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);

  // ── Toast auto-dismiss ──
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Filtrage ──
  const filteredRows = useMemo(() => {
    let list = rows;
    if (tab !== 'toutes') list = list.filter(r => r.statut === tab);
    if (uniteFilter !== 'all') list = list.filter(r => (r.unite_id ?? r.intervention?.unite_id) === uniteFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(r =>
        r.intervention?.titre?.toLowerCase().includes(q) ||
        r.intervention?.code_gmao?.toLowerCase().includes(q) ||
        r.demandeurNom?.toLowerCase().includes(q) ||
        r.motif?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, tab, uniteFilter, search]);

  const counts = useMemo(() => ({
    en_attente: rows.filter(r => r.statut === 'en_attente').length,
    approuvee: rows.filter(r => r.statut === 'approuvee').length,
    refusee: rows.filter(r => r.statut === 'refusee').length,
    annulee: rows.filter(r => r.statut === 'annulee').length,
    toutes: rows.length,
  }), [rows]);

  // ── Actions ──
  const handleConfirmAction = useCallback(async () => {
    if (!actionModal || !profile) return;
    const { type, row } = actionModal;
    setActionSaving(true);
    try {
      const adminId = profile.user_id || profile.id;
      const nowIso = new Date().toISOString();

      const { error: updErr } = await supabase.from('demandes_report').update({
        statut: type === 'approve' ? 'approuvee' : 'refusee',
        admin_id: adminId,
        admin_commentaire: actionComment.trim() || null,
        traitee_at: nowIso,
        updated_at: nowIso,
      }).eq('id', row.id);
      if (updErr) throw updErr;

      if (type === 'approve') {
        // Applique le report sur le planning (même convention que la replanification en fin de journée).
        const { error: planErr } = await supabase.from('planning').update({
          date_prevue: row.date_demandee,
          statut: 'reportee',
          updated_at: nowIso,
        }).eq('id', row.intervention_id);
        if (planErr) throw planErr;

        if (row.demandeur_id) {
          await notifyInterventionReported({
            userId: row.demandeur_id,
            uniteId: row.unite_id ?? row.intervention?.unite_id ?? 0,
            titre: row.intervention?.titre || 'Intervention',
            oldDate: row.date_originale,
            newDate: row.date_demandee,
            motif: row.motif,
          });
        }
        setToast({ type: 'success', msg: '✅ Demande approuvée — planning mis à jour' });
      } else {
        if (row.demandeur_id) {
          const commentPart = actionComment.trim() ? ` — ${actionComment.trim()}` : '';
          await notifySelf({
            userId: row.demandeur_id,
            type: 'warning',
            message: `❌ Report refusé : "${row.intervention?.titre || 'Intervention'}" reste planifiée au ${fmtDate(row.date_originale)}${commentPart}`,
          });
        }
        setToast({ type: 'success', msg: 'Demande refusée' });
      }

      setActionModal(null);
      setActionComment('');
      fetchAll(true);
    } catch (err: any) {
      console.error('Erreur traitement demande:', err);
      setToast({ type: 'error', msg: 'Erreur : ' + err.message });
    } finally {
      setActionSaving(false);
    }
  }, [actionModal, actionComment, profile, fetchAll]);

  // ═══════════════════════════════════════════════════════════
  return (
    <div className="bg-slate-100 min-h-[calc(100vh-60px)] p-4 lg:p-6">
      <div className="max-w-[1300px] mx-auto space-y-5">

        {/* HEADER */}
        <div className="bg-gradient-to-br from-[#1e2a5e] to-[#0c1530] rounded-3xl p-5 lg:p-6 shadow-md">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center"><RotateCcw size={22} className="text-amber-400" /></div>
              <div>
                <h1 className="text-lg font-bold text-white">Demandes de report</h1>
                <p className="text-xs text-slate-300">Validez ou refusez les demandes de report d'intervention envoyées par les unités</p>
              </div>
            </div>
            <button
              onClick={() => fetchAll(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />Actualiser
            </button>
          </div>
        </div>

        {/* TABS + FILTRES */}
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex flex-wrap items-center gap-2">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                tab === t.key ? 'bg-[#1e2a5e] text-white shadow-sm' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
              }`}
            >
              {t.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${tab === t.key ? 'bg-white/20' : 'bg-white text-slate-400'}`}>{counts[t.key]}</span>
            </button>
          ))}

          <div className="flex-1" />

          <div className="relative">
            <Building2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              value={uniteFilter}
              onChange={e => setUniteFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="pl-8 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 outline-none appearance-none cursor-pointer hover:bg-slate-100"
            >
              <option value="all">Toutes les unités</option>
              {unites.map(u => <option key={u.id} value={u.id}>{u.code} — {u.nom}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Titre, GMAO, demandeur…"
              className="pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-300 w-48"
            />
          </div>
        </div>

        {/* LISTE */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-32 bg-white rounded-2xl animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />)}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 flex flex-col items-center justify-center gap-3 shadow-sm">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center"><Info size={28} className="text-slate-400" /></div>
            <p className="text-sm font-bold text-slate-600">Aucune demande{tab !== 'toutes' ? ` ${STATUT_STYLES[tab]?.label.toLowerCase()}` : ''}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRows.map(row => {
              const statutStyle = STATUT_STYLES[row.statut] || STATUT_STYLES.en_attente;
              const StatutIcon = statutStyle.icon;
              const niveauStyle = NIVEAU_STYLES[row.alerte_niveau || 'none'] || NIVEAU_STYLES.none;

              return (
                <div key={row.id} className={`bg-white rounded-2xl shadow-sm border ${statutStyle.border} overflow-hidden`}>
                  <div className="p-4 lg:p-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${statutStyle.bg} ${statutStyle.text}`}>
                            <StatutIcon size={11} />{statutStyle.label}
                          </span>
                          {row.alerte_niveau && row.alerte_niveau !== 'none' && (
                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${niveauStyle.bg} ${niveauStyle.text}`}>{niveauStyle.label}</span>
                          )}
                          {row.uniteNom && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-500"><Building2 size={10} />{row.uniteNom}</span>
                          )}
                        </div>
                        <h3 className="text-sm font-bold text-slate-800 mt-1.5 truncate">{row.intervention?.titre || `Intervention #${row.intervention_id}`}</h3>
                        {row.intervention?.code_gmao && <p className="text-[11px] text-slate-400">{row.intervention.code_gmao}</p>}
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Report demandé</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-slate-400 line-through">{fmtDate(row.date_originale)}</span>
                            <span className="text-slate-300">→</span>
                            <span className="text-xs font-bold text-amber-700">{fmtDate(row.date_demandee)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Détails */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                      <div className="flex items-start gap-2">
                        <User size={13} className="text-slate-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-[10px] text-slate-400 font-semibold uppercase">Demandeur</p>
                          <p className="text-xs font-semibold text-slate-700">{row.demandeurNom || '—'}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <MessageSquare size={13} className="text-slate-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-[10px] text-slate-400 font-semibold uppercase">Motif</p>
                          <p className="text-xs font-semibold text-slate-700">{row.motif || '—'}</p>
                        </div>
                      </div>
                      {row.techniciens_concernes && (row.techniciens_concernes as any[]).length > 0 && (
                        <div className="flex items-start gap-2 sm:col-span-2">
                          <Users size={13} className="text-slate-400 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[10px] text-slate-400 font-semibold uppercase">Techniciens concernés</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {(row.techniciens_concernes as any[]).map((t, i) => (
                                <span key={i} className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700">{typeof t === 'string' ? t : t?.nom}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                      {row.charge_technicien_prevue != null && (
                        <div className="flex items-start gap-2">
                          <CalendarClock size={13} className="text-slate-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[10px] text-slate-400 font-semibold uppercase">Charge estimée / jour</p>
                            <p className="text-xs font-semibold text-slate-700">{Number(row.charge_technicien_prevue).toFixed(1)}h / {MAX_HOURS_PER_DAY}h</p>
                          </div>
                        </div>
                      )}
                      {row.conges_conflits && (row.conges_conflits as any[]).length > 0 && (
                        <div className="flex items-start gap-2 sm:col-span-2">
                          <AlertTriangle size={13} className="text-rose-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[10px] text-rose-400 font-semibold uppercase">Conflits congés</p>
                            <p className="text-xs text-rose-600">
                              {(row.conges_conflits as any[]).map(c => c.technicienNom).filter(Boolean).join(', ')}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Pied : traçabilité + actions */}
                    <div className="flex items-center justify-between gap-4 flex-wrap mt-4 pt-3 border-t border-slate-100">
                      <p className="text-[10px] text-slate-400">
                        Envoyée le {fmtDateTime(row.created_at)}
                        {row.traitee_at && <> · Traitée le {fmtDateTime(row.traitee_at)}{row.adminNom ? ` par ${row.adminNom}` : ''}</>}
                        {row.admin_commentaire && <span className="italic"> — « {row.admin_commentaire} »</span>}
                      </p>

                      {row.statut === 'en_attente' && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setActionModal({ type: 'reject', row })}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors"
                          >
                            <ThumbsDown size={12} />Refuser
                          </button>
                          <button
                            onClick={() => setActionModal({ type: 'approve', row })}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 shadow-sm transition-colors"
                          >
                            <CheckCircle2 size={12} />Approuver
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODALE ACTION */}
      {actionModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className={`px-6 py-5 ${actionModal.type === 'approve' ? 'bg-gradient-to-br from-emerald-500 to-emerald-600' : 'bg-gradient-to-br from-rose-500 to-rose-600'}`}>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center">
                  {actionModal.type === 'approve' ? <CheckCircle2 size={20} className="text-white" /> : <ThumbsDown size={20} className="text-white" />}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest">{actionModal.type === 'approve' ? 'Approuver' : 'Refuser'} la demande</p>
                  <h2 className="text-sm font-bold text-white truncate max-w-[260px]">{actionModal.row.intervention?.titre}</h2>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600 space-y-1">
                <p><span className="text-slate-400">Demandeur :</span> <strong>{actionModal.row.demandeurNom || '—'}</strong></p>
                <p><span className="text-slate-400">Date actuelle → demandée :</span> <strong>{fmtDate(actionModal.row.date_originale)} → {fmtDate(actionModal.row.date_demandee)}</strong></p>
                <p><span className="text-slate-400">Motif :</span> <strong>{actionModal.row.motif}</strong></p>
              </div>

              {actionModal.type === 'approve' && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-2">
                  <Info className="text-blue-500 shrink-0 mt-0.5" size={14} />
                  <p className="text-[11px] text-blue-700">Le planning sera automatiquement mis à jour à la nouvelle date, avec le statut « Reportée ».</p>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Commentaire {actionModal.type === 'reject' ? '(recommandé)' : '(optionnel)'}
                </label>
                <textarea
                  value={actionComment}
                  onChange={e => setActionComment(e.target.value)}
                  rows={3}
                  placeholder={actionModal.type === 'approve' ? 'Précisions pour le demandeur…' : 'Expliquez le motif du refus…'}
                  className="w-full px-3.5 py-2.5 bg-white rounded-xl border-2 border-slate-200 focus:border-blue-400 outline-none text-sm text-slate-800 resize-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
              <button
                onClick={() => { setActionModal(null); setActionComment(''); }}
                disabled={actionSaving}
                className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 font-semibold disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmAction}
                disabled={actionSaving}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm disabled:opacity-50 flex items-center gap-2 text-white ${
                  actionModal.type === 'approve' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'
                }`}
              >
                {actionSaving ? <><Loader2 size={14} className="animate-spin" />Traitement…</> : <><Send size={14} />{actionModal.type === 'approve' ? 'Confirmer l\'approbation' : 'Confirmer le refus'}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-2xl shadow-lg text-sm font-semibold flex items-center gap-2 animate-in slide-in-from-bottom-2 duration-300 ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
