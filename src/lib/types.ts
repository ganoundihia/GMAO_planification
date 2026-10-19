// src/lib/types.ts

// ⚠️ 'super_admin' avec underscore (cohérence BDD et ROLE_CONFIG)
export type Role = 'super_admin' | 'admin' | 'responsable_unite' | 'charge_unite';

export type Frequence = 'Quotidienne' | 'Hebdomadaire' | 'Bimensuelle' | 'Mensuelle' | 'Bimestrielle' | 'Trimestrielle' | 'Quadrimestrielle' | 'Semestrielle' | 'Annuelle';
export type Statut = 'planifiee' | 'en_cours' | 'terminee' | 'reportee';
export type HolidayType = 'national' | 'religieux' | 'local';

export const FREQUENCES: Frequence[] = [
  'Quotidienne','Hebdomadaire','Bimensuelle','Mensuelle',
  'Bimestrielle','Trimestrielle','Quadrimestrielle','Semestrielle','Annuelle'
];

export const FREQ_JO: Record<Frequence, number> = {
  Quotidienne: 1,
  Hebdomadaire: 5,
  Bimensuelle: 10,
  Mensuelle: 22,
  Bimestrielle: 44,
  Trimestrielle: 65,
  Quadrimestrielle: 87,
  Semestrielle: 130,
  Annuelle: 261,
};

export const STATUTS: { value: Statut; label: string; color: string }[] = [
  { value: 'planifiee', label: 'Planifiée',  color: 'bg-blue-100 text-blue-800'  },
  { value: 'en_cours',  label: 'En cours',   color: 'bg-amber-100 text-amber-800' },
  { value: 'terminee',  label: 'Clôturée',   color: 'bg-green-100 text-green-800' },
  { value: 'reportee',  label: 'Reportée',   color: 'bg-red-100 text-red-800'    },
];

export const ROLES: { value: Role; label: string }[] = [
  { value: 'super_admin',       label: 'Super Admin'                    },
  { value: 'admin',             label: 'Admin / Responsable OPPI (DG)'  },
  { value: 'responsable_unite', label: "Responsable OPPI d'Unité"       },
  { value: 'charge_unite',      label: "Chargé d'Unité"                 },
];

/**
 * Calcule le nombre de jours ouvrés entre deux dates.
 * Jours ouvrés en Algérie : Dimanche–Jeudi (Ven/Sam = week-end).
 * Exclut les jours fériés.
 */
export function joursOuvres(
  dateDebut: string,
  dateFin: string,
  joursFeries: string[]
): number {
  let count = 0;
  const d    = new Date(dateDebut + 'T00:00:00');
  const end  = new Date(dateFin   + 'T00:00:00');
  const feriesSet = new Set(joursFeries);

  while (d <= end) {
    const day = d.getDay(); // 0=Dim … 6=Sam
    // Algérie : Dim(0) Lun(1) Mar(2) Mer(3) Jeu(4) = ouvrés
    if (day >= 0 && day <= 4) {
      const dateStr = d.toISOString().split('T')[0];
      if (!feriesSet.has(dateStr)) count++;
    }
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/**
 * Calcule le nombre d'occurrences d'une intervention sur une période.
 */
export function nbOccurrences(
  frequence: Frequence,
  joursOuvresPeriode: number
): number {
  const freq = FREQ_JO[frequence];
  if (!freq || freq === 0) return 0;
  return Math.max(0, Math.floor(joursOuvresPeriode / freq));
}

export function parseCodeGmao(code: string): { systeme: string; sous_systeme: string } {
  if (!code) return { systeme: '', sous_systeme: '' };
  const parts = code.split('.');
  return { systeme: parts[0] || '', sous_systeme: parts[2] || '' };
}

// ─────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────

export interface Unite   { id: number; code: string; nom: string; }
// Catalogue global : un atelier (CFA, VOIE, MR, …) n'appartient PAS à une seule unité.
// Chaque unité couvre l'ensemble des ateliers ; le lien unité↔atelier se fait au niveau
// des lignes techniciens/planning (qui portent unite_id ET atelier_id séparément).
export interface Atelier { id: number; code: string; nom: string; }

export interface Profile {
  id:         string;
  user_id:    string;
  nom:        string;
  prenom:     string;
  role:       Role;
  unite_id:   number | null;
  atelier_id: number | null;
  email:      string;
}

export interface Technicien {
  id:         number;
  nom:        string;
  prenom:     string;
  unite_id:   number;
  atelier_id: number | null;
  specialite?: string;
  email?:      string;
  actif?:      boolean;
  statut?:     string;
}

export interface Intervention {
  id:                   number;
  unite_id:             number;
  atelier_id:           number;
  equipement:           string;
  code_gmao:            string;
  titre:                string;
  systeme:              string;
  sous_systeme:         string;
  frequence:            Frequence;
  date_prevue:          string;
  duree_intervention:   number;
  temps_logistique:     number;
  materiel:             string;
  outillage:            string;
  fiche_inspection:     string;
  consignation:         string;
  consignation_motif:   string;
  jour_nuit:            string;
  num_shift:            number | null;
  statut:               Statut;
  created_by:           string;
  created_at:           string;
  updated_at:           string;
  techniciens?:         InterventionTechnicien[];
}

export interface InterventionTechnicien {
  id:            number;
  planning_id:   number;
  technicien_id: number;
  duree:         number;
  technicien?:   Technicien;
}

export interface Materiel     { id: number; nom: string; reference: string; description: string; unite: string; }
export interface Outillage    { id: number; nom: string; reference: string; description: string; }
export interface Notification { id: number; user_id: string; type: string; message: string; lu: boolean; created_at: string; }

export interface JourFerie {
  id:      number;
  date:    string;
  nom:     string;
  type:    HolidayType;
  source?: 'api' | 'local' | 'manual' | 'supabase';
}

export interface ExcelImport {
  id:          number;
  filename:    string;
  uploaded_by: string;
  unite_id:    number;
  row_count:   number;
  status:      string;
  created_at:  string;
}

export interface Conge {
  id:            number;
  technicien_id: number;
  date_debut:    string;
  date_fin:      string;
  motif:         string;
  created_at:    string;
  created_by:    string;
}

export interface PlanningRow {
  id:                 number;
  titre:              string;
  date_prevue:        string;
  frequence:          string;
  atelier_id:         number | null;
  duree_intervention: number;
  techniciens:        string | null;
  equipement:         string | null;
  statut:             string;
  unite_id:           number;
}

export interface DemandeReport {
  id: number;
  intervention_id: number;
  demandeur_id: string;
  unite_id: number | null;
  date_originale: string;
  date_demandee: string;
  motif: string;
  charge_technicien_prevue: number | null;
  conges_conflits: any[];
  techniciens_concernes: any[];
  alerte_niveau: 'none' | 'low' | 'medium' | 'high' | 'critical' | null;
  alerte_details: Record<string, any>;
  statut: 'en_attente' | 'approuvee' | 'refusee' | 'annulee';
  admin_id: string | null;
  admin_commentaire: string | null;
  traitee_at: string | null;
  created_at: string;
  updated_at: string;
}

export const MOTIFS_REPORT = [
  'Indisponibilité technicien',
  'Manque de matériel',
  'Conditions techniques',
  'Urgence prioritaire',
  'Conflit planning',
  'Autre',
] as const;

export const MAX_HOURS_PER_DAY = 5;
export const LOGISTICS_H = 0.5;