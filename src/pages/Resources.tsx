// pages/BudgetAnnuel.tsx
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Calendar, Download, Upload, FileSpreadsheet, Wallet, Loader2,
  CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft, Info, X,
  Building2, DollarSign, Wrench, Package, Clock, Users, Target,
  Sparkles, FileText, BarChart3, TrendingUp, Award, Filter,
  ChevronDown, ChevronRight, Hash, Zap, RefreshCw, Search,
  Layers, Activity, PieChart as PieChartIcon
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import type { Unite, Atelier } from '../lib/types';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
interface PlanAnnuel {
  id: number;
  annee: number;
  statut: string;
  unite_id: number;
}

interface PlanningRow {
  id: number;
  titre: string;
  atelier_id: number | null;
  date_prevue: string;
  duree_intervention: number;
  materiel: string | null;         // texte libre séparé par des virgules
  outillage: string | null;         // texte libre séparé par des virgules
  ateliers?: { code: string } | null;
  planning_techniciens?: { technicien_id: number }[];
}

interface PriceItem {
  nom: string;
  type: 'materiel' | 'outillage';
  prix_unitaire: number;
  quantite: number;              // quantité par intervention
  nb_utilisations: number;        // nb d'utilisations avant remplacement
  cout_par_intervention: number;  // (prix × quantité) / nb_utilisations
}

interface InterventionCoutDetail {
  intervention_id: number;
  titre: string;
  atelier: string;
  date: string;
  duree_h: number;
  nb_techniciens: number;
  cout_main_oeuvre: number;
  cout_materiels: number;
  cout_outillages: number;
  cout_total: number;
  details_materiels: { nom: string; prix: number; qte: number; nb_util: number; cout: number }[];
  details_outillages: { nom: string; prix: number; qte: number; nb_util: number; cout: number }[];
  items_manquants: string[];
}

interface ImportRow {
  nom: string;
  type: 'materiel' | 'outillage';
  prix_unitaire: number;
  quantite: number;
  nb_utilisations: number;
  status: 'ok' | 'error';
  error?: string;
}

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────
const TAUX_HORAIRE_DEFAULT = 1500; // DZD par heure — configurable

// ─────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────
function fmtCurrency(v: number): string {
  return v.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' DZD';
}
function fmtNumber(v: number): string {
  return v.toLocaleString('fr-FR');
}
function normalizeKey(s: string): string {
  return String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}
function splitItems(txt: string | null): string[] {
  if (!txt) return [];
  return txt.split(/[,;]/).map(s => s.trim()).filter(Boolean);
}

// Parse un item avec quantité éventuelle
// Formats supportés :
//   "chiffon x2", "chiffon x 2", "chiffon *2", "chiffon (2)",
//   "chiffon:2", "2 chiffons", "chiffon"
function parseItemWithQty(raw: string): { nom: string; quantite: number } {
  const trimmed = raw.trim();
  if (!trimmed) return { nom: '', quantite: 1 };

  // Pattern 1: "nom xN" ou "nom x N" ou "nom *N" ou "nom ×N"
  let m = trimmed.match(/^(.+?)\s*[x*×]\s*(\d+(?:[.,]\d+)?)$/i);
  if (m) return { nom: m[1].trim(), quantite: parseFloat(m[2].replace(',', '.')) || 1 };

  // Pattern 2: "nom (N)"
  m = trimmed.match(/^(.+?)\s*\((\d+(?:[.,]\d+)?)\)$/);
  if (m) return { nom: m[1].trim(), quantite: parseFloat(m[2].replace(',', '.')) || 1 };

  // Pattern 3: "nom : N" ou "nom: N"
  m = trimmed.match(/^(.+?)\s*:\s*(\d+(?:[.,]\d+)?)$/);
  if (m) return { nom: m[1].trim(), quantite: parseFloat(m[2].replace(',', '.')) || 1 };

  // Pattern 4: "N nom" ou "N x nom"
  m = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*[x×*]?\s*(.+)$/);
  if (m && m[2].trim().length > 1 && isNaN(Number(m[2].trim()))) {
    return { nom: m[2].trim(), quantite: parseFloat(m[1].replace(',', '.')) || 1 };
  }

  // Pas de quantité détectée → 1 par défaut
  return { nom: trimmed, quantite: 1 };
}

// Version améliorée de splitItems qui retourne aussi la quantité
function splitItemsWithQty(txt: string | null): { nom: string; quantite: number }[] {
  if (!txt) return [];
  return txt
    .split(/[,;]/)
    .map(s => parseItemWithQty(s))
    .filter(x => x.nom.length > 0);
}
// ─────────────────────────────────────────────────────────────
// ANIMATED NUMBER
// ─────────────────────────────────────────────────────────────
function AnimatedNumber({ value, className = '', prefix = '', suffix = '' }: {
  value: number; className?: string; prefix?: string; suffix?: string;
}) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start: number | null = null;
    const ease = (t: number) => 1 - Math.pow(1 - t, 4);
    const to = value;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / 900, 1);
      setDisplay(Math.floor(to * ease(p)));
      if (p < 1) requestAnimationFrame(step); else setDisplay(to);
    };
    requestAnimationFrame(step);
  }, [value]);
  return <span className={className}>{prefix}{display.toLocaleString('fr-FR')}{suffix}</span>;
}

// ─────────────────────────────────────────────────────────────
// STAT CARD
// ─────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, iconBg, isCurrency = false }: {
  label: string; value: number; sub?: string; icon: any; iconBg: string; isCurrency?: boolean;
}) {
  return (
    <div className="group bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all relative overflow-hidden">
      <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full bg-gradient-to-br ${iconBg} opacity-5 group-hover:opacity-10 blur-2xl`} />
      <div className="relative">
        <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${iconBg} flex items-center justify-center shadow-md mb-2 group-hover:scale-110 transition-transform`}>
          <Icon size={17} className="text-white" />
        </div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
        {isCurrency ? (
          <AnimatedNumber value={value} suffix=" DZD" className="text-xl font-black text-slate-800 tabular-nums block mt-1 leading-none" />
        ) : (
          <AnimatedNumber value={value} className="text-2xl font-black text-slate-800 tabular-nums block mt-1 leading-none" />
        )}
        {sub && <p className="text-[10px] text-slate-400 mt-1.5 font-medium">{sub}</p>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function BudgetAnnuel() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
  const effectiveUniteId = isAdmin ? null : (profile?.unite_id ?? null);

  // ── State ──
  const [unites, setUnites] = useState<Unite[]>([]);
  const [ateliers, setAteliers] = useState<Atelier[]>([]);
  const [plansAnnuels, setPlansAnnuels] = useState<PlanAnnuel[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [planningRows, setPlanningRows] = useState<PlanningRow[]>([]);

  const [selectedUnite, setSelectedUnite] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [tauxHoraire, setTauxHoraire] = useState<number>(TAUX_HORAIRE_DEFAULT);

  const [step, setStep] = useState<number>(0); // 0=choix, 1=modèle, 2=import, 3=résultats
  const [priceItems, setPriceItems] = useState<PriceItem[]>([]);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [computing, setComputing] = useState(false);
  const [interventionCosts, setInterventionCosts] = useState<InterventionCoutDetail[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [comparativeMode, setComparativeMode] = useState(false);
  const [comparativeLoading, setComparativeLoading] = useState(false);
  const [comparativeData, setComparativeData] = useState<{
    unite_id: number;
    unite_code: string;
    unite_nom: string;
    nb_interventions: number;
    totalMainOeuvre: number;
    totalMateriels: number;
    totalOutillages: number;
    totalGeneral: number;
    moyenneParInterv: number;
    hasData: boolean;
    error?: string;
  }[]>([]);
  const effectiveUnite = isAdmin ? unites.find(u => u.id === Number(selectedUnite)) : unites.find(u => u.id === effectiveUniteId);
  const selectedPlan = useMemo(() => {
    const uid = isAdmin ? Number(selectedUnite) : effectiveUniteId;
    return plansAnnuels.find(p => p.unite_id === uid && p.annee === selectedYear);
  }, [plansAnnuels, selectedUnite, selectedYear, isAdmin, effectiveUniteId]);

  // ── Load base data ──
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
    let q = supabase.from('plan_annuel').select('id, annee, statut, unite_id').order('annee', { ascending: false });
    if (effectiveUniteId) q = q.eq('unite_id', effectiveUniteId);
    q.then(({ data }) => {
      if (data) {
        setPlansAnnuels(data);
        const years = [...new Set(data.map(p => p.annee))].sort((a, b) => b - a);
        setAvailableYears(years);
        if (years.length > 0 && !years.includes(selectedYear)) setSelectedYear(years[0]);
      }
    });
  }, [effectiveUniteId]);

  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(null), 4000);
    return () => clearTimeout(t);
  }, [successMsg]);


  // ─────────────────────────────────────────────────────────────
  // STEP 1 : Charger le planning + générer le modèle Excel
  // ─────────────────────────────────────────────────────────────
  const loadPlanningAndGenerateTemplate = useCallback(async () => {
    const uid = isAdmin ? Number(selectedUnite) : effectiveUniteId;
    if (!uid) { setError('Sélectionnez une unité.'); return; }
    if (!selectedPlan) { setError(`Aucun plan trouvé pour ${selectedYear}.`); return; }

    setError(null);
    setImportLoading(true);
    try {
      // ✅ CORRECTION : utiliser materiel_libre et outillage_libre
      const { data, error: dbErr } = await supabase
        .from('planning')
        .select(`id, titre, atelier_id, date_prevue, duree_intervention, materiel_libre, outillage_libre,
                ateliers:atelier_id(code),
                planning_techniciens(technicien_id)`)
        .eq('plan_annuel_id', selectedPlan.id);

      if (dbErr) throw new Error(dbErr.message);
      if (!data?.length) throw new Error('Aucune intervention pour ce plan.');

      // Normaliser les noms de colonnes pour le reste du code
      const normalizedRows: PlanningRow[] = data.map((r: any) => ({
        id: r.id,
        titre: r.titre,
        atelier_id: r.atelier_id,
        date_prevue: r.date_prevue,
        duree_intervention: r.duree_intervention,
        materiel: r.materiel_libre,   // ← mapping
        outillage: r.outillage_libre, // ← mapping
        ateliers: r.ateliers,
        planning_techniciens: r.planning_techniciens,
      }));

      setPlanningRows(normalizedRows);

      // Extraire tous les items uniques (matériels + outillages)
      const materialsSet = new Set<string>();
      const outillagesSet = new Set<string>();
      normalizedRows.forEach((r) => {
        splitItems(r.materiel).forEach(m => materialsSet.add(m));
        splitItems(r.outillage).forEach(o => outillagesSet.add(o));
      });

      if (materialsSet.size === 0 && outillagesSet.size === 0) {
        throw new Error('Aucun matériel ni outillage renseigné dans ce plan. Vérifiez que les interventions ont bien des matériels/outillages définis.');
      }

      // Générer le fichier Excel
      const XLSXmod = await import('xlsx');
      const uniteName = effectiveUnite?.code || 'UNITE';

      const rows: any[][] = [
        ['Type', 'Nom', 'Prix unitaire (DZD)', 'Quantité par intervention', 'Nombre d\'utilisations'],
      ];

      Array.from(materialsSet).sort().forEach(m => {
        rows.push(['Matériel', m, 0, 1, 1]);
      });
      Array.from(outillagesSet).sort().forEach(o => {
        rows.push(['Outillage', o, 0, 1, 10]);
      });

      const ws = XLSXmod.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 22 }, { wch: 26 }, { wch: 26 }];

      const wsInstr = XLSXmod.utils.aoa_to_sheet([
        ['Instructions de remplissage'],
        [''],
        ['1. Ne modifiez PAS les colonnes "Type" et "Nom"'],
        ['2. Renseignez le "Prix unitaire" en DZD (chiffre entier ou décimal)'],
        ['3. "Quantité par intervention" : combien d\'unités sont utilisées à chaque fois'],
        ['4. "Nombre d\'utilisations" :'],
        ['   - Pour un matériel jetable (chiffon, joint) : nb de fois avant remplacement'],
        ['   - Pour un outillage : durée de vie utile (nb d\'interventions)'],
        [''],
        ['Exemple :'],
        ['   Chiffon à 100 DZD, utilisé 3 fois → coût par intervention = 100/3 = 33 DZD'],
        ['   Perceuse à 30 000 DZD, durée 100 interventions → 30 000/100 = 300 DZD'],
      ]);
      wsInstr['!cols'] = [{ wch: 80 }];

      const wb = XLSXmod.utils.book_new();
      XLSXmod.utils.book_append_sheet(wb, ws, 'Prix');
      XLSXmod.utils.book_append_sheet(wb, wsInstr, 'Instructions');
      XLSXmod.writeFile(wb, `modele_budget_${uniteName}_${selectedYear}.xlsx`);

      setSuccessMsg(`✅ Modèle téléchargé : ${materialsSet.size} matériel(s) + ${outillagesSet.size} outillage(s) à valoriser`);
      setStep(1);
    } catch (err: any) {
      setError(err.message);
    }
    setImportLoading(false);
  }, [selectedPlan, isAdmin, selectedUnite, effectiveUniteId, effectiveUnite, selectedYear]);

  // ─────────────────────────────────────────────────────────────
  // STEP 2 : Importer les prix
  // ─────────────────────────────────────────────────────────────
  const handleFileUpload = useCallback(async (file: File) => {
    setImportLoading(true);
    setError(null);
    setImportRows([]);

    try {
      const XLSXmod = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = XLSXmod.read(buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[][] = XLSXmod.utils.sheet_to_json(ws, { header: 1, defval: '' });

      if (raw.length < 2) throw new Error('Fichier vide.');

      // Détecter la ligne d'entête (chercher 'type' et 'nom')
      let headerRow = 0;
      for (let i = 0; i < Math.min(raw.length, 5); i++) {
        const cells = (raw[i] || []).map((c: any) => normalizeKey(String(c || '')));
        if (cells.includes('type') && cells.includes('nom')) { headerRow = i; break; }
      }
      const headers = (raw[headerRow] || []).map((c: any) => normalizeKey(String(c || '')));
      const ci = {
        type: headers.indexOf('type'),
        nom: headers.indexOf('nom'),
        prix: headers.findIndex((h: string) => h.includes('prix')),
        qte: headers.findIndex((h: string) => h.includes('quantite') || h.includes('qte')),
        nbUtil: headers.findIndex((h: string) => h.includes('utilisation')),
      };

      if (ci.type === -1 || ci.nom === -1 || ci.prix === -1) {
        throw new Error(`Colonnes manquantes. Trouvées: ${headers.join(', ')}`);
      }

      const rows: ImportRow[] = [];
      for (let i = headerRow + 1; i < raw.length; i++) {
        const r = raw[i];
        if (!r || !r[ci.nom]) continue;

        const typeRaw = String(r[ci.type] || '').trim().toLowerCase();
        const type: 'materiel' | 'outillage' = typeRaw.includes('outil') ? 'outillage' : 'materiel';
        const nom = String(r[ci.nom]).trim();
        const prix = parseFloat(String(r[ci.prix] || '0').replace(',', '.')) || 0;
        const qte = ci.qte >= 0 ? (parseFloat(String(r[ci.qte] || '1').replace(',', '.')) || 1) : 1;
        const nbUtil = ci.nbUtil >= 0 ? (parseFloat(String(r[ci.nbUtil] || '1').replace(',', '.')) || 1) : 1;

        if (prix < 0 || qte <= 0 || nbUtil <= 0) {
          rows.push({ nom, type, prix_unitaire: prix, quantite: qte, nb_utilisations: nbUtil, status: 'error', error: 'Valeurs invalides' });
          continue;
        }
        rows.push({ nom, type, prix_unitaire: prix, quantite: qte, nb_utilisations: nbUtil, status: 'ok' });
      }

      if (!rows.length) throw new Error('Aucune ligne valide trouvée.');
      setImportRows(rows);
      setStep(2);
    } catch (err: any) {
      setError(err.message);
    }
    setImportLoading(false);
  }, []);

  // ─────────────────────────────────────────────────────────────
  // STEP 3 : Calculer les budgets
  // ─────────────────────────────────────────────────────────────
  const computeBudgets = useCallback(async () => {
    setComputing(true);
    setError(null);

    try {
      // Convertir importRows → priceItems
      const items: PriceItem[] = importRows
        .filter(r => r.status === 'ok')
        .map(r => ({
          nom: r.nom,
          type: r.type,
          prix_unitaire: r.prix_unitaire,
          quantite: r.quantite,
          nb_utilisations: r.nb_utilisations,
          cout_par_intervention: (r.prix_unitaire * r.quantite) / r.nb_utilisations,
        }));

      setPriceItems(items);

      // Map de recherche rapide par nom normalisé
      const priceMap = new Map<string, PriceItem>();
      items.forEach(it => priceMap.set(normalizeKey(it.nom), it));

      // Calculer pour chaque intervention
      const costs: InterventionCoutDetail[] = planningRows.map(pl => {
        const nbTech = pl.planning_techniciens?.length || 1;
        const cout_main_oeuvre = pl.duree_intervention * tauxHoraire * nbTech;

        const materiels = splitItems(pl.materiel);
        const outillages = splitItems(pl.outillage);
        const items_manquants: string[] = [];

        const details_materiels: any[] = [];
        let cout_materiels = 0;
        materiels.forEach(m => {
          const price = priceMap.get(normalizeKey(m));
          if (!price) { items_manquants.push(`${m} (matériel)`); return; }
          details_materiels.push({
            nom: m,
            prix: price.prix_unitaire,
            qte: price.quantite,
            nb_util: price.nb_utilisations,
            cout: price.cout_par_intervention,
          });
          cout_materiels += price.cout_par_intervention;
        });

        const details_outillages: any[] = [];
        let cout_outillages = 0;
        outillages.forEach(o => {
          const price = priceMap.get(normalizeKey(o));
          if (!price) { items_manquants.push(`${o} (outillage)`); return; }
          details_outillages.push({
            nom: o,
            prix: price.prix_unitaire,
            qte: price.quantite,
            nb_util: price.nb_utilisations,
            cout: price.cout_par_intervention,
          });
          cout_outillages += price.cout_par_intervention;
        });

        return {
          intervention_id: pl.id,
          titre: pl.titre,
          atelier: (pl.ateliers as any)?.code || '—',
          date: pl.date_prevue,
          duree_h: pl.duree_intervention,
          nb_techniciens: nbTech,
          cout_main_oeuvre,
          cout_materiels,
          cout_outillages,
          cout_total: cout_main_oeuvre + cout_materiels + cout_outillages,
          details_materiels,
          details_outillages,
          items_manquants: [...new Set(items_manquants)],
        };
      });

      setInterventionCosts(costs);
      setStep(3);
      setSuccessMsg(`✅ Budget calculé pour ${costs.length} intervention(s)`);
    } catch (err: any) {
      setError(err.message);
    }
    setComputing(false);
  }, [importRows, planningRows, tauxHoraire]);
  const computeComparative = useCallback(async () => {
  if (!isAdmin) return;
  if (importRows.length === 0 || importRows.filter(r => r.status === 'ok').length === 0) {
    setError('Vous devez d\'abord importer les prix (Étape 2) pour lancer une comparaison.');
    return;
  }

  setComparativeLoading(true);
  setError(null);

  try {
    const items = importRows
      .filter(r => r.status === 'ok')
      .map(r => ({
        nom: r.nom, type: r.type,
        prix_unitaire: r.prix_unitaire,
        nb_utilisations: r.nb_utilisations,
      }));
    const priceMap = new Map<string, typeof items[0]>();
    items.forEach(it => priceMap.set(normalizeKey(it.nom), it));

    const { data: plans, error: plErr } = await supabase
      .from('plan_annuel')
      .select('id, unite_id, annee')
      .eq('annee', selectedYear);

    if (plErr) throw new Error(plErr.message);

    const results: typeof comparativeData = [];

    for (const unite of unites) {
      const plan = plans?.find(p => p.unite_id === unite.id);

      if (!plan) {
        results.push({
          unite_id: unite.id,
          unite_code: unite.code,
          unite_nom: unite.nom,
          nb_interventions: 0,
          totalMainOeuvre: 0, totalMateriels: 0, totalOutillages: 0,
          totalGeneral: 0, moyenneParInterv: 0,
          hasData: false,
          error: `Aucun plan ${selectedYear}`,
        });
        continue;
      }

      const { data: interData } = await supabase
        .from('planning')
        .select(`id, titre, atelier_id, date_prevue, duree_intervention, materiel_libre, outillage_libre,
                 ateliers:atelier_id(code), planning_techniciens(technicien_id)`)
        .eq('plan_annuel_id', plan.id);

      if (!interData?.length) {
        results.push({
          unite_id: unite.id,
          unite_code: unite.code,
          unite_nom: unite.nom,
          nb_interventions: 0,
          totalMainOeuvre: 0, totalMateriels: 0, totalOutillages: 0,
          totalGeneral: 0, moyenneParInterv: 0,
          hasData: false,
          error: 'Plan vide',
        });
        continue;
      }

      let totalMO = 0, totalMat = 0, totalOut = 0;

      interData.forEach((pl: any) => {
        const nbTech = pl.planning_techniciens?.length || 1;
        totalMO += (pl.duree_intervention || 0) * tauxHoraire * nbTech;

        splitItemsWithQty(pl.materiel_libre).forEach(({ nom, quantite }) => {
          const price = priceMap.get(normalizeKey(nom));
          if (price) totalMat += (price.prix_unitaire * quantite) / price.nb_utilisations;
        });
        splitItemsWithQty(pl.outillage_libre).forEach(({ nom, quantite }) => {
          const price = priceMap.get(normalizeKey(nom));
          if (price) totalOut += (price.prix_unitaire * quantite) / price.nb_utilisations;
        });
      });

      const total = totalMO + totalMat + totalOut;
      results.push({
        unite_id: unite.id,
        unite_code: unite.code,
        unite_nom: unite.nom,
        nb_interventions: interData.length,
        totalMainOeuvre: totalMO,
        totalMateriels: totalMat,
        totalOutillages: totalOut,
        totalGeneral: total,
        moyenneParInterv: interData.length > 0 ? total / interData.length : 0,
        hasData: true,
      });
    }

    results.sort((a, b) => b.totalGeneral - a.totalGeneral);
    setComparativeData(results);
    setComparativeMode(true);
    setSuccessMsg(`✅ Analyse comparative réalisée sur ${results.filter(r => r.hasData).length}/${results.length} unité(s)`);
  } catch (err: any) {
    setError(err.message);
  }
  setComparativeLoading(false);
}, [isAdmin, importRows, unites, selectedYear, tauxHoraire]);

  // ─────────────────────────────────────────────────────────────
  // COMPUTED
  // ─────────────────────────────────────────────────────────────
  const globalStats = useMemo(() => {
    const totalMainOeuvre = interventionCosts.reduce((s, i) => s + i.cout_main_oeuvre, 0);
    const totalMateriels = interventionCosts.reduce((s, i) => s + i.cout_materiels, 0);
    const totalOutillages = interventionCosts.reduce((s, i) => s + i.cout_outillages, 0);
    const totalGeneral = totalMainOeuvre + totalMateriels + totalOutillages;
    const nbAvecManquants = interventionCosts.filter(i => i.items_manquants.length > 0).length;
    return {
      totalMainOeuvre, totalMateriels, totalOutillages, totalGeneral,
      nbInterventions: interventionCosts.length,
      nbAvecManquants,
      moyenneParInterv: interventionCosts.length > 0 ? totalGeneral / interventionCosts.length : 0,
    };
  }, [interventionCosts]);

  const budgetParAtelier = useMemo(() => {
    const map: Record<string, { atelier: string; total: number; count: number }> = {};
    interventionCosts.forEach(i => {
      if (!map[i.atelier]) map[i.atelier] = { atelier: i.atelier, total: 0, count: 0 };
      map[i.atelier].total += i.cout_total;
      map[i.atelier].count++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [interventionCosts]);

  const budgetParMois = useMemo(() => {
    const map: Record<number, number> = {};
    interventionCosts.forEach(i => {
      const m = new Date(i.date + 'T00:00:00').getMonth();
      map[m] = (map[m] || 0) + i.cout_total;
    });
    return Array.from({ length: 12 }, (_, m) => ({
      mois: m,
      label: new Date(2000, m, 1).toLocaleDateString('fr-FR', { month: 'short' }),
      total: map[m] || 0,
    }));
  }, [interventionCosts]);

  const maxMois = Math.max(...budgetParMois.map(m => m.total), 1);
  const importOkCount = importRows.filter(r => r.status === 'ok').length;

  const reset = () => {
    setStep(0);
    setPlanningRows([]);
    setImportRows([]);
    setPriceItems([]);
    setInterventionCosts([]);
    setError(null);
    setSuccessMsg(null);
  };

  const stepLabels = ['Sélection', 'Modèle', 'Import', 'Résultats'];

  return (
    <div className="bg-slate-100 min-h-[calc(100vh-60px)] p-4 lg:p-6">
      <div className="max-w-[1500px] mx-auto space-y-5">

        {/* HEADER */}
        <div className="bg-gradient-to-br from-[#1e2a5e] to-[#0c1530] rounded-3xl p-5 lg:p-6 shadow-md">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
                <Wallet size={22} className="text-emerald-300" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Budget Annuel</h1>
                <p className="text-xs text-slate-300">
                  Calcul du budget prévisionnel par intervention basé sur les prix des matériels, outillages et main d'œuvre
                </p>
              </div>
            </div>
            {step > 0 && (
              <button onClick={reset}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition-colors">
                <RefreshCw size={13} strokeWidth={2.5} /><span className="hidden sm:inline">Recommencer</span>
              </button>
            )}
          </div>
        </div>

        {/* STEPPER */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 relative overflow-hidden">
          <div className="flex items-center justify-between flex-wrap gap-2">
            {stepLabels.map((label, idx) => {
              const active = step === idx;
              const done = step > idx;
              return (
                <div key={idx} className="flex items-center gap-2 flex-1 min-w-0">
                  <div className={`relative w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all text-xs font-black ${
                    active ? 'bg-[#1e2a5e] text-white shadow-md scale-110'
                      : done ? 'bg-emerald-500 text-white'
                      : 'bg-slate-100 text-slate-400'
                  }`}>
                    {done ? <CheckCircle2 size={15} strokeWidth={2.5} /> : idx + 1}
                    {active && <div className="absolute inset-0 rounded-xl bg-[#1e2a5e]/30 animate-ping" />}
                  </div>
                  <div className="hidden lg:block min-w-0">
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${active || done ? 'text-slate-700' : 'text-slate-300'}`}>Étape {idx + 1}</p>
                    <p className={`text-[11px] font-semibold truncate ${active ? 'text-[#1e2a5e]' : done ? 'text-emerald-600' : 'text-slate-400'}`}>{label}</p>
                  </div>
                  {idx < 3 && <div className={`hidden lg:block h-0.5 flex-1 rounded-full ${done ? 'bg-emerald-500' : 'bg-slate-100'}`} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Error / Success */}
        {error && (
          <div className="flex items-center gap-4 p-4 bg-red-50 border border-red-100 rounded-2xl">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shrink-0 shadow-sm"><AlertTriangle size={17} className="text-white" /></div>
            <div className="flex-1 min-w-0"><p className="text-sm font-bold text-red-800">Erreur</p><p className="text-xs text-red-500">{error}</p></div>
            <button onClick={() => setError(null)} className="px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-xl active:scale-95">Fermer</button>
          </div>
        )}
        {successMsg && (
          <div className="flex items-center gap-4 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
            <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
            <p className="text-sm font-semibold text-emerald-800 flex-1">{successMsg}</p>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-600"><X size={14} /></button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/* STEP 0 : Sélection année + unité + génération modèle */}
        {/* ══════════════════════════════════════════════════ */}
        {step === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6 relative overflow-hidden">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#1e2a5e] flex items-center justify-center shadow-sm">
                <Wallet size={19} className="text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800">Démarrer le calcul du budget</h2>
                <p className="text-[11px] text-slate-400">Sélectionnez l'unité et l'année du plan à budgéter</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Unité */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.08em] mb-1.5 flex items-center gap-1.5">
                  <Building2 size={11} />Unité <span className="text-red-500">*</span>
                </label>
                {isAdmin ? (
                  <div className="relative">
                    <select value={selectedUnite} onChange={e => setSelectedUnite(e.target.value)}
                      className="w-full pl-3.5 pr-9 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 outline-none appearance-none cursor-pointer">
                      <option value="">Sélectionner…</option>
                      {unites.map(u => <option key={u.id} value={u.id}>{u.code} — {u.nom}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-semibold">
                    <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                    <span><strong>{effectiveUnite?.code ?? '—'}</strong> — {effectiveUnite?.nom ?? '—'}</span>
                  </div>
                )}
              </div>

              {/* Année */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.08em] mb-1.5 flex items-center gap-1.5">
                  <Calendar size={11} />Année du plan <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
                      className="w-full pl-3.5 pr-9 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 outline-none appearance-none cursor-pointer">
                      {availableYears.length === 0 ? (
                        <option>Aucun plan disponible</option>
                      ) : availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  {selectedPlan && (
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                      selectedPlan.statut === 'publie' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}>{selectedPlan.statut}</span>
                  )}
                </div>
              </div>

              {/* Taux horaire */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.08em] mb-1.5 flex items-center gap-1.5">
                  <Clock size={11} />Taux horaire technicien <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input type="number" min={0} step={50} value={tauxHoraire}
                      onChange={e => setTauxHoraire(Math.max(0, Number(e.target.value) || 0))}
                      className="w-full pl-3.5 pr-16 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">DZD/h</span>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Coût moyen d'une heure de travail par technicien</p>
              </div>

              {/* Aperçu du plan */}
              <div className="flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 to-blue-50/50 rounded-xl border border-slate-200">
                {selectedPlan ? (
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Plan sélectionné</p>
                    <p className="text-2xl font-black text-slate-800 mt-1">{effectiveUnite?.code} · {selectedYear}</p>
                    <p className="text-[11px] text-slate-500 mt-1">Prêt pour l'analyse budgétaire</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <AlertTriangle size={20} className="text-amber-500 mx-auto mb-1" />
                    <p className="text-[11px] text-slate-500">
                      {availableYears.length === 0
                        ? 'Aucun plan disponible pour cette unité'
                        : 'Aucun plan pour l\'année sélectionnée'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Info box */}
            <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm shrink-0">
                <Info size={15} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-blue-900">Comment ça fonctionne ?</p>
                <ol className="text-[11px] text-blue-700 mt-1 space-y-0.5 list-decimal list-inside">
                  <li><strong>Téléchargez</strong> le modèle Excel avec tous les matériels/outillages du plan</li>
                  <li><strong>Remplissez</strong> les prix (par le service concerné)</li>
                  <li><strong>Importez</strong> le fichier rempli</li>
                  <li><strong>Consultez</strong> le budget calculé automatiquement pour chaque intervention</li>
                </ol>
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={loadPlanningAndGenerateTemplate}
              disabled={importLoading || !selectedPlan || (isAdmin && !selectedUnite)}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-[#1e2a5e] hover:bg-[#2a3875] text-white rounded-xl text-sm font-bold shadow-sm disabled:opacity-50 transition-all active:scale-[0.98]">
              {importLoading ? (
                <><Loader2 size={15} className="animate-spin" />Chargement du plan…</>
              ) : (
                <><Download size={14} strokeWidth={2.5} />Télécharger le modèle Excel<ArrowRight size={14} /></>
              )}
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/* STEP 1 : Modèle téléchargé — instructions import */}
        {/* ══════════════════════════════════════════════════ */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4 relative overflow-hidden">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-md">
                  <CheckCircle2 size={19} className="text-white" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">Modèle Excel téléchargé</h2>
                  <p className="text-[11px] text-slate-400">Remplissez le fichier avec les prix, puis importez-le ci-dessous</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <p className="text-[10px] font-bold text-blue-600 uppercase">Étape 1</p>
                  <p className="text-xs text-blue-800 mt-0.5 font-semibold">📥 Envoyez le fichier au service concerné</p>
                </div>
                <div className="p-3 bg-violet-50 border border-violet-200 rounded-xl">
                  <p className="text-[10px] font-bold text-violet-600 uppercase">Étape 2</p>
                  <p className="text-xs text-violet-800 mt-0.5 font-semibold">✏️ Le service remplit les prix</p>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase">Étape 3</p>
                  <p className="text-xs text-emerald-800 mt-0.5 font-semibold">📤 Importez le fichier rempli ci-dessous</p>
                </div>
              </div>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFileUpload(f); }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer ${
                isDragging ? 'border-emerald-500 bg-emerald-50 scale-[1.01]'
                : 'border-slate-200 hover:border-emerald-300 bg-white hover:bg-emerald-50/20'
              }`}>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ''; }} />
              <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-3 transition-all ${
                isDragging ? 'bg-emerald-500 scale-110 shadow-lg shadow-emerald-200' : 'bg-slate-100'
              }`}>
                {importLoading
                  ? <Loader2 size={28} className={isDragging ? 'text-white animate-spin' : 'text-slate-400 animate-spin'} />
                  : <Upload size={28} className={isDragging ? 'text-white' : 'text-slate-400'} strokeWidth={1.5} />}
              </div>
              <p className="text-sm font-bold text-slate-700 mb-1">
                {importLoading ? 'Analyse en cours…' : isDragging ? '✨ Déposez ici !' : 'Glissez le fichier Excel rempli'}
              </p>
              <p className="text-xs text-slate-400 mb-4">Formats : .xlsx, .xls, .csv</p>
              <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1e2a5e] hover:bg-[#2a3875] text-white text-sm font-bold rounded-xl shadow-sm cursor-pointer active:scale-95 transition-all">
                <FileSpreadsheet size={14} strokeWidth={2.5} />Parcourir
              </label>
            </div>

            <div className="flex items-center justify-between">
              <button onClick={() => setStep(0)}
                className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors font-semibold">
                <ArrowLeft size={14} />Retour
              </button>
              <button onClick={loadPlanningAndGenerateTemplate}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-emerald-200 hover:border-emerald-400 text-emerald-700 rounded-xl text-sm font-bold shadow-sm transition-all active:scale-95">
                <Download size={14} />Retélécharger le modèle
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/* STEP 2 : Aperçu de l'import + calcul */}
        {/* ══════════════════════════════════════════════════ */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400" />
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md"><FileSpreadsheet size={19} className="text-white" /></div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">Prix importés</h2>
                  <p className="text-[11px] text-slate-400">{importRows.length} lignes détectées · {importOkCount} valides</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <StatCard label="Total lignes" value={importRows.length} icon={FileText} iconBg="from-slate-500 to-slate-600" />
                <StatCard label="Valides" value={importOkCount} icon={CheckCircle2} iconBg="from-emerald-500 to-green-600" />
                <StatCard label="Matériels" value={importRows.filter(r => r.type === 'materiel').length} icon={Package} iconBg="from-blue-500 to-indigo-600" />
                <StatCard label="Outillages" value={importRows.filter(r => r.type === 'outillage').length} icon={Wrench} iconBg="from-violet-500 to-purple-600" />
              </div>

              <div className="border border-slate-100 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gradient-to-r from-slate-50 to-blue-50/30 sticky top-0 z-10">
                    <tr>{['Type', 'Nom', 'Prix unit.', 'Qté', 'Nb util.', 'Coût/interv.', 'Statut'].map(h =>
                      <th key={h} className="px-3 py-2.5 text-left font-bold text-slate-400 uppercase tracking-wider text-[10px]">{h}</th>
                    )}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {importRows.map((r, i) => {
                      const cout = r.status === 'ok' ? (r.prix_unitaire * r.quantite) / r.nb_utilisations : 0;
                      return (
                        <tr key={i} className={r.status === 'ok' ? 'hover:bg-slate-50' : 'bg-red-50/50'}>
                          <td className="px-3 py-2">
                            <span className={`text-[10px] px-2 py-0.5 rounded-lg font-bold border ${
                              r.type === 'materiel' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-violet-50 text-violet-700 border-violet-200'
                            }`}>{r.type === 'materiel' ? '📦' : '🔧'} {r.type}</span>
                          </td>
                          <td className="px-3 py-2 font-semibold text-slate-800 max-w-[220px] truncate">{r.nom}</td>
                          <td className="px-3 py-2 font-mono text-slate-600">{fmtCurrency(r.prix_unitaire)}</td>
                          <td className="px-3 py-2 font-mono text-slate-600">×{r.quantite}</td>
                          <td className="px-3 py-2 font-mono text-slate-600">÷{r.nb_utilisations}</td>
                          <td className="px-3 py-2 font-black text-emerald-700">{fmtCurrency(cout)}</td>
                          <td className="px-3 py-2">
                            {r.status === 'ok'
                              ? <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 border border-emerald-200 rounded font-bold">✓ OK</span>
                              : <span className="text-[10px] px-2 py-0.5 bg-red-100 text-red-700 border border-red-200 rounded font-bold" title={r.error}>✕ {r.error}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button onClick={() => setStep(1)}
                className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 font-semibold">
                <ArrowLeft size={14} />Retour
              </button>
              <button onClick={computeBudgets} disabled={computing || importOkCount === 0}
                className="flex items-center gap-2 px-6 py-3 bg-[#1e2a5e] hover:bg-[#2a3875] text-white rounded-xl text-sm font-bold shadow-sm disabled:opacity-50 transition-all active:scale-95">
                {computing
                  ? <><Loader2 size={14} className="animate-spin" />Calcul…</>
                  : <><Sparkles size={14} strokeWidth={2.5} />Calculer le budget<ArrowRight size={14} /></>}
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/* STEP 3 : Résultats */}
        {/* ══════════════════════════════════════════════════ */}
        {step === 3 && (
          <div className="space-y-5">

            {/* KPI globaux */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Budget total" value={Math.round(globalStats.totalGeneral)} icon={Wallet} iconBg="from-emerald-500 to-teal-600" isCurrency />
              <StatCard label="Main d'œuvre" value={Math.round(globalStats.totalMainOeuvre)} icon={Users} iconBg="from-blue-500 to-indigo-600" isCurrency />
              <StatCard label="Matériels" value={Math.round(globalStats.totalMateriels)} icon={Package} iconBg="from-amber-500 to-orange-600" isCurrency />
              <StatCard label="Outillages" value={Math.round(globalStats.totalOutillages)} icon={Wrench} iconBg="from-violet-500 to-purple-600" isCurrency />
            </div>

            {/* Résumé grand format */}
            <div className="bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-600 rounded-2xl p-6 text-white relative overflow-hidden shadow-xl shadow-emerald-200">
              <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-3xl" />
              <div className="absolute -bottom-6 -left-6 w-32 h-32 rounded-full bg-cyan-400/20 blur-2xl" />
              <div className="relative flex items-center justify-between flex-wrap gap-4">
                <div>
                  <p className="text-[10px] font-bold text-emerald-100/80 uppercase tracking-widest">Budget prévisionnel</p>
                  <p className="text-4xl md:text-5xl font-black tracking-tight mt-2">
                    <AnimatedNumber value={Math.round(globalStats.totalGeneral)} suffix=" DZD" />
                  </p>
                  <p className="text-sm text-emerald-100/90 mt-1">
                    {effectiveUnite?.code} · Année {selectedYear} · {globalStats.nbInterventions} intervention{globalStats.nbInterventions > 1 ? 's' : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-emerald-100/80 uppercase tracking-widest">Moyenne / intervention</p>
                  <p className="text-2xl font-black mt-1">{fmtCurrency(globalStats.moyenneParInterv)}</p>
                  {globalStats.nbAvecManquants > 0 && (
                    <p className="text-[11px] text-amber-100 mt-2 flex items-center gap-1 justify-end">
                      <AlertTriangle size={11} />{globalStats.nbAvecManquants} avec items sans prix
                    </p>
                  )}
                </div>
              </div>

              {/* Barre segmentée */}
              <div className="mt-5">
                <div className="h-3 bg-white/20 rounded-full overflow-hidden flex gap-[2px]">
                  {globalStats.totalMainOeuvre > 0 && (
                    <div className="h-full bg-blue-400 flex items-center justify-center text-[9px] font-black text-white"
                      style={{ width: `${(globalStats.totalMainOeuvre / globalStats.totalGeneral) * 100}%` }}>
                      {(globalStats.totalMainOeuvre / globalStats.totalGeneral) * 100 >= 8 && `${Math.round((globalStats.totalMainOeuvre / globalStats.totalGeneral) * 100)}%`}
                    </div>
                  )}
                  {globalStats.totalMateriels > 0 && (
                    <div className="h-full bg-amber-400 flex items-center justify-center text-[9px] font-black text-white"
                      style={{ width: `${(globalStats.totalMateriels / globalStats.totalGeneral) * 100}%` }}>
                      {(globalStats.totalMateriels / globalStats.totalGeneral) * 100 >= 8 && `${Math.round((globalStats.totalMateriels / globalStats.totalGeneral) * 100)}%`}
                    </div>
                  )}
                  {globalStats.totalOutillages > 0 && (
                    <div className="h-full bg-violet-400 flex items-center justify-center text-[9px] font-black text-white"
                      style={{ width: `${(globalStats.totalOutillages / globalStats.totalGeneral) * 100}%` }}>
                      {(globalStats.totalOutillages / globalStats.totalGeneral) * 100 >= 8 && `${Math.round((globalStats.totalOutillages / globalStats.totalGeneral) * 100)}%`}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-2 text-[11px] flex-wrap">
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-blue-400" /><span className="opacity-90">Main d'œuvre</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-amber-400" /><span className="opacity-90">Matériels</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-violet-400" /><span className="opacity-90">Outillages</span></div>
                </div>
              </div>
            </div>

            {/* Répartition mensuelle */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm"><BarChart3 size={16} className="text-white" /></div>
                <div>
                  <p className="text-sm font-bold text-slate-800">Répartition mensuelle du budget</p>
                  <p className="text-[11px] text-slate-400">Coût total par mois de l'année {selectedYear}</p>
                </div>
              </div>
              <div className="flex items-end gap-2 h-48 pt-2">
                {budgetParMois.map((m, i) => {
                  const h = (m.total / maxMois) * 100;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                      <div className="relative w-full max-w-[50px] flex-1 flex items-end">
                        <div className="w-full rounded-t-lg bg-gradient-to-t from-emerald-500 to-teal-400 transition-all hover:scale-105 relative"
                          style={{ height: `${Math.max(h, 3)}%` }}>
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-lg z-10">
                            {fmtCurrency(m.total)}
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] font-bold text-slate-500">{m.label}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Budget par atelier */}
            {budgetParAtelier.length > 1 && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm"><Layers size={16} className="text-white" /></div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">Budget par atelier</p>
                    <p className="text-[11px] text-slate-400">Répartition des coûts entre ateliers</p>
                  </div>
                </div>
                <div className="space-y-2.5">
                  {budgetParAtelier.map(a => {
                    const pct = (a.total / globalStats.totalGeneral) * 100;
                    return (
                      <div key={a.atelier} className="group">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
                            <Building2 size={12} className="text-slate-400" />
                            {a.atelier}
                            <span className="text-[10px] font-bold text-slate-400">({a.count} interv.)</span>
                          </span>
                          <span className="text-sm font-black text-emerald-700 tabular-nums">{fmtCurrency(a.total)}</span>
                        </div>
                        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-700 flex items-center justify-end pr-2"
                            style={{ width: `${pct}%` }}>
                            {pct >= 8 && <span className="text-[9px] font-black text-white">{Math.round(pct)}%</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* ══ ANALYSE COMPARATIVE MULTI-UNITÉS (Admin uniquement) ══ */}
            {isAdmin && (
              <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-blue-50 rounded-2xl border-2 border-indigo-200 shadow-sm p-5 relative overflow-hidden">
                <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-indigo-500/10 blur-3xl" />
                <div className="relative">
                  <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-600 via-purple-600 to-blue-600 flex items-center justify-center shadow-md shadow-indigo-200">
                        <BarChart3 size={19} className="text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-800 flex items-center gap-2">
                          Analyse comparative
                          <span className="text-[9px] font-black px-2 py-0.5 bg-indigo-600 text-white rounded-full">ADMIN</span>
                        </p>
                        <p className="text-[11px] text-slate-500">Comparer les budgets entre toutes les unités pour {selectedYear}</p>
                      </div>
                    </div>
                    <button
                      onClick={computeComparative}
                      disabled={comparativeLoading}
                      className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 hover:from-indigo-700 hover:via-purple-700 hover:to-blue-700 text-white rounded-xl text-sm font-bold shadow-md shadow-indigo-200 disabled:opacity-50 transition-all active:scale-95">
                      {comparativeLoading
                        ? <><Loader2 size={14} className="animate-spin" />Analyse en cours…</>
                        : <><Sparkles size={14} strokeWidth={2.5} />{comparativeMode ? 'Recalculer' : 'Lancer la comparaison'}</>}
                    </button>
                  </div>

                  {!comparativeMode && !comparativeLoading && (
                    <div className="p-4 bg-white/70 backdrop-blur-sm rounded-xl border border-white/50 flex items-start gap-3">
                      <Info size={14} className="text-indigo-500 shrink-0 mt-0.5" />
                      <div className="text-[11px] text-slate-600">
                        <p className="font-bold text-indigo-700 mb-0.5">Comment ça marche ?</p>
                        <p>Le système applique les <strong>mêmes prix importés</strong> à toutes les unités ayant un plan {selectedYear},
                        avec le même <strong>taux horaire ({tauxHoraire} DZD/h)</strong>. Idéal pour comparer les charges de travail et budgets entre unités.</p>
                      </div>
                    </div>
                  )}

                  {comparativeMode && comparativeData.length > 0 && (
                    <div className="space-y-4">
                      {/* KPIs globaux comparatifs */}
                      {(() => {
                        const withData = comparativeData.filter(d => d.hasData);
                        const grandTotal = withData.reduce((s, d) => s + d.totalGeneral, 0);
                        const totalInterv = withData.reduce((s, d) => s + d.nb_interventions, 0);
                        const maxUnit = withData[0];
                        const minUnit = [...withData].filter(d => d.totalGeneral > 0).sort((a, b) => a.totalGeneral - b.totalGeneral)[0];

                        return (
                          <>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              <div className="bg-white/80 backdrop-blur-sm p-3 rounded-xl border border-indigo-100">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Budget total combiné</p>
                                <p className="text-lg font-black text-indigo-700 mt-1">{fmtCurrency(grandTotal)}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">{withData.length} unité(s) analysée(s)</p>
                              </div>
                              <div className="bg-white/80 backdrop-blur-sm p-3 rounded-xl border border-indigo-100">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total interventions</p>
                                <p className="text-lg font-black text-purple-700 mt-1">{fmtNumber(totalInterv)}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">toutes unités confondues</p>
                              </div>
                              {maxUnit && (
                                <div className="bg-white/80 backdrop-blur-sm p-3 rounded-xl border border-red-100">
                                  <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Budget max</p>
                                  <p className="text-lg font-black text-red-700 mt-1">{maxUnit.unite_code}</p>
                                  <p className="text-[10px] text-slate-500 mt-0.5">{fmtCurrency(maxUnit.totalGeneral)}</p>
                                </div>
                              )}
                              {minUnit && (
                                <div className="bg-white/80 backdrop-blur-sm p-3 rounded-xl border border-emerald-100">
                                  <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Budget min</p>
                                  <p className="text-lg font-black text-emerald-700 mt-1">{minUnit.unite_code}</p>
                                  <p className="text-[10px] text-slate-500 mt-0.5">{fmtCurrency(minUnit.totalGeneral)}</p>
                                </div>
                              )}
                            </div>

                            {/* Graphique comparatif — barres horizontales */}
                            <div className="bg-white/90 backdrop-blur-sm rounded-xl p-4 border border-indigo-100">
                              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Comparaison budgétaire par unité</p>
                              <div className="space-y-3">
                                {comparativeData.map((d, idx) => {
                                  const pct = grandTotal > 0 ? (d.totalGeneral / grandTotal) * 100 : 0;
                                  const maxBudget = comparativeData[0]?.totalGeneral || 1;
                                  const barPct = (d.totalGeneral / maxBudget) * 100;
                                  const colors = [
                                    'from-indigo-500 to-purple-600',
                                    'from-blue-500 to-indigo-600',
                                    'from-purple-500 to-pink-600',
                                    'from-emerald-500 to-teal-600',
                                    'from-amber-500 to-orange-600',
                                    'from-rose-500 to-red-600',
                                    'from-cyan-500 to-blue-600',
                                  ];
                                  const grad = colors[idx % colors.length];

                                  return (
                                    <div key={d.unite_id} className={`group ${!d.hasData ? 'opacity-50' : ''}`}>
                                      <div className="flex items-center justify-between mb-1.5">
                                        <div className="flex items-center gap-2">
                                          <span className={`w-6 h-6 rounded-lg text-[10px] font-black flex items-center justify-center text-white bg-gradient-to-br ${grad}`}>
                                            {idx + 1}
                                          </span>
                                          <span className="text-sm font-bold text-slate-700">{d.unite_code}</span>
                                          <span className="text-[10px] text-slate-400 truncate max-w-[200px]">— {d.unite_nom}</span>
                                          {d.hasData && (
                                            <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-bold">
                                              {d.nb_interventions} interv.
                                            </span>
                                          )}
                                          {!d.hasData && (
                                            <span className="text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded font-bold">
                                              ⚠ {d.error}
                                            </span>
                                          )}
                                        </div>
                                        {d.hasData && (
                                          <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-slate-500">{Math.round(pct)}%</span>
                                            <span className="text-sm font-black text-slate-800 tabular-nums min-w-[120px] text-right">
                                              {fmtCurrency(d.totalGeneral)}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                      {d.hasData && (
                                        <>
                                          <div className="h-6 bg-slate-100 rounded-lg overflow-hidden flex">
                                            {/* Barre segmentée : MO / Matériels / Outillages */}
                                            {d.totalMainOeuvre > 0 && (
                                              <div className="h-full bg-gradient-to-r from-blue-500 to-blue-400 flex items-center justify-center text-[9px] font-black text-white"
                                                style={{ width: `${(d.totalMainOeuvre / d.totalGeneral) * barPct}%` }}
                                                title={`M.O.: ${fmtCurrency(d.totalMainOeuvre)}`}>
                                                {((d.totalMainOeuvre / d.totalGeneral) * 100) >= 12 && `MO ${Math.round((d.totalMainOeuvre / d.totalGeneral) * 100)}%`}
                                              </div>
                                            )}
                                            {d.totalMateriels > 0 && (
                                              <div className="h-full bg-gradient-to-r from-amber-500 to-amber-400 flex items-center justify-center text-[9px] font-black text-white"
                                                style={{ width: `${(d.totalMateriels / d.totalGeneral) * barPct}%` }}
                                                title={`Matériels: ${fmtCurrency(d.totalMateriels)}`}>
                                                {((d.totalMateriels / d.totalGeneral) * 100) >= 12 && `Mat ${Math.round((d.totalMateriels / d.totalGeneral) * 100)}%`}
                                              </div>
                                            )}
                                            {d.totalOutillages > 0 && (
                                              <div className="h-full bg-gradient-to-r from-violet-500 to-violet-400 flex items-center justify-center text-[9px] font-black text-white"
                                                style={{ width: `${(d.totalOutillages / d.totalGeneral) * barPct}%` }}
                                                title={`Outillages: ${fmtCurrency(d.totalOutillages)}`}>
                                                {((d.totalOutillages / d.totalGeneral) * 100) >= 12 && `Out ${Math.round((d.totalOutillages / d.totalGeneral) * 100)}%`}
                                              </div>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
                                            <span>💰 M.O: <strong className="text-blue-700">{fmtCurrency(d.totalMainOeuvre)}</strong></span>
                                            <span>📦 Mat: <strong className="text-amber-700">{fmtCurrency(d.totalMateriels)}</strong></span>
                                            <span>🔧 Out: <strong className="text-violet-700">{fmtCurrency(d.totalOutillages)}</strong></span>
                                            <span className="ml-auto">Moy/interv: <strong className="text-slate-700">{fmtCurrency(d.moyenneParInterv)}</strong></span>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Légende */}
                              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100 text-[10px]">
                                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-gradient-to-r from-blue-500 to-blue-400" /><span className="text-slate-600 font-semibold">Main d'œuvre</span></div>
                                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-gradient-to-r from-amber-500 to-amber-400" /><span className="text-slate-600 font-semibold">Matériels</span></div>
                                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-gradient-to-r from-violet-500 to-violet-400" /><span className="text-slate-600 font-semibold">Outillages</span></div>
                              </div>
                            </div>

                            {/* Tableau récapitulatif */}
                            <div className="bg-white/90 backdrop-blur-sm rounded-xl border border-indigo-100 overflow-hidden">
                              <div className="max-h-96 overflow-y-auto">
                                <table className="w-full text-xs">
                                  <thead className="bg-gradient-to-r from-indigo-50 to-purple-50 sticky top-0 z-10">
                                    <tr>{['Rang', 'Unité', 'Nb interv.', 'Main d\'œuvre', 'Matériels', 'Outillages', 'Total', '% budget global', 'Coût moyen'].map(h =>
                                      <th key={h} className="px-3 py-2.5 text-left font-bold text-indigo-700 uppercase tracking-wider text-[10px]">{h}</th>
                                    )}</tr>
                                  </thead>
                                  <tbody className="divide-y divide-indigo-50">
                                    {comparativeData.map((d, idx) => (
                                      <tr key={d.unite_id} className={`hover:bg-indigo-50/40 ${!d.hasData ? 'opacity-50' : ''}`}>
                                        <td className="px-3 py-2 font-black text-slate-500">#{idx + 1}</td>
                                        <td className="px-3 py-2">
                                          <div>
                                            <p className="font-bold text-slate-800">{d.unite_code}</p>
                                            <p className="text-[10px] text-slate-400 truncate max-w-[180px]">{d.unite_nom}</p>
                                          </div>
                                        </td>
                                        <td className="px-3 py-2 font-mono text-slate-600">{d.hasData ? d.nb_interventions : '—'}</td>
                                        <td className="px-3 py-2 font-semibold text-blue-700 tabular-nums">{d.hasData ? fmtCurrency(d.totalMainOeuvre) : '—'}</td>
                                        <td className="px-3 py-2 font-semibold text-amber-700 tabular-nums">{d.hasData ? fmtCurrency(d.totalMateriels) : '—'}</td>
                                        <td className="px-3 py-2 font-semibold text-violet-700 tabular-nums">{d.hasData ? fmtCurrency(d.totalOutillages) : '—'}</td>
                                        <td className="px-3 py-2 font-black text-emerald-700 tabular-nums">{d.hasData ? fmtCurrency(d.totalGeneral) : '—'}</td>
                                        <td className="px-3 py-2">
                                          {d.hasData ? (
                                            <span className="text-[10px] font-black px-2 py-0.5 bg-indigo-100 text-indigo-700 border border-indigo-200 rounded">
                                              {Math.round((d.totalGeneral / grandTotal) * 100)}%
                                            </span>
                                          ) : (
                                            <span className="text-[9px] text-amber-600 font-bold">{d.error}</span>
                                          )}
                                        </td>
                                        <td className="px-3 py-2 font-semibold text-slate-700 tabular-nums">{d.hasData ? fmtCurrency(d.moyenneParInterv) : '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot className="bg-gradient-to-r from-indigo-100 to-purple-100 border-t-2 border-indigo-300 sticky bottom-0">
                                    <tr>
                                      <td colSpan={2} className="px-3 py-3 font-black text-indigo-800 text-[11px] uppercase">TOTAL GÉNÉRAL</td>
                                      <td className="px-3 py-3 font-black text-indigo-800 font-mono">{totalInterv}</td>
                                      <td className="px-3 py-3 font-black text-blue-800 tabular-nums">{fmtCurrency(withData.reduce((s, d) => s + d.totalMainOeuvre, 0))}</td>
                                      <td className="px-3 py-3 font-black text-amber-800 tabular-nums">{fmtCurrency(withData.reduce((s, d) => s + d.totalMateriels, 0))}</td>
                                      <td className="px-3 py-3 font-black text-violet-800 tabular-nums">{fmtCurrency(withData.reduce((s, d) => s + d.totalOutillages, 0))}</td>
                                      <td className="px-3 py-3 font-black text-emerald-800 tabular-nums">{fmtCurrency(grandTotal)}</td>
                                      <td className="px-3 py-3 font-black text-indigo-800">100%</td>
                                      <td className="px-3 py-3 font-black text-slate-700 tabular-nums">{totalInterv > 0 ? fmtCurrency(grandTotal / totalInterv) : '—'}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </div>

                            {/* Export comparatif */}
                            <div className="flex items-center justify-between p-3 bg-white/70 backdrop-blur-sm rounded-xl border border-indigo-100">
                              <div className="flex items-center gap-2">
                                <Download size={14} className="text-indigo-500" />
                                <p className="text-xs font-bold text-slate-700">Exporter l'analyse comparative</p>
                              </div>
                              <button onClick={async () => {
                                try {
                                  const XLSXmod = await import('xlsx');
                                  const wb = XLSXmod.utils.book_new();

                                  const compData: any[][] = [
                                    ['ANALYSE COMPARATIVE MULTI-UNITÉS'],
                                    [`Année: ${selectedYear} · Taux horaire: ${tauxHoraire} DZD/h`],
                                    [`Date export: ${new Date().toLocaleDateString('fr-FR')}`],
                                    [''],
                                    ['Rang', 'Code', 'Nom Unité', 'Nb interv.', 'Main d\'œuvre (DZD)', 'Matériels (DZD)', 'Outillages (DZD)', 'Total (DZD)', '% Budget global', 'Coût moyen (DZD)', 'Statut'],
                                  ];

                                  comparativeData.forEach((d, idx) => {
                                    compData.push([
                                      idx + 1,
                                      d.unite_code,
                                      d.unite_nom,
                                      d.hasData ? d.nb_interventions : '',
                                      d.hasData ? Math.round(d.totalMainOeuvre) : '',
                                      d.hasData ? Math.round(d.totalMateriels) : '',
                                      d.hasData ? Math.round(d.totalOutillages) : '',
                                      d.hasData ? Math.round(d.totalGeneral) : '',
                                      d.hasData ? `${Math.round((d.totalGeneral / grandTotal) * 100)}%` : '',
                                      d.hasData ? Math.round(d.moyenneParInterv) : '',
                                      d.hasData ? 'OK' : d.error,
                                    ]);
                                  });

                                  compData.push([]);
                                  compData.push([
                                    '',
                                    'TOTAL',
                                    '',
                                    totalInterv,
                                    Math.round(withData.reduce((s, d) => s + d.totalMainOeuvre, 0)),
                                    Math.round(withData.reduce((s, d) => s + d.totalMateriels, 0)),
                                    Math.round(withData.reduce((s, d) => s + d.totalOutillages, 0)),
                                    Math.round(grandTotal),
                                    '100%',
                                    totalInterv > 0 ? Math.round(grandTotal / totalInterv) : 0,
                                    '',
                                  ]);

                                  const ws = XLSXmod.utils.aoa_to_sheet(compData);
                                  ws['!cols'] = [
                                    { wch: 8 }, { wch: 12 }, { wch: 30 }, { wch: 12 },
                                    { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
                                    { wch: 15 }, { wch: 18 }, { wch: 25 }
                                  ];
                                  XLSXmod.utils.book_append_sheet(wb, ws, 'Comparaison');

                                  XLSXmod.writeFile(wb, `comparaison_budget_${selectedYear}.xlsx`);
                                  setSuccessMsg('✅ Analyse comparative exportée');
                                } catch (e: any) { setError(e.message); }
                              }}
                                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-200 transition-all active:scale-95">
                                <Download size={12} />Exporter comparaison
                              </button>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Détail par intervention */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center shadow-sm"><FileText size={16} className="text-white" /></div>
                <div><p className="text-sm font-bold text-slate-800">Détail par intervention</p><p className="text-[11px] text-slate-400">{interventionCosts.length} interventions calculées</p></div>
              </div>
              <div className="max-h-[500px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gradient-to-r from-slate-50 to-emerald-50/30 sticky top-0 z-10 border-b border-slate-100">
                    <tr>{['Date', 'Intervention', 'Atelier', 'Durée', 'Techs', 'M.O.', 'Matériels', 'Outillages', 'Total'].map(h =>
                      <th key={h} className="px-3 py-2.5 text-left font-bold text-slate-400 uppercase tracking-wider text-[10px]">{h}</th>
                    )}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {interventionCosts
                      .sort((a, b) => b.cout_total - a.cout_total)
                      .map(c => (
                        <tr key={c.intervention_id} className={`hover:bg-emerald-50/30 transition-colors ${c.items_manquants.length > 0 ? 'bg-amber-50/20' : ''}`}>
                          <td className="px-3 py-2 font-mono text-slate-500">{c.date}</td>
                          <td className="px-3 py-2 font-semibold text-slate-800 max-w-[220px] truncate" title={c.titre}>
                            {c.titre}
                            {c.items_manquants.length > 0 && (
                              <span className="ml-1 text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded font-bold" title={c.items_manquants.join(', ')}>
                                ⚠ {c.items_manquants.length} sans prix
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2"><span className="text-[10px] px-1.5 py-0.5 bg-violet-50 text-violet-700 border border-violet-200 rounded font-bold">{c.atelier}</span></td>
                          <td className="px-3 py-2 font-mono text-slate-600">{c.duree_h}h</td>
                          <td className="px-3 py-2 text-center font-mono text-slate-600">{c.nb_techniciens}</td>
                          <td className="px-3 py-2 text-blue-700 font-semibold tabular-nums">{fmtCurrency(c.cout_main_oeuvre)}</td>
                          <td className="px-3 py-2 text-amber-700 font-semibold tabular-nums">{fmtCurrency(c.cout_materiels)}</td>
                          <td className="px-3 py-2 text-violet-700 font-semibold tabular-nums">{fmtCurrency(c.cout_outillages)}</td>
                          <td className="px-3 py-2 font-black text-emerald-700 tabular-nums">{fmtCurrency(c.cout_total)}</td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot className="bg-gradient-to-r from-emerald-50 to-teal-50 border-t-2 border-emerald-200 sticky bottom-0">
                    <tr>
                      <td colSpan={5} className="px-3 py-3 font-black text-slate-700 text-[11px] uppercase text-right">TOTAL GÉNÉRAL</td>
                      <td className="px-3 py-3 font-black text-blue-800 tabular-nums">{fmtCurrency(globalStats.totalMainOeuvre)}</td>
                      <td className="px-3 py-3 font-black text-amber-800 tabular-nums">{fmtCurrency(globalStats.totalMateriels)}</td>
                      <td className="px-3 py-3 font-black text-violet-800 tabular-nums">{fmtCurrency(globalStats.totalOutillages)}</td>
                      <td className="px-3 py-3 font-black text-emerald-800 tabular-nums text-sm">{fmtCurrency(globalStats.totalGeneral)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

           {/* Export enrichi */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[#1e2a5e] flex items-center justify-center shadow-sm">
                  <Download size={19} className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">Exporter le rapport détaillé</p>
                  <p className="text-[11px] text-slate-400">Résumé global + par atelier + détail par intervention</p>
                </div>
              </div>
              <button onClick={async () => {
                try {
                  const XLSXmod = await import('xlsx');
                  const wb = XLSXmod.utils.book_new();

                  // ═══════════════════════════════════════
                  // ONGLET 1 : Résumé Global
                  // ═══════════════════════════════════════
                  const resumeGlobal: any[][] = [
                    ['RAPPORT BUDGET ANNUEL'],
                    [''],
                    ['Unité', effectiveUnite?.code || ''],
                    ['Année', selectedYear],
                    ['Date d\'export', new Date().toLocaleDateString('fr-FR')],
                    ['Taux horaire technicien', `${tauxHoraire} DZD/h`],
                    [''],
                    ['═══ RÉPARTITION DES COÛTS ═══'],
                    ['Catégorie', 'Montant (DZD)', 'Pourcentage'],
                    ['Main d\'œuvre', globalStats.totalMainOeuvre, `${Math.round((globalStats.totalMainOeuvre / globalStats.totalGeneral) * 100)}%`],
                    ['Matériels', globalStats.totalMateriels, `${Math.round((globalStats.totalMateriels / globalStats.totalGeneral) * 100)}%`],
                    ['Outillages', globalStats.totalOutillages, `${Math.round((globalStats.totalOutillages / globalStats.totalGeneral) * 100)}%`],
                    [''],
                    ['BUDGET TOTAL', globalStats.totalGeneral, '100%'],
                    [''],
                    ['═══ INDICATEURS ═══'],
                    ['Nombre d\'interventions', globalStats.nbInterventions],
                    ['Coût moyen / intervention', Math.round(globalStats.moyenneParInterv)],
                    ['Interventions avec items non valorisés', globalStats.nbAvecManquants],
                  ];
                  const wsResume = XLSXmod.utils.aoa_to_sheet(resumeGlobal);
                  wsResume['!cols'] = [{ wch: 40 }, { wch: 20 }, { wch: 15 }];
                  XLSXmod.utils.book_append_sheet(wb, wsResume, 'Résumé Global');

                  // ═══════════════════════════════════════
                  // ONGLET 2 : Résumé par Atelier
                  // ═══════════════════════════════════════
                  const resumeAtelier: any[][] = [
                    ['RÉSUMÉ PAR ATELIER'],
                    [`Unité: ${effectiveUnite?.code || '—'} · Année: ${selectedYear}`],
                    [''],
                    ['Atelier', 'Nb interv.', 'Main d\'œuvre (DZD)', 'Matériels (DZD)', 'Outillages (DZD)', 'Total (DZD)', '% du budget', 'Coût moyen/interv.'],
                  ];

                  // Calculer les totaux par atelier
                  const atelierDetails: Record<string, {
                    atelier: string;
                    count: number;
                    mainOeuvre: number;
                    materiels: number;
                    outillages: number;
                    total: number;
                  }> = {};

                  interventionCosts.forEach(i => {
                    if (!atelierDetails[i.atelier]) {
                      atelierDetails[i.atelier] = {
                        atelier: i.atelier,
                        count: 0,
                        mainOeuvre: 0,
                        materiels: 0,
                        outillages: 0,
                        total: 0,
                      };
                    }
                    atelierDetails[i.atelier].count++;
                    atelierDetails[i.atelier].mainOeuvre += i.cout_main_oeuvre;
                    atelierDetails[i.atelier].materiels += i.cout_materiels;
                    atelierDetails[i.atelier].outillages += i.cout_outillages;
                    atelierDetails[i.atelier].total += i.cout_total;
                  });

                  const ateliersArr = Object.values(atelierDetails).sort((a, b) => b.total - a.total);

                  ateliersArr.forEach(a => {
                    resumeAtelier.push([
                      a.atelier,
                      a.count,
                      Math.round(a.mainOeuvre),
                      Math.round(a.materiels),
                      Math.round(a.outillages),
                      Math.round(a.total),
                      `${Math.round((a.total / globalStats.totalGeneral) * 100)}%`,
                      Math.round(a.total / a.count),
                    ]);
                  });

                  // Ligne total
                  resumeAtelier.push([]);
                  resumeAtelier.push([
                    'TOTAL',
                    globalStats.nbInterventions,
                    Math.round(globalStats.totalMainOeuvre),
                    Math.round(globalStats.totalMateriels),
                    Math.round(globalStats.totalOutillages),
                    Math.round(globalStats.totalGeneral),
                    '100%',
                    Math.round(globalStats.moyenneParInterv),
                  ]);

                  const wsAtelier = XLSXmod.utils.aoa_to_sheet(resumeAtelier);
                  wsAtelier['!cols'] = [
                    { wch: 15 }, { wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 20 }
                  ];
                  XLSXmod.utils.book_append_sheet(wb, wsAtelier, 'Par Atelier');

                  // ═══════════════════════════════════════
                  // ONGLET 3 : Résumé Mensuel
                  // ═══════════════════════════════════════
                  const resumeMensuel: any[][] = [
                    ['RÉPARTITION MENSUELLE'],
                    [''],
                    ['Mois', 'Nb interventions', 'Main d\'œuvre', 'Matériels', 'Outillages', 'Total (DZD)'],
                  ];

                  const moisData: Record<number, { count: number; mo: number; mat: number; out: number; total: number }> = {};
                  interventionCosts.forEach(i => {
                    const m = new Date(i.date + 'T00:00:00').getMonth();
                    if (!moisData[m]) moisData[m] = { count: 0, mo: 0, mat: 0, out: 0, total: 0 };
                    moisData[m].count++;
                    moisData[m].mo += i.cout_main_oeuvre;
                    moisData[m].mat += i.cout_materiels;
                    moisData[m].out += i.cout_outillages;
                    moisData[m].total += i.cout_total;
                  });

                  const MOIS_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
                  for (let m = 0; m < 12; m++) {
                    const d = moisData[m];
                    resumeMensuel.push([
                      MOIS_NAMES[m],
                      d?.count || 0,
                      d ? Math.round(d.mo) : 0,
                      d ? Math.round(d.mat) : 0,
                      d ? Math.round(d.out) : 0,
                      d ? Math.round(d.total) : 0,
                    ]);
                  }
                  const wsMois = XLSXmod.utils.aoa_to_sheet(resumeMensuel);
                  wsMois['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
                  XLSXmod.utils.book_append_sheet(wb, wsMois, 'Par Mois');

                  // ═══════════════════════════════════════
                  // ONGLET 4 : Détail par intervention (avec atelier)
                  // ═══════════════════════════════════════
                  const detail: any[][] = [
                    ['DÉTAIL PAR INTERVENTION'],
                    [''],
                    ['Date', 'Titre', 'Atelier', 'Durée (h)', 'Techniciens', 'Main d\'œuvre (DZD)', 'Matériels (DZD)', 'Outillages (DZD)', 'Total (DZD)', 'Items manquants'],
                  ];

                  // Grouper par atelier puis trier par coût
                  const parAtelierSorted = ateliersArr.map(a => a.atelier);
                  parAtelierSorted.forEach(atelierCode => {
                    const interAtelier = interventionCosts
                      .filter(c => c.atelier === atelierCode)
                      .sort((a, b) => b.cout_total - a.cout_total);

                    if (interAtelier.length === 0) return;

                    // Sous-titre atelier
                    detail.push([`━━━ ATELIER : ${atelierCode} (${interAtelier.length} interventions) ━━━`]);

                    interAtelier.forEach(c => {
                      detail.push([
                        c.date,
                        c.titre,
                        c.atelier,
                        c.duree_h,
                        c.nb_techniciens,
                        Math.round(c.cout_main_oeuvre),
                        Math.round(c.cout_materiels),
                        Math.round(c.cout_outillages),
                        Math.round(c.cout_total),
                        c.items_manquants.length > 0 ? c.items_manquants.join(', ') : '',
                      ]);
                    });

                    // Sous-total par atelier
                    const sub = atelierDetails[atelierCode];
                    detail.push([
                      '',
                      `Sous-total ${atelierCode}`,
                      '',
                      '',
                      sub.count,
                      Math.round(sub.mainOeuvre),
                      Math.round(sub.materiels),
                      Math.round(sub.outillages),
                      Math.round(sub.total),
                      '',
                    ]);
                    detail.push([]);
                  });

                  // Total général
                  detail.push([]);
                  detail.push([
                    '',
                    'TOTAL GÉNÉRAL',
                    '',
                    '',
                    globalStats.nbInterventions,
                    Math.round(globalStats.totalMainOeuvre),
                    Math.round(globalStats.totalMateriels),
                    Math.round(globalStats.totalOutillages),
                    Math.round(globalStats.totalGeneral),
                    '',
                  ]);

                  const wsDetail = XLSXmod.utils.aoa_to_sheet(detail);
                  wsDetail['!cols'] = [
                    { wch: 12 }, { wch: 35 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
                    { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 35 }
                  ];
                  XLSXmod.utils.book_append_sheet(wb, wsDetail, 'Détail Interventions');

                  // ═══════════════════════════════════════
                  // ONGLET 5 : Prix des ressources utilisées
                  // ═══════════════════════════════════════
                  const prixData: any[][] = [
                    ['PRIX DES RESSOURCES UTILISÉES'],
                    [''],
                    ['Type', 'Nom', 'Prix unitaire (DZD)', 'Nb utilisations', 'Coût unitaire (DZD)'],
                  ];
                  priceItems.sort((a, b) => a.nom.localeCompare(b.nom)).forEach(p => {
                    prixData.push([
                      p.type === 'materiel' ? 'Matériel' : 'Outillage',
                      p.nom,
                      p.prix_unitaire,
                      p.nb_utilisations,
                      Math.round(p.prix_unitaire / p.nb_utilisations),
                    ]);
                  });
                  const wsPrix = XLSXmod.utils.aoa_to_sheet(prixData);
                  wsPrix['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 20 }, { wch: 18 }, { wch: 22 }];
                  XLSXmod.utils.book_append_sheet(wb, wsPrix, 'Prix Ressources');

                  XLSXmod.writeFile(wb, `budget_${effectiveUnite?.code}_${selectedYear}.xlsx`);
                  setSuccessMsg('✅ Rapport exporté avec succès (5 onglets)');
                } catch (e: any) { setError(e.message); }
              }}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#1e2a5e] hover:bg-[#2a3875] text-white rounded-xl text-sm font-bold shadow-sm transition-all active:scale-95">
                <Download size={14} strokeWidth={2.5} />Télécharger le rapport Excel
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}