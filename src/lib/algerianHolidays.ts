// src/lib/algerianHolidays.ts

import type { JourFerie, HolidayType } from './types';

// ─────────────────────────────────────────────────────────────
// API KEYS (depuis .env)
// ─────────────────────────────────────────────────────────────
const ABSTRACT_API_KEY     = import.meta.env.VITE_ABSTRACT_API_KEY     || '';
const CALENDARIFIC_API_KEY = import.meta.env.VITE_CALENDARIFIC_API_KEY || '';

// ─────────────────────────────────────────────────────────────
// CACHE EN MÉMOIRE
// ─────────────────────────────────────────────────────────────
interface CacheEntry {
  data: JourFerie[];
  source: string;
  timestamp: number;
}

const cache = new Map<number, CacheEntry>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

// ─────────────────────────────────────────────────────────────
// CACHE localStorage (persiste entre rechargements)
// ─────────────────────────────────────────────────────────────
function saveToLocalStorage(year: number, data: JourFerie[], source: string) {
  try {
    localStorage.setItem(`holidays_${year}`, JSON.stringify({ data, source, ts: Date.now() }));
  } catch { /* quota exceeded — silencieux */ }
}

function loadFromLocalStorage(year: number): CacheEntry | null {
  try {
    const raw = localStorage.getItem(`holidays_${year}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > 7 * CACHE_TTL) return null; // expire après 7 jours
    return { data: parsed.data, source: parsed.source + ' [localStorage]', timestamp: parsed.ts };
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────
// JOURS FÉRIÉS FIXES NATIONAUX ALGÉRIENS
// ─────────────────────────────────────────────────────────────
const FIXED_NATIONAL: { month: number; day: number; nom: string }[] = [
  { month: 1,  day: 1,  nom: "Jour de l'An" },
  { month: 1,  day: 12, nom: "Yennayer — Nouvel An Amazigh" },
  { month: 2,  day: 24, nom: "Journée de la Chahida" },
  { month: 3,  day: 19, nom: "Fête de la Victoire" },
  { month: 5,  day: 1,  nom: "Fête du Travail" },
  { month: 7,  day: 5,  nom: "Fête de l'Indépendance" },
  { month: 11, day: 1,  nom: "Anniversaire de la Révolution" },
];

// ─────────────────────────────────────────────────────────────
// JOURS FÉRIÉS RELIGIEUX — FALLBACK PRÉ-CALCULÉ
// Dates approximatives basées sur le calendrier hégirien.
// Peuvent varier de ±1-2 jours selon l'observation lunaire.
// ─────────────────────────────────────────────────────────────
const RELIGIOUS_FALLBACK: Record<number, { date: string; nom: string }[]> = {
  2025: [
    { date: '2025-01-29', nom: "Mawlid Ennabaoui — Jour 1" },
    { date: '2025-01-30', nom: "Mawlid Ennabaoui — Jour 2" },
    { date: '2025-03-30', nom: "Aïd el-Fitr — Jour 1" },
    { date: '2025-03-31', nom: "Aïd el-Fitr — Jour 2" },
    { date: '2025-06-06', nom: "Aïd el-Adha — Jour 1" },
    { date: '2025-06-07', nom: "Aïd el-Adha — Jour 2" },
    { date: '2025-06-27', nom: "1er Moharram (Nouvel An Hégirien)" },
    { date: '2025-07-06', nom: "Achoura" },
    { date: '2025-11-16', nom: "Isra et Miraj" },
  ],
  2026: [
    { date: '2026-01-18', nom: "Mawlid Ennabaoui — Jour 1" },
    { date: '2026-01-19', nom: "Mawlid Ennabaoui — Jour 2" },
    { date: '2026-03-20', nom: "Aïd el-Fitr — Jour 1" },
    { date: '2026-03-21', nom: "Aïd el-Fitr — Jour 2" },
    { date: '2026-05-27', nom: "Aïd el-Adha — Jour 1" },
    { date: '2026-05-28', nom: "Aïd el-Adha — Jour 2" },
    { date: '2026-06-17', nom: "1er Moharram" },
    { date: '2026-06-26', nom: "Achoura" },
    { date: '2026-11-06', nom: "Isra et Miraj" },
  ],
  2027: [
    { date: '2027-01-07', nom: "Mawlid Ennabaoui — Jour 1" },
    { date: '2027-01-08', nom: "Mawlid Ennabaoui — Jour 2" },
    { date: '2027-03-10', nom: "Aïd el-Fitr — Jour 1" },
    { date: '2027-03-11', nom: "Aïd el-Fitr — Jour 2" },
    { date: '2027-05-16', nom: "Aïd el-Adha — Jour 1" },
    { date: '2027-05-17', nom: "Aïd el-Adha — Jour 2" },
    { date: '2027-06-06', nom: "1er Moharram" },
    { date: '2027-06-15', nom: "Achoura" },
    { date: '2027-10-26', nom: "Isra et Miraj" },
    { date: '2027-12-28', nom: "Mawlid Ennabaoui — Jour 1" },
    { date: '2027-12-29', nom: "Mawlid Ennabaoui — Jour 2" },
  ],
  2028: [
    { date: '2028-02-27', nom: "Aïd el-Fitr — Jour 1" },
    { date: '2028-02-28', nom: "Aïd el-Fitr — Jour 2" },
    { date: '2028-05-05', nom: "Aïd el-Adha — Jour 1" },
    { date: '2028-05-06', nom: "Aïd el-Adha — Jour 2" },
    { date: '2028-05-26', nom: "1er Moharram" },
    { date: '2028-06-04', nom: "Achoura" },
    { date: '2028-10-15', nom: "Isra et Miraj" },
    { date: '2028-12-16', nom: "Mawlid Ennabaoui — Jour 1" },
    { date: '2028-12-17', nom: "Mawlid Ennabaoui — Jour 2" },
  ],
  2029: [
    { date: '2029-02-15', nom: "Aïd el-Fitr — Jour 1" },
    { date: '2029-02-16', nom: "Aïd el-Fitr — Jour 2" },
    { date: '2029-04-24', nom: "Aïd el-Adha — Jour 1" },
    { date: '2029-04-25', nom: "Aïd el-Adha — Jour 2" },
    { date: '2029-05-15', nom: "1er Moharram" },
    { date: '2029-05-24', nom: "Achoura" },
    { date: '2029-10-04', nom: "Isra et Miraj" },
    { date: '2029-12-05', nom: "Mawlid Ennabaoui — Jour 1" },
    { date: '2029-12-06', nom: "Mawlid Ennabaoui — Jour 2" },
  ],
};

// ─────────────────────────────────────────────────────────────
// HELPER : déterminer si un nom correspond à une fête religieuse
// ─────────────────────────────────────────────────────────────
const RELIGIOUS_KEYWORDS = [
  'eid', 'aid', 'aïd', 'fitr', 'adha', 'ramadan', 'mawlid', 'mouloud',
  'achoura', 'moharram', 'muharram', 'isra', 'miraj', 'laylat', 'muslim',
  'islamic', 'hegir', 'hijr', 'prophete', 'prophet', 'nabaoui',
];

function detectHolidayType(name: string, apiType?: string): HolidayType {
  const lower = (name + ' ' + (apiType || '')).toLowerCase();
  if (RELIGIOUS_KEYWORDS.some(kw => lower.includes(kw))) return 'religieux';
  return 'national';
}

// ─────────────────────────────────────────────────────────────
// API 1 : Abstract API — 12,000 requêtes/mois GRATUIT
// https://www.abstractapi.com/api/holidays-api
// ─────────────────────────────────────────────────────────────
async function fetchAbstractAPI(year: number): Promise<{ data: JourFerie[]; source: string } | null> {
  if (!ABSTRACT_API_KEY) return null;

  try {
    const url = `https://holidays.abstractapi.com/v1/?api_key=${ABSTRACT_API_KEY}&country=DZ&year=${year}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (!response.ok) {
      console.warn(`⚠️ Abstract API: HTTP ${response.status}`);
      return null;
    }

    const raw = await response.json();
    if (!Array.isArray(raw) || raw.length === 0) return null;

    const holidays: JourFerie[] = raw.map((h: any, idx: number) => {
      // Abstract API retourne date au format "M/D/YYYY" ou "MM/DD/YYYY"
      let isoDate = '';
      if (h.date_year && h.date_month && h.date_day) {
        isoDate = `${h.date_year}-${String(h.date_month).padStart(2, '0')}-${String(h.date_day).padStart(2, '0')}`;
      } else if (typeof h.date === 'string' && h.date.includes('/')) {
        const parts = h.date.split('/');
        if (parts.length === 3) {
          isoDate = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
        }
      } else {
        isoDate = String(h.date || '').substring(0, 10);
      }

      return {
        id: idx + 1,
        date: isoDate,
        nom: h.name_local || h.name || '',
        type: detectHolidayType(h.name || '', h.type),
        source: 'api' as const,
      };
    }).filter((h: JourFerie) => /^\d{4}-\d{2}-\d{2}$/.test(h.date));

    console.log(`✅ Abstract API: ${holidays.length} fériés pour DZ ${year}`);
    return { data: holidays, source: 'Abstract API (12k/mois)' };
  } catch (err) {
    console.warn('⚠️ Abstract API erreur:', err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// API 2 : Calendarific — 1,000 requêtes/mois GRATUIT
// https://calendarific.com
// ─────────────────────────────────────────────────────────────
async function fetchCalendarific(year: number): Promise<{ data: JourFerie[]; source: string } | null> {
  if (!CALENDARIFIC_API_KEY) return null;

  try {
    const url = `https://calendarific.com/api/v2/holidays?api_key=${CALENDARIFIC_API_KEY}&country=DZ&year=${year}&language=fr`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (!response.ok) return null;

    const result = await response.json();
    const raw = result?.response?.holidays || [];

    if (!Array.isArray(raw) || raw.length === 0) return null;

    const holidays: JourFerie[] = raw.map((h: any, idx: number) => ({
      id: idx + 1,
      date: (h.date?.iso || '').substring(0, 10),
      nom: h.name || '',
      type: detectHolidayType(h.name || '', (h.type || []).join(' ')),
      source: 'api' as const,
    })).filter((h: JourFerie) => /^\d{4}-\d{2}-\d{2}$/.test(h.date));

    console.log(`✅ Calendarific: ${holidays.length} fériés pour DZ ${year}`);
    return { data: holidays, source: 'Calendarific (1k/mois)' };
  } catch (err) {
    console.warn('⚠️ Calendarific erreur:', err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// API 3 : Nager.Date — ILLIMITÉ, sans clé
// https://date.nager.at
// Note : support limité pour l'Algérie, pas de fêtes religieuses
// ─────────────────────────────────────────────────────────────
async function fetchNagerDate(year: number): Promise<{ data: JourFerie[]; source: string } | null> {
  try {
    const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/DZ`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (!response.ok) return null;

    const raw = await response.json();
    if (!Array.isArray(raw) || raw.length === 0) return null;

    const holidays: JourFerie[] = raw.map((h: any, idx: number) => ({
      id: idx + 1,
      date: h.date || '',
      nom: h.localName || h.name || '',
      type: detectHolidayType(h.localName || h.name || ''),
      source: 'api' as const,
    })).filter((h: JourFerie) => /^\d{4}-\d{2}-\d{2}$/.test(h.date));

    console.log(`✅ Nager.Date: ${holidays.length} fériés pour DZ ${year}`);
    return { data: holidays, source: 'Nager.Date (illimité)' };
  } catch (err) {
    console.warn('⚠️ Nager.Date erreur:', err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// FALLBACK LOCAL — toujours disponible
// ─────────────────────────────────────────────────────────────
function getLocalFallback(year: number): { data: JourFerie[]; source: string } {
  const holidays: JourFerie[] = [];

  // Nationaux fixes
  FIXED_NATIONAL.forEach((h, idx) => {
    holidays.push({
      id: idx + 1,
      date: `${year}-${String(h.month).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`,
      nom: h.nom,
      type: 'national',
      source: 'local',
    });
  });

  // Religieux pré-calculés
  const religious = RELIGIOUS_FALLBACK[year];
  if (religious) {
    religious.forEach((h, idx) => {
      holidays.push({
        id: 100 + idx,
        date: h.date,
        nom: h.nom,
        type: 'religieux',
        source: 'local',
      });
    });
  }

  const religCount = religious?.length ?? 0;
  return {
    data: holidays,
    source: `Fallback local (${holidays.length} jours : ${FIXED_NATIONAL.length}N + ${religCount}R)`,
  };
}

// ─────────────────────────────────────────────────────────────
// ENRICHIR : compléter les données API avec le fallback religieux
// ─────────────────────────────────────────────────────────────
function enrichWithLocalReligious(apiHolidays: JourFerie[], year: number): JourFerie[] {
  const religious = RELIGIOUS_FALLBACK[year];
  if (!religious) return apiHolidays;

  const merged = [...apiHolidays];

  religious.forEach((rh, idx) => {
    // Vérifier si cette fête est déjà dans les données API (tolérance ±2 jours)
    const alreadyExists = merged.some(h => {
      const diff = Math.abs(new Date(h.date).getTime() - new Date(rh.date).getTime());
      const sameName = h.nom.toLowerCase().includes(rh.nom.split('—')[0].trim().toLowerCase().substring(0, 6));
      return diff <= 2 * 86400000 && sameName;
    });

    if (!alreadyExists) {
      merged.push({
        id: 200 + idx,
        date: rh.date,
        nom: rh.nom,
        type: 'religieux',
        source: 'local',
      });
    }
  });

  return merged;
}

// ─────────────────────────────────────────────────────────────
// DÉDUPLICATION + TRI
// ─────────────────────────────────────────────────────────────
function deduplicateAndSort(holidays: JourFerie[]): JourFerie[] {
  const seen = new Map<string, JourFerie>();

  holidays.forEach(h => {
    const existing = seen.get(h.date);
    if (!existing) {
      seen.set(h.date, h);
    } else {
      // Priorité : API > local, et nom plus long = plus descriptif
      if (h.source === 'api' && existing.source !== 'api') {
        seen.set(h.date, h);
      } else if (h.nom.length > existing.nom.length && h.source === existing.source) {
        seen.set(h.date, h);
      }
    }
  });

  return Array.from(seen.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((h, idx) => ({ ...h, id: idx + 1 }));
}

// ─────────────────────────────────────────────────────────────
// FONCTION PRINCIPALE EXPORTÉE
// Stratégie de fallback :
//   1. Cache mémoire (24h)
//   2. localStorage (7 jours)
//   3. Abstract API     (12,000/mois gratuit) ⭐
//   4. Calendarific      (1,000/mois gratuit)
//   5. Nager.Date        (illimité, limité pour DZ)
//   6. Fallback local    (toujours disponible)
// ─────────────────────────────────────────────────────────────
export async function fetchAlgerianHolidays(
  year: number
): Promise<{ holidays: JourFerie[]; source: string }> {

  // 1. Cache mémoire
  const memCached = cache.get(year);
  if (memCached && Date.now() - memCached.timestamp < CACHE_TTL) {
    return { holidays: memCached.data, source: `${memCached.source} [mémoire]` };
  }

  // 2. localStorage
  const lsCached = loadFromLocalStorage(year);
  if (lsCached) {
    cache.set(year, lsCached);
    return { holidays: lsCached.data, source: lsCached.source };
  }

  // 3-6. APIs puis fallback
  let result: { data: JourFerie[]; source: string } | null = null;

  // 3. Abstract API (12k/mois)
  result = await fetchAbstractAPI(year);

  // 4. Calendarific (1k/mois)
  if (!result) result = await fetchCalendarific(year);

  // 5. Nager.Date (illimité)
  if (!result) result = await fetchNagerDate(year);

  // 6. Fallback local
  if (!result) result = getLocalFallback(year);

  // Enrichir avec les données religieuses locales si l'API est incomplète
  const isFromApi = result.source.includes('API') || result.source.includes('Nager');
  const enriched = isFromApi
    ? enrichWithLocalReligious(result.data, year)
    : result.data;

  const final = deduplicateAndSort(enriched);
  const source = result.source;

  // Mise en cache
  cache.set(year, { data: final, source, timestamp: Date.now() });
  saveToLocalStorage(year, final, source);

  console.log(`📅 ${final.length} jours fériés algériens — ${year} — ${source}`);
  return { holidays: final, source };
}

// ─────────────────────────────────────────────────────────────
// UTILITAIRES EXPORTÉS
// ─────────────────────────────────────────────────────────────

/** Charger les jours fériés pour plusieurs années */
export async function fetchAlgerianHolidaysMultiYear(
  years: number[]
): Promise<{ holidays: JourFerie[]; sources: Record<number, string> }> {
  const all: JourFerie[] = [];
  const sources: Record<number, string> = {};

  for (const year of years) {
    const { holidays, source } = await fetchAlgerianHolidays(year);
    all.push(...holidays);
    sources[year] = source;
  }

  return { holidays: all, sources };
}

/** Vider le cache (mémoire + localStorage) */
export function clearHolidayCache(year?: number): void {
  if (year) {
    cache.delete(year);
    try { localStorage.removeItem(`holidays_${year}`); } catch { /* */ }
  } else {
    cache.clear();
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('holidays_'))
        .forEach(k => localStorage.removeItem(k));
    } catch { /* */ }
  }
}

/** Stats du cache */
export function getHolidayCacheStats() {
  const memYears = Array.from(cache.keys());
  const lsYears: number[] = [];
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('holidays_'))
      .forEach(k => {
        const y = parseInt(k.replace('holidays_', ''));
        if (!isNaN(y)) lsYears.push(y);
      });
  } catch { /* */ }

  return {
    memory: memYears.map(y => ({
      year: y,
      count: cache.get(y)?.data.length ?? 0,
      source: cache.get(y)?.source ?? '?',
      ageMinutes: Math.round((Date.now() - (cache.get(y)?.timestamp ?? 0)) / 60000),
    })),
    localStorage: lsYears,
    apiKeys: {
      abstract: !!ABSTRACT_API_KEY,
      calendarific: !!CALENDARIFIC_API_KEY,
    },
  };
}

/** Obtenir les années couvertes par le fallback local */
export function getAvailableFallbackYears(): number[] {
  return Object.keys(RELIGIOUS_FALLBACK).map(Number).sort();
}