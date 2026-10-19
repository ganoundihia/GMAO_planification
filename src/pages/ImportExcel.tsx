// pages/ImportExcel.tsx
import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  Upload, FileSpreadsheet, AlertTriangle, CheckCircle2,
  Shield, MapPin, Pencil, RotateCcw, Users, Calendar,
  AlertOctagon, Info, Copy, FilePlus, Loader2, ArrowRight,
  ArrowLeft, Sparkles, Zap, Rocket, FileUp,
  Search, X, Plus, Trash2, ChevronDown, ChevronRight,
  Save, Hash, Building2, CalendarDays, Lock, ClipboardCheck, Download, Check
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import type { Unite, Atelier, JourFerie, Frequence } from '../lib/types';
import { FREQUENCES } from '../lib/types';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
interface ParsedTache {
  numero: number;
  sous_equipement: string;
  operation: string;
}

interface RawRow {
  id: string; atelier: string; atelier_id: number | null; titre: string;
  frequence: string; temps_h: number; temps_logistique?: number; materiel: string; outillage: string;
  fiche_inspection: string; mode: string; consignation: string; consignation_motif: string;
  techniciens_noms: string; date_debut: string; dates_exceptionnelles: string;
  equipement: string; code_gmao: string; num_shift: number;
  fieldErrors: Record<string, string>; errors: string[]; warnings: string[];
  techWarnings: string[]; excluded: boolean;
  taches?: ParsedTache[];
}
interface DbTechnicien {
  id: number; nom: string; prenom: string; atelier_id: number | null;
  atelier_code: string; unite_id: number; statut: string;
}
interface Occurrence {
  rowId: string; titre: string; date: string; atelier: string; frequence: string;
  isExceptionnelle: boolean; conflictType: 'none' | 'weekend' | 'ferie' | 'ferie_lendemain';
  conflictDetail: string; needsReschedule: boolean; suggestedDate?: string;
}
interface TechOverload {
  technicien: string; date: string; totalH: number;
  details: { rowId: string; titre: string; atelier: string; dureeH: number; logistiqueH: number; chargeH: number }[];
}
interface CongeConflict {
  rowId: string; titre: string; date: string; technicienNom: string;
  technicienId: number; congeDebut: string; congeFin: string; congeMotif: string;
  resolved: boolean; remplacantId?: number; remplacantNom?: string;
}
interface TechDispoCharge {
  id: number; nom: string; prenom: string; nom_complet: string;
  atelier_code: string; heuresJour: Record<string, number>;
}
interface ImportResult {
  imported: number; errors: number;
  errorDetails?: { batch: number; error: string }[];
  tachesImported?: number;
}

type PlanScope = 'annual' | 'monthly';
interface MonthlyPlanInfo {
  month: number; hasData: boolean; count: number;
  status: 'empty' | 'partial' | 'full';
}
type ExistingAction = 'skip' | 'replace' | 'merge' | null;

const NIGHT_ATELIERS = ['CFO', 'LAC', 'VOIE'];
// Valeur par défaut si la colonne « Temps_logistique » est absente/vide dans l'Excel.
const LOGISTICS_H = 0.5;
// Le temps logistique est désormais extrait ligne par ligne depuis la colonne Excel
// « Temps_logistique » (voir processFile) ; ce helper centralise le repli sur la
// valeur par défaut quand la colonne n'a pas été renseignée pour une ligne donnée.
function logisticsHOf(r: { temps_logistique?: number } | undefined | null): number {
  const v = r?.temps_logistique;
  return typeof v === 'number' && !isNaN(v) && v >= 0 ? v : LOGISTICS_H;
}
const MONTH_NAMES = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre'
];

const ALL_COLUMNS = [
  { key: 'titre', label: 'Titre', required: true, type: 'text', width: 'min-w-[200px]' },
  { key: 'frequence', label: 'Fréquence', required: true, type: 'freq', width: 'min-w-[130px]' },
  { key: 'date_debut', label: 'Date Début', required: true, type: 'text', width: 'min-w-[110px]' },
  { key: 'temps_h', label: 'Tps (h)', required: false, type: 'number', width: 'min-w-[80px]' },
  { key: 'mode', label: 'Mode', required: false, type: 'mode', width: 'min-w-[90px]' },
  { key: 'consignation', label: 'Consig.', required: false, type: 'consig', width: 'min-w-[80px]' },
  { key: 'consignation_motif', label: 'Motif Consig.', required: false, type: 'text', width: 'min-w-[140px]' },
  { key: 'techniciens_noms', label: 'Techniciens', required: false, type: 'text', width: 'min-w-[160px]' },
  { key: 'equipement', label: 'Équipement', required: false, type: 'text', width: 'min-w-[130px]' },
  { key: 'code_gmao', label: 'Code GMAO', required: false, type: 'text', width: 'min-w-[110px]' },
  { key: 'materiel', label: 'Matériel', required: false, type: 'text', width: 'min-w-[120px]' },
  { key: 'outillage', label: 'Outillage', required: false, type: 'text', width: 'min-w-[120px]' },
  { key: 'fiche_inspection', label: 'Fiche Insp.', required: false, type: 'text', width: 'min-w-[120px]' },
  { key: 'dates_exceptionnelles', label: 'Dates Except.', required: false, type: 'text', width: 'min-w-[140px]' },
  { key: 'num_shift', label: 'Shift', required: false, type: 'number', width: 'min-w-[70px]' },
];

// ─── Date & Utils ───
const isAlgeriaWeekend = (d: Date) => d.getDay() === 5 || d.getDay() === 6;
const isHoliday = (d: Date, holidays: JourFerie[]) =>
  holidays.some(h => h.date === formatDateISO(d));
const isWorkingDay = (d: Date, holidays: JourFerie[]) =>
  !isAlgeriaWeekend(d) && !isHoliday(d, holidays);

function formatDateISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function parseDateFR(v: unknown): Date | null {
  if (!v && v !== 0) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const s = String(v).trim();
  // ISO format YYYY-MM-DD
  const m0 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m0) return new Date(+m0[1], +m0[2]-1, +m0[3]);
  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const m1 = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m1) return new Date(+m1[3], +m1[2]-1, +m1[1]);
  // YYYY/MM/DD
  const m2 = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (m2) return new Date(+m2[1], +m2[2]-1, +m2[3]);
  return null;
}

function nextWorkingDay(d: Date, holidays: JourFerie[]): Date {
  const cur = new Date(d);
  while (!isWorkingDay(cur, holidays)) cur.setDate(cur.getDate() + 1);
  return cur;
}

function getSelectableMonths(year: number): number[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const months: number[] = [];
  const startFrom = year === currentYear ? currentMonth : 0;
  for (let m = startFrom; m < 12; m++) months.push(m);
  return months;
}

function getMaxAvailableMonths(year: number, startMonth: number): number {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const minStart = year === currentYear ? currentMonth : 0;
  const effectiveStart = Math.max(startMonth, minStart);
  const remaining = 12 - effectiveStart;
  return Math.min(6, remaining);
}

function filterOccurrencesByScope(
  occs: Occurrence[], scope: PlanScope, year: number,
  startMonth: number, numMonths: number
): Occurrence[] {
  if (scope === 'annual') return occs;
  // Comparer en ISO string pour éviter les problèmes de fuseau horaire
  const startISO = formatDateISO(new Date(year, startMonth, 1));
  const endISO = formatDateISO(new Date(year, startMonth + numMonths, 0));
  return occs.filter(o => o.date >= startISO && o.date <= endISO);
}

function getPlanPeriod(
  scope: PlanScope, year: number, startMonth: number, numMonths: number
): { start: Date; end: Date } {
  if (scope === 'annual') {
    return { start: new Date(year, 0, 1), end: new Date(year, 11, 31) };
  }
  return {
    start: new Date(year, startMonth, 1),
    end: new Date(year, startMonth + numMonths, 0),
  };
}

const REQUIRED_HEADERS = ['titre', 'frequence', 'date_debut', 'date debut'];

function normalizeKey(k: string): string {
  return k.toString().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/[\s_\-]+/g, '');
}

function normalizeFrequence(v: string): string {
  const n = String(v).normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
  return FREQUENCES.find(f =>
    f.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase() === n
  ) ?? '';
}

function parseSheetSkippingHeaders(ws: XLSX.WorkSheet): Record<string, unknown>[] {
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  let headerRowIdx = -1;
  for (let i = 0; i < raw.length; i++) {
    const rowNorm = (raw[i] as unknown[]).map(c => normalizeKey(String(c ?? '')));
    if (REQUIRED_HEADERS.some(rh => rowNorm.includes(rh))) { headerRowIdx = i; break; }
  }
  if (headerRowIdx === -1) return [];
  const headers = (raw[headerRowIdx] as unknown[]).map(c => normalizeKey(String(c ?? '')));
  const result: Record<string, unknown>[] = [];
  for (let i = headerRowIdx + 1; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    if (row.every(c => c === '' || c === null || c === undefined)) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, j) => { if (h) obj[h] = row[j] ?? ''; });
    result.push(obj);
  }
  return result;
}

function getCell(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    const nk = normalizeKey(k);
    if (row[nk] !== undefined && row[nk] !== '') return row[nk];
    for (const rk of Object.keys(row)) {
      if (normalizeKey(rk) === nk && row[rk] !== '') return row[rk];
    }
  }
  return '';
}

// ═══════════════════════════════════════════════════════════
// PARSER EXCEL DES TÂCHES
// ═══════════════════════════════════════════════════════════
function parseTachesFromWorkbook(wb: XLSX.WorkBook): ParsedTache[] {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Normalise (minuscules + suppression des accents) pour que "Sous-équipement",
  // "Opération", etc. matchent quelle que soit la présence d'accents dans le fichier source.
  const deaccent = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

  let headerIdx = -1;
  for (let i = 0; i < raw.length; i++) {
    const row = (raw[i] as unknown[]).map(c => deaccent(String(c ?? '')));
    const joined = row.join(' ');
    const hasSousEquip = joined.includes('sous-equip') || joined.includes('sous equip') || joined.includes('sous_equip');
    const hasOperation = joined.includes('operation');
    const hasNumero = row.some(c =>
      c === 'n°' || c === 'n' || c === 'num' || c === 'numero' || c === 'n °'
    );
    if (hasOperation && (hasSousEquip || hasNumero)) { headerIdx = i; break; }
  }

  if (headerIdx === -1) {
    console.warn('[parseTaches] Aucune ligne d\'en-tête trouvée');
    return [];
  }

  const headerRow = (raw[headerIdx] as unknown[]).map(c => deaccent(String(c ?? '')));
  let colSousEquip = -1, colNumero = -1, colOperation = -1;

  headerRow.forEach((c, idx) => {
    if (colSousEquip === -1 && (
      c.includes('sous-equip') || c.includes('sous equip') || c.includes('sous_equip')
    )) colSousEquip = idx;
    if (colNumero === -1 && (
      c === 'n°' || c === 'n' || c === 'num' || c === 'numero' || c === 'n °'
    )) colNumero = idx;
    if (colOperation === -1 && c.includes('operation')) colOperation = idx;
  });

  if (colOperation === -1) return [];

  const taches: ParsedTache[] = [];
  let currentSousEquip = '';

  for (let i = headerIdx + 1; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    if (!row) continue;

    const sousEquip = colSousEquip >= 0 ? String(row[colSousEquip] ?? '').trim() : '';
    const numStr = colNumero >= 0 ? String(row[colNumero] ?? '').trim() : '';
    const operation = String(row[colOperation] ?? '').trim();

    const opLower = operation.toLowerCase();
    if (opLower.startsWith('commentaire')) break;
    if (opLower.startsWith('nombre de bouton')) break;
    if (opLower.startsWith('code di')) break;

    if (sousEquip) currentSousEquip = sousEquip;

    const num = parseInt(numStr);
    if (!isNaN(num) && num > 0 && operation && operation.length > 3) {
      taches.push({ numero: num, sous_equipement: currentSousEquip, operation });
    }
  }

  console.log(`[parseTaches] ${taches.length} tâches extraites`);
  return taches;
}

function parseTachesFromExcel(file: File): Promise<ParsedTache[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary' });
        resolve(parseTachesFromWorkbook(wb));
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Erreur lecture fichier'));
    reader.readAsBinaryString(file);
  });
}

async function parseTachesFromServer(fichePath: string): Promise<ParsedTache[]> {
  try {
    const raw = String(fichePath).trim();
    // Le nom de base doit être extrait en tenant compte des chemins Windows
    // (ex: "C:\Users\...\CFA\fiche.xlsx" saisis tels quels dans l'Excel source) :
    // .split('/') seul les laissait intacts (aucun '/'), donc la recherche de secours
    // par nom de fichier cherchait le chemin entier au lieu du seul nom de fichier.
    const basename = (p: string) => p.split(/[\\/]/).pop() || p;
    const isAbsoluteLocalPath = /^[a-zA-Z]:[\\/]/.test(raw) || raw.startsWith('\\\\');

    let apiUrl = '';
    if (!isAbsoluteLocalPath) {
      if (raw.startsWith('http://') || raw.startsWith('https://')) {
        const match = raw.match(/[?&]path=([^&]+)/);
        apiUrl = match ? `/api/fichiers/fiches?path=${match[1]}` : raw;
      } else {
        const cleanPath = raw.replace(/^[\\/]+/, '');
        apiUrl = `/api/fichiers/fiches?path=${encodeURIComponent(cleanPath)}`;
      }
    }

    // Un chemin local absolu (lecteur Windows ou UNC) ne correspond jamais à un
    // chemin relatif à FICHES_ROOT — inutile de tenter la requête directe,
    // on cherche tout de suite par nom de fichier dans tout FICHES_ROOT.
    const response = isAbsoluteLocalPath ? null : await fetch(apiUrl);
    if (!response || !response.ok) {
      const fileName = basename(raw);
      const searchUrl = `/api/fichiers/fiches-search?name=${encodeURIComponent(fileName)}`;
      const searchResp = await fetch(searchUrl);
      if (!searchResp.ok) throw new Error(`Fichier introuvable (${fileName})`);
      const buffer = await searchResp.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      return parseTachesFromWorkbook(wb);
    }

    const buffer = await response.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    return parseTachesFromWorkbook(wb);
  } catch (err: any) {
    console.error(`[parseTaches] Erreur pour "${fichePath}":`, err.message);
    throw err;
  }
}

function normalizeFreqKey(v: string): string {
  return String(v ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
}

// ─── Génération des occurrences par fréquence ───
function everyNMonths(
  dom: number, stepMonths: number,
  periodStart: Date, periodEnd: Date,
  anchorDate: Date,
): Date[] {
  const dates: Date[] = [];
  // Reculer depuis l'ancre pour trouver le bon alignement de cycle
  const cursor = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);

  // Reculer jusqu'avant ou à periodStart
  while (cursor > new Date(periodStart.getFullYear(), periodStart.getMonth(), 1)) {
    cursor.setMonth(cursor.getMonth() - stepMonths);
  }
  // Avancer jusqu'au premier mois de cycle >= periodStart
  while (
    cursor < new Date(periodStart.getFullYear(), periodStart.getMonth(), 1)
  ) {
    cursor.setMonth(cursor.getMonth() + stepMonths);
  }

  while (cursor <= periodEnd) {
    const lastDayOfMonth = new Date(
      cursor.getFullYear(), cursor.getMonth() + 1, 0
    ).getDate();
    const d = new Date(
      cursor.getFullYear(), cursor.getMonth(), Math.min(dom, lastDayOfMonth)
    );
    if (d >= periodStart && d <= periodEnd) dates.push(d);
    cursor.setMonth(cursor.getMonth() + stepMonths);
  }
  return dates;
}

function generateOccurrences(
  row: RawRow, periodStart: Date, periodEnd: Date, holidays: JourFerie[]
): Occurrence[] {
  const occs: Occurrence[] = [];
  let startDate = parseDateFR(row.date_debut);
  if (!startDate) return occs;

  // Le plan cible toujours une année précise (le mois de départ + la durée du
  // plan mensuel/bimensuel/... ne peuvent pas chevaucher deux années — voir
  // getPlanPeriod). Si la date de l'Excel source tombe dans une autre année
  // (ex : fichier 2027 importé pour construire le plan 2026), on recale
  // l'ancre sur l'année du plan afin que TOUTES les occurrences générées
  // tombent bien dans l'année sélectionnée, quelle que soit l'année réelle
  // du fichier Excel.
  if (startDate.getFullYear() !== periodStart.getFullYear()) {
    const targetYear = periodStart.getFullYear();
    const lastDay = new Date(targetYear, startDate.getMonth() + 1, 0).getDate();
    startDate = new Date(targetYear, startDate.getMonth(), Math.min(startDate.getDate(), lastDay));
  }

  const isNight = NIGHT_ATELIERS.includes(row.atelier.toUpperCase());

  const buildOcc = (date: Date, isExc = false): Occurrence => {
    const ds = formatDateISO(date);
    let conflictType: Occurrence['conflictType'] = 'none';
    let conflictDetail = '';
    let needsReschedule = false;
    let suggestedDate: string | undefined;

    if (isAlgeriaWeekend(date)) {
      conflictType = 'weekend';
      if (isNight) {
        conflictDetail = 'Week-end (Ven/Sam) — mode Nuit toléré';
      } else {
        conflictDetail = 'Week-end — jour non ouvrable';
        needsReschedule = true;
        const next = nextWorkingDay(new Date(date.getTime() + 86400000), holidays);
        suggestedDate = formatDateISO(next);
        conflictDetail += ` → suggéré : ${suggestedDate}`;
      }
    } else if (isHoliday(date, holidays)) {
      const hName = holidays.find(h => h.date === ds)?.nom ?? '';
      conflictType = 'ferie';
      conflictDetail = `Jour férié : ${hName}`;
      needsReschedule = true;
      const next = nextWorkingDay(new Date(date.getTime() + 86400000), holidays);
      suggestedDate = formatDateISO(next);
      conflictDetail += ` → suggéré : ${suggestedDate}`;
    } else if (isNight) {
      const next = new Date(date);
      next.setDate(next.getDate() + 1);
      if (isHoliday(next, holidays)) {
        conflictType = 'ferie_lendemain';
        conflictDetail = `Nuit : lendemain férié (${
          holidays.find(h => h.date === formatDateISO(next))?.nom ?? ''
        })`;
      }
    }

    return {
      rowId: row.id, titre: row.titre, date: ds, atelier: row.atelier,
      frequence: row.frequence, isExceptionnelle: isExc, conflictType,
      conflictDetail, needsReschedule, suggestedDate
    };
  };

  const dom = startDate.getDate();
  const freqKey = normalizeFreqKey(row.frequence);

  if (freqKey.startsWith('quotidien')) {
    const d = new Date(Math.max(startDate.getTime(), periodStart.getTime()));
    while (d <= periodEnd) {
      if (isWorkingDay(d, holidays)) {
        occs.push({
          rowId: row.id, titre: row.titre, date: formatDateISO(d),
          atelier: row.atelier, frequence: row.frequence,
          isExceptionnelle: false, conflictType: 'none',
          conflictDetail: '', needsReschedule: false
        });
      }
      d.setDate(d.getDate() + 1);
    }
  } else if (freqKey.startsWith('hebdo')) {
    const d = new Date(startDate);
    while (d < periodStart) d.setDate(d.getDate() + 7);
    while (d <= periodEnd) {
      occs.push(buildOcc(new Date(d)));
      d.setDate(d.getDate() + 7);
    }
  } else if (freqKey.startsWith('bimensuel')) {
    const d = new Date(startDate);
    while (d < periodStart) d.setDate(d.getDate() + 14);
    while (d <= periodEnd) {
      occs.push(buildOcc(new Date(d)));
      d.setDate(d.getDate() + 14);
    }
  } else if (freqKey.startsWith('mensuel')) {
    everyNMonths(dom, 1, periodStart, periodEnd, startDate)
      .forEach(d => occs.push(buildOcc(d)));
  } else if (freqKey.startsWith('bimestriel')) {
    everyNMonths(dom, 2, periodStart, periodEnd, startDate)
      .forEach(d => occs.push(buildOcc(d)));
  } else if (freqKey.startsWith('trimestriel')) {
    everyNMonths(dom, 3, periodStart, periodEnd, startDate)
      .forEach(d => occs.push(buildOcc(d)));
  } else if (freqKey.startsWith('quadrimestriel')) {
    everyNMonths(dom, 4, periodStart, periodEnd, startDate)
      .forEach(d => occs.push(buildOcc(d)));
  } else if (freqKey.startsWith('semestriel')) {
    everyNMonths(dom, 6, periodStart, periodEnd, startDate)
      .forEach(d => occs.push(buildOcc(d)));
  } else if (freqKey.startsWith('annuel')) {
    everyNMonths(dom, 12, periodStart, periodEnd, startDate)
      .forEach(d => occs.push(buildOcc(d)));
  } else {
    console.warn(
      '[generateOccurrences] Fréquence non reconnue :',
      JSON.stringify(row.frequence), '— ligne', row.id
    );
    const fallback = startDate >= periodStart && startDate <= periodEnd
      ? startDate
      : periodStart;
    if (fallback <= periodEnd) occs.push(buildOcc(new Date(fallback)));
  }

  // Dates exceptionnelles
  if (row.dates_exceptionnelles) {
    row.dates_exceptionnelles
      .split(/[;,]/).map(s => s.trim()).filter(Boolean)
      .forEach(ds => {
        const d = parseDateFR(ds);
        if (d && d >= periodStart && d <= periodEnd) occs.push(buildOcc(d, true));
      });
  }

  return occs;
}

function computeOverloads(
  rows: RawRow[], occs: Occurrence[], maxH: number
): TechOverload[] {
  const map: Record<string, Record<string, {
    totalH: number; details: TechOverload['details']
  }>> = {};

  const occsByRowId = new Map<string, Occurrence[]>();
  occs.forEach(o => {
    if (!occsByRowId.has(o.rowId)) occsByRowId.set(o.rowId, []);
    occsByRowId.get(o.rowId)!.push(o);
  });

  rows.filter(r => !r.excluded && r.techniciens_noms).forEach(r => {
    const names = r.techniciens_noms.split(/[,;]/).map(s => s.trim()).filter(Boolean);
    const nbTechs = Math.max(names.length, 1);
    const dureeH = r.temps_h / nbTechs;
    const logistiqueH = logisticsHOf(r);
    const chargeH = dureeH + logistiqueH;
    const rowOccs = occsByRowId.get(r.id) || [];

    names.forEach(name => {
      if (!map[name]) map[name] = {};
      rowOccs.forEach(occ => {
        if (!map[name][occ.date]) map[name][occ.date] = { totalH: 0, details: [] };
        map[name][occ.date].totalH += chargeH;
        map[name][occ.date].details.push({ rowId: r.id, titre: r.titre, atelier: r.atelier, dureeH, logistiqueH, chargeH });
      });
    });
  });

  const overloads: TechOverload[] = [];
  Object.entries(map).forEach(([tech, days]) => {
    Object.entries(days).forEach(([date, { totalH, details }]) => {
      if (totalH > maxH) overloads.push({ technicien: tech, date, totalH, details });
    });
  });

  return overloads.sort((a, b) => b.totalH - a.totalH);
}

// Charge totale (toutes dates confondues) par nom de technicien sur l'ensemble du plan
// importé — sert à classer les remplaçants du moins chargé au plus chargé lors d'une
// réaffectation manuelle ou automatique.
function computeTechTotalCharge(rows: RawRow[], occs: Occurrence[]): Record<string, number> {
  const occCountByRowId = new Map<string, number>();
  occs.forEach(o => occCountByRowId.set(o.rowId, (occCountByRowId.get(o.rowId) || 0) + 1));

  const totals: Record<string, number> = {};
  rows.filter(r => !r.excluded && r.techniciens_noms).forEach(r => {
    const names = r.techniciens_noms.split(/[,;]/).map(s => s.trim()).filter(Boolean);
    const nbTechs = Math.max(names.length, 1);
    const chargeH = (r.temps_h / nbTechs) + logisticsHOf(r);
    const nOccs = occCountByRowId.get(r.id) || 0;
    names.forEach(name => { totals[name] = (totals[name] || 0) + chargeH * nOccs; });
  });
  return totals;
}

function createEmptyRow(atelier: string, atelierObj: Atelier | undefined): RawRow {
  return {
    id: `new-${Date.now()}-${Math.random()}`,
    atelier, atelier_id: atelierObj?.id ?? null,
    titre: '', frequence: '', temps_h: 0, temps_logistique: undefined, materiel: '', outillage: '',
    fiche_inspection: '', mode: 'JOUR', consignation: 'NON', consignation_motif: '',
    techniciens_noms: '', date_debut: '', dates_exceptionnelles: '',
    equipement: '', code_gmao: '', num_shift: 1,
    fieldErrors: {},
    errors: ['Titre manquant', 'Fréquence manquante', 'Date_Debut manquante'],
    warnings: [], techWarnings: [], excluded: true, taches: [],
  };
}
// ─── Stat Card ───
function StatCard({ label, val, color = 'blue', icon: Icon }: {
  label: string; val: string | number; color?: string; icon?: any;
}) {
  const colorMap: Record<string, { text: string; bg: string }> = {
    blue:   { text: 'text-blue-700',    bg: 'bg-blue-500' },
    green:  { text: 'text-emerald-700', bg: 'bg-emerald-500' },
    amber:  { text: 'text-amber-700',   bg: 'bg-amber-500' },
    red:    { text: 'text-rose-700',    bg: 'bg-rose-500' },
    orange: { text: 'text-orange-700',  bg: 'bg-orange-500' },
    slate:  { text: 'text-slate-700',   bg: 'bg-slate-500' },
    purple: { text: 'text-violet-700',  bg: 'bg-violet-500' },
  };
  const c = colorMap[color] ?? colorMap.slate;
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-all">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className={`w-11 h-11 rounded-2xl ${c.bg} flex items-center justify-center shrink-0`}>
            <Icon size={18} className="text-white" strokeWidth={2.2} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-slate-500 font-medium leading-tight">{label}</p>
          <p className={`text-2xl font-bold ${c.text} tabular-nums leading-tight`}>{val}</p>
        </div>
      </div>
    </div>
  );
}

// ─── FormField ───
function FormField({ label, icon: Icon, required, error, children, hint }: {
  label: string; icon?: any; required?: boolean;
  error?: string; children: React.ReactNode; hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
        {Icon && <Icon size={11} className="text-slate-400" />}
        {label}
        {required && <span className="text-rose-400 font-bold">*</span>}
      </label>
      {children}
      {error && (
        <p className="text-[11px] text-rose-500 font-semibold flex items-center gap-1">
          <AlertTriangle size={10} />{error}
        </p>
      )}
      {hint && !error && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

const inputBase = "w-full rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white transition-all outline-none placeholder:text-slate-300 focus:ring-2 focus:ring-[#1e2a5e]/20 border border-transparent focus:border-[#1e2a5e]/30";
const inputError = "border-rose-300 bg-rose-50/30 focus:ring-rose-500/20 focus:border-rose-400";

// ─── Edit Modal ───
function EditModal({ row, ateliers, onSave, onClose }: {
  row: RawRow; ateliers: Atelier[];
  onSave: (u: RawRow) => void; onClose: () => void;
}) {
  const [form, setForm] = useState<RawRow>({ ...row });
  const set = (field: keyof RawRow, value: unknown) =>
    setForm(p => ({ ...p, [field]: value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-br from-[#1e2a5e] to-[#2a3875] p-5 shrink-0 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-blue-400/20 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-sm ring-1 ring-white/20 flex items-center justify-center shrink-0">
              <Pencil size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-white text-base leading-tight truncate">
                {row.titre || 'Nouvelle intervention'}
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-lg bg-white/15 text-white font-bold">
                {row.atelier}
              </span>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-xl hover:bg-white/10 text-white/70 hover:text-white flex items-center justify-center transition-all">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50">
          <FormField label="Titre intervention" required error={form.fieldErrors?.titre}>
            <input type="text" value={form.titre}
              onChange={e => set('titre', e.target.value)}
              placeholder="Ex: Vérification des contacts…"
              className={`${inputBase} ${form.fieldErrors?.titre ? inputError : ''}`} />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Fréquence" required error={form.fieldErrors?.frequence}>
              <select value={form.frequence} onChange={e => set('frequence', e.target.value)}
                className={`${inputBase} ${form.fieldErrors?.frequence ? inputError : ''}`}>
                <option value="">— Choisir —</option>
                {FREQUENCES.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </FormField>

            <FormField label="Date début" required error={form.fieldErrors?.date_debut}
              hint="Format AAAA-MM-JJ ou JJ/MM/AAAA">
              <input type="text" value={form.date_debut}
                onChange={e => set('date_debut', e.target.value)}
                placeholder="2026-01-15"
                className={`${inputBase} font-mono ${form.fieldErrors?.date_debut ? inputError : ''}`} />
            </FormField>

            <FormField label="Temps (h)">
              <input type="number" value={form.temps_h}
                onChange={e => set('temps_h', parseFloat(e.target.value) || 0)}
                min={0} step={0.5} className={inputBase} />
            </FormField>

            <FormField label="Temps logistique (h)" hint={`Vide = valeur par défaut (${LOGISTICS_H}h)`}>
              <input type="number" value={form.temps_logistique ?? ''}
                onChange={e => set('temps_logistique', e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0))}
                placeholder={String(LOGISTICS_H)}
                min={0} step={0.25} className={inputBase} />
            </FormField>

            <FormField label="Mode">
              <div className="grid grid-cols-2 gap-2">
                {['JOUR','NUIT'].map(m => (
                  <button key={m} type="button" onClick={() => set('mode', m)}
                    className={`py-2.5 rounded-xl text-xs font-bold transition-all ${
                      form.mode === m
                        ? m === 'NUIT'
                          ? 'bg-indigo-500 text-white shadow-sm'
                          : 'bg-amber-500 text-white shadow-sm'
                        : 'bg-white text-slate-500 hover:bg-slate-100 ring-1 ring-slate-200'
                    }`}>
                    {m === 'JOUR' ? '☀️ Jour' : '🌙 Nuit'}
                  </button>
                ))}
              </div>
            </FormField>

            <FormField label="Consignation">
              <div className="grid grid-cols-2 gap-2">
                {['NON','OUI'].map(c => (
                  <button key={c} type="button" onClick={() => set('consignation', c)}
                    className={`py-2.5 rounded-xl text-xs font-bold transition-all ${
                      form.consignation === c
                        ? c === 'OUI'
                          ? 'bg-rose-500 text-white shadow-sm'
                          : 'bg-emerald-500 text-white shadow-sm'
                        : 'bg-white text-slate-500 hover:bg-slate-100 ring-1 ring-slate-200'
                    }`}>
                    {c === 'OUI' ? '⚡ Oui' : '✓ Non'}
                  </button>
                ))}
              </div>
            </FormField>

            <FormField label="Motif consignation">
              <input type="text" value={form.consignation_motif}
                onChange={e => set('consignation_motif', e.target.value)}
                placeholder="Préciser le motif…" className={inputBase} />
            </FormField>
          </div>

          <FormField label="Techniciens" hint="Séparés par des virgules">
            <input type="text" value={form.techniciens_noms}
              onChange={e => set('techniciens_noms', e.target.value)}
              placeholder="Nom1, Nom2…" className={inputBase} />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Équipement">
              <input type="text" value={form.equipement}
                onChange={e => set('equipement', e.target.value)}
                placeholder="Nom de l'équipement" className={inputBase} />
            </FormField>
            <FormField label="Code GMAO">
              <input type="text" value={form.code_gmao}
                onChange={e => set('code_gmao', e.target.value)}
                placeholder="Ex: EQ-001" className={`${inputBase} font-mono`} />
            </FormField>
            <FormField label="Matériel">
              <input type="text" value={form.materiel}
                onChange={e => set('materiel', e.target.value)}
                placeholder="Matériel requis" className={inputBase} />
            </FormField>
            <FormField label="Outillage">
              <input type="text" value={form.outillage}
                onChange={e => set('outillage', e.target.value)}
                placeholder="Outillage requis" className={inputBase} />
            </FormField>
            <FormField label="Fiche inspection">
              <input type="text" value={form.fiche_inspection}
                onChange={e => set('fiche_inspection', e.target.value)}
                placeholder="Référence fiche" className={inputBase} />
            </FormField>
            <FormField label="Shift (1-3)">
              <div className="grid grid-cols-3 gap-2">
                {[1,2,3].map(s => (
                  <button key={s} type="button" onClick={() => set('num_shift', s)}
                    className={`py-2.5 rounded-xl text-xs font-bold transition-all ${
                      form.num_shift === s
                        ? 'bg-[#1e2a5e] text-white shadow-sm'
                        : 'bg-white text-slate-500 hover:bg-slate-100 ring-1 ring-slate-200'
                    }`}>
                    S{s}
                  </button>
                ))}
              </div>
            </FormField>
          </div>

          <FormField label="Dates exceptionnelles" hint="Séparées par des point-virgules">
            <input type="text" value={form.dates_exceptionnelles}
              onChange={e => set('dates_exceptionnelles', e.target.value)}
              placeholder="2026-03-15; 2026-06-22"
              className={`${inputBase} font-mono`} />
          </FormField>

          <FormField label="Atelier">
            <select value={form.atelier}
              onChange={e => {
                const a = ateliers.find(at => at.code === e.target.value);
                setForm(p => ({ ...p, atelier: e.target.value, atelier_id: a?.id ?? null }));
              }}
              className={inputBase}>
              <option value="">— Choisir —</option>
              {ateliers.map(a => (
                <option key={a.id} value={a.code}>{a.code} — {a.nom}</option>
              ))}
            </select>
          </FormField>

          {/* Tâches — ajout manuel : chaque intervention doit avoir au moins une
              tâche avant de pouvoir passer à l'étape de consolidation. Elles
              peuvent venir de l'import automatique de la fiche d'inspection,
              ou être saisies ici manuellement. */}
          <FormField label={`Tâches (${form.taches?.length || 0})`}
            hint="Importées depuis la fiche d'inspection, ou ajoutées manuellement">
            <div className="space-y-1.5">
              {(form.taches || []).map((t, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-white rounded-lg ring-1 ring-slate-200 px-2 py-1.5">
                  <span className="text-[10px] font-bold text-slate-400 w-6 shrink-0">#{t.numero}</span>
                  <input type="text" value={t.sous_equipement}
                    onChange={e => {
                      const list = [...(form.taches || [])];
                      list[idx] = { ...list[idx], sous_equipement: e.target.value };
                      set('taches', list);
                    }}
                    placeholder="Sous-équipement"
                    className="flex-1 min-w-0 text-xs px-2 py-1 rounded-md border border-slate-200" />
                  <input type="text" value={t.operation}
                    onChange={e => {
                      const list = [...(form.taches || [])];
                      list[idx] = { ...list[idx], operation: e.target.value };
                      set('taches', list);
                    }}
                    placeholder="Opération"
                    className="flex-[1.5] min-w-0 text-xs px-2 py-1 rounded-md border border-slate-200" />
                  <button type="button"
                    onClick={() => set('taches', (form.taches || []).filter((_, i) => i !== idx))}
                    className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-rose-500 hover:bg-rose-50">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <button type="button"
                onClick={() => {
                  const list = form.taches || [];
                  const nextNum = (list.length ? Math.max(...list.map(t => t.numero)) : 0) + 1;
                  set('taches', [...list, { numero: nextNum, sous_equipement: '', operation: '' }]);
                }}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed border-slate-300 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:border-slate-400 transition-all">
                <Plus size={12} />Ajouter une tâche
              </button>
              {(form.taches?.length || 0) === 0 && (
                <p className="text-[11px] text-rose-600 flex items-center gap-1">
                  <AlertTriangle size={11} />Aucune tâche : requis avant de publier le plan.
                </p>
              )}
            </div>
          </FormField>
        </div>

        {/* Footer */}
        <div className="shrink-0 p-4 border-t border-slate-100 bg-white flex items-center justify-between gap-3">
          <button onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-all font-semibold">
            <X size={14} />Annuler
          </button>
          <button onClick={() => onSave(form)}
            className="flex items-center gap-2 px-5 py-2 bg-[#1e2a5e] hover:bg-[#2a3875] text-white rounded-xl text-sm font-bold shadow-sm transition-all">
            <Save size={14} strokeWidth={2.5} />Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Modal ───
function DeleteModal({ row, onConfirm, onClose }: {
  row: RawRow; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-6 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500 flex items-center justify-center shadow-lg mb-4">
            <Trash2 size={24} className="text-white" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-1">Supprimer cette intervention ?</h3>
          <p className="text-sm text-slate-500 mb-3">Action irréversible.</p>
          <div className="p-3 bg-rose-50 rounded-xl text-left">
            <p className="text-xs font-bold text-rose-800 truncate">
              « {row.titre || 'Sans titre'} »
            </p>
            <p className="text-[11px] text-rose-600 mt-0.5">
              {row.atelier} · {row.frequence}
            </p>
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all">
            Annuler
          </button>
          <button onClick={onConfirm}
            className="flex-1 px-4 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-sm font-bold shadow-sm transition-all">
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Month Conflict Modal ───
function MonthConflictModal({ conflictingMonths, year, onChoose, onClose }: {
  conflictingMonths: MonthlyPlanInfo[]; year: number;
  onChoose: (action: ExistingAction) => void; onClose: () => void;
}) {
  const totalExisting = conflictingMonths.reduce((s, m) => s + m.count, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">

        <div className="bg-gradient-to-br from-amber-500 to-orange-500 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <AlertOctagon size={22} className="text-white" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-bold text-amber-100/90 uppercase tracking-widest mb-0.5">
                Conflit détecté
              </p>
              <h2 className="text-base font-bold text-white">
                {conflictingMonths.length} mois avec plans existants
              </h2>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="p-4 bg-amber-50 rounded-xl">
            <div className="flex items-start gap-2.5">
              <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-800 mb-2">
                  Mois avec des interventions existantes :
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {conflictingMonths.map(m => (
                    <span key={m.month}
                      className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 bg-white rounded-lg font-bold text-amber-700">
                      {MONTH_NAMES[m.month]}
                      <span className="text-amber-500">({m.count})</span>
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-amber-600 mt-2 font-semibold">
                  Total : <strong>{totalExisting}</strong> intervention(s) en {year}
                </p>
              </div>
            </div>
          </div>

          <p className="text-sm font-bold text-slate-700">Que souhaitez-vous faire ?</p>

          <div className="space-y-2.5">
            <button
              onClick={() => { onChoose('replace'); onClose(); }}
              className="w-full p-4 bg-white rounded-xl hover:bg-rose-50 ring-1 ring-rose-200 hover:ring-rose-400 transition-all text-left"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500 flex items-center justify-center shadow-sm shrink-0">
                  <Trash2 size={17} className="text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-800 text-sm">🔴 Remplacer (écraser)</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Supprime toutes les interventions existantes des mois concernés et les remplace.
                  </p>
                </div>
              </div>
            </button>

            <button
              onClick={() => { onChoose('merge'); onClose(); }}
              className="w-full p-4 bg-white rounded-xl hover:bg-blue-50 ring-1 ring-blue-200 hover:ring-blue-400 transition-all text-left"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1e2a5e] flex items-center justify-center shadow-sm shrink-0">
                  <Plus size={17} className="text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-800 text-sm">➕ Ajouter (fusionner)</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Conserve les interventions existantes et ajoute les nouvelles.
                  </p>
                </div>
              </div>
            </button>

            <button
              onClick={() => { onChoose('skip'); onClose(); }}
              className="w-full p-4 bg-white rounded-xl hover:bg-slate-50 ring-1 ring-slate-200 hover:ring-slate-400 transition-all text-left"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-500 flex items-center justify-center shadow-sm shrink-0">
                  <X size={17} className="text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-800 text-sm">⚪ Ignorer les mois existants</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    N'importe que dans les mois vides.
                  </p>
                </div>
              </div>
            </button>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button onClick={onClose}
            className="px-5 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-white transition-colors font-semibold">
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Scope Selector ───
function ScopeSelector({
  scope, setScope, startMonth, setStartMonth,
  numMonths, setNumMonths, year, existingMonths
}: {
  scope: PlanScope; setScope: (s: PlanScope) => void;
  startMonth: number; setStartMonth: (m: number) => void;
  numMonths: number; setNumMonths: (n: number) => void;
  year: number; existingMonths: MonthlyPlanInfo[];
}) {
  const selectableMonths = getSelectableMonths(year);
  const maxMonths = getMaxAvailableMonths(year, startMonth);

  useEffect(() => {
    if (numMonths > maxMonths) setNumMonths(maxMonths);
  }, [maxMonths, numMonths, setNumMonths]);

  const selectedRange: number[] = [];
  for (let i = 0; i < numMonths; i++) {
    const m = startMonth + i;
    if (m < 12) selectedRange.push(m);
  }

  const monthsWithData = selectedRange.filter(m =>
    existingMonths.find(em => em.month === m && em.hasData)
  );

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
          <span className="flex items-center gap-1.5">
            <Calendar size={11} className="text-slate-400" />Portée du plan
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setScope('annual')}
            className={`relative p-4 rounded-2xl text-left transition-all ${
              scope === 'annual'
                ? 'bg-blue-50 ring-2 ring-[#1e2a5e]'
                : 'bg-slate-50 hover:bg-blue-50'
            }`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                scope === 'annual' ? 'bg-[#1e2a5e]' : 'bg-white'
              }`}>
                <Calendar size={17} className={scope === 'annual' ? 'text-white' : 'text-slate-400'} />
              </div>
              <div>
                <p className={`text-sm font-bold ${scope === 'annual' ? 'text-[#1e2a5e]' : 'text-slate-700'}`}>
                  Année complète
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">Janvier → Décembre {year}</p>
              </div>
            </div>
            {scope === 'annual' && (
              <div className="absolute top-2 right-2"><CheckCircle2 size={14} className="text-[#1e2a5e]" /></div>
            )}
          </button>

          <button onClick={() => setScope('monthly')}
            className={`relative p-4 rounded-2xl text-left transition-all ${
              scope === 'monthly'
                ? 'bg-violet-50 ring-2 ring-violet-500'
                : 'bg-slate-50 hover:bg-violet-50'
            }`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                scope === 'monthly' ? 'bg-violet-500' : 'bg-white'
              }`}>
                <CalendarDays size={17} className={scope === 'monthly' ? 'text-white' : 'text-slate-400'} />
              </div>
              <div>
                <p className={`text-sm font-bold ${scope === 'monthly' ? 'text-violet-800' : 'text-slate-700'}`}>
                  Plage de mois
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">1 à 6 mois consécutifs</p>
              </div>
            </div>
            {scope === 'monthly' && (
              <div className="absolute top-2 right-2"><CheckCircle2 size={14} className="text-violet-500" /></div>
            )}
          </button>
        </div>
      </div>

      {scope === 'monthly' && (
        <div className="p-4 bg-violet-50 rounded-2xl space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-violet-700 uppercase tracking-wider mb-2">
              Mois de début
            </label>
            <div className="grid grid-cols-6 gap-1.5">
              {MONTH_NAMES.map((name, idx) => {
                const isSelectable = selectableMonths.includes(idx);
                const isStart = idx === startMonth;
                const isInRange = selectedRange.includes(idx);
                const hasData = existingMonths.find(em => em.month === idx && em.hasData);
                return (
                  <button key={idx}
                    onClick={() => isSelectable && setStartMonth(idx)}
                    disabled={!isSelectable}
                    title={!isSelectable ? 'Mois passé' : hasData ? `${hasData.count} intervention(s)` : name}
                    className={`relative py-2 px-1 rounded-lg text-[11px] font-bold transition-all ${
                      !isSelectable
                        ? 'bg-slate-100 text-slate-300 cursor-not-allowed line-through'
                        : isStart
                          ? 'bg-violet-600 text-white shadow-sm ring-2 ring-violet-300'
                          : isInRange
                            ? 'bg-violet-100 text-violet-800'
                            : 'bg-white text-slate-600 hover:bg-violet-50'
                    }`}>
                    {name.substring(0, 3)}
                    {hasData && isSelectable && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400 flex items-center justify-center text-[7px] font-bold text-white">!</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-bold text-violet-700 uppercase tracking-wider">
                Nombre de mois
              </label>
              <span className="text-xs font-bold text-violet-700 bg-white px-2.5 py-0.5 rounded-lg">
                {numMonths} mois · max {maxMonths}
              </span>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {[1,2,3,4,5,6].map(n => {
                const disabled = n > maxMonths;
                return (
                  <button key={n} onClick={() => !disabled && setNumMonths(n)}
                    disabled={disabled}
                    className={`py-2 rounded-lg text-xs font-bold transition-all ${
                      disabled
                        ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                        : numMonths === n
                          ? 'bg-violet-600 text-white shadow-sm'
                          : 'bg-white text-slate-600 hover:bg-violet-50'
                    }`}>
                    {n}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-3 bg-white rounded-xl">
            <p className="text-[10px] font-bold text-violet-600 uppercase mb-1.5">Période</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-violet-800">
                {MONTH_NAMES[startMonth]} →{' '}
                {MONTH_NAMES[selectedRange[selectedRange.length - 1] ?? startMonth]} {year}
              </span>
              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                {selectedRange.length} mois
              </span>
            </div>
            {monthsWithData.length > 0 && (
              <div className="mt-2 p-2 bg-amber-50 rounded-lg flex items-start gap-2">
                <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-700 font-semibold">
                  {monthsWithData.length} mois contient déjà des interventions.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Floating Action Bar ───
function FloatingActionBar({ row, onEdit, onDelete, onClose }: {
  row: RawRow; onEdit: () => void; onDelete: () => void; onClose: () => void;
}) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-slide-up">
      <div className="bg-white rounded-2xl shadow-2xl px-5 py-3.5 flex items-center gap-4">
        <button onClick={onClose}
          className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-all shrink-0">
          <X size={14} />
        </button>
        <div className="w-px h-8 bg-slate-200 shrink-0" />
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="text-[10px] px-2 py-0.5 rounded-lg bg-violet-100 text-violet-600 font-bold shrink-0">
            {row.atelier}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate max-w-[280px]">
              {row.titre || 'Sans titre'}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-slate-400">{row.frequence || '—'}</span>
              {row.errors.length > 0
                ? <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-600 font-bold">Bloquée</span>
                : <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-600 font-bold">OK</span>
              }
            </div>
          </div>
        </div>
        <div className="w-px h-8 bg-slate-200 shrink-0" />
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onEdit}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1e2a5e] hover:bg-[#2a3875] text-white text-xs font-bold shadow-md transition-all">
            <Pencil size={13} strokeWidth={2.5} />Modifier
          </button>
          <button onClick={onDelete}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold shadow-md transition-all">
            <Trash2 size={13} strokeWidth={2.5} />Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Full Table ───
function FullTable({ rows, selectedId, onSelectRow, showAtelier = false, onUploadTaches, onClearTaches }: {
  rows: RawRow[]; selectedId: string | null;
  onSelectRow: (id: string | null) => void; showAtelier?: boolean;
  onUploadTaches: (rowId: string, file: File) => void;
  onClearTaches: (rowId: string) => void;
}) {
  const handleFileChange = (rowId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUploadTaches(rowId, file);
    e.target.value = '';
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" style={{ minWidth: showAtelier ? '1600px' : '1500px' }}>
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            <th className="px-3 py-2.5 w-10 sticky left-0 bg-slate-50 z-20" />
            {showAtelier && (
              <th className="px-3 py-2.5 text-left font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                Onglet
              </th>
            )}
            {ALL_COLUMNS.map(col => (
              <th key={col.key}
                className={`px-3 py-2.5 text-left font-bold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap ${col.width}`}>
                {col.label}{col.required && <span className="text-rose-400 ml-0.5">*</span>}
              </th>
            ))}
            <th className="px-3 py-2.5 text-left font-bold text-slate-500 uppercase tracking-wider text-[10px]">Tâches</th>
            <th className="px-3 py-2.5 text-left font-bold text-slate-500 uppercase tracking-wider text-[10px]">Statut</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={ALL_COLUMNS.length + (showAtelier ? 4 : 3)}
                className="px-4 py-10 text-center text-slate-400 text-xs italic">
                Aucune intervention
              </td>
            </tr>
          )}
          {rows.map(r => {
            const hasErr = r.errors.length > 0;
            const hasTechW = r.techWarnings.length > 0;
            const isSel = selectedId === r.id;
            const tachesCount = r.taches?.length || 0;
            return (
              <tr key={r.id}
                onClick={() => onSelectRow(isSel ? null : r.id)}
                className={`cursor-pointer transition-all duration-150 ${
                  isSel
                    ? 'bg-blue-50 ring-2 ring-inset ring-[#1e2a5e]/30'
                    : hasErr
                      ? 'bg-rose-50/40 hover:bg-rose-50/70'
                      : hasTechW
                        ? 'bg-amber-50/30 hover:bg-amber-50/60'
                        : 'hover:bg-slate-50'
                }`}>
                <td className="px-3 py-2.5 sticky left-0 bg-inherit z-10 w-10">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                    isSel ? 'bg-[#1e2a5e]' : 'ring-2 ring-slate-300'
                  }`}>
                    {isSel && <CheckCircle2 size={11} className="text-white" strokeWidth={3} />}
                  </div>
                </td>
                {showAtelier && (
                  <td className="px-3 py-2.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded-lg font-bold ${
                      r.atelier_id ? 'bg-violet-50 text-violet-600' : 'bg-rose-50 text-rose-600'
                    }`}>{r.atelier}</span>
                  </td>
                )}
                {ALL_COLUMNS.map(col => {
                  const val = r[col.key as keyof RawRow] as string | number;
                  const hasFieldErr = !!r.fieldErrors[col.key];
                  return (
                    <td key={col.key} className={`px-3 py-2.5 ${col.width}`}>
                      <div className={`text-xs ${hasFieldErr ? 'text-rose-600 font-semibold' : 'text-slate-700'}`}>
                        {col.key === 'mode' && (
                          <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg font-bold ${
                            val === 'NUIT' ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'
                          }`}>
                            {val === 'NUIT' ? '🌙' : '☀️'} {val || '—'}
                          </span>
                        )}
                        {col.key === 'consignation' && (
                          val === 'OUI'
                            ? <span className="inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-lg font-bold bg-rose-50 text-rose-600">
                                <Shield size={9} />OUI
                              </span>
                            : <span className="text-slate-400 text-[10px]">NON</span>
                        )}
                        {col.key === 'techniciens_noms' && (
                          <span className="flex items-start gap-1">
                            <span className="truncate max-w-[150px] block">
                              {val || <span className="text-slate-300 italic">—</span>}
                            </span>
                            {r.techWarnings.length > 0 && (
                              <span title={r.techWarnings.join('\n')} className="text-amber-500 cursor-help shrink-0">⚠️</span>
                            )}
                          </span>
                        )}
                        {!['mode','consignation','techniciens_noms'].includes(col.key) && (
                          <span className={`block truncate max-w-[200px] ${
                            !val && val !== 0 ? 'text-slate-300 italic' : ''
                          }`}>
                            {(val !== '' && val !== 0) ? String(val) : '—'}
                          </span>
                        )}
                        {hasFieldErr && (
                          <span className="block text-[9px] text-rose-400 mt-0.5">
                            ⚠ {r.fieldErrors[col.key]}
                          </span>
                        )}
                      </div>
                    </td>
                  );
                })}
                {/* Colonne Tâches */}
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-1.5">
                    {tachesCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg font-bold bg-emerald-50 text-emerald-700">
                        <ClipboardCheck size={9} />{tachesCount}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-300">—</span>
                    )}
                    <label
                      className="cursor-pointer p-1 rounded hover:bg-blue-50 text-slate-400 hover:text-[#1e2a5e] transition-all"
                      title="Uploader le fichier Excel des tâches">
                      <FileUp size={11} />
                      <input type="file" accept=".xlsx,.xls" className="hidden"
                        onChange={(e) => handleFileChange(r.id, e)} />
                    </label>
                    {tachesCount > 0 && (
                      <button onClick={() => onClearTaches(r.id)}
                        className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-all"
                        title="Supprimer les tâches">
                        <X size={11} />
                      </button>
                    )}
                  </div>
                </td>
                {/* Statut */}
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {hasErr
                    ? <span className="text-[10px] px-2 py-0.5 rounded-lg font-bold bg-rose-100 text-rose-700">❌ Bloquée</span>
                    : hasTechW
                      ? <span className="text-[10px] px-2 py-0.5 rounded-lg font-bold bg-amber-100 text-amber-700">⚠️ Atelier</span>
                      : r.warnings.length > 0
                        ? <span className="text-[10px] px-2 py-0.5 rounded-lg font-bold bg-amber-50 text-amber-600">⚠️ OK</span>
                        : <span className="text-[10px] px-2 py-0.5 rounded-lg font-bold bg-emerald-100 text-emerald-700">✅ OK</span>
                  }
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
// ═══════════════════════════════════════════════
// ACCESS GUARD
// ═══════════════════════════════════════════════
export default function ImportExcel() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const role = (profile?.role ?? '').trim().toLowerCase();
  const canChooseUnite = role === 'admin' || role === 'super_admin';
  const isUnitRole = role === 'responsable_unite' || role === 'charge_unite';

  if (isUnitRole) {
    return (
      <div className="bg-slate-100 min-h-[calc(100vh-60px)] flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-lg p-10 flex flex-col items-center gap-4 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-500 flex items-center justify-center shadow-md">
            <Lock size={28} className="text-white" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Accès refusé</h2>
          <p className="text-sm text-slate-500">
            L'import Excel est réservé aux{' '}
            <strong className="text-[#1e2a5e]">Admin</strong> et{' '}
            <strong className="text-rose-600">Super Admin</strong>.
          </p>
          <button onClick={() => navigate('/planification')}
            className="mt-2 px-5 py-2.5 bg-[#1e2a5e] hover:bg-[#2a3875] text-white rounded-xl text-sm font-bold shadow-sm transition-all">
            ← Retour au tableau de bord
          </button>
        </div>
      </div>
    );
  }

  return <ImportExcelInner profile={profile} canChooseUnite={canChooseUnite} />;
}

// ═══════════════════════════════════════════════
// INNER COMPONENT
// ═══════════════════════════════════════════════
function ImportExcelInner({ profile, canChooseUnite }: {
  profile: any; canChooseUnite: boolean;
}) {
  const navigate = useNavigate();

  // ─── Refs (stables à travers les closures async) ───
  const predFileInputRef = useRef<HTMLInputElement>(null);
  const rawDataRef     = useRef<RawRow[]>([]);
  const occurrencesRef = useRef<Occurrence[]>([]);
  const uniteIdRef     = useRef('');

  // ─── Master data ───
  const [unites, setUnites]           = useState<Unite[]>([]);
  const [ateliers, setAteliers]       = useState<Atelier[]>([]);
  const [holidays, setHolidays]       = useState<JourFerie[]>([]);
  const [dbTechniciens, setDbTechniciens] = useState<DbTechnicien[]>([]);

  // ─── Plan config ───
  const [selectedUnite, setSelectedUnite] = useState('');
  const [planYear, setPlanYear]       = useState(new Date().getFullYear() + 1);
  const [planYearInput, setPlanYearInput] = useState(String(new Date().getFullYear() + 1));
  const [mode, setMode]               = useState<'new' | 'duplicate'>('new');
  const [sourceYear, setSourceYear]   = useState(new Date().getFullYear());
  const [sourcePlanId, setSourcePlanId] = useState<number | null>(null);
  const [planScope, setPlanScope]     = useState<PlanScope>('annual');
  const [startMonth, setStartMonth]   = useState<number>(new Date().getMonth());
  const [numMonths, setNumMonths]     = useState<number>(1);

  // ─── Data ───
  const [rawData, setRawData]         = useState<RawRow[]>([]);
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [fileName, setFileName]       = useState('');

  // ─── UI state ───
  const [step, setStep]               = useState(0);
  const [importing, setImporting]     = useState(false);
  const [result, setResult]           = useState<ImportResult | null>(null);
  const [published, setPublished]     = useState(false);
  const [error, setError]             = useState('');
  const [isDragging, setIsDragging]   = useState(false);
  const [loadingDup, setLoadingDup]   = useState(false);
  const [countdown, setCountdown]     = useState(5);
  const [maxHoursPerDay, setMaxHoursPerDay] = useState(5);
  const [toast, setToast]             = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // ─── Year/month state ───
  const [availableYears, setAvailableYears]   = useState<number[]>([]);
  const [existingYears, setExistingYears]     = useState<number[]>([]);
  const [existingMonths, setExistingMonths]   = useState<MonthlyPlanInfo[]>([]);
  const [monthConflictAction, setMonthConflictAction] = useState<ExistingAction>(null);
  const [showMonthConflictModal, setShowMonthConflictModal] = useState(false);

  // ─── Table UI ───
  const [searchFilter, setSearchFilter]     = useState('');
  const [codeEquipFilter, setCodeEquipFilter] = useState('');
  const [activeAtelier, setActiveAtelier]   = useState<string | null>(null);
  const [collapsedAteliers, setCollapsedAteliers] = useState<Set<string>>(new Set());
  const [selectedRowId, setSelectedRowId]   = useState<string | null>(null);
  const [editingRow, setEditingRow]         = useState<RawRow | null>(null);
  const [deletingRow, setDeletingRow]       = useState<RawRow | null>(null);

  // ─── Auto-load tâches ───
  const [autoLoadingTaches, setAutoLoadingTaches] = useState(false);
  const [shouldAutoLoad, setShouldAutoLoad]   = useState(false);

  // ─── Congés ───
  const [congeConflicts, setCongeConflicts]   = useState<CongeConflict[]>([]);
  const [loadingConges, setLoadingConges]     = useState(false);
  const [techDispoCharges, setTechDispoCharges] = useState<TechDispoCharge[]>([]);
  const [showCongeStep, setShowCongeStep]     = useState(false);

  // ─── Prédiction des congés (optionnelle, avant génération du plan) ───
  const [showCongePrediction, setShowCongePrediction] = useState(false);
  const [predTechId, setPredTechId]     = useState('');
  const [predDateDebut, setPredDateDebut] = useState('');
  const [predDateFin, setPredDateFin]     = useState('');
  const [predMotif, setPredMotif]         = useState('Congé annuel');
  const [predRows, setPredRows]           = useState<{ technicien_id: number; nom: string; date_debut: string; date_fin: string; motif: string }[]>([]);
  const [predSaving, setPredSaving]       = useState(false);
  const [predMsg, setPredMsg]             = useState('');
  // ─── Édition d'une ligne de congé prévisionnel déjà ajoutée à la liste ───
  const [editingPredIdx, setEditingPredIdx] = useState<number | null>(null);
  const [editPredDateDebut, setEditPredDateDebut] = useState('');
  const [editPredDateFin, setEditPredDateFin]     = useState('');
  const [editPredMotif, setEditPredMotif]         = useState('Congé annuel');

  // ─── Pending navigation to step 3 (après choix conflit mois) ───
  const [pendingGoStep3, setPendingGoStep3]   = useState(false);

  // ─── Computed ───
  const selectedRow = rawData.find(r => r.id === selectedRowId) ?? null;
  const effectiveUniteId = canChooseUnite
    ? selectedUnite
    : (profile?.unite_id ? String(profile.unite_id) : '');
  const effectiveUnite = unites.find(u => u.id === Number(effectiveUniteId));
  const thisYear = new Date().getFullYear();

  const validRows  = useMemo(() => rawData.filter(r => !r.excluded), [rawData]);
  const errorRows  = useMemo(() => rawData.filter(r => r.excluded), [rawData]);
  const warnRows   = useMemo(() => rawData.filter(r => !r.excluded && r.techWarnings.length > 0), [rawData]);
  const overloads  = useMemo(() => computeOverloads(validRows, occurrences, maxHoursPerDay), [validRows, occurrences, maxHoursPerDay]);
  // Charge totale (plan entier) par technicien : sert à proposer les moins chargés
  // en premier lors d'une réaffectation (manuelle ou automatique).
  const techTotalCharge = useMemo(() => computeTechTotalCharge(validRows, occurrences), [validRows, occurrences]);
  const [expandedOverload, setExpandedOverload] = useState<Set<number>>(new Set());
  const [autoBalancing, setAutoBalancing] = useState(false);
  const totalTaches    = useMemo(() => rawData.reduce((s, r) => s + (r.taches?.length || 0), 0), [rawData]);
  const rowsWithTaches = useMemo(() => rawData.filter(r => (r.taches?.length || 0) > 0).length, [rawData]);
  // Chaque intervention valide doit avoir au moins une tâche (importée depuis
  // la fiche d'inspection ou ajoutée manuellement) avant de pouvoir passer à
  // l'étape de consolidation.
  const rowsMissingTaches = useMemo(
    () => validRows.filter(r => (r.taches?.length || 0) === 0),
    [validRows]
  );

  const cs = useMemo(() => ({
    noConflict:       occurrences.filter(o => o.conflictType === 'none'),
    weekendConflicts: occurrences.filter(o => o.conflictType === 'weekend'),
    ferieConflicts:   occurrences.filter(o => o.conflictType === 'ferie'),
    ferieLendemain:   occurrences.filter(o => o.conflictType === 'ferie_lendemain'),
    needsReschedule:  occurrences.filter(o => o.needsReschedule),
  }), [occurrences]);

  const atelierGroups = useMemo(() => rawData.reduce<Record<string, RawRow[]>>((acc, row) => {
    if (!acc[row.atelier]) acc[row.atelier] = [];
    acc[row.atelier].push(row);
    return acc;
  }, {}), [rawData]);
  const atelierList = useMemo(() => Object.keys(atelierGroups), [atelierGroups]);

  const isFiltering = searchFilter.trim() !== '' || codeEquipFilter.trim() !== '';
  const filteredData = useMemo(() => rawData.filter(r => {
    const matchSearch = !searchFilter.trim() ||
      r.titre.toLowerCase().includes(searchFilter.toLowerCase());
    const matchEquip = !codeEquipFilter.trim() ||
      r.code_gmao.toLowerCase().includes(codeEquipFilter.toLowerCase()) ||
      r.equipement.toLowerCase().includes(codeEquipFilter.toLowerCase());
    const matchAtelier = isFiltering ? true : !activeAtelier || r.atelier === activeAtelier;
    return matchSearch && matchEquip && matchAtelier;
  }), [rawData, searchFilter, codeEquipFilter, isFiltering, activeAtelier]);

  // Un plan annuel existant pour l'année choisie ne bloque plus l'import : on
  // propose désormais explicitement à l'utilisateur de le modifier (remplacer)
  // via une confirmation dédiée (showAnnualReplaceModal), au lieu d'empêcher
  // purement et simplement toute nouvelle importation sur cette année.
  const yearIsBlocked = false;
  const annualPlanExists = mode === 'new'
    && planScope === 'annual'
    && existingYears.includes(planYear);
  const annualExistingCount = useMemo(
    () => existingMonths.reduce((s, m) => s + (m.count || 0), 0),
    [existingMonths]
  );

  const conflictingMonths = useMemo(() => {
    if (!existingYears.includes(planYear)) return [];
    if (planScope === 'annual') {
      // Portée annuelle : tous les mois de l'année sont potentiellement concernés.
      return existingMonths.filter(em => em.hasData);
    }
    if (planScope !== 'monthly') return [];
    const range: number[] = [];
    for (let i = 0; i < numMonths; i++) {
      const m = startMonth + i;
      if (m < 12) range.push(m);
    }
    return existingMonths.filter(em => range.includes(em.month) && em.hasData);
  }, [planScope, existingYears, planYear, startMonth, numMonths, existingMonths]);

  const scopeLabel = planScope === 'monthly'
    ? `${MONTH_NAMES[startMonth]}${
        numMonths > 1
          ? ` → ${MONTH_NAMES[Math.min(startMonth + numMonths - 1, 11)]}`
          : ''
      } ${planYear}`
    : `${planYear}`;

  const stepLabels = [
    'Choix', 'Source', 'Vérification', 'Consolidation',
    'Conflits', 'Congés & Surcharge', 'Récapitulatif', 'Résultat'
  ];

  // Navigation via le stepper : seules les étapes déjà franchies sont cliquables
  // (on ne permet pas de sauter en avant vers une étape pas encore validée).
  const goToStep = useCallback((s: number) => {
    if (s === 5) setShowCongeStep(false); // ré-atterrit sur la sous-étape Surcharge (fin de l'étape 5)
    setStep(s);
  }, []);

  const labelCls  = "block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5";
  const fieldWrap = "space-y-1.5";
  const selectCls = "w-full rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 focus:bg-white transition-all outline-none focus:ring-2 focus:ring-[#1e2a5e]/20 border border-transparent focus:border-[#1e2a5e]/30 appearance-none cursor-pointer";

  // ─── Sync refs ───
  useEffect(() => { rawDataRef.current = rawData; }, [rawData]);
  useEffect(() => { occurrencesRef.current = occurrences; }, [occurrences]);
  useEffect(() => { uniteIdRef.current = effectiveUniteId; }, [effectiveUniteId]);

  // ─── Countdown après publication ───
  useEffect(() => {
    if (!published) return;
    if (countdown <= 0) { navigate('/planification'); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [published, countdown, navigate]);

  // ─── Escape key ───
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editingRow)        setEditingRow(null);
      else if (deletingRow)  setDeletingRow(null);
      else if (selectedRowId) setSelectedRowId(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editingRow, deletingRow, selectedRowId]);

  // ─── Toast auto-dismiss ───
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ─── Initial data load ───
  useEffect(() => {
    Promise.all([
      supabase.from('unites').select('*').order('code'),
      supabase.from('ateliers').select('*').order('code'),
      supabase.from('jours_feries').select('*').order('date'),
      supabase.from('plan_annuel').select('annee, unite_id'),
    ]).then(([{ data: u }, { data: a }, { data: h }, { data: pa }]) => {
      if (u) setUnites(u);
      if (a) setAteliers(a);
      if (h) setHolidays(h);
      if (pa?.length) {
        const years = [...new Set(pa.map(r => r.annee))].sort((a, b) => b - a);
        setAvailableYears(years);
        if (years.length > 0) setSourceYear(years[0]);
      }
    });
  }, []);

  // ─── Auto-set unite for non-admin ───
  useEffect(() => {
    if (!canChooseUnite && profile?.unite_id && unites.length > 0) {
      setSelectedUnite(String(profile.unite_id));
    }
  }, [canChooseUnite, profile?.unite_id, unites]);

  // ─── Load existing years for unite ───
  useEffect(() => {
    if (!effectiveUniteId) { setExistingYears([]); return; }
    supabase
      .from('plan_annuel')
      .select('annee')
      .eq('unite_id', Number(effectiveUniteId))
      .then(({ data }) => {
        if (data) setExistingYears(data.map(r => r.annee));
      });
  }, [effectiveUniteId]);

  // ─── Load existing months for (unite, year) ───
  useEffect(() => {
    if (!effectiveUniteId || !existingYears.includes(planYear)) {
      setExistingMonths([]);
      return;
    }
    supabase
      .from('plan_annuel')
      .select('id')
      .eq('unite_id', Number(effectiveUniteId))
      .eq('annee', planYear)
      .maybeSingle()
      .then(({ data: plan }) => {
        if (!plan) { setExistingMonths([]); return; }
        supabase
          .from('planning')
          .select('date_prevue')
          .eq('plan_annuel_id', plan.id)
          .then(({ data }) => {
            const counts: Record<number, number> = {};
            (data || []).forEach(p => {
              const m = new Date(p.date_prevue + 'T00:00:00').getMonth();
              counts[m] = (counts[m] || 0) + 1;
            });
            const months: MonthlyPlanInfo[] = Array.from({ length: 12 }, (_, m) => {
              const c = counts[m] || 0;
              return { month: m, count: c, hasData: c > 0, status: c === 0 ? 'empty' : c < 5 ? 'partial' : 'full' };
            });
            setExistingMonths(months);
          });
      });
  }, [effectiveUniteId, planYear, existingYears]);

  // ─── Load techniciens for unite ───
  useEffect(() => {
    if (!effectiveUniteId) { setDbTechniciens([]); return; }
    supabase
      .from('techniciens')
      .select('id, nom, prenom, atelier_id, unite_id, statut, ateliers(code)')
      .eq('unite_id', Number(effectiveUniteId))
      .eq('statut', 'actif')
      .then(({ data }) => {
        if (data) {
          setDbTechniciens(data.map((t: any) => ({
            id: t.id, nom: t.nom, prenom: t.prenom,
            atelier_id: t.atelier_id,
            atelier_code: t.ateliers?.code || '',
            unite_id: t.unite_id, statut: t.statut,
          })));
        }
      });
  }, [effectiveUniteId]);

  // ─── Callbacks ───

  const techMap = useMemo(() => {
    const map = new Map<string, DbTechnicien>();
    dbTechniciens.forEach(t => {
      map.set(`${t.prenom} ${t.nom}`.toLowerCase().trim(), t);
      map.set(`${t.nom} ${t.prenom}`.toLowerCase().trim(), t);
      map.set(t.nom.toLowerCase().trim(), t);
    });
    return map;
  }, [dbTechniciens]);

  const validateRow = useCallback((row: Partial<RawRow>) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const techWarnings: string[] = [];
    const fieldErrors: Record<string, string> = {};

    if (!row.titre?.trim()) {
      errors.push('Titre manquant');
      fieldErrors.titre = 'Obligatoire';
    }
    if (!row.frequence?.trim()) {
      errors.push('Fréquence manquante');
      fieldErrors.frequence = 'Obligatoire';
    } else if (!FREQUENCES.includes(row.frequence as Frequence)) {
      errors.push('Fréquence invalide');
      fieldErrors.frequence = `Valeurs : ${FREQUENCES.join(', ')}`;
    }
    if (!row.date_debut?.trim()) {
      errors.push('Date_Debut manquante');
      fieldErrors.date_debut = 'Obligatoire (AAAA-MM-JJ)';
    } else if (!parseDateFR(row.date_debut)) {
      errors.push('Date_Debut invalide');
      fieldErrors.date_debut = 'Format : AAAA-MM-JJ ou JJ/MM/AAAA';
    }
    if (row.temps_h !== undefined && (isNaN(row.temps_h) || row.temps_h <= 0)) {
      warnings.push('Temps_h invalide ou nul');
    }
    if (!row.atelier_id) warnings.push(`Atelier "${row.atelier}" non reconnu`);

    if (row.techniciens_noms?.trim() && row.atelier_id && dbTechniciens.length > 0) {
      row.techniciens_noms.split(/[,;]/).map(s => s.trim()).filter(Boolean).forEach(name => {
        const dbTech = techMap.get(name.toLowerCase().trim());
        if (!dbTech) {
          techWarnings.push(`"${name}" : introuvable`);
        } else if (dbTech.atelier_id !== row.atelier_id) {
          techWarnings.push(`"${name}" : atelier ${dbTech.atelier_code} ≠ ${row.atelier}`);
        }
      });
    }

    return { errors, warnings, techWarnings, fieldErrors };
  }, [techMap, dbTechniciens]);

  // ─── Auto-load toutes les fiches ───

  const autoLoadAllTaches = useCallback(async (force = false) => {
    const currentRows = rawDataRef.current.length > 0 ? rawDataRef.current : rawData;
    // force=true (clic explicite sur « Recharger ») : on re-fetch même les lignes déjà
    // chargées, sinon le bouton « Recharger toutes les fiches » ne rechargerait jamais
    // rien pour les lignes déjà remplies — ce qui contredit son propre intitulé.
    const rowsToLoad = currentRows.filter(
      r => r.fiche_inspection?.trim() && (force || !r.taches || r.taches.length === 0)
    );

    if (rowsToLoad.length === 0) {
      setToast({ type: 'success', msg: 'Aucune fiche_inspection à charger (ou déjà chargées)' });
      return;
    }

    setAutoLoadingTaches(true);
    setToast({ type: 'success', msg: `⏳ Chargement de ${rowsToLoad.length} fiche(s)...` });

    let successCount = 0;
    let failedCount = 0;
    const updates: Record<string, ParsedTache[]> = {};

    const results = await Promise.allSettled(
      rowsToLoad.map(row => parseTachesFromServer(row.fiche_inspection))
    );

    results.forEach((result, idx) => {
      const row = rowsToLoad[idx];
      if (result.status === 'fulfilled' && result.value.length > 0) {
        updates[row.id] = result.value;
        successCount++;
      } else {
        if (result.status === 'rejected') {
          console.error(`Erreur chargement tâches pour "${row.titre}":`, result.reason);
        }
        failedCount++;
      }
    });

    if (Object.keys(updates).length > 0) {
      setRawData(prev => prev.map(r =>
        updates[r.id] ? { ...r, taches: updates[r.id] } : r
      ));
      const totalT = Object.values(updates).reduce((s, t) => s + t.length, 0);
      setToast({
        type: 'success',
        msg: `✅ ${totalT} tâches chargées depuis ${successCount} fiche(s)${failedCount > 0 ? ` · ${failedCount} échec(s)` : ''}`
      });
    } else if (failedCount > 0) {
      setToast({
        type: 'error',
        msg: `❌ Aucune fiche chargée (${failedCount} échecs). Vérifiez que le serveur est démarré.`
      });
    }

    setAutoLoadingTaches(false);
  }, [rawData]);

  // Déclencher l'auto-chargement après que rawData est mis à jour
  useEffect(() => {
    if (shouldAutoLoad && rawData.length > 0 && !autoLoadingTaches) {
      setShouldAutoLoad(false);
      autoLoadAllTaches();
    }
  }, [shouldAutoLoad, rawData, autoLoadingTaches, autoLoadAllTaches]);

  // ─── Trigger goToStep3 après monthConflictAction mis à jour ───
  useEffect(() => {
    if (pendingGoStep3 && monthConflictAction !== null) {
      setPendingGoStep3(false);
      goToStep3();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingGoStep3, monthConflictAction]);

  // ─── Upload tâches par intervention ───
  const handleUploadTaches = useCallback(async (rowId: string, file: File) => {
    try {
      const taches = await parseTachesFromExcel(file);
      if (taches.length === 0) {
        setToast({ type: 'error', msg: `Aucune tâche trouvée dans "${file.name}"` });
        return;
      }

      const targetRow = rawData.find(r => r.id === rowId);

      setRawData(prev => prev.map(r =>
        r.id === rowId ? { ...r, taches } : r
      ));

      setToast({
        type: 'success',
        msg: `✅ ${taches.length} tâche(s) importée(s)${targetRow?.titre ? ` pour "${targetRow.titre}"` : ''}`
      });
    } catch (err: any) {
      setToast({ type: 'error', msg: 'Erreur : ' + err.message });
    }
  }, [rawData]);

  const handleClearTaches = useCallback((rowId: string) => {
    setRawData(prev => prev.map(r =>
      r.id === rowId ? { ...r, taches: [] } : r
    ));
    setToast({ type: 'success', msg: 'Tâches supprimées pour cette intervention' });
  }, []);

  // ─── Process uploaded file ───
  const processFile = useCallback((file: File) => {
    setFileName(file.name);
    setError('');

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary', cellDates: true });
        const rows: RawRow[] = [];
        let counter = 0;

        wb.SheetNames.forEach(sheetName => {
          const ws = wb.Sheets[sheetName];
          const jsonData = parseSheetSkippingHeaders(ws);
          if (!jsonData.length) return;

          // Le catalogue d'ateliers est global (pas de unite_id) : chaque unité couvre
          // tous les ateliers, la correspondance se fait donc simplement par code/nom.
          const atelier = ateliers.find(a =>
            a.code.toUpperCase() === sheetName.toUpperCase() ||
            a.nom.toUpperCase() === sheetName.toUpperCase()
          );

          jsonData.forEach(row => {
            const titre = String(getCell(row, 'titre', 'title') ?? '').trim();
            if (!titre) return;

            const rawDate = getCell(row, 'date_debut', 'date', 'date_prevue');
            let dateStr = '';
            if (rawDate instanceof Date) dateStr = formatDateISO(rawDate);
            else {
              const p = parseDateFR(rawDate);
              dateStr = p ? formatDateISO(p) : String(rawDate ?? '').trim();
            }

            const rawFreq = String(getCell(row, 'frequence') ?? '').trim();
            const normFreq = normalizeFrequence(rawFreq);

            const r: RawRow = {
              id: `${sheetName}-${counter++}`,
              atelier: sheetName,
              atelier_id: atelier?.id ?? null,
              titre,
              frequence: normFreq || rawFreq,
              temps_h: parseFloat(String(getCell(row, 'temps_h', 'temps', 'tempsh') ?? '0')) || 0,
              temps_logistique: (() => {
                const raw = getCell(row, 'temps_logistique', 'tempslogistique', 'logistique');
                if (raw === undefined || raw === null || String(raw).trim() === '') return undefined;
                const n = parseFloat(String(raw).replace(',', '.'));
                return !isNaN(n) && n >= 0 ? n : undefined;
              })(),
              materiel: String(getCell(row, 'materiel') ?? '').trim(),
              outillage: String(getCell(row, 'outillage') ?? '').trim(),
              fiche_inspection: String(getCell(row, 'fiche_inspection', 'ficheinspection') ?? '').trim(),
              mode: String(getCell(row, 'mode') ?? 'JOUR').trim().toUpperCase(),
              consignation: String(getCell(row, 'consignation') ?? 'NON').trim().toUpperCase(),
              consignation_motif: String(getCell(row, 'consignation_motif', 'consignationmotif') ?? '').trim(),
              techniciens_noms: String(getCell(row, 'techniciens') ?? '').trim(),
              date_debut: dateStr,
              dates_exceptionnelles: String(getCell(row, 'dates_exceptionnelles', 'datesexceptionnelles') ?? '').trim(),
              equipement: String(getCell(row, 'equipement') ?? '').trim(),
              code_gmao: String(getCell(row, 'code_gmao', 'codegmao') ?? '').trim(),
              num_shift: parseInt(String(getCell(row, 'num_shift', 'numshift') ?? '1')) || 1,
              fieldErrors: {},
              errors: [],
              warnings: [],
              techWarnings: [],
              excluded: false,
              taches: [],
            };

            const v = validateRow(r);
            Object.assign(r, v);
            r.excluded = v.errors.length > 0;

            rows.push(r);
          });
        });

        if (!rows.length) {
          setError('Aucune donnée valide trouvée dans le fichier.');
          return;
        }

        setRawData(rows);
        setOccurrences([]);
        setActiveAtelier(rows[0]?.atelier ?? null);
        setCollapsedAteliers(new Set());
        setSearchFilter('');
        setCodeEquipFilter('');
        setSelectedRowId(null);
        setStep(2);

        // Lancer le chargement auto des fiches d'inspection en arrière-plan
        const rowsWithFiches = rows.filter(r => r.fiche_inspection?.trim());
        if (rowsWithFiches.length > 0) {
          setToast({
            type: 'success',
            msg: `⏳ Chargement automatique de ${rowsWithFiches.length} fiche(s) d'inspection…`
          });
          setShouldAutoLoad(true);
        }
      } catch (err) {
        setError('Erreur lecture fichier : ' + (err as Error).message);
      }
    };

    reader.readAsBinaryString(file);
  }, [ateliers, validateRow]);

  // ─── Load duplicate ───
  const loadDuplicate = useCallback(async () => {
    if (!effectiveUniteId) { setError('Sélectionnez une unité.'); return; }
    setLoadingDup(true);
    setError('');

    try {
      const { data: sourcePlan } = await supabase
        .from('plan_annuel').select('id')
        .eq('unite_id', Number(effectiveUniteId))
        .eq('annee', sourceYear).maybeSingle();

      if (!sourcePlan) throw new Error(`Aucun plan pour ${sourceYear}.`);
      setSourcePlanId(sourcePlan.id);

      const { data, error: dbErr } = await supabase
        .from('planning').select('*').eq('plan_annuel_id', sourcePlan.id);

      if (dbErr) throw new Error(dbErr.message);
      if (!data?.length) throw new Error(`Aucune intervention pour ${sourceYear}.`);

      const uniqueMap = new Map<string, any>();
      data.forEach(row => {
        const key = `${row.atelier_id}::${row.titre}::${row.frequence}`;
        if (!uniqueMap.has(key)) uniqueMap.set(key, row);
      });

      const rawRows: RawRow[] = Array.from(uniqueMap.values()).map((row, idx) => {
        const atelier = ateliers.find(a => a.id === row.atelier_id);
        const orig = new Date(row.date_prevue);
        const newDate = new Date(planYear, orig.getMonth(), orig.getDate());

        const r: RawRow = {
          id: `dup-${idx}`,
          atelier: atelier?.code ?? '',
          atelier_id: row.atelier_id,
          titre: row.titre || '',
          frequence: row.frequence || '',
          temps_h: Number(row.duree_intervention) || 0,
          temps_logistique: row.temps_logistique != null ? Number(row.temps_logistique) : undefined,
          materiel: row.materiel_libre || '',
          outillage: row.outillage_libre || '',
          fiche_inspection: row.fiche_inspection || '',
          mode: (row.jour_nuit || 'Jour').toUpperCase(),
          consignation: (row.consignation || 'Non').toUpperCase(),
          consignation_motif: row.consignation_motif || '',
          techniciens_noms: '',
          date_debut: formatDateISO(newDate),
          dates_exceptionnelles: '',
          equipement: row.equipement || '',
          code_gmao: row.code_gmao || '',
          num_shift: row.num_shift || 1,
          fieldErrors: {}, errors: [], warnings: [], techWarnings: [],
          excluded: false, taches: [],
        };

        const v = validateRow(r);
        Object.assign(r, v);
        r.excluded = v.errors.length > 0;
        return r;
      });

      setRawData(rawRows);
      setOccurrences([]);
      setFileName(`Duplication ${sourceYear} → ${planYear}`);
      setActiveAtelier(rawRows[0]?.atelier ?? null);
      setCollapsedAteliers(new Set());
      setSearchFilter('');
      setCodeEquipFilter('');
      setSelectedRowId(null);
      setStep(2);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingDup(false);
    }
  }, [effectiveUniteId, sourceYear, planYear, ateliers, validateRow]);

  // ─── Save edit ───
  const handleSaveEdit = useCallback((updated: RawRow) => {
    const v = validateRow(updated);
    const finalRow: RawRow = { ...updated, ...v, excluded: v.errors.length > 0 };
    setRawData(prev => prev.map(r => r.id === finalRow.id ? finalRow : r));
    setEditingRow(null);
  }, [validateRow]);

  // ─── Delete ───
  const handleConfirmDelete = useCallback(() => {
    if (!deletingRow) return;
    setRawData(prev => prev.filter(r => r.id !== deletingRow.id));
    if (selectedRowId === deletingRow.id) setSelectedRowId(null);
    setDeletingRow(null);
  }, [deletingRow, selectedRowId]);

  // ─── Add row ───
  const addRow = useCallback((atelier: string) => {
    const atelierObj = ateliers.find(
      a => a.code.toUpperCase() === atelier.toUpperCase()
    );
    const newRow = createEmptyRow(atelier, atelierObj);
    setRawData(prev => [...prev, newRow]);
    setEditingRow(newRow);
  }, [ateliers]);

  // ─── Go to step 3 (générer les occurrences) ───
  const goToStep3 = useCallback(() => {
    const currentValidRows = rawData.filter(r => !r.excluded);
    const currentErrorRows = rawData.filter(r => r.excluded);

    if (currentValidRows.length === 0) {
      setError('Aucune intervention valide.');
      return;
    }
    if (currentErrorRows.length > 0) {
      const ok = window.confirm(
        `${currentErrorRows.length} ligne(s) bloquée(s) seront ignorée(s). Continuer ?`
      );
      if (!ok) return;
    }

    const { start: periodStart, end: periodEnd } = getPlanPeriod(
      planScope, planYear, startMonth, numMonths
    );
    const allOccs: Occurrence[] = [];
    rawData.filter(r => !r.excluded).forEach(r => {
      allOccs.push(...generateOccurrences(r, periodStart, periodEnd, holidays));
    });

    const scopedOccs = filterOccurrencesByScope(
      allOccs, planScope, planYear, startMonth, numMonths
    );
    if (scopedOccs.length === 0) {
      setError('Aucune occurrence dans la période sélectionnée.');
      return;
    }

    setOccurrences(scopedOccs);
    setStep(3);
  }, [rawData, planYear, holidays, planScope, startMonth, numMonths]);

  // ─── Reschedule ───
  const applyReschedule = useCallback((rowId: string, originalDate: string, newDate: string) => {
    setOccurrences(prev => prev.map(o =>
      o.rowId === rowId && o.date === originalDate
        ? { ...o, date: newDate, conflictType: 'none', conflictDetail: '', needsReschedule: false }
        : o
    ));
  }, []);

  const applyAllReschedules = useCallback((filterType?: 'weekend' | 'ferie' | 'all') => {
    setOccurrences(prev => prev.map(o => {
      if (!o.needsReschedule || !o.suggestedDate) return o;
      if (filterType && filterType !== 'all' && o.conflictType !== filterType) return o;
      return { ...o, date: o.suggestedDate, conflictType: 'none', conflictDetail: '', needsReschedule: false };
    }));
  }, []);

  // ─── Toggle atelier collapse ───
  const toggleAtelierCollapse = useCallback((atelier: string) => {
    setCollapsedAteliers(prev => {
      const next = new Set(prev);
      next.has(atelier) ? next.delete(atelier) : next.add(atelier);
      return next;
    });
  }, []);

  // ─── Prédiction des congés (période couverte par le plan à créer) ───
  const predPeriod = useMemo(
    () => getPlanPeriod(planScope, planYear, startMonth, numMonths),
    [planScope, planYear, startMonth, numMonths]
  );
  const predPeriodLabel = useMemo(() => {
    const f = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `${f(predPeriod.start)} → ${f(predPeriod.end)}`;
  }, [predPeriod]);

  const addPredRow = useCallback(() => {
    if (!predTechId || !predDateDebut || !predDateFin) return;
    if (predDateFin < predDateDebut) { setPredMsg('La date de fin doit être ≥ date de début.'); return; }
    const tech = dbTechniciens.find(t => t.id === Number(predTechId));
    if (!tech) return;
    setPredRows(prev => [...prev, {
      technicien_id: tech.id, nom: `${tech.prenom} ${tech.nom}`,
      date_debut: predDateDebut, date_fin: predDateFin, motif: predMotif,
    }]);
    setPredDateDebut(''); setPredDateFin(''); setPredMsg('');
  }, [predTechId, predDateDebut, predDateFin, predMotif, dbTechniciens]);

  const removePredRow = useCallback((idx: number) => {
    setPredRows(prev => prev.filter((_, i) => i !== idx));
    setEditingPredIdx(current => {
      if (current === null) return current;
      if (current === idx) return null;
      return current > idx ? current - 1 : current;
    });
  }, []);

  const startEditPredRow = useCallback((idx: number) => {
    const row = predRows[idx];
    if (!row) return;
    setEditPredDateDebut(row.date_debut);
    setEditPredDateFin(row.date_fin);
    setEditPredMotif(row.motif);
    setEditingPredIdx(idx);
  }, [predRows]);

  const cancelEditPredRow = useCallback(() => {
    setEditingPredIdx(null);
  }, []);

  const saveEditPredRow = useCallback((idx: number) => {
    if (editPredDateFin < editPredDateDebut) { setPredMsg('La date de fin doit être ≥ date de début.'); return; }
    setPredRows(prev => prev.map((r, i) =>
      i === idx ? { ...r, date_debut: editPredDateDebut, date_fin: editPredDateFin, motif: editPredMotif } : r
    ));
    setEditingPredIdx(null);
    setPredMsg('');
  }, [editPredDateDebut, editPredDateFin, editPredMotif]);

  // ─── Import Excel des congés prévisionnels (alternative optionnelle à la saisie manuelle) ───
  const handlePredFileUpload = useCallback(async (file: File) => {
    if (!dbTechniciens.length) { setPredMsg("Sélectionnez d'abord une unité."); return; }
    setPredMsg('');
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (raw.length < 2) throw new Error('Fichier vide ou entête manquant.');

      const headers = (raw[0] as unknown[]).map(h => normalizeKey(String(h ?? '')));
      const ci = {
        nom:    headers.findIndex(h => h.includes('nom') || h.includes('agent') || h.includes('technicien')),
        debut:  headers.findIndex(h => h.includes('debut')),
        fin:    headers.findIndex(h => h.includes('fin')),
        motif:  headers.findIndex(h => h.includes('motif') || h.includes('type') || h.includes('nature')),
        atelier: headers.findIndex(h => h.includes('atelier')),
        unite:  headers.findIndex(h => h.includes('unite')),
      };
      if (ci.nom === -1) throw new Error(`Colonne "Nom" introuvable. Entêtes : ${headers.join(', ')}`);
      if (ci.debut === -1) throw new Error('Colonne "Date Début" introuvable.');
      if (ci.fin === -1) throw new Error('Colonne "Date Fin" introuvable.');

      const selectedUniteCode = effectiveUnite?.code?.toUpperCase().trim() ?? '';

      const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const newRows: typeof predRows = [];
      const errors: string[] = [];

      for (let i = 1; i < raw.length; i++) {
        const row = raw[i] as unknown[];
        if (!row || !row[ci.nom]) continue;
        const nomRaw = String(row[ci.nom]).trim();
        const db = parseDateFR(row[ci.debut]);
        const df = parseDateFR(row[ci.fin]);
        const motif = ci.motif >= 0 && row[ci.motif] ? String(row[ci.motif]).trim() : 'Congé annuel';
        const atelierHint = ci.atelier >= 0 && row[ci.atelier] ? String(row[ci.atelier]).trim().toUpperCase() : '';
        const uniteHint = ci.unite >= 0 && row[ci.unite] ? String(row[ci.unite]).trim().toUpperCase() : '';

        if (!db || !df) { errors.push(`${nomRaw} : dates invalides`); continue; }
        if (df < db) { errors.push(`${nomRaw} : date de fin < date de début`); continue; }
        // La colonne Unité du fichier doit correspondre à l'unité sélectionnée dans
        // l'assistant : sinon on importerait des congés de techniciens d'une autre
        // unité (par ex. même nom que quelqu'un dans l'unité choisie) sans s'en rendre compte.
        if (uniteHint && selectedUniteCode && uniteHint !== selectedUniteCode) {
          errors.push(`${nomRaw} : unité "${uniteHint}" ≠ unité sélectionnée "${selectedUniteCode}"`);
          continue;
        }

        const nl = nomRaw.toLowerCase().replace(/\s+/g, ' ');
        let matched = atelierHint
          ? dbTechniciens.find(t => t.atelier_code.toUpperCase() === atelierHint &&
              (`${t.prenom} ${t.nom}`.toLowerCase() === nl || `${t.nom} ${t.prenom}`.toLowerCase() === nl ||
               t.nom.toLowerCase() === nl || `${t.prenom} ${t.nom}`.toLowerCase().includes(nl)))
          : undefined;
        if (!matched) {
          matched = dbTechniciens.find(t =>
            `${t.prenom} ${t.nom}`.toLowerCase() === nl || `${t.nom} ${t.prenom}`.toLowerCase() === nl ||
            t.nom.toLowerCase() === nl || `${t.prenom} ${t.nom}`.toLowerCase().includes(nl));
        }
        if (!matched) { errors.push(`${nomRaw} : technicien introuvable`); continue; }

        newRows.push({ technicien_id: matched.id, nom: `${matched.prenom} ${matched.nom}`, date_debut: toISO(db), date_fin: toISO(df), motif });
      }

      setPredRows(prev => [...prev, ...newRows]);
      setPredMsg(
        errors.length
          ? `⚠️ ${newRows.length} ligne(s) ajoutée(s), ${errors.length} ignorée(s) : ${errors.slice(0, 3).join(' · ')}${errors.length > 3 ? '…' : ''}`
          : `✅ ${newRows.length} ligne(s) ajoutée(s) depuis le fichier.`
      );
    } catch (e: any) {
      setPredMsg(`Erreur : ${e.message || 'inconnue'}`);
    }
  }, [dbTechniciens, effectiveUnite]);

  const savePredConges = useCallback(async () => {
    if (!predRows.length || !effectiveUniteId) return;
    setPredSaving(true); setPredMsg('');
    try {
      const inserts = predRows.map(r => ({
        technicien_id: r.technicien_id,
        unite_id: Number(effectiveUniteId),
        date_debut: r.date_debut,
        date_fin: r.date_fin,
        motif: r.motif,
      }));
      const { error: err } = await supabase.from('conges').insert(inserts);
      if (err) throw new Error(err.message);
      setPredMsg(`✅ ${predRows.length} congé(s) prévisionnel(s) enregistré(s).`);
      setPredRows([]);
    } catch (e: any) {
      setPredMsg(`Erreur : ${e.message || 'inconnue'}`);
    } finally {
      setPredSaving(false);
    }
  }, [predRows, effectiveUniteId]);

  // ─── Réaffectation des techniciens (résolution de surcharge) ───
  // Le technicien est stocké au niveau de la ligne (techniciens_noms) : une réaffectation
  // s'applique donc à TOUTES les occurrences de cette intervention, pas seulement au jour
  // en surcharge (la donnée ne permet pas de surcharger un seul jour indépendamment).
  const reassignTechnicien = useCallback((rowId: string, oldName: string, newName: string) => {
    setRawData(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      const names = r.techniciens_noms.split(/[,;]/).map(s => s.trim()).filter(Boolean);
      const idx = names.findIndex(n => n.toLowerCase() === oldName.toLowerCase());
      if (idx === -1) return r;
      names[idx] = newName;
      return { ...r, techniciens_noms: names.join(', ') };
    }));
  }, []);

  // Alternatives proposées pour une ligne donnée : tout technicien de l'unité (même hors
  // de l'atelier de l'intervention — un dépannage inter-atelier reste possible), pas déjà
  // affecté à cette intervention, trié du moins chargé au plus chargé sur le plan entier.
  // Les techniciens du même atelier sont listés en premier (plus pertinents), puis les autres.
  const getReassignAlternatives = useCallback((rowId: string, currentNames: string[]) => {
    const row = validRows.find(r => r.id === rowId);
    if (!row) return [];
    return dbTechniciens
      .filter(t => !currentNames.some(n => n.toLowerCase().trim() === `${t.prenom} ${t.nom}`.toLowerCase().trim()))
      .sort((a, b) => {
        const aSame = a.atelier_id === row.atelier_id ? 0 : 1;
        const bSame = b.atelier_id === row.atelier_id ? 0 : 1;
        if (aSame !== bSame) return aSame - bSame;
        return (techTotalCharge[`${a.prenom} ${a.nom}`] || 0) - (techTotalCharge[`${b.prenom} ${b.nom}`] || 0);
      });
  }, [validRows, dbTechniciens, techTotalCharge]);

  // Équilibrage automatique : réaffecte, surcharge par surcharge (la plus grosse d'abord),
  // le plus gros contributeur du jour vers le technicien du même atelier le moins chargé,
  // à condition que ça ne crée pas une nouvelle surcharge sur aucune des dates de cette
  // intervention. Les surcharges qu'aucun remplaçant ne peut absorber sont ignorées (on
  // passe aux suivantes) puis signalées à la fin.
  const autoBalanceCharge = useCallback(() => {
    setAutoBalancing(true);
    try {
      const rows = validRows.filter(r => r.techniciens_noms);
      const occsByRowId = new Map<string, Occurrence[]>();
      occurrences.forEach(o => {
        if (!occsByRowId.has(o.rowId)) occsByRowId.set(o.rowId, []);
        occsByRowId.get(o.rowId)!.push(o);
      });

      const assignByRow = new Map<string, string[]>();
      const dayCharge: Record<string, Record<string, number>> = {};
      const totalCharge: Record<string, number> = {};

      const addCharge = (name: string, date: string, h: number) => {
        dayCharge[name] = dayCharge[name] || {};
        dayCharge[name][date] = (dayCharge[name][date] || 0) + h;
        totalCharge[name] = (totalCharge[name] || 0) + h;
      };
      const removeCharge = (name: string, date: string, h: number) => {
        if (dayCharge[name]) dayCharge[name][date] = Math.max(0, (dayCharge[name][date] || 0) - h);
        totalCharge[name] = Math.max(0, (totalCharge[name] || 0) - h);
      };

      rows.forEach(r => {
        const names = r.techniciens_noms.split(/[,;]/).map(s => s.trim()).filter(Boolean);
        assignByRow.set(r.id, names);
        const nbTechs = Math.max(names.length, 1);
        const chargeH = (r.temps_h / nbTechs) + logisticsHOf(r);
        const occs = occsByRowId.get(r.id) || [];
        names.forEach(name => occs.forEach(o => addCharge(name, o.date, chargeH)));
      });

      const findOverloadedEntries = () => {
        const list: { name: string; date: string; total: number }[] = [];
        Object.entries(dayCharge).forEach(([name, days]) => {
          Object.entries(days).forEach(([date, total]) => {
            if (total > maxHoursPerDay) list.push({ name, date, total });
          });
        });
        return list.sort((a, b) => b.total - a.total);
      };

      const unresolvable = new Set<string>();
      let resolvedCount = 0;
      let attempts = 0;
      const maxAttempts = 500;

      while (attempts < maxAttempts) {
        attempts++;
        const overloadedNow = findOverloadedEntries().filter(o => !unresolvable.has(`${o.name}|${o.date}`));
        if (overloadedNow.length === 0) break;
        const target = overloadedNow[0];

        let bestRow: RawRow | null = null;
        let bestCharge = 0;
        rows.forEach(r => {
          const names = assignByRow.get(r.id) || [];
          if (!names.some(n => n.toLowerCase() === target.name.toLowerCase())) return;
          const occs = occsByRowId.get(r.id) || [];
          if (!occs.some(o => o.date === target.date)) return;
          const nbTechs = Math.max(names.length, 1);
          const chargeH = (r.temps_h / nbTechs) + logisticsHOf(r);
          if (chargeH > bestCharge) { bestCharge = chargeH; bestRow = r; }
        });
        if (!bestRow) { unresolvable.add(`${target.name}|${target.date}`); continue; }

        const rowRef = bestRow as RawRow;
        const names = assignByRow.get(rowRef.id)!;
        const occs = occsByRowId.get(rowRef.id) || [];

        // Priorité aux techniciens du même atelier, mais un dépannage hors atelier reste
        // autorisé si c'est ce qu'il faut pour résoudre la surcharge.
        const candidates = dbTechniciens
          .filter(t => !names.some(n => n.toLowerCase() === `${t.prenom} ${t.nom}`.toLowerCase()))
          .sort((a, b) => {
            const aSame = a.atelier_id === rowRef.atelier_id ? 0 : 1;
            const bSame = b.atelier_id === rowRef.atelier_id ? 0 : 1;
            if (aSame !== bSame) return aSame - bSame;
            return (totalCharge[`${a.prenom} ${a.nom}`] || 0) - (totalCharge[`${b.prenom} ${b.nom}`] || 0);
          });

        const replacement = candidates.find(t => {
          const name = `${t.prenom} ${t.nom}`;
          return occs.every(o => ((dayCharge[name]?.[o.date]) || 0) + bestCharge <= maxHoursPerDay);
        });

        if (!replacement) { unresolvable.add(`${target.name}|${target.date}`); continue; }

        const replName = `${replacement.prenom} ${replacement.nom}`;
        occs.forEach(o => { removeCharge(target.name, o.date, bestCharge); addCharge(replName, o.date, bestCharge); });
        assignByRow.set(rowRef.id, names.map(n => n.toLowerCase() === target.name.toLowerCase() ? replName : n));
        resolvedCount++;
      }

      setRawData(prev => prev.map(r => {
        const names = assignByRow.get(r.id);
        if (!names) return r;
        const joined = names.join(', ');
        return joined === r.techniciens_noms ? r : { ...r, techniciens_noms: joined };
      }));

      const stillOverloaded = findOverloadedEntries().length;
      if (stillOverloaded === 0) {
        setToast({ type: 'success', msg: `✅ Plan équilibré : ${resolvedCount} réaffectation(s), plus aucune surcharge.` });
      } else {
        setToast({
          type: 'error',
          msg: `⚠️ ${resolvedCount} réaffectation(s) appliquée(s), mais ${stillOverloaded} surcharge(s) restent impossibles à résoudre avec les techniciens disponibles de ces ateliers. Suggestion : ajoutez un technicien à l'atelier concerné, ou étalez certaines interventions sur d'autres dates.`,
        });
      }
    } finally {
      setAutoBalancing(false);
    }
  }, [validRows, occurrences, dbTechniciens, maxHoursPerDay]);

  // ─── Vérification des congés ───
  const checkConges = useCallback(async () => {
    setLoadingConges(true);
    setShowCongeStep(true);
    setCongeConflicts([]);
    setError('');

    try {
      const { data: congesData } = await supabase
        .from('conges')
        .select('technicien_id, date_debut, date_fin, motif, techniciens(nom, prenom)')
        .eq('unite_id', Number(effectiveUniteId))
        .gte('date_fin', `${planYear}-01-01`)
        .lte('date_debut', `${planYear}-12-31`);

      if (!congesData?.length) {
        setLoadingConges(false);
        setCongeConflicts([]);
        return;
      }

      const congeMap: Record<number, { debut: string; fin: string; motif: string }[]> = {};
      congesData.forEach((c: any) => {
        if (!congeMap[c.technicien_id]) congeMap[c.technicien_id] = [];
        congeMap[c.technicien_id].push({
          debut: c.date_debut, fin: c.date_fin, motif: c.motif
        });
      });

      const conflicts: CongeConflict[] = [];
      const currentOccs = occurrencesRef.current;
      const validR = rawDataRef.current.filter(r => !r.excluded);

      const occsByRowId = new Map<string, typeof currentOccs>();
      currentOccs.forEach(o => {
        if (!occsByRowId.has(o.rowId)) occsByRowId.set(o.rowId, []);
        occsByRowId.get(o.rowId)!.push(o);
      });

      validR.forEach(row => {
        if (!row.techniciens_noms?.trim()) return;
        const rowOccs = occsByRowId.get(row.id) || [];
        row.techniciens_noms.split(/[,;]/).map(s => s.trim()).filter(Boolean).forEach(name => {
          const dbTech = techMap.get(name.toLowerCase().trim());
          if (!dbTech) return;
          const tc = congeMap[dbTech.id];
          if (!tc?.length) return;
          rowOccs.forEach(occ => {
            tc.forEach(conge => {
              if (occ.date >= conge.debut && occ.date <= conge.fin) {
                conflicts.push({
                  rowId: row.id, titre: row.titre, date: occ.date,
                  technicienNom: name, technicienId: dbTech.id,
                  congeDebut: conge.debut, congeFin: conge.fin,
                  congeMotif: conge.motif, resolved: false
                });
              }
            });
          });
        });
      });

      setCongeConflicts(conflicts);
      if (conflicts.length === 0) { setLoadingConges(false); return; }

      // Charger les charges existantes pour les remplaçants
      const { data: ptData } = await supabase
        .from('planning_techniciens')
        .select('technicien_id, duree, planning!inner(date_prevue, unite_id, statut, duree_intervention)')
        .eq('planning.unite_id', Number(effectiveUniteId))
        .gte('planning.date_prevue', `${planYear}-01-01`)
        .lte('planning.date_prevue', `${planYear}-12-31`)
        .in('planning.statut', ['planifiee', 'en_cours']);

      const chargeMap: Record<number, Record<string, number>> = {};
      (ptData || []).forEach((r: any) => {
        const id = r.technicien_id;
        const d = (r.planning as any)?.date_prevue;
        const h = r.duree || (r.planning as any)?.duree_intervention || 1;
        if (!chargeMap[id]) chargeMap[id] = {};
        chargeMap[id][d] = (chargeMap[id][d] || 0) + h;
      });

      // Ajouter les charges du plan en cours
      validR.forEach(row => {
        if (!row.techniciens_noms?.trim()) return;
        const ns = row.techniciens_noms.split(/[,;]/).map(s => s.trim()).filter(Boolean);
        const ch = ((row.temps_h || 1) / Math.max(ns.length, 1)) + logisticsHOf(row);
        (occsByRowId.get(row.id) || []).forEach(occ => {
          ns.forEach(n => {
            const dt = techMap.get(n.toLowerCase().trim());
            if (!dt) return;
            if (!chargeMap[dt.id]) chargeMap[dt.id] = {};
            chargeMap[dt.id][occ.date] = (chargeMap[dt.id][occ.date] || 0) + ch;
          });
        });
      });

      setTechDispoCharges(dbTechniciens.map(t => ({
        id: t.id, nom: t.nom, prenom: t.prenom,
        nom_complet: `${t.prenom} ${t.nom}`.trim(),
        atelier_code: t.atelier_code,
        heuresJour: chargeMap[t.id] || {}
      })));
    } catch (err: any) {
      console.error(err);
      setError('Erreur vérification congés: ' + err.message);
      setShowCongeStep(false);
    }

    setLoadingConges(false);
  }, [effectiveUniteId, planYear, techMap, dbTechniciens]);

  // ─── Résolution congés ───
  const resolveCongeConflict = useCallback((conflictIndex: number, remplacant: TechDispoCharge) => {
    setCongeConflicts(prev => {
      const conflict = prev[conflictIndex];
      if (!conflict) return prev;

      const dureeRow = rawDataRef.current.find(r => r.id === conflict.rowId);
      const names = dureeRow?.techniciens_noms.split(/[,;]/).map(s => s.trim()).filter(Boolean) || [];
      const chargeH = ((dureeRow?.temps_h || 1) / Math.max(names.length, 1)) + logisticsHOf(dureeRow);

      // Mettre à jour les charges du remplaçant de manière asynchrone
      setTimeout(() => {
        setTechDispoCharges(prevTech => prevTech.map(t => {
          if (t.id !== remplacant.id) return t;
          return {
            ...t,
            heuresJour: {
              ...t.heuresJour,
              [conflict.date]: (t.heuresJour[conflict.date] || 0) + chargeH
            }
          };
        }));
      }, 0);

      return prev.map((c, i) =>
        i !== conflictIndex
          ? c
          : { ...c, resolved: true, remplacantId: remplacant.id, remplacantNom: remplacant.nom_complet }
      );
    });
  }, []);

  const applyCongeResolutions = useCallback(() => {
    const unresolvedCount = congeConflicts.filter(c => !c.resolved).length;
    if (unresolvedCount > 0) {
      setError(`${unresolvedCount} conflit(s) non résolu(s).`);
      return;
    }
    setRawData(prev => {
      const updated = [...prev];
      congeConflicts.filter(c => c.resolved && c.remplacantNom).forEach(conflict => {
        const rowIdx = updated.findIndex(r => r.id === conflict.rowId);
        if (rowIdx === -1) return;
        const row = { ...updated[rowIdx] };
        const names = row.techniciens_noms.split(/[,;]/).map(s => s.trim()).filter(Boolean);
        const newNames = names.map(n =>
          n.toLowerCase().trim() === conflict.technicienNom.toLowerCase().trim()
            ? conflict.remplacantNom!
            : n
        );
        row.techniciens_noms = [...new Set(newNames)].join(', ');
        const v = validateRow(row);
        Object.assign(row, v);
        row.excluded = v.errors.length > 0;
        updated[rowIdx] = row;
      });
      return updated;
    });
    setCongeConflicts([]);
    // Congés vérifiés en premier désormais : on révèle la sous-étape Surcharge
    // plutôt que de sauter directement au récapitulatif.
    setShowCongeStep(false);
  }, [congeConflicts, validateRow]);

  // ─── Import final ───
  const handleImport = async () => {
    setImporting(true);
    setError('');

    try {
      const { data: { session }, error: se } = await supabase.auth.getSession();
      if (se || !session) throw new Error('Session expirée.');

      // Toujours utiliser les refs dans une fonction async
      const valid = rawDataRef.current.filter(r => !r.excluded);
      if (!valid.length) throw new Error('Aucune ligne valide.');

      const currentUniteId = uniteIdRef.current;
      if (!currentUniteId) throw new Error('Sélectionnez une unité.');

      let currentOccs = occurrencesRef.current;
      if (!currentOccs.length) {
        console.warn('[handleImport] Occurrences vides, re-génération de secours');
        const { start: periodStart, end: periodEnd } = getPlanPeriod(
          planScope, planYear, startMonth, numMonths
        );
        const allOccs: Occurrence[] = [];
        valid.forEach(r => allOccs.push(...generateOccurrences(r, periodStart, periodEnd, holidays)));
        currentOccs = filterOccurrencesByScope(allOccs, planScope, planYear, startMonth, numMonths);
      }
      if (!currentOccs.length) throw new Error('Aucune occurrence.');

      const uniteIdNum = Number(currentUniteId);

      const { data: existingPlan } = await supabase
        .from('plan_annuel').select('id')
        .eq('unite_id', uniteIdNum).eq('annee', planYear).maybeSingle();

      let planAnnuelId: number;

      if (existingPlan) {
        planAnnuelId = existingPlan.id;

        if (conflictingMonths.length > 0 && monthConflictAction) {
          // Choix explicite de l'utilisateur (remplacer / fusionner / ignorer),
          // applicable aussi bien à une portée mensuelle qu'à une portée annuelle
          // (dans ce dernier cas, conflictingMonths couvre tous les mois occupés
          // de l'année — cela permet de MODIFIER un plan annuel déjà existant
          // au lieu de bloquer purement et simplement l'import).
          if (monthConflictAction === 'replace') {
            for (const m of conflictingMonths) {
              const start = `${planYear}-${String(m.month + 1).padStart(2,'0')}-01`;
              const endMonth = m.month === 11
                ? `${planYear + 1}-01-01`
                : `${planYear}-${String(m.month + 2).padStart(2,'0')}-01`;
              await supabase.from('planning').delete()
                .eq('plan_annuel_id', planAnnuelId)
                .gte('date_prevue', start)
                .lt('date_prevue', endMonth);
            }
          } else if (monthConflictAction === 'skip') {
            const skipMonths = new Set(conflictingMonths.map(m => m.month));
            currentOccs = currentOccs.filter(o =>
              !skipMonths.has(new Date(o.date + 'T00:00:00').getMonth())
            );
          }
          // 'merge' → rien à supprimer, juste ajouter
        } else if (planScope === 'annual' && mode === 'duplicate') {
          // Duplication explicite d'une année source vers une année cible qui
          // possède déjà un plan (sans conflit de mois détecté, ex: rejouer une
          // duplication) : on remplace intégralement, comportement historique.
          await supabase.from('planning').delete().eq('plan_annuel_id', planAnnuelId);
        }
      } else {
        const { data: newPlan, error: planErr } = await supabase
          .from('plan_annuel')
          .insert({
            unite_id: uniteIdNum,
            annee: planYear,
            statut: 'publie',
            description: mode === 'duplicate'
              ? `Plan ${planYear} (dupliqué depuis ${sourceYear})`
              : planScope === 'monthly'
                ? `Plan ${planYear} (${MONTH_NAMES[startMonth]}${
                    numMonths > 1
                      ? ` → ${MONTH_NAMES[Math.min(startMonth + numMonths - 1, 11)]}`
                      : ''
                  })`
                : `Plan ${planYear}`,
            source_plan_annuel_id: mode === 'duplicate' ? sourcePlanId : null,
            created_by: session.user.id,
          })
          .select('id').single();

        if (planErr) throw new Error(`Erreur création plan: ${planErr.message}`);
        planAnnuelId = newPlan.id;
      }

      const findTechIds = (namesStr: string): number[] => {
        if (!namesStr) return [];
        return namesStr.split(/[,;]/).map(s => s.trim().toLowerCase()).filter(Boolean)
          .map(n => techMap.get(n)?.id).filter((id): id is number => id !== undefined);
      };

      const normConsignation = (v: string): 'Oui' | 'Non' =>
        ['oui','yes','true','1'].includes(v.trim().toLowerCase()) ? 'Oui' : 'Non';
      const normJourNuit = (v: string): 'Jour' | 'Nuit' =>
        ['nuit','night'].includes(v.trim().toLowerCase()) ? 'Nuit' : 'Jour';
      const normNumShift = (v: number): 1|2|3 => {
        const n = Math.round(Number(v) || 1);
        return (n === 2 ? 2 : n === 3 ? 3 : 1) as 1|2|3;
      };

      const interventions: {
        data: Record<string, unknown>;
        techIds: number[];
        taches: ParsedTache[];
      }[] = [];

      const occsByRowId = new Map<string, typeof currentOccs>();
      currentOccs.forEach(o => {
        if (!occsByRowId.has(o.rowId)) occsByRowId.set(o.rowId, []);
        occsByRowId.get(o.rowId)!.push(o);
      });

      for (const r of valid) {
        const rowOccs = occsByRowId.get(r.id) || [];
        if (!rowOccs.length) continue;

        const parts = (r.code_gmao || '').split('.');
        const techIds = findTechIds(r.techniciens_noms);
        const cons = normConsignation(r.consignation);
        const consMotif = cons === 'Oui' ? (r.consignation_motif?.trim() || 'À préciser') : null;

        for (const occ of rowOccs) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(occ.date)) continue;

          const rowData: Record<string, unknown> = {
            plan_annuel_id: planAnnuelId,
            unite_id: uniteIdNum,
            atelier_id: r.atelier_id ?? null,
            titre: r.titre.trim(),
            frequence: r.frequence,
            date_prevue: occ.date,
            duree_intervention: Number(r.temps_h) || 0,
            statut: 'planifiee',
            jour_nuit: normJourNuit(r.mode),
            num_shift: normNumShift(r.num_shift),
            consignation: cons,
            created_by: session.user.id,
          };

          if (r.equipement?.trim())       rowData.equipement = r.equipement.trim();
          if (r.code_gmao?.trim())        rowData.code_gmao = r.code_gmao.trim();
          if (parts[0]?.trim())           rowData.systeme = parts[0].trim();
          if (parts[2]?.trim())           rowData.sous_systeme = parts[2].trim();
          if (r.materiel?.trim())         rowData.materiel_libre = r.materiel.trim();
          if (r.outillage?.trim())        rowData.outillage_libre = r.outillage.trim();
          if (r.fiche_inspection?.trim()) rowData.fiche_inspection = r.fiche_inspection.trim();
          if (consMotif)                  rowData.consignation_motif = consMotif;
          // Temps logistique : extrait de la colonne Excel « Temps_logistique » quand
          // disponible, sinon valeur par défaut (LOGISTICS_H).
          rowData.temps_logistique = logisticsHOf(r);

          interventions.push({ data: rowData, techIds, taches: r.taches || [] });
        }
      }

      if (!interventions.length) throw new Error('Aucune intervention à insérer.');

      const BATCH = 100;
      let totalInserted = 0, totalErrors = 0;
      const errorDetails: { batch: number; error: string }[] = [];
      let totalTachesInserted = 0;

      for (let i = 0; i < interventions.length; i += BATCH) {
        const batch = interventions.slice(i, i + BATCH);
        const batchNum = Math.floor(i / BATCH) + 1;

        const { data: inserted, error: insErr } = await supabase
          .from('planning')
          .insert(batch.map(b => b.data))
          .select('id');

        if (insErr) {
          totalErrors += batch.length;
          errorDetails.push({ batch: batchNum, error: insErr.message });
          continue;
        }

        const ptRows: { planning_id: number; technicien_id: number; duree: number }[] = [];
        // Tâches groupées par intervention (planning_id) pour isoler les échecs :
        // un lot invalide sur UNE intervention ne doit pas empêcher les autres d'être chargées.
        const tachesParPid: { pid: number; titre: string; rows: any[] }[] = [];

        for (let j = 0; j < (inserted?.length ?? 0); j++) {
          const pid = inserted![j].id;
          batch[j].techIds.forEach(tid =>
            ptRows.push({
              planning_id: pid, technicien_id: tid,
              duree: (batch[j].data.duree_intervention as number) || 1,
            })
          );
          if (batch[j].taches.length > 0) {
            tachesParPid.push({
              pid,
              titre: String(batch[j].data.titre ?? ''),
              rows: batch[j].taches.map(t => ({
                planning_id: pid, numero: t.numero,
                sous_equipement: t.sous_equipement, operation: t.operation,
                ok: null, motif: '', duree_min: null, initial: '',
              })),
            });
          }
        }

        if (ptRows.length > 0) {
          await supabase.from('planning_techniciens').insert(ptRows);
        }
        if (tachesParPid.length > 0) {
          const results = await Promise.allSettled(
            tachesParPid.map(g => supabase.from('planning_taches').insert(g.rows))
          );
          results.forEach((res, idx) => {
            const g = tachesParPid[idx];
            const tacheErr = res.status === 'fulfilled' ? res.value.error : res.reason;
            if (!tacheErr) {
              totalTachesInserted += g.rows.length;
            } else {
              const msg = tacheErr?.message || String(tacheErr);
              console.error(`[import] Tâches non chargées pour "${g.titre}" (planning_id=${g.pid}):`, msg);
              errorDetails.push({ batch: batchNum, error: `Tâches non chargées pour "${g.titre}" : ${msg}` });
            }
          });
        }

        totalInserted += inserted?.length ?? 0;
      }

      const { count } = await supabase
        .from('planning').select('*', { count: 'exact', head: true })
        .eq('plan_annuel_id', planAnnuelId);

      if (count === 0) throw new Error('⚠️ Données non persistées. Vérifiez les policies RLS.');

      setResult({ imported: totalInserted, errors: totalErrors, errorDetails, tachesImported: totalTachesInserted });
      setPublished(true);
      setStep(7);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  // ─── Reset ───
  const reset = () => {
    setStep(0); setRawData([]); setOccurrences([]); setFileName('');
    setResult(null); setPublished(false); setError(''); setMode('new');
    setSourcePlanId(null); setCountdown(5); setSearchFilter('');
    setCodeEquipFilter(''); setActiveAtelier(null);
    setCollapsedAteliers(new Set()); setSelectedRowId(null);
    setEditingRow(null); setDeletingRow(null);
    setPlanScope('annual'); setStartMonth(new Date().getMonth());
    setNumMonths(1); setMonthConflictAction(null);
    setShowMonthConflictModal(false); setCongeConflicts([]);
    setShowCongeStep(false); setLoadingConges(false);
    setToast(null); setShouldAutoLoad(false); setPendingGoStep3(false);
    setPredRows([]); setEditingPredIdx(null); setShowCongePrediction(false);
  };

  // ─── Year Selector (composant interne) ───
  const YearSelector = () => {
    const quickYears = Array.from({ length: 5 }, (_, i) => thisYear + i);
    return (
      <div className={fieldWrap}>
        <label className={labelCls}>
          <span className="flex items-center gap-1.5">
            <CalendarDays size={11} className="text-slate-400" />
            Année de publication (cible)
          </span>
        </label>
        <div className="flex items-stretch gap-3 flex-wrap">
          <div className="relative">
            <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
              <Hash size={15} className={yearIsBlocked ? 'text-rose-400' : 'text-[#1e2a5e]'} />
            </div>
            <input
              type="number" min={thisYear} max={3000}
              value={planYearInput}
              onChange={e => {
                setPlanYearInput(e.target.value);
                const v = parseInt(e.target.value);
                if (!isNaN(v) && v >= 1900 && v <= 3000) setPlanYear(v);
              }}
              onBlur={() => setPlanYearInput(String(planYear))}
              className={`w-32 pl-9 pr-3 py-3 text-xl font-bold text-center rounded-xl outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                yearIsBlocked
                  ? 'bg-rose-50 text-rose-700 ring-2 ring-rose-300'
                  : 'bg-blue-50 text-[#1e2a5e] ring-2 ring-[#1e2a5e]/20'
              }`}
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {quickYears.map(y => {
              const isExist = existingYears.includes(y);
              const isSel   = planYear === y;
              // Un plan existant n'empêche plus la sélection de l'année : on
              // avertit simplement (badge « ! ») qu'un choix de fusion/
              // remplacement/ignorer sera demandé plus loin dans le flux.
              const isBlock = false;
              return (
                <button key={y} type="button"
                  onClick={() => { if (!isBlock) { setPlanYear(y); setPlanYearInput(String(y)); } }}
                  disabled={isBlock}
                  className={`relative h-full min-h-[46px] px-3.5 rounded-xl text-sm font-bold transition-all ${
                    isSel   ? 'bg-[#1e2a5e] text-white shadow-sm'
                    : isBlock ? 'bg-slate-50 text-slate-300 cursor-not-allowed line-through'
                    : isExist && mode === 'duplicate' ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                    : 'bg-white text-slate-600 hover:bg-blue-50 ring-1 ring-slate-200'
                  }`}>
                  {y}
                  {isExist && !isBlock && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-400 text-white text-[9px] font-bold flex items-center justify-center shadow-sm">!</span>
                  )}
                  {isBlock && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-400 text-white text-[9px] font-bold flex items-center justify-center shadow-sm">✕</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        {annualPlanExists && (
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-xl p-3 mt-2">
            <Info size={13} className="shrink-0 mt-0.5" />
            <span>
              Un plan <strong>{planYear}</strong> existe déjà ({annualExistingCount} intervention(s)).
              Vous pourrez choisir de <strong>remplacer</strong>, <strong>fusionner</strong> ou <strong>ignorer</strong> les
              mois déjà occupés avant la publication.
            </span>
          </div>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════
  // JSX
  // ═══════════════════════════════════════════════
  return (
    <div className="bg-slate-100 min-h-[calc(100vh-60px)] p-4 lg:p-6">
      <div className="max-w-[1600px] mx-auto space-y-5">

        {/* TOAST */}
        {toast && (
          <div className="fixed top-6 right-6 z-50 animate-slide-down">
            <div className={`px-4 py-3 rounded-2xl shadow-lg text-sm font-bold flex items-center gap-2 ${
              toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
            }`}>
              {toast.type === 'success'
                ? <CheckCircle2 size={16} />
                : <AlertTriangle size={16} />}
              {toast.msg}
            </div>
          </div>
        )}

        {/* MODALS */}
        {editingRow && (
          <EditModal row={editingRow} ateliers={ateliers}
            onSave={handleSaveEdit} onClose={() => setEditingRow(null)} />
        )}
        {deletingRow && (
          <DeleteModal row={deletingRow}
            onConfirm={handleConfirmDelete} onClose={() => setDeletingRow(null)} />
        )}
        {showMonthConflictModal && (
          <MonthConflictModal
            conflictingMonths={conflictingMonths} year={planYear}
            onChoose={(action) => {
              setMonthConflictAction(action);
              if (action) setPendingGoStep3(true); // ← déclenché par useEffect
            }}
            onClose={() => setShowMonthConflictModal(false)}
          />
        )}

        {/* FLOATING BAR */}
        {selectedRow && !editingRow && !deletingRow && step === 2 && (
          <FloatingActionBar
            row={selectedRow}
            onEdit={() => { setEditingRow(selectedRow); setSelectedRowId(null); }}
            onDelete={() => setDeletingRow(selectedRow)}
            onClose={() => setSelectedRowId(null)}
          />
        )}

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <FileSpreadsheet size={13} className="text-[#1e2a5e]" />
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                Import Excel
              </span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-800 leading-tight">
              Import & <span className="text-[#1e2a5e]">Planification</span>
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {effectiveUnite && (
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-white shadow-sm">
                <MapPin size={11} className="text-[#1e2a5e]" />
                <span className="font-bold text-xs text-[#1e2a5e]">{effectiveUnite.code}</span>
                <span className="text-[11px] text-slate-400">{scopeLabel}</span>
              </div>
            )}
            {step > 0 && (
              <button onClick={reset}
                className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 text-xs font-semibold transition-all shadow-sm">
                <RotateCcw size={13} strokeWidth={2.5} />
                <span className="hidden sm:inline">Recommencer</span>
              </button>
            )}
          </div>
        </div>

        {/* STEPPER */}
        <p className="text-[12px] text-slate-400">
          {step === 0
            ? 'Choisissez comment créer votre planning'
            : `Étape ${step + 1}/${stepLabels.length} : ${stepLabels[step]}${
                effectiveUnite ? ` · ${effectiveUnite.code}` : ''
              } · ${scopeLabel}`}
        </p>

        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            {stepLabels.map((label, s) => {
              const clickable = step > s;
              return (
                <div key={s}
                  onClick={clickable ? () => goToStep(s) : undefined}
                  title={clickable ? `Revenir à « ${label} »` : undefined}
                  className={`flex items-center gap-2 flex-1 min-w-0 ${clickable ? 'cursor-pointer group' : ''}`}>
                  <div className={`relative w-9 h-9 rounded-2xl flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
                    step === s ? 'bg-[#1e2a5e] text-white shadow-md scale-110'
                    : step > s  ? 'bg-emerald-500 text-white shadow-sm group-hover:scale-110 group-hover:shadow-md'
                    : 'bg-slate-100 text-slate-400'
                  }`}>
                    {step > s ? <CheckCircle2 size={15} strokeWidth={2.5} /> : s + 1}
                    {step === s && (
                      <div className="absolute inset-0 rounded-2xl bg-[#1e2a5e]/30 animate-ping" />
                    )}
                  </div>
                  <div className="hidden lg:block min-w-0">
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${
                      step >= s ? 'text-slate-700' : 'text-slate-300'
                    }`}>Étape {s + 1}</p>
                    <p className={`text-[11px] font-semibold truncate ${
                      step === s ? 'text-[#1e2a5e]'
                      : step > s  ? 'text-emerald-600 group-hover:underline'
                      : 'text-slate-400'
                    }`}>{label}</p>
                  </div>
                  {s < stepLabels.length - 1 && (
                    <div className={`hidden lg:block h-0.5 flex-1 rounded-full transition-all ${
                      step > s ? 'bg-emerald-500' : 'bg-slate-100'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ERROR BANNER */}
        {error && (
          <div className="flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm border-l-4 border-rose-500">
            <div className="w-10 h-10 rounded-xl bg-rose-500 flex items-center justify-center shrink-0">
              <AlertTriangle size={17} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-rose-800">Erreur</p>
              <p className="text-xs text-rose-500">{error}</p>
            </div>
            <button onClick={() => setError('')}
              className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-xl">
              Fermer
            </button>
          </div>
        )}

        {/* ── STEP 0 : Choix méthode ── */}
        {step === 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-8">
            <div className="text-center mb-8">
              <h2 className="text-xl font-bold text-slate-800">Comment créer ce planning ?</h2>
              <p className="text-sm text-slate-400 mt-1">Sélectionnez la méthode</p>
              <a href="/pdc_model.xlsx" download
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#1e2a5e] bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors">
                <Download size={12} />Télécharger le modèle Excel à remplir
              </a>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button onClick={() => { setMode('new'); setStep(1); }}
                className="group relative p-6 bg-white rounded-2xl hover:bg-blue-50 hover:shadow-md ring-1 ring-slate-200 hover:ring-[#1e2a5e] transition-all text-left">
                <div className="w-12 h-12 rounded-2xl bg-[#1e2a5e] flex items-center justify-center shadow-md group-hover:scale-110 transition-transform mb-3">
                  <FilePlus size={22} className="text-white" />
                </div>
                <h3 className="text-base font-bold text-slate-800 mb-1">Nouveau planning</h3>
                <p className="text-xs text-slate-500">Importer un fichier Excel depuis zéro.</p>
                <div className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-bold text-[#1e2a5e] bg-blue-50 px-2.5 py-1 rounded-lg">
                  <FileUp size={11} />.xlsx, .xls
                </div>
              </button>
              <button onClick={() => { setMode('duplicate'); setStep(1); }}
                disabled={!availableYears.length}
                className="group relative p-6 bg-white rounded-2xl hover:bg-violet-50 hover:shadow-md ring-1 ring-slate-200 hover:ring-violet-500 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed">
                <div className="w-12 h-12 rounded-2xl bg-violet-500 flex items-center justify-center shadow-md group-hover:scale-110 transition-transform mb-3">
                  <Copy size={22} className="text-white" />
                </div>
                <h3 className="text-base font-bold text-slate-800 mb-1">Dupliquer une année</h3>
                <p className="text-xs text-slate-500">Reprendre une année existante.</p>
                <div className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-bold text-violet-600 bg-violet-50 px-2.5 py-1 rounded-lg">
                  <Calendar size={11} />{availableYears.length} année(s)
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 1 : Configuration ── */}
        {step === 1 && (
          <div className="bg-white rounded-2xl shadow-sm p-6 space-y-6">

            {/* Unité */}
            <div className={fieldWrap}>
              <label className={labelCls}>
                <span className="flex items-center gap-1.5">
                  <Building2 size={11} className="text-slate-400" />Unité
                </span>
              </label>
              {canChooseUnite ? (
                <div className="relative">
                  <select value={selectedUnite} onChange={e => setSelectedUnite(e.target.value)}
                    className={`${selectCls} max-w-md pl-3.5 pr-9`}>
                    <option value="">Sélectionner une unité…</option>
                    {unites.map(u => (
                      <option key={u.id} value={u.id}>{u.code} — {u.nom}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-50 rounded-xl text-sm text-emerald-700 font-semibold max-w-md">
                  <Lock size={14} className="text-emerald-500 shrink-0" />
                  <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                  <span><strong>{effectiveUnite?.code ?? '—'}</strong> — {effectiveUnite?.nom ?? '—'}</span>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100" />
            <YearSelector />
            <div className="border-t border-slate-100" />

            <ScopeSelector
              scope={planScope} setScope={setPlanScope}
              startMonth={startMonth} setStartMonth={setStartMonth}
              numMonths={numMonths} setNumMonths={setNumMonths}
              year={planYear} existingMonths={existingMonths}
            />

            <div className="border-t border-slate-100" />

            {/* Prédiction des congés — optionnelle, non bloquante */}
            <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/40 p-4">
              <button type="button" onClick={() => setShowCongePrediction(v => !v)}
                className="w-full flex items-center justify-between gap-2 text-left">
                <span className="flex items-center gap-2 text-sm font-bold text-indigo-800">
                  <CalendarDays size={15} className="text-indigo-500" />
                  Prédiction des congés
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-white px-2 py-0.5 rounded-lg">Optionnel</span>
                </span>
                <ChevronDown size={16} className={`text-indigo-400 transition-transform ${showCongePrediction ? 'rotate-180' : ''}`} />
              </button>
              <p className="text-xs text-indigo-500 mt-1.5">
                Déclarez à l'avance les congés connus pour la période couverte par ce plan (<strong>{predPeriodLabel}</strong>)
                — cela évite les surcharges détectées trop tard. Non requis pour continuer l'import.
              </p>

              {showCongePrediction && (
                <div className="mt-4 space-y-3">
                  {!effectiveUniteId ? (
                    <p className="text-xs text-indigo-400 italic">Sélectionnez d'abord une unité.</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <select value={predTechId} onChange={e => setPredTechId(e.target.value)}
                          className="border border-indigo-200 rounded-lg px-2 py-1.5 text-xs bg-white">
                          <option value="">Technicien…</option>
                          {dbTechniciens.map(t => (
                            <option key={t.id} value={t.id}>{t.prenom} {t.nom}</option>
                          ))}
                        </select>
                        <input type="date" value={predDateDebut} onChange={e => setPredDateDebut(e.target.value)}
                          className="border border-indigo-200 rounded-lg px-2 py-1.5 text-xs bg-white" />
                        <input type="date" value={predDateFin} onChange={e => setPredDateFin(e.target.value)}
                          className="border border-indigo-200 rounded-lg px-2 py-1.5 text-xs bg-white" />
                        <select value={predMotif} onChange={e => setPredMotif(e.target.value)}
                          className="border border-indigo-200 rounded-lg px-2 py-1.5 text-xs bg-white">
                          <option>Congé annuel</option>
                          <option>Maladie</option>
                          <option>Autre</option>
                        </select>
                      </div>
                      <button type="button" onClick={addPredRow}
                        disabled={!predTechId || !predDateDebut || !predDateFin}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-[11px] font-bold rounded-lg disabled:opacity-40">
                        <Plus size={12} />Ajouter à la liste
                      </button>

                      <div className="flex items-center gap-2 text-[10px] font-bold text-indigo-300 uppercase tracking-wider">
                        <div className="flex-1 h-px bg-indigo-100" />ou<div className="flex-1 h-px bg-indigo-100" />
                      </div>

                      <input ref={predFileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handlePredFileUpload(f); e.target.value = ''; }} />
                      <button type="button" onClick={() => predFileInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-indigo-300 text-[11px] font-semibold text-indigo-500 hover:bg-indigo-100/50 hover:border-indigo-400 transition-all">
                        <FileUp size={12} />Importer un fichier Excel de congés (.xlsx, .xls, .csv)
                      </button>

                      {predRows.length > 0 && (
                        <div className="bg-white rounded-xl overflow-hidden ring-1 ring-indigo-100">
                          <table className="w-full text-xs">
                            <tbody className="divide-y divide-indigo-50">
                              {predRows.map((r, i) => (
                                editingPredIdx === i ? (
                                  <tr key={i} className="bg-indigo-50/60">
                                    <td className="px-3 py-1.5 font-semibold text-slate-700">{r.nom}</td>
                                    <td className="px-3 py-1.5">
                                      <div className="flex items-center gap-1">
                                        <input type="date" value={editPredDateDebut} onChange={e => setEditPredDateDebut(e.target.value)}
                                          className="border border-indigo-200 rounded px-1.5 py-1 text-[11px] bg-white w-[112px]" />
                                        <span className="text-slate-400">→</span>
                                        <input type="date" value={editPredDateFin} onChange={e => setEditPredDateFin(e.target.value)}
                                          className="border border-indigo-200 rounded px-1.5 py-1 text-[11px] bg-white w-[112px]" />
                                      </div>
                                    </td>
                                    <td className="px-3 py-1.5">
                                      <select value={editPredMotif} onChange={e => setEditPredMotif(e.target.value)}
                                        className="border border-indigo-200 rounded px-1.5 py-1 text-[11px] bg-white">
                                        <option>Congé annuel</option>
                                        <option>Maladie</option>
                                        <option>Autre</option>
                                      </select>
                                    </td>
                                    <td className="px-3 py-1.5">
                                      <div className="flex items-center justify-end gap-2">
                                        <button type="button" onClick={() => saveEditPredRow(i)} className="text-emerald-600 hover:text-emerald-700" title="Enregistrer">
                                          <Check size={13} />
                                        </button>
                                        <button type="button" onClick={cancelEditPredRow} className="text-slate-400 hover:text-slate-600" title="Annuler">
                                          <X size={13} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ) : (
                                  <tr key={i}>
                                    <td className="px-3 py-1.5 font-semibold text-slate-700">{r.nom}</td>
                                    <td className="px-3 py-1.5 font-mono text-slate-500">{r.date_debut} → {r.date_fin}</td>
                                    <td className="px-3 py-1.5 text-slate-500">{r.motif}</td>
                                    <td className="px-3 py-1.5">
                                      <div className="flex items-center justify-end gap-2">
                                        <button type="button" onClick={() => startEditPredRow(i)} className="text-indigo-500 hover:text-indigo-700" title="Modifier">
                                          <Pencil size={12} />
                                        </button>
                                        <button type="button" onClick={() => removePredRow(i)} className="text-rose-500 hover:text-rose-700" title="Supprimer">
                                          <Trash2 size={12} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                )
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {predRows.length > 0 && (
                        <div className="flex items-center gap-3">
                          <button type="button" onClick={savePredConges} disabled={predSaving}
                            className="flex items-center gap-2 px-4 py-2 bg-[#1e2a5e] hover:bg-[#2a3875] text-white rounded-xl text-xs font-bold shadow-sm disabled:opacity-50">
                            {predSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                            Enregistrer {predRows.length} congé(s)
                          </button>
                        </div>
                      )}

                      {predMsg && (
                        <p className={`text-xs font-semibold ${predMsg.startsWith('✅') ? 'text-emerald-600' : 'text-rose-600'}`}>{predMsg}</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-slate-100" />

            {/* Source : Nouveau vs Dupliquer */}
            {mode === 'new' ? (
              <div className={fieldWrap}>
                <label className={`${labelCls} flex items-center justify-between gap-2`}>
                  <span className="flex items-center gap-1.5">
                    <FileUp size={11} className="text-slate-400" />Fichier Excel *
                  </span>
                  <a href="/pdc_model.xlsx" download
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#1e2a5e] hover:underline normal-case tracking-normal">
                    <Download size={10} />Télécharger le modèle
                  </a>
                </label>
                <div
                  className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all ${
                    yearIsBlocked
                      ? 'border-slate-200 bg-slate-50 opacity-60 pointer-events-none'
                      : isDragging
                        ? 'border-[#1e2a5e] bg-blue-50 scale-[1.01]'
                        : 'border-slate-200 hover:border-[#1e2a5e]/40 bg-slate-50/60 hover:bg-blue-50/40'
                  }`}
                  onDragOver={e => { e.preventDefault(); if (!yearIsBlocked) setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={e => {
                    e.preventDefault(); setIsDragging(false);
                    if (yearIsBlocked) return;
                    const f = e.dataTransfer.files?.[0];
                    if (f?.name.match(/\.xlsx?$/i)) processFile(f);
                    else setError('Fichier invalide (.xlsx ou .xls requis).');
                  }}>
                  <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 ${
                    isDragging ? 'bg-[#1e2a5e] scale-110 shadow-lg' : 'bg-slate-100'
                  }`}>
                    <Upload size={28} className={isDragging ? 'text-white' : 'text-slate-400'} strokeWidth={1.5} />
                  </div>
                  <p className="text-sm font-bold text-slate-700 mb-1">
                    {isDragging ? '✨ Déposez ici !' : 'Glissez-déposez votre fichier'}
                  </p>
                  <p className="text-xs text-slate-400 mb-5">Formats : .xlsx, .xls</p>
                  <input type="file" accept=".xlsx,.xls" className="hidden" id="fu"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f && !yearIsBlocked) processFile(f);
                    }} />
                  <label htmlFor={yearIsBlocked ? undefined : 'fu'}
                    className={`inline-flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-xl shadow-sm transition-all ${
                      yearIsBlocked
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        : 'bg-[#1e2a5e] hover:bg-[#2a3875] text-white cursor-pointer'
                    }`}>
                    <FileUp size={14} strokeWidth={2.5} />Parcourir
                  </label>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-violet-50 rounded-2xl flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-violet-500 flex items-center justify-center shrink-0">
                    <Copy size={15} className="text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-violet-900">Duplication</p>
                    <p className="text-xs text-violet-600 mt-0.5">
                      Occurrences régénérées pour <strong>{scopeLabel}</strong>.
                    </p>
                  </div>
                </div>

                <div className={fieldWrap}>
                  <label className={labelCls}>
                    <span className="flex items-center gap-1.5">
                      <Calendar size={11} className="text-slate-400" />Année source
                    </span>
                  </label>
                  <div className="relative max-w-xs">
                    <select value={sourceYear} onChange={e => setSourceYear(Number(e.target.value))}
                      className={`${selectCls} pl-3.5 pr-9`}>
                      {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {sourceYear === planYear && (
                  <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 rounded-xl p-3">
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                    <span>Les années source et cible doivent être <strong>différentes</strong>.</span>
                  </div>
                )}

                <button onClick={loadDuplicate}
                  disabled={loadingDup || !effectiveUniteId || sourceYear === planYear}
                  className="flex items-center gap-2 px-5 py-2.5 bg-violet-500 hover:bg-violet-600 text-white rounded-xl text-sm font-bold shadow-sm disabled:opacity-50 transition-all">
                  {loadingDup
                    ? <><Loader2 size={14} className="animate-spin" />Chargement…</>
                    : <><Copy size={14} />Charger {sourceYear} → {planYear}</>}
                </button>
              </div>
            )}

            {/* Tâches en problème — visible dès que le fichier est traité, avant même
                de passer à l'étape Vérification, pour un retour immédiat. */}
            {errorRows.length > 0 && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertOctagon size={16} className="text-rose-500 shrink-0" />
                  <p className="text-sm font-bold text-rose-800">
                    {errorRows.length} tâche{errorRows.length > 1 ? 's' : ''} en problème
                  </p>
                </div>
                <ul className="space-y-1.5 max-h-56 overflow-y-auto">
                  {errorRows.map(r => (
                    <li key={r.id} className="flex items-start justify-between gap-3 text-xs bg-white rounded-lg px-3 py-2">
                      <span className="font-semibold text-slate-700 shrink-0">
                        {r.atelier} · {r.titre || '(sans titre)'}
                      </span>
                      <span className="text-rose-600 text-right">{r.errors.join(' · ')}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-rose-500 mt-2.5">
                  Ces lignes seront exclues tant qu'elles ne sont pas corrigées — vous pourrez les modifier à l'étape « Vérification ».
                </p>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button onClick={() => setStep(0)}
                className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 font-semibold">
                <ArrowLeft size={14} />Retour
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2 : Vérification ── */}
        {step === 2 && (
          <div className="space-y-4">

            {/* Résumé fichier */}
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500 flex items-center justify-center">
                  <FileSpreadsheet size={20} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{fileName}</p>
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    <span className="text-[11px] text-slate-500"><strong>{rawData.length}</strong> lignes</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-[11px] text-emerald-600 font-semibold">{validRows.length} valides</span>
                    {errorRows.length > 0 && (
                      <><span className="text-slate-300">·</span>
                      <span className="text-[11px] text-rose-600 font-semibold">{errorRows.length} bloquées</span></>
                    )}
                    <span className="text-slate-300">·</span>
                    <span className="text-[11px] text-violet-600 font-semibold">{atelierList.length} onglet(s)</span>
                    {totalTaches > 0 && (
                      <><span className="text-slate-300">·</span>
                      <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                        <ClipboardCheck size={11} />{totalTaches} tâches ({rowsWithTaches} interv.)
                      </span></>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatCard label="Total"    val={rawData.length}    color="slate"  icon={FileSpreadsheet} />
                <StatCard label="Valides"  val={validRows.length}  color="green"  icon={CheckCircle2} />
                <StatCard label="Bloquées" val={errorRows.length}  color={errorRows.length > 0 ? 'red' : 'slate'} icon={AlertOctagon} />
                <StatCard label="Onglets"  val={atelierList.length} color="purple" icon={FileSpreadsheet} />
                <StatCard label="Tâches"   val={totalTaches}       color={totalTaches > 0 ? 'green' : 'slate'} icon={ClipboardCheck} />
              </div>
            </div>

            {/* Info tâches + bouton recharger */}
            <div className="p-4 bg-blue-50 rounded-2xl flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#1e2a5e] flex items-center justify-center shrink-0">
                <ClipboardCheck size={17} className="text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-bold text-[#1e2a5e]">📎 Fichiers Excel de tâches</p>
                    <p className="text-xs text-slate-600 mt-1">
                      Chargées automatiquement via{' '}
                      <code className="text-[10px] bg-white px-1.5 py-0.5 rounded font-mono">fiche_inspection</code>.
                      Sinon uploadez manuellement via <FileUp size={11} className="inline text-[#1e2a5e]" />.
                    </p>
                  </div>
                  <button onClick={() => autoLoadAllTaches(true)} disabled={autoLoadingTaches}
                    className="flex items-center gap-1.5 px-3 py-2 bg-[#1e2a5e] hover:bg-[#2a3875] text-white text-xs font-bold rounded-xl shadow-sm disabled:opacity-50 shrink-0">
                    {autoLoadingTaches
                      ? <><Loader2 size={12} className="animate-spin" />Chargement…</>
                      : <><RotateCcw size={12} />Recharger toutes les fiches</>}
                  </button>
                </div>
              </div>
            </div>

            {/* Erreurs bloquantes */}
            {errorRows.length > 0 && (
              <div className="p-4 bg-rose-50 rounded-2xl flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500 flex items-center justify-center shrink-0">
                  <AlertOctagon size={17} className="text-white" />
                </div>
                <div>
                  <p className="font-bold text-rose-800">{errorRows.length} bloquée(s)</p>
                  <p className="text-sm text-rose-600 mt-0.5">Cliquez sur une ligne puis Modifier.</p>
                </div>
              </div>
            )}

            {/* Filtres + onglets */}
            <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" placeholder="Rechercher…" value={searchFilter}
                    onChange={e => {
                      setSearchFilter(e.target.value);
                      if (e.target.value) setActiveAtelier(null);
                      setSelectedRowId(null);
                    }}
                    className="w-full pl-10 pr-8 py-2.5 text-sm rounded-xl focus:ring-2 focus:ring-[#1e2a5e]/20 outline-none bg-slate-50 border border-transparent focus:bg-white focus:border-[#1e2a5e]/30" />
                  {searchFilter && (
                    <button onClick={() => setSearchFilter('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X size={13} />
                    </button>
                  )}
                </div>
                <button onClick={() => addRow(activeAtelier || atelierList[0] || '')}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-sm ml-auto">
                  <Plus size={13} />Ajouter
                </button>
              </div>

              {!isFiltering && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button onClick={() => { setActiveAtelier(null); setSelectedRowId(null); }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      activeAtelier === null
                        ? 'bg-[#1e2a5e] text-white shadow-sm'
                        : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                    }`}>
                    Tous ({rawData.length})
                  </button>
                  {atelierList.map(atelier => (
                    <button key={atelier}
                      onClick={() => { setActiveAtelier(atelier); setSelectedRowId(null); }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        activeAtelier === atelier
                          ? 'bg-violet-500 text-white shadow-sm'
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}>
                      {atelier} ({atelierGroups[atelier]?.length ?? 0})
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Table */}
            {isFiltering ? (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <FullTable rows={filteredData} selectedId={selectedRowId}
                  onSelectRow={setSelectedRowId} showAtelier
                  onUploadTaches={handleUploadTaches} onClearTaches={handleClearTaches} />
              </div>
            ) : (
              <div className="space-y-3">
                {atelierList.map(atelier => {
                  if (activeAtelier && atelier !== activeAtelier) return null;
                  const aRows = atelierGroups[atelier];
                  const isCollapsed = collapsedAteliers.has(atelier);
                  const atelierTaches = aRows.reduce((s, r) => s + (r.taches?.length || 0), 0);
                  return (
                    <div key={atelier} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                      <div
                        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-50 border-b border-slate-100"
                        onClick={() => toggleAtelierCollapse(atelier)}>
                        <div className="w-9 h-9 rounded-2xl bg-violet-500 flex items-center justify-center shrink-0">
                          <FileSpreadsheet size={15} className="text-white" />
                        </div>
                        <span className="font-bold text-slate-800 text-sm flex-1">
                          {atelier} ({aRows.length})
                        </span>
                        {atelierTaches > 0 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-lg font-bold bg-emerald-50 text-emerald-700 flex items-center gap-1">
                            <ClipboardCheck size={10} />{atelierTaches} tâches
                          </span>
                        )}
                        <div className="text-slate-400">
                          {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </div>
                      {!isCollapsed && (
                        <FullTable rows={aRows} selectedId={selectedRowId}
                          onSelectRow={setSelectedRowId}
                          onUploadTaches={handleUploadTaches} onClearTaches={handleClearTaches} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Alerte tâches manquantes — bloque le passage à la Consolidation */}
            {rowsMissingTaches.length > 0 && (
              <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 rounded-xl p-3">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  <strong>{rowsMissingTaches.length}</strong> intervention(s) sans aucune tâche :
                  chargez la fiche d'inspection correspondante ou ajoutez les tâches manuellement
                  (bouton « Modifier » de chaque ligne) avant de continuer.
                  {' '}
                  <span className="font-semibold">
                    {rowsMissingTaches.slice(0, 5).map(r => r.titre || '(sans titre)').join(', ')}
                    {rowsMissingTaches.length > 5 ? `, +${rowsMissingTaches.length - 5} autre(s)` : ''}
                  </span>
                </span>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <button onClick={reset}
                className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 font-semibold">
                <RotateCcw size={14} />Recommencer
              </button>
              <button
                onClick={() => {
                  if (conflictingMonths.length > 0 && !monthConflictAction) {
                    setShowMonthConflictModal(true);
                    return;
                  }
                  goToStep3();
                }}
                disabled={!validRows.length || !effectiveUniteId || rowsMissingTaches.length > 0}
                title={rowsMissingTaches.length > 0 ? 'Toutes les interventions doivent avoir au moins une tâche' : undefined}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#1e2a5e] hover:bg-[#2a3875] text-white rounded-xl text-sm font-bold shadow-sm disabled:opacity-50">
                {conflictingMonths.length > 0 && !monthConflictAction && (
                  <AlertOctagon size={13} />
                )}
                Consolidation <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3 : Consolidation ── */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-[#1e2a5e] flex items-center justify-center">
                  <Calendar size={17} className="text-white" />
                </div>
                <h3 className="font-bold text-slate-800 text-base">
                  Consolidation — {scopeLabel}
                </h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Occurrences" val={occurrences.length} color="blue" icon={Calendar} />
                <StatCard label="Sources" val={validRows.length} color="green" icon={CheckCircle2} />
                <StatCard label="Except." val={occurrences.filter(o => o.isExceptionnelle).length} color="purple" icon={Sparkles} />
                <StatCard label="Replanifier" val={cs.needsReschedule.length}
                  color={cs.needsReschedule.length > 0 ? 'red' : 'slate'} icon={AlertTriangle} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <button onClick={() => setStep(2)}
                className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 font-semibold">
                <ArrowLeft size={14} />Retour
              </button>
              <button onClick={() => setStep(4)} disabled={occurrences.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#1e2a5e] hover:bg-[#2a3875] text-white rounded-xl text-sm font-bold shadow-sm disabled:opacity-50">
                Conflits <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4 : Conflits calendrier ── */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 flex items-center justify-center">
                  <AlertTriangle size={17} className="text-white" />
                </div>
                <h3 className="font-bold text-slate-800 text-base">Conflits Calendrier</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="OK"          val={cs.noConflict.length}       color="green"  icon={CheckCircle2} />
                <StatCard label="Week-end"    val={cs.weekendConflicts.length}  color="amber"  icon={Calendar} />
                <StatCard label="Férié"       val={cs.ferieConflicts.length}    color="red"    icon={AlertOctagon} />
                <StatCard label="Replanifier" val={cs.needsReschedule.length}
                  color={cs.needsReschedule.length > 0 ? 'red' : 'slate'} icon={RotateCcw} />
              </div>
            </div>

            {cs.needsReschedule.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 bg-rose-50 border-b border-rose-100">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-2xl bg-rose-500 flex items-center justify-center">
                        <AlertOctagon size={15} className="text-white" />
                      </div>
                      <p className="text-sm font-bold text-rose-800">
                        {cs.needsReschedule.length} à replanifier
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {cs.weekendConflicts.filter(o => o.needsReschedule).length > 0 && (
                        <button onClick={() => applyAllReschedules('weekend')}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold rounded-lg shadow-sm">
                          <Sparkles size={11} />
                          Auto week-end ({cs.weekendConflicts.filter(o => o.needsReschedule).length})
                        </button>
                      )}
                      {cs.ferieConflicts.filter(o => o.needsReschedule).length > 0 && (
                        <button onClick={() => applyAllReschedules('ferie')}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-bold rounded-lg shadow-sm">
                          <Sparkles size={11} />
                          Auto fériés ({cs.ferieConflicts.filter(o => o.needsReschedule).length})
                        </button>
                      )}
                      <button onClick={() => applyAllReschedules('all')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e2a5e] hover:bg-[#2a3875] text-white text-[11px] font-bold rounded-lg shadow-md">
                        <Zap size={11} />Tout replanifier
                      </button>
                    </div>
                  </div>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-rose-50 z-10">
                      <tr>
                        {['Titre','Date','Conflit','Nouvelle date','Action'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left font-bold text-rose-700 uppercase tracking-wider text-[10px]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rose-100">
                      {cs.needsReschedule.map((o, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 font-semibold text-slate-800 max-w-[140px] truncate">{o.titre}</td>
                          <td className="px-3 py-2 font-mono text-rose-700">{o.date}</td>
                          <td className="px-3 py-2 text-[10px] text-rose-600">{o.conflictDetail.split('→')[0].trim()}</td>
                          <td className="px-3 py-2">
                            <input type="date" defaultValue={o.suggestedDate || ''}
                              onChange={e => applyReschedule(o.rowId, o.date, e.target.value)}
                              className="rounded-lg px-2 py-1 text-xs outline-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[#1e2a5e]/20" />
                          </td>
                          <td className="px-3 py-2">
                            {o.suggestedDate && (
                              <button onClick={() => applyReschedule(o.rowId, o.date, o.suggestedDate!)}
                                className="text-[10px] px-2 py-1 bg-[#1e2a5e] hover:bg-[#2a3875] text-white rounded-lg font-bold">
                                ✓ {o.suggestedDate}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {cs.needsReschedule.length > 0 && (
              <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 rounded-xl p-3">
                <AlertOctagon size={13} className="shrink-0 mt-0.5" />
                <span>
                  <strong>{cs.needsReschedule.length} conflit(s)</strong> week-end/férié non résolu(s).
                  Utilisez les boutons « Auto » ou choisissez une nouvelle date pour chaque ligne
                  avant de pouvoir passer à l'étape suivante.
                </span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <button onClick={() => setStep(3)}
                className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 font-semibold">
                <ArrowLeft size={14} />Retour
              </button>
              <button onClick={() => { setStep(5); checkConges(); }} disabled={cs.needsReschedule.length > 0}
                title={cs.needsReschedule.length > 0 ? 'Résolvez tous les conflits week-end/férié avant de continuer' : undefined}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#1e2a5e] hover:bg-[#2a3875] text-white rounded-xl text-sm font-bold shadow-sm disabled:opacity-50">
                Congés & Surcharge <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 5 : Surcharge + Congés ── */}
        {step === 5 && (
          <div className="space-y-4">

            {/* Sous-étape Surcharge */}
            {!showCongeStep && (
              <>
                <div className="bg-white rounded-2xl shadow-sm p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-500 flex items-center justify-center">
                      <Users size={17} className="text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-base">Surcharge Horaire</h3>
                      <p className="text-[11px] text-slate-400">
                        (temps ÷ nb_tech) + temps logistique (colonne Excel, {LOGISTICS_H * 60}min par défaut) · Seuil : {maxHoursPerDay}h/jour
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-indigo-50 rounded-2xl space-y-3 mb-4">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">
                        Seuil max / jour
                      </label>
                      <div className="flex items-center gap-2">
                        <input type="number" min={1} max={8} step={0.5} value={maxHoursPerDay}
                          onChange={e => setMaxHoursPerDay(Math.min(8, Math.max(1, Number(e.target.value) || 1)))}
                          className="w-20 px-3 py-2 rounded-xl text-center font-bold text-indigo-700 bg-white outline-none focus:ring-2 focus:ring-indigo-500/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                        <span className="text-sm font-bold text-indigo-700">h/jour</span>
                      </div>
                    </div>
                    <input type="range" min={1} max={8} step={0.5} value={maxHoursPerDay}
                      onChange={e => setMaxHoursPerDay(Number(e.target.value))}
                      className="w-full h-2 bg-indigo-200 rounded-lg accent-indigo-500 cursor-pointer" />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <StatCard label="Techniciens vérifiés" val={validRows.filter(r => r.techniciens_noms).length} color="blue" icon={Users} />
                    <StatCard label="Surcharges" val={overloads.length} color={overloads.length > 0 ? 'red' : 'green'} icon={AlertOctagon} />
                    <StatCard label="Seuil" val={`${maxHoursPerDay}h`} color="slate" icon={Shield} />
                  </div>
                </div>

                {overloads.length === 0 ? (
                  <div className="bg-emerald-50 rounded-2xl p-8 text-center">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500 flex items-center justify-center shadow-lg mb-3">
                      <CheckCircle2 size={28} className="text-white" />
                    </div>
                    <p className="font-bold text-emerald-800 text-lg">Aucune surcharge 🎉</p>
                    <p className="text-sm text-emerald-600 mt-1">Toutes les charges sont ≤ {maxHoursPerDay}h/jour.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    <div className="p-4 bg-rose-50 flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-2xl bg-rose-500 flex items-center justify-center">
                          <AlertOctagon size={15} className="text-white" />
                        </div>
                        <p className="text-sm font-bold text-rose-800">
                          {overloads.length} surcharge(s) détectée(s)
                        </p>
                      </div>
                      <button onClick={autoBalanceCharge} disabled={autoBalancing}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-[#1e2a5e] hover:bg-[#2a3875] text-white text-[11px] font-bold rounded-xl shadow-sm disabled:opacity-50">
                        {autoBalancing
                          ? <><Loader2 size={12} className="animate-spin" />Équilibrage…</>
                          : <><Sparkles size={12} />Équilibrer automatiquement</>}
                      </button>
                    </div>
                    <div className="max-h-[420px] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-rose-50 z-10">
                          <tr>
                            {['', 'Technicien', 'Unité', 'Date', 'Total', 'Seuil', 'Dépassement', 'Gravité'].map(h => (
                              <th key={h} className="px-3 py-2.5 text-left font-bold text-rose-700 uppercase tracking-wider text-[10px]">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-rose-100">
                          {overloads.map((o, i) => {
                            const ratio = o.totalH / maxHoursPerDay;
                            const [sevLabel, sevCls] = ratio >= 2
                              ? ['Critique', 'bg-rose-100 text-rose-700']
                              : ratio >= 1.5
                                ? ['Élevée', 'bg-orange-100 text-orange-700']
                                : ['Faible', 'bg-amber-100 text-amber-700'];
                            const isOpen = expandedOverload.has(i);
                            return (
                              <Fragment key={i}>
                                <tr className="bg-rose-50/30 hover:bg-rose-50/50 cursor-pointer"
                                  onClick={() => setExpandedOverload(prev => {
                                    const next = new Set(prev);
                                    next.has(i) ? next.delete(i) : next.add(i);
                                    return next;
                                  })}>
                                  <td className="px-3 py-2 text-slate-400">
                                    <ChevronRight size={13} className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                                  </td>
                                  <td className="px-3 py-2 font-bold text-rose-700">{o.technicien}</td>
                                  <td className="px-3 py-2">
                                    <span className="text-[10px] px-2 py-0.5 rounded-lg font-bold bg-violet-50 text-violet-700">
                                      {effectiveUnite?.code ?? '—'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 font-mono text-slate-600">{o.date}</td>
                                  <td className="px-3 py-2 font-bold text-rose-700">{o.totalH.toFixed(1)}h</td>
                                  <td className="px-3 py-2">{maxHoursPerDay}h</td>
                                  <td className="px-3 py-2 text-rose-600 font-bold">+{(o.totalH - maxHoursPerDay).toFixed(1)}h</td>
                                  <td className="px-3 py-2">
                                    <span className={`text-[10px] px-2 py-0.5 rounded-lg font-bold ${sevCls}`}>
                                      {sevLabel}
                                    </span>
                                  </td>
                                </tr>
                                {isOpen && (
                                  <tr>
                                    <td colSpan={8} className="px-3 pb-3 bg-rose-50/20">
                                      <div className="bg-white rounded-xl ring-1 ring-rose-100 overflow-hidden ml-6">
                                        <table className="w-full text-[11px]">
                                          <thead className="bg-slate-50">
                                            <tr>
                                              {['Intervention', 'Atelier', 'Durée', 'Tps logistique', 'Charge', 'Réaffecter'].map(h => (
                                                <th key={h} className="px-2.5 py-2 text-left font-bold text-slate-400 uppercase tracking-wider text-[9px]">{h}</th>
                                              ))}
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-50">
                                            {o.details.map((d, di) => {
                                              const row = validRows.find(r => r.id === d.rowId);
                                              const currentNames = row?.techniciens_noms.split(/[,;]/).map(s => s.trim()).filter(Boolean) || [];
                                              const alternatives = getReassignAlternatives(d.rowId, currentNames);
                                              return (
                                                <tr key={di}>
                                                  <td className="px-2.5 py-2 font-semibold text-slate-700 max-w-[180px] truncate">{d.titre}</td>
                                                  <td className="px-2.5 py-2 text-slate-500">{d.atelier}</td>
                                                  <td className="px-2.5 py-2 text-slate-500">{d.dureeH.toFixed(2)}h</td>
                                                  <td className="px-2.5 py-2 text-slate-500">{d.logistiqueH.toFixed(2)}h</td>
                                                  <td className="px-2.5 py-2 font-bold text-slate-700">{d.chargeH.toFixed(2)}h</td>
                                                  <td className="px-2.5 py-2">
                                                    <select defaultValue="" onClick={e => e.stopPropagation()}
                                                      onChange={e => {
                                                        if (e.target.value) reassignTechnicien(d.rowId, o.technicien, e.target.value);
                                                      }}
                                                      className="text-[10px] rounded-lg px-2 py-1 bg-white text-[#1e2a5e] cursor-pointer hover:bg-slate-50 font-bold ring-1 ring-slate-200 max-w-[210px]">
                                                      <option value="">↻ Réaffecter…</option>
                                                      {alternatives.length === 0
                                                        ? <option disabled>⚠ Aucun autre technicien disponible</option>
                                                        : alternatives.map(t => {
                                                            const name = `${t.prenom} ${t.nom}`;
                                                            const sameAtelier = t.atelier_id === row?.atelier_id;
                                                            return (
                                                              <option key={t.id} value={name}>
                                                                {sameAtelier ? '' : '⇄ '}{name} [{t.atelier_code}] ({(techTotalCharge[name] || 0).toFixed(1)}h plan)
                                                              </option>
                                                            );
                                                          })}
                                                    </select>
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <button onClick={() => setShowCongeStep(true)}
                    className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 font-semibold">
                    <ArrowLeft size={14} />Retour congés
                  </button>
                  <button onClick={() => setStep(6)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[#1e2a5e] hover:bg-[#2a3875] text-white rounded-xl text-sm font-bold shadow-sm">
                    Continuer <ArrowRight size={14} />
                  </button>
                </div>
              </>
            )}

            {/* Sous-étape Congés */}
            {showCongeStep && (
              <>
                <div className="bg-white rounded-2xl shadow-sm p-5">
                  <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-rose-500 flex items-center justify-center">
                        <CalendarDays size={17} className="text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800 text-base">Vérification des Congés</h3>
                        <p className="text-[11px] text-slate-400">
                          Techniciens en congé pendant les interventions planifiées
                        </p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setShowCongeStep(false)}
                      className="flex items-center gap-1.5 text-[11px] font-bold text-[#1e2a5e] hover:underline shrink-0">
                      <Users size={12} />Voir le détail des surcharges <ArrowRight size={12} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <StatCard label="Conflits" val={congeConflicts.length}
                      color={congeConflicts.length > 0 ? 'red' : 'green'} icon={AlertOctagon} />
                    <StatCard label="Résolus" val={congeConflicts.filter(c => c.resolved).length}
                      color="green" icon={CheckCircle2} />
                    <StatCard label="En attente" val={congeConflicts.filter(c => !c.resolved).length}
                      color={congeConflicts.some(c => !c.resolved) ? 'amber' : 'green'} icon={AlertTriangle} />
                    <StatCard label="Remplaçants" val={techDispoCharges.length}
                      color="blue" icon={Users} />
                    <StatCard label="Surcharges" val={overloads.length}
                      color={overloads.length > 0 ? 'red' : 'green'} icon={AlertOctagon} />
                  </div>
                </div>

                {loadingConges && (
                  <div className="bg-white rounded-2xl shadow-sm p-10 flex flex-col items-center gap-3">
                    <Loader2 size={32} className="animate-spin text-rose-500" />
                    <p className="text-sm font-bold text-slate-500">Vérification en cours…</p>
                  </div>
                )}

                {!loadingConges && congeConflicts.length === 0 && (
                  <div className="bg-emerald-50 rounded-2xl p-10 text-center">
                    <div className="w-20 h-20 mx-auto rounded-2xl bg-emerald-500 flex items-center justify-center shadow-lg mb-4">
                      <CheckCircle2 size={36} className="text-white" strokeWidth={2.5} />
                    </div>
                    <h3 className="font-bold text-emerald-800 text-xl mb-2">✨ Aucun conflit de congé</h3>
                    <p className="text-sm text-emerald-600 max-w-md mx-auto">
                      Tous les techniciens sont <strong>disponibles</strong> sur les dates planifiées.
                    </p>
                  </div>
                )}

                {!loadingConges && congeConflicts.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 bg-rose-50 flex items-center justify-between">
                      <span className="text-xs font-bold text-rose-700 uppercase flex items-center gap-2">
                        <AlertTriangle size={14} />Résolution
                      </span>
                      <span className="text-[11px] font-bold">
                        <span className="text-emerald-600">{congeConflicts.filter(c => c.resolved).length}</span>
                        /<span className="text-rose-600">{congeConflicts.length}</span>
                      </span>
                    </div>
                    <div className="max-h-[500px] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-slate-50 z-10 border-b border-slate-100">
                          <tr>
                            {['#','Intervention','Date','Tech. absent','Congé','Motif','Remplaçant',''].map(h => (
                              <th key={h} className="px-3 py-2.5 text-left font-bold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {congeConflicts.map((conflict, idx) => {
                            const rowData = rawData.find(r => r.id === conflict.rowId);
                            const names = rowData?.techniciens_noms.split(/[,;]/).map(s => s.trim()).filter(Boolean) || [];
                            const chargePerTech = ((rowData?.temps_h || 1) / Math.max(names.length, 1)) + logisticsHOf(rowData);
                            const avail = techDispoCharges
                              .filter(t =>
                                t.id !== conflict.technicienId &&
                                !names.some(n => n.toLowerCase().trim() === t.nom_complet.toLowerCase().trim()) &&
                                !congeConflicts.some(cc =>
                                  cc.technicienId === t.id && cc.date === conflict.date && !cc.resolved
                                ) &&
                                ((t.heuresJour[conflict.date] || 0) + chargePerTech) <= maxHoursPerDay
                              )
                              .sort((a, b) =>
                                (a.heuresJour[conflict.date] || 0) - (b.heuresJour[conflict.date] || 0)
                              );

                            return (
                              <tr key={idx} className={conflict.resolved ? 'bg-emerald-50/40' : 'bg-rose-50/30'}>
                                <td className="px-3 py-2.5 text-slate-400">{idx + 1}</td>
                                <td className="px-3 py-2.5 font-semibold text-slate-800 max-w-[120px] truncate">
                                  {conflict.titre}
                                </td>
                                <td className="px-3 py-2.5 font-mono text-slate-700 font-bold">
                                  {conflict.date}
                                </td>
                                <td className="px-3 py-2.5">
                                  <span className="text-[10px] px-2 py-0.5 rounded-lg font-bold bg-rose-100 text-rose-700 line-through">
                                    ❌ {conflict.technicienNom}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-[10px] text-rose-600 whitespace-nowrap">
                                  {conflict.congeDebut} → {conflict.congeFin}
                                </td>
                                <td className="px-3 py-2.5">
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold">
                                    {conflict.congeMotif}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 min-w-[200px]">
                                  {conflict.resolved ? (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[10px] px-2 py-0.5 rounded-lg font-bold bg-emerald-100 text-emerald-700">
                                        ✅ {conflict.remplacantNom}
                                      </span>
                                      <button
                                        onClick={() => {
                                          setCongeConflicts(prev => {
                                            const c = prev[idx];
                                            if (c?.remplacantId) {
                                              const dr = rawDataRef.current.find(r => r.id === c.rowId);
                                              const ns = dr?.techniciens_noms.split(/[,;]/).map(s => s.trim()).filter(Boolean) || [];
                                              const ch = ((dr?.temps_h || 1) / Math.max(ns.length, 1)) + logisticsHOf(dr);
                                              setTimeout(() => {
                                                setTechDispoCharges(p => p.map(t =>
                                                  t.id !== c.remplacantId ? t : {
                                                    ...t,
                                                    heuresJour: {
                                                      ...t.heuresJour,
                                                      [c.date]: Math.max(0, (t.heuresJour[c.date] || 0) - ch)
                                                    }
                                                  }
                                                ));
                                              }, 0);
                                            }
                                            return prev.map((cc, i) =>
                                              i === idx
                                                ? { ...cc, resolved: false, remplacantId: undefined, remplacantNom: undefined }
                                                : cc
                                            );
                                          });
                                        }}
                                        className="w-5 h-5 rounded flex items-center justify-center text-emerald-400 hover:text-rose-500 hover:bg-rose-50">
                                        <X size={10} />
                                      </button>
                                    </div>
                                  ) : (
                                    <select defaultValue=""
                                      onChange={e => {
                                        const t = techDispoCharges.find(t => t.id === Number(e.target.value));
                                        if (t) resolveCongeConflict(idx, t);
                                      }}
                                      className="text-[10px] rounded-lg px-2 py-1.5 bg-white text-indigo-600 cursor-pointer hover:bg-indigo-50 font-bold w-full max-w-[220px] ring-1 ring-indigo-200">
                                      <option value="">＋ Remplaçant…</option>
                                      {avail.length === 0
                                        ? <option disabled>⚠ Aucun disponible</option>
                                        : avail.map(t => {
                                            const h = t.heuresJour[conflict.date] || 0;
                                            const a = h + chargePerTech;
                                            return (
                                              <option key={t.id} value={t.id}>
                                                {t.nom_complet} [{t.atelier_code}] ({h.toFixed(1)}→{a.toFixed(1)}h/{maxHoursPerDay}h)
                                              </option>
                                            );
                                          })}
                                    </select>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                  {conflict.resolved
                                    ? <span className="text-[10px] px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 font-bold">✅</span>
                                    : <span className="text-[10px] px-2 py-0.5 rounded-lg bg-rose-100 text-rose-700 font-bold animate-pulse">⚠</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between flex-wrap gap-3">
                  <button onClick={() => { setStep(4); setCongeConflicts([]); }}
                    className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 font-semibold">
                    <ArrowLeft size={14} />Retour
                  </button>
                  <div className="flex items-center gap-3">
                    {!loadingConges && congeConflicts.some(c => !c.resolved) && (
                      <p className="text-xs text-rose-600 flex items-center gap-1.5 font-bold">
                        <AlertOctagon size={12} />
                        {congeConflicts.filter(c => !c.resolved).length} non résolu(s)
                      </p>
                    )}
                    {!loadingConges && (
                      <button
                        onClick={() => {
                          if (congeConflicts.length === 0) {
                            setShowCongeStep(false);
                          } else {
                            applyCongeResolutions();
                          }
                        }}
                        disabled={congeConflicts.length > 0 && congeConflicts.some(c => !c.resolved)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-sm disabled:opacity-50">
                        {congeConflicts.length === 0
                          ? <><CheckCircle2 size={14} strokeWidth={2.5} />Continuer <ArrowRight size={14} /></>
                          : <>Appliquer {congeConflicts.filter(c => c.resolved).length}/{congeConflicts.length} & Continuer <ArrowRight size={14} /></>}
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── STEP 6 : Récapitulatif ── */}
        {step === 6 && !published && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500 flex items-center justify-center">
                  <Rocket size={18} className="text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">📋 Récapitulatif final</h3>
                  <p className="text-[11px] text-slate-400">Vérifiez avant de publier</p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                <StatCard label="Interventions"       val={validRows.length}      color="slate"  icon={FileSpreadsheet} />
                <StatCard label={`Occurrences ${planYear}`} val={occurrences.length} color="blue" icon={Calendar} />
                <StatCard label="Tâches"              val={totalTaches}           color={totalTaches > 0 ? 'green' : 'slate'} icon={ClipboardCheck} />
                <StatCard label="Replanifier"         val={cs.needsReschedule.length} color={cs.needsReschedule.length > 0 ? 'amber' : 'green'} icon={AlertTriangle} />
                <StatCard label="Surcharges"          val={overloads.length}      color={overloads.length > 0 ? 'red' : 'green'} icon={Users} />
                <StatCard label="Unité / Année"       val={`${effectiveUnite?.code ?? '—'} · ${planYear}`} color="purple" icon={MapPin} />
              </div>
              {totalTaches > 0 && (
                <div className="p-3 bg-emerald-50 rounded-xl text-sm text-emerald-700 flex items-start gap-2 mb-2">
                  <ClipboardCheck size={14} className="shrink-0 mt-0.5" />
                  <span>
                    ✅ <strong>{totalTaches} tâches</strong> depuis {rowsWithTaches} intervention(s) seront insérées.
                  </span>
                </div>
              )}
              {cs.needsReschedule.length > 0 && (
                <div className="p-3 bg-amber-50 rounded-xl text-sm text-amber-700 flex items-start gap-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>⚠️ {cs.needsReschedule.length} occurrence(s) en conflit publiées telles quelles.</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <button onClick={() => { setStep(5); setShowCongeStep(false); }}
                className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 font-semibold">
                <ArrowLeft size={14} />Retour
              </button>
              <button onClick={handleImport} disabled={importing}
                className="flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-sm disabled:opacity-50 transition-all">
                {importing
                  ? <><Loader2 size={14} className="animate-spin" />Publication…</>
                  : <><Rocket size={14} strokeWidth={2.5} />
                      Publier {occurrences.length} occurrence(s){totalTaches > 0 ? ` + ${totalTaches} tâches` : ''}
                    </>}
              </button>
            </div>
          </div>
        )}

        {/* STEP 7 - Résultat final */}
        {step === 7 && published && result && (
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center space-y-4 relative overflow-hidden">
            {/* Decoration */}
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-emerald-100/50 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-blue-100/50 blur-3xl pointer-events-none" />

            <div className="relative">
              <div className="w-20 h-20 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
                <CheckCircle2 size={36} className="text-white" strokeWidth={2.5} />
              </div>
            </div>

            <div className="relative space-y-1">
              <h3 className="text-2xl font-bold text-slate-800">Publication réussie ! 🎉</h3>
              <p className="text-slate-500 text-sm">
                Le planning a été importé avec succès dans la base de données.
              </p>
            </div>

            {/* Stats résultat */}
            <div className="relative grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl mx-auto mt-2">
              <div className="bg-emerald-50 rounded-2xl p-4 text-center">
                <p className="text-2xl font-bold text-emerald-700 tabular-nums">{result.imported}</p>
                <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">Occurrences</p>
              </div>
              {result.tachesImported !== undefined && result.tachesImported > 0 && (
                <div className="bg-blue-50 rounded-2xl p-4 text-center">
                  <p className="text-2xl font-bold text-[#1e2a5e] tabular-nums">{result.tachesImported}</p>
                  <p className="text-[11px] text-blue-600 font-semibold mt-0.5">Tâches</p>
                </div>
              )}
              <div className="bg-violet-50 rounded-2xl p-4 text-center">
                <p className="text-2xl font-bold text-violet-700 tabular-nums">{effectiveUnite?.code ?? '—'}</p>
                <p className="text-[11px] text-violet-600 font-semibold mt-0.5">Unité</p>
              </div>
              <div className="bg-slate-50 rounded-2xl p-4 text-center">
                <p className="text-2xl font-bold text-slate-700 tabular-nums">{planYear}</p>
                <p className="text-[11px] text-slate-500 font-semibold mt-0.5">Année</p>
              </div>
            </div>

            {/* Scope info */}
            {planScope === 'monthly' && (
              <div className="relative inline-flex items-center gap-2 px-4 py-2 bg-violet-50 rounded-xl text-sm text-violet-700 font-semibold">
                <CalendarDays size={14} className="text-violet-500" />
                Période : {scopeLabel}
              </div>
            )}

            {/* Erreurs éventuelles */}
            {result.errors > 0 && (
              <div className="relative max-w-md mx-auto p-3 bg-amber-50 rounded-xl text-sm text-amber-700 flex items-start gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-500" />
                <span>
                  ⚠️ <strong>{result.errors}</strong> intervention(s) n'ont pas pu être insérées.
                  {result.errorDetails && result.errorDetails.length > 0 && (
                    <span className="block text-[11px] text-amber-600 mt-1">
                      Lot(s) en erreur : {result.errorDetails.map(e => `#${e.batch}`).join(', ')}
                    </span>
                  )}
                </span>
              </div>
            )}

            {/* Countdown */}
            <div className="relative max-w-xs mx-auto space-y-2 mt-2">
              <p className="text-sm text-slate-500">
                Redirection automatique dans{' '}
                <strong className="text-[#1e2a5e] tabular-nums">{countdown}s</strong>
              </p>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-[#1e2a5e] h-1.5 rounded-full transition-all duration-1000"
                  style={{ width: `${((5 - countdown) / 5) * 100}%` }}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="relative flex items-center justify-center gap-3 pt-2 flex-wrap">
              <button
                onClick={() => navigate('/planification')}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#1e2a5e] hover:bg-[#2a3875] text-white rounded-xl text-sm font-bold shadow-sm transition-all"
              >
                <ArrowRight size={15} />
                Tableau de bord
              </button>
              <button
                onClick={reset}
                className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 font-semibold transition-all"
              >
                <RotateCcw size={13} />
                Nouveau planning
              </button>
            </div>
          </div>
        )}

      </div>{/* end max-w container */}

      {/* ANIMATIONS CSS */}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up  { animation: slideUp  0.25s ease-out; }
        .animate-slide-down { animation: slideDown 0.25s ease-out; }
      `}</style>

    </div>
  );
}