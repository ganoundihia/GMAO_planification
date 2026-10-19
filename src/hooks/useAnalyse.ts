import { useState, useCallback } from 'react';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, format } from 'date-fns';

export interface AnalyseChargeRequest {
  date_debut: string;
  date_fin: string;
  atelier_id?: string;
  unite_id?: string;
  technicien_id?: string;
  cap_h: number;
}

export interface InterventionCharge {
  intervention_id: number;
  titre: string;
  atelier_code: string;
  frequence: string;
  nb_occ: number;
  duree_occ_min: number;
  total_h: number;
  alerte: string | null;
  detail: string;
  hors_periode: boolean;
}

export interface TechnicienCharge {
  technicien_id: number;
  nom: string;
  prenom: string;
  unite_code: string;
  jours_dispo: number;
  charge_totale_min: number;
  charge_totale_h: number;
  charge_moy_h_j: number;
  en_conge: boolean;
  en_surcharge: boolean;
  interventions: InterventionCharge[];
}

export interface AnalyseChargeResponse {
  jours_ouvres: number;
  techniciens: TechnicienCharge[];
  stats: {
    nb_analyses: number;
    nb_surcharges: number;
    charge_moy_h_j: number;
  };
}

export function useAnalyse() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyseChargeResponse | null>(null);

  const analyser = useCallback(async (params: AnalyseChargeRequest): Promise<AnalyseChargeResponse | null> => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        date_debut: params.date_debut,
        date_fin: params.date_fin,
        cap_h: String(params.cap_h),
      });
      if (params.atelier_id) qs.set('atelier_id', params.atelier_id);
      if (params.unite_id) qs.set('unite_id', params.unite_id);
      if (params.technicien_id) qs.set('technicien_id', params.technicien_id);

      const res = await fetch(`/api/analyse-charge?${qs.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || `Erreur serveur (${res.status})`);
      }
      const data: AnalyseChargeResponse = await res.json();
      setResult(data);
      return data;
    } catch (err: any) {
      setError(err.message || 'Erreur analyse');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const getPeriodeRaccourci = useCallback((type: 'semaine' | 'mois' | 'trimestre' | 'semestre' | 'annee'): { date_debut: string; date_fin: string } => {
    const now = new Date();
    let start: Date;
    let end: Date;
    switch (type) {
      case 'semaine':
        start = startOfWeek(now, { weekStartsOn: 0 }); // Sunday
        end = endOfWeek(now, { weekStartsOn: 0 });
        break;
      case 'mois':
        start = startOfMonth(now);
        end = endOfMonth(now);
        break;
      case 'trimestre':
        start = startOfQuarter(now);
        end = endOfQuarter(now);
        break;
      case 'semestre': {
        const m = now.getMonth();
        start = m < 6 ? new Date(now.getFullYear(), 0, 1) : new Date(now.getFullYear(), 6, 1);
        end = m < 6 ? new Date(now.getFullYear(), 5, 30) : new Date(now.getFullYear(), 11, 31);
        break;
      }
      case 'annee':
        start = startOfYear(now);
        end = endOfYear(now);
        break;
    }
    return { date_debut: format(start, 'yyyy-MM-dd'), date_fin: format(end, 'yyyy-MM-dd') };
  }, []);

  return { analyser, loading, error, result, getPeriodeRaccourci };
}
