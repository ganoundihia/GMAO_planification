import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { Unite, Atelier, Technicien } from '../lib/types';
import { Search, RotateCcw } from 'lucide-react';

export interface Filters {
  unite_id: string;
  atelier_id: string;
  technicien_id: string;
  date_start: string;
  date_end: string;
  statut: string;
  search: string;
}

interface Props {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  unites: Unite[];
  ateliers: Atelier[];
  techniciens: Technicien[];
}

export default function FilterPanel({ filters, setFilters, unites, ateliers, techniciens }: Props) {
  const { profile } = useAuth();
  const isTechnicien = (profile?.role as string | undefined) === 'technicien'; // rôle historique, hors enum Role
  // Le chargé d'unité est verrouillé sur son unité ET son unique atelier, partout, y compris ici.
  const isChargeUnite = profile?.role === 'charge_unite';
  // Le responsable d'unité est verrouillé sur son unité mais voit tous les ateliers de celle-ci.
  const isResponsableUnite = profile?.role === 'responsable_unite';
  const reset = () => setFilters({
    unite_id:      isChargeUnite || isResponsableUnite ? String(profile?.unite_id ?? '') : '',
    atelier_id:    isChargeUnite ? String(profile?.atelier_id ?? '') : '',
    technicien_id: '', date_start: '', date_end: '', statut: '', search: '',
  });
  const hasFilters = Object.values(filters).some(v => v !== '');
  // Catalogue d'ateliers global (aucun lien unité→atelier) : le chargé d'unité
  // est restreint à son unique atelier, le reste voit le catalogue complet.
  const ateliersOptions = isChargeUnite
    ? ateliers.filter(a => a.id === Number(profile?.atelier_id))
    : ateliers;

  // Verrouille unité + atelier dès qu'on connaît le profil (défense en profondeur, même si l'appelant filtre déjà les données).
  useEffect(() => {
    if (!profile) return;
    if (isChargeUnite) {
      setFilters(f => ({
        ...f,
        unite_id:   String(profile.unite_id ?? ''),
        atelier_id: String(profile.atelier_id ?? ''),
      }));
    } else if (isResponsableUnite) {
      setFilters(f => ({ ...f, unite_id: String(profile.unite_id ?? '') }));
    }
  }, [profile, isChargeUnite, isResponsableUnite, setFilters]);

  // For technicians: only date filters
  if (isTechnicien) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Search size={16} /> Filtrer par date</h3>
          {hasFilters && <button onClick={reset} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"><RotateCcw size={12} /> Réinitialiser</button>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Du</label>
            <input type="date" value={filters.date_start} onChange={e => setFilters(f => ({ ...f, date_start: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Au</label>
            <input type="date" value={filters.date_end} onChange={e => setFilters(f => ({ ...f, date_end: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          </div>
        </div>
      </div>
    );
  }

  // For admin/responsable/charge: full filters
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Search size={16} /> Filtres</h3>
        {hasFilters && <button onClick={reset} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"><RotateCcw size={12} /> Réinitialiser</button>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <select value={filters.unite_id} disabled={isChargeUnite || isResponsableUnite} onChange={e => setFilters(f => ({ ...f, unite_id: e.target.value }))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-500">
          {!(isChargeUnite || isResponsableUnite) && <option value="">Toutes unités</option>}
          {unites.map(u => <option key={u.id} value={u.id}>{u.code}</option>)}
        </select>
        <select value={filters.atelier_id} disabled={isChargeUnite} onChange={e => setFilters(f => ({ ...f, atelier_id: e.target.value }))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-500">
          {!isChargeUnite && <option value="">Tous ateliers</option>}
          {ateliersOptions.map(a => <option key={a.id} value={a.id}>{a.code}</option>)}
        </select>
        <select value={filters.technicien_id} onChange={e => setFilters(f => ({ ...f, technicien_id: e.target.value }))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
          <option value="">Tous techniciens</option>
          {techniciens.map(t => <option key={t.id} value={t.id}>{t.prenom} {t.nom}</option>)}
        </select>
        <input type="date" value={filters.date_start} onChange={e => setFilters(f => ({ ...f, date_start: e.target.value }))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
        <input type="date" value={filters.date_end} onChange={e => setFilters(f => ({ ...f, date_end: e.target.value }))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
        <select value={filters.statut} onChange={e => setFilters(f => ({ ...f, statut: e.target.value }))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
          <option value="">Tous statuts</option>
          <option value="planifiee">Planifiée</option>
          <option value="en_cours">En cours</option>
          <option value="terminee">Clôturée</option>
          <option value="reportee">Reportée</option>
        </select>
        <input type="text" value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} placeholder="Rechercher..." className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
      </div>
    </div>
  );
}
