// src/lib/Ficheurl.ts

const FICHES_SERVER = import.meta.env.VITE_FICHES_SERVER || 'http://localhost:3000';

/**
 * Convertit un chemin de fiche d'inspection en URL HTTP accessible
 * via le serveur Express, avec conversion XLSX → HTML pour visualisation.
 *
 * Les fichiers sont des .xlsx — le serveur les convertit en HTML
 * via le paramètre &format=html pour affichage dans le navigateur.
 */
export function ficheToHttpUrl(fichePath: string | null | undefined): string | null {
  const cleaned = normalizePath(fichePath);
  if (!cleaned) return null;

  // &format=html → le serveur renvoie le XLSX converti en HTML lisible
  const url = `${FICHES_SERVER}/api/fichiers/fiches?path=${encodeURIComponent(cleaned)}&format=html`;
  console.log(`🔗 ficheToHttpUrl: "${fichePath}" → "${url}"`);
  return url;
}

/**
 * URL de téléchargement brut du fichier XLSX (sans conversion)
 */
export function ficheToDownloadUrl(fichePath: string | null | undefined): string | null {
  const cleaned = normalizePath(fichePath);
  if (!cleaned) return null;

  const url = `${FICHES_SERVER}/api/fichiers/fiches?path=${encodeURIComponent(cleaned)}`;
  console.log(`⬇️  ficheToDownloadUrl: "${fichePath}" → "${url}"`);
  return url;
}

/**
 * URL brute pour l'impression serveur (utilisée par /api/print-fiches)
 * Le serveur accède directement au fichier via resolveFilePath()
 * donc on passe le chemin nettoyé directement.
 */
export function ficheToPrintUrl(fichePath: string | null | undefined): string | null {
  const cleaned = normalizePath(fichePath);
  if (!cleaned) return null;

  // Le endpoint print-fiches utilise resolveFilePath() côté serveur
  // il n'a pas besoin du format=html, il lit le XLSX directement
  const url = `${FICHES_SERVER}/api/fichiers/fiches?path=${encodeURIComponent(cleaned)}`;
  return url;
}

// ─── Normalisation interne ─────────────────────────────────────────────────────

/**
 * Nettoie et normalise un chemin de fiche quelle que soit sa forme :
 * - Chemin Windows absolu : C:\Users\...\CFA\fiche.xlsx
 * - Chemin mixte doublé  : C:/.../Downloads/C:/.../CFA/fiche.xlsx
 * - Chemin relatif        : CFA/fiche.xlsx
 * - Nom de fichier seul   : fiche.xlsx
 *
 * Retourne toujours un chemin relatif propre (ex: "CFA/fiche.xlsx")
 * ou null si le chemin est invalide.
 */
function normalizePath(fichePath: string | null | undefined): string | null {
  if (!fichePath) return null;

  let cleaned = String(fichePath).trim();
  if (!cleaned) return null;

  // 1. Uniformiser les séparateurs
  cleaned = cleaned.replace(/\\/g, '/');

  // 2. Si chemin doublé avec lettre de lecteur (ex: "C:/.../C:/...")
  //    → garder uniquement la dernière occurrence après le dernier ":"
  const lastDriveMatch = cleaned.match(/.*[a-zA-Z]:\/(.+)$/);
  if (lastDriveMatch) {
    cleaned = lastDriveMatch[1];
  }

  // 3. Chercher un dossier atelier connu pour extraire le chemin relatif
  //    Ajoutez ici vos propres codes d'atelier si nécessaire
  const KNOWN_FOLDERS = [
    'CFA', 'CFO', 'LAC', 'VOIE', 'BT', 'MAT',
    'SIG', 'TR', 'TRACTION', 'ELEC', 'MECA', 'INF',
  ];
  const folderPattern = new RegExp(`(${KNOWN_FOLDERS.join('|')})\\/`, 'i');
  const folderMatch = cleaned.match(folderPattern);

  if (folderMatch) {
    // Extraire depuis le dossier atelier (ex: "CFA/fiche.xlsx")
    const idx = cleaned.lastIndexOf(folderMatch[0]);
    cleaned = cleaned.substring(idx);
  } else {
    // Pas de dossier atelier connu → garder uniquement le nom du fichier
    // après avoir filtré les segments système (Users, Downloads, etc.)
    const SYSTEM_SEGMENTS = [
      'users', 'downloads', 'documents', 'desktop',
      'appdata', 'temp', 'tmp', 'public',
    ];

    const parts = cleaned.split('/').filter(Boolean);
    const hasSystemSegment = parts.some(p =>
      /^[a-zA-Z]:$/.test(p) ||
      SYSTEM_SEGMENTS.includes(p.toLowerCase())
    );

    if (hasSystemSegment) {
      // Garder uniquement le nom de fichier
      const fileName = parts[parts.length - 1];
      cleaned = fileName || '';
    }
  }

  // 4. Supprimer les slashes initiaux résiduels
  cleaned = cleaned.replace(/^\/+/, '').trim();

  // 5. Vérifications de sécurité
  if (!cleaned) return null;
  if (cleaned.includes('..')) return null;       // path traversal
  if (/^[a-zA-Z]:/.test(cleaned)) return null;  // lettre de lecteur résiduelle

  // 6. S'assurer que c'est bien un fichier .xlsx (ou sans extension → on laisse passer)
  const ext = cleaned.split('.').pop()?.toLowerCase();
  if (ext && !['xlsx', 'xls', 'xlsm', 'xlsb'].includes(ext)) {
    console.warn(`⚠️  ficheToHttpUrl: extension inattendue "${ext}" pour "${fichePath}"`);
    // On laisse passer quand même — le serveur gérera l'erreur
  }

  return cleaned;
}