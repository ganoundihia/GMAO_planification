import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { X, AlertTriangle } from 'lucide-react';
import type { Intervention, InterventionTechnicien, Unite, Atelier, Technicien, Frequence, Statut, JourFerie } from '../lib/types';
import { FREQUENCES, STATUTS, parseCodeGmao } from '../lib/types';

interface Props {
  intervention: Intervention | null;
  unites: Unite[];
  ateliers: Atelier[];
  techniciens: Technicien[];
  holidays: JourFerie[];
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  readOnly?: boolean;
}

export default function InterventionModal({ intervention, unites, ateliers, techniciens, holidays, onClose, onSave, readOnly }: Props) {
  const isEdit = !!intervention;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    unite_id: intervention?.unite_id || '',
    atelier_id: intervention?.atelier_id || '',
    equipement: intervention?.equipement || '',
    code_gmao: intervention?.code_gmao || '',
    titre: intervention?.titre || '',
    systeme: intervention?.systeme || '',
    sous_systeme: intervention?.sous_systeme || '',
    frequence: intervention?.frequence || 'Mensuelle',
    date_prevue: intervention?.date_prevue || '',
    duree_intervention: intervention?.duree_intervention || 1,
    temps_logistique: intervention?.temps_logistique || 0,
    materiel: intervention?.materiel || '',
    outillage: intervention?.outillage || '',
    fiche_inspection: intervention?.fiche_inspection || '',
    consignation: intervention?.consignation || 'Non',
    consignation_motif: intervention?.consignation_motif || '',
    jour_nuit: intervention?.jour_nuit || 'Jour',
    num_shift: intervention?.num_shift || 1,
    statut: intervention?.statut || 'planifiee',
  });
  const [selectedTechs, setSelectedTechs] = useState<InterventionTechnicien[]>([]);
  const [holidayWarning, setHolidayWarning] = useState(false);
  const [weekendWarning, setWeekendWarning] = useState(false);

  useEffect(() => {
    if (intervention?.techniciens) setSelectedTechs(intervention.techniciens);
  }, [intervention]);

  useEffect(() => {
    if (form.date_prevue) {
      const d = new Date(form.date_prevue + 'T00:00:00');
      setWeekendWarning(d.getDay() === 5 || d.getDay() === 6);
      setHolidayWarning(holidays.some(h => h.date === form.date_prevue));
    } else { setWeekendWarning(false); setHolidayWarning(false); }
  }, [form.date_prevue, holidays]);

  useEffect(() => {
    if (form.code_gmao) {
      const { systeme, sous_systeme } = parseCodeGmao(form.code_gmao);
      if (systeme && !form.systeme) setForm(f => ({ ...f, systeme }));
      if (sous_systeme && !form.sous_systeme) setForm(f => ({ ...f, sous_systeme }));
    }
  }, [form.code_gmao]);

  const toggleTech = (techId: number) => {
    setSelectedTechs(prev => {
      const exists = prev.find(t => t.technicien_id === techId);
      if (exists) return prev.filter(t => t.technicien_id !== techId);
      return [...prev, { id: 0, planning_id: 0, technicien_id: techId, duree: form.duree_intervention }];
    });
  };

  const updateTechDuree = (techId: number, duree: number) => {
    setSelectedTechs(prev => prev.map(t => t.technicien_id === techId ? { ...t, duree } : t));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        intervention: { ...form, unite_id: Number(form.unite_id), atelier_id: Number(form.atelier_id), duree_intervention: Number(form.duree_intervention), temps_logistique: Number(form.temps_logistique), num_shift: Number(form.num_shift) },
        techniciens: selectedTechs.map(t => ({ technicien_id: t.technicien_id, duree: t.duree })),
        notify: true,
      });
    } finally { setSaving(false); }
  };

  const filteredTechs = techniciens.filter(t => !form.unite_id || t.unite_id === Number(form.unite_id));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-slate-800">{isEdit ? 'Modifier l\'intervention' : 'Nouvelle intervention'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg"><X size={20} /></button>
        </div>

        {(holidayWarning || weekendWarning) && (
          <div className="mx-5 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              {weekendWarning && <p>⚠️ Date prévue tombe un week-end (Ven/Sam).</p>}
              {holidayWarning && <p>⚠️ Date prévue est un jour férié.</p>}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Unité *</label><select value={form.unite_id} onChange={e => setForm(f => ({ ...f, unite_id: e.target.value }))} required disabled={readOnly} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-100"><option value="">Sélectionner...</option>{unites.map(u => <option key={u.id} value={u.id}>{u.code} — {u.nom}</option>)}</select></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Atelier</label><select value={form.atelier_id} onChange={e => setForm(f => ({ ...f, atelier_id: e.target.value }))} disabled={readOnly} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-100"><option value="">Sélectionner...</option>{ateliers.map(a => <option key={a.id} value={a.id}>{a.code} — {a.nom}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Titre de visite *</label><input type="text" value={form.titre} onChange={e => setForm(f => ({ ...f, titre: e.target.value }))} required disabled={readOnly} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-100" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Équipement</label><input type="text" value={form.equipement} onChange={e => setForm(f => ({ ...f, equipement: e.target.value }))} disabled={readOnly} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-100" /></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Code GMAO</label><input type="text" value={form.code_gmao} onChange={e => setForm(f => ({ ...f, code_gmao: e.target.value }))} disabled={readOnly} placeholder="sys.unité.sous_unité.num.num" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono disabled:bg-slate-100" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Système <span className="text-slate-400 text-xs">(auto)</span></label><input type="text" value={form.systeme} onChange={e => setForm(f => ({ ...f, systeme: e.target.value }))} disabled={readOnly} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-100" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Sous-système <span className="text-slate-400 text-xs">(auto)</span></label><input type="text" value={form.sous_systeme} onChange={e => setForm(f => ({ ...f, sous_systeme: e.target.value }))} disabled={readOnly} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-100" /></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Fréquence *</label><select value={form.frequence} onChange={e => setForm(f => ({ ...f, frequence: e.target.value as Frequence }))} required disabled={readOnly} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-100">{FREQUENCES.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Date prévue *</label><input type="date" value={form.date_prevue} onChange={e => setForm(f => ({ ...f, date_prevue: e.target.value }))} required disabled={readOnly} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-100" /></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Durée intervention (h)</label><input type="number" min="0.5" step="0.5" value={form.duree_intervention} onChange={e => setForm(f => ({ ...f, duree_intervention: Number(e.target.value) }))} disabled={readOnly} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-100" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Temps logistique (h)</label><input type="number" min="0" step="0.25" value={form.temps_logistique} onChange={e => setForm(f => ({ ...f, temps_logistique: Number(e.target.value) }))} disabled={readOnly} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-100" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Statut</label><select value={form.statut} onChange={e => setForm(f => ({ ...f, statut: e.target.value as Statut }))} disabled={readOnly} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-100">{STATUTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Consignation</label><select value={form.consignation} onChange={e => setForm(f => ({ ...f, consignation: e.target.value }))} disabled={readOnly} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-100"><option value="Non">Non</option><option value="Oui">Oui</option></select></div>
            {form.consignation === 'Oui' && <div><label className="block text-sm font-medium text-slate-700 mb-1">Motif consignation</label><input type="text" value={form.consignation_motif} onChange={e => setForm(f => ({ ...f, consignation_motif: e.target.value }))} disabled={readOnly} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-100" /></div>}
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Jour / Nuit</label><select value={form.jour_nuit} onChange={e => setForm(f => ({ ...f, jour_nuit: e.target.value }))} disabled={readOnly} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-100"><option value="Jour">Jour</option><option value="Nuit">Nuit</option></select></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">N° Shift</label><select value={form.num_shift || 1} onChange={e => setForm(f => ({ ...f, num_shift: Number(e.target.value) }))} disabled={readOnly} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-100"><option value={1}>Shift 1</option><option value={2}>Shift 2</option><option value={3}>Shift 3</option></select></div>
          </div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Intervenants</label><div className="border border-slate-300 rounded-lg p-3 max-h-40 overflow-y-auto">{filteredTechs.length === 0 && <p className="text-sm text-slate-400">Aucun technicien pour cette unité</p>}{filteredTechs.map(tech => {const selected = selectedTechs.find(t => t.technicien_id === tech.id); return (<div key={tech.id} className="flex items-center gap-3 py-1"><input type="checkbox" checked={!!selected} onChange={() => !readOnly && toggleTech(tech.id)} disabled={readOnly} className="rounded border-slate-300" /><span className="text-sm flex-1">{tech.prenom} {tech.nom} ({tech.specialite})</span>{selected && <input type="number" min="0.5" step="0.5" value={selected.duree} onChange={e => updateTechDuree(tech.id, Number(e.target.value))} disabled={readOnly} className="w-20 border border-slate-300 rounded px-2 py-1 text-sm" />}</div>);})}</div></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Matériels / Consommables</label><input type="text" value={form.materiel} onChange={e => setForm(f => ({ ...f, materiel: e.target.value }))} disabled={readOnly} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-100" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Outillage requis</label><input type="text" value={form.outillage} onChange={e => setForm(f => ({ ...f, outillage: e.target.value }))} disabled={readOnly} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-100" /></div>
          </div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Fiche d'inspection (chemin)</label><input type="text" value={form.fiche_inspection} onChange={e => setForm(f => ({ ...f, fiche_inspection: e.target.value }))} disabled={readOnly} placeholder="CFA\FI-CFA-001.pdf" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono disabled:bg-slate-100" /></div>
          {!readOnly && (
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">Annuler</button>
              <button type="submit" disabled={saving} className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">{saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}{isEdit ? 'Enregistrer' : 'Créer'}</button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
