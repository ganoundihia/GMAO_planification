// components/SeuilChargeCard.tsx
// ══════════════════════════════════════════════════════════════════════════════
//  Réglage du seuil de charge maximale par technicien et par jour.
//
//  Ce seuil pilote la demande de report côté chargé d'unité : seules les dates
//  et les techniciens qui restent sous ce seuil lui sont proposés. Il est donc
//  réservé à l'administrateur et s'applique à toute l'application.
//
//  À déposer dans votre page « Demandes de report reçues » :
//      import SeuilChargeCard from '../components/SeuilChargeCard';
//      ...
//      <SeuilChargeCard canEdit={isAdmin} />
// ══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react';
import { Gauge, Lock, Loader2, Check, AlertTriangle, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { MAX_HOURS_PER_DAY } from '../lib/types';

// Doit rester identique à la clé utilisée par le Dashboard
const SETTINGS_KEY_CHARGE = 'charge_max_jour_technicien';

const MIN_SEUIL = 1;
const MAX_SEUIL = 8;

export default function SeuilChargeCard({ canEdit = false }: { canEdit?: boolean }) {
  const [seuil, setSeuil] = useState<number>(MAX_HOURS_PER_DAY);
  const [seuilEnregistre, setSeuilEnregistre] = useState<number>(MAX_HOURS_PER_DAY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'error'; msg: string } | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Lecture ──
  useEffect(() => {
    let cancelled = false;
    supabase.from('settings').select('value').eq('key', SETTINGS_KEY_CHARGE).maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const v = parseFloat(data?.value ?? '');
        const valeur = Number.isFinite(v) && v > 0 ? v : MAX_HOURS_PER_DAY;
        setSeuil(valeur);
        setSeuilEnregistre(valeur);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => { if (feedbackTimer.current) clearTimeout(feedbackTimer.current); }, []);

  const notifier = (type: 'ok' | 'error', msg: string) => {
    setFeedback({ type, msg });
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(null), 3500);
  };

  // ── Écriture ──
  const enregistrer = useCallback(async (valeur: number) => {
    if (!canEdit) return;
    const v = Math.min(MAX_SEUIL, Math.max(MIN_SEUIL, valeur));
    if (v === seuilEnregistre) return;

    setSaving(true);
    try {
      const { error } = await supabase.from('settings')
        .upsert({ key: SETTINGS_KEY_CHARGE, value: String(v) }, { onConflict: 'key' });
      if (error) throw error;
      setSeuilEnregistre(v);
      setSeuil(v);
      notifier('ok', `Seuil enregistré : ${v}h par jour et par technicien`);
    } catch (err: any) {
      console.error('Erreur sauvegarde seuil de charge:', err);
      setSeuil(seuilEnregistre); // on revient à la valeur connue du serveur
      notifier('error', 'Enregistrement impossible : ' + (err.message || 'erreur inconnue'));
    } finally {
      setSaving(false);
    }
  }, [canEdit, seuilEnregistre]);

  const modifie = seuil !== seuilEnregistre;

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">

      {/* En-tête */}
      <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-orange-50 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500 flex items-center justify-center shadow-md">
            <Gauge size={17} className="text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Seuil de charge</h3>
            <p className="text-[11px] text-slate-500">Charge maximale par technicien et par jour</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {saving && <Loader2 size={14} className="animate-spin text-amber-600" />}
          <span className="px-3 py-1.5 rounded-xl bg-amber-500 text-white text-sm font-bold tabular-nums">
            {loading ? '—' : `${seuil}h`}
          </span>
        </div>
      </div>

      <div className="p-5 space-y-4">

        {loading ? (
          <div className="flex items-center justify-center py-8 gap-2">
            <Loader2 size={18} className="animate-spin text-slate-300" />
            <span className="text-xs text-slate-400">Lecture du réglage…</span>
          </div>
        ) : canEdit ? (
          <>
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-bold text-slate-400 tabular-nums shrink-0">{MIN_SEUIL}h</span>
              <input
                type="range"
                min={MIN_SEUIL} max={MAX_SEUIL} step={0.5}
                value={seuil}
                onChange={e => setSeuil(parseFloat(e.target.value))}
                onMouseUp={e => enregistrer(parseFloat((e.target as HTMLInputElement).value))}
                onTouchEnd={e => enregistrer(parseFloat((e.target as HTMLInputElement).value))}
                onKeyUp={e => { if (['ArrowLeft', 'ArrowRight'].includes(e.key)) enregistrer(seuil); }}
                className="flex-1 accent-amber-500 cursor-pointer"
                disabled={saving}
              />
              <span className="text-[10px] font-bold text-slate-400 tabular-nums shrink-0">{MAX_SEUIL}h</span>
              <input
                type="number"
                min={MIN_SEUIL} max={MAX_SEUIL} step={0.5}
                value={seuil}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  setSeuil(Number.isFinite(v) ? v : seuilEnregistre);
                }}
                onBlur={e => {
                  const v = parseFloat(e.target.value);
                  enregistrer(Number.isFinite(v) && v > 0 ? v : seuilEnregistre);
                }}
                disabled={saving}
                className="w-20 px-2 py-1.5 text-sm text-center font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg outline-none focus:ring-2 focus:ring-amber-300 tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>

            {/* Repères rapides */}
            <div className="flex items-center gap-2 flex-wrap">
              {[3, 4, 5, 6, 7].map(v => (
                <button
                  key={v}
                  onClick={() => enregistrer(v)}
                  disabled={saving}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all disabled:opacity-50 ${
                    seuilEnregistre === v
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-amber-50 hover:text-amber-700'
                  }`}
                >
                  {v}h
                </button>
              ))}
              {modifie && (
                <button
                  onClick={() => enregistrer(seuil)}
                  disabled={saving}
                  className="ml-auto flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold shadow-sm disabled:opacity-50 transition-all active:scale-95"
                >
                  {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                  Enregistrer {seuil}h
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${(seuil / MAX_SEUIL) * 100}%` }} />
            </div>
            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 shrink-0">
              <Lock size={10} />Réservé à l'administrateur
            </span>
          </div>
        )}

        {/* Explication de l'effet du réglage */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-2.5">
          <Info className="text-blue-500 shrink-0 mt-0.5" size={14} />
          <p className="text-[11px] text-blue-700 leading-relaxed">
            Lors d'une demande de report, seules les dates comptant au moins un technicien
            sous <strong>{loading ? '—' : `${seuil}h`}</strong> sont proposées, puis les techniciens
            de cette journée sont classés du moins chargé au plus chargé. Baisser le seuil
            resserre les propositions ; le relever ouvre davantage de créneaux.
          </p>
        </div>

        {feedback && (
          <div className={`p-3 rounded-xl flex items-center gap-2 text-[11px] font-semibold ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
              : 'bg-rose-50 border border-rose-200 text-rose-700'
          }`}>
            {feedback.type === 'ok' ? <Check size={13} /> : <AlertTriangle size={13} />}
            {feedback.msg}
          </div>
        )}
      </div>
    </div>
  );
}