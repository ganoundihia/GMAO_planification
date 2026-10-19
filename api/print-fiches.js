// api/print-fiches.js
// ══════════════════════════════════════════════════════════════════════════════
//  Impression groupée des fiches d'inspection.
//  Chaque fiche .xlsx est rendue comme un export PDF d'Excel : charte conservée,
//  une feuille = une page A4.
// ══════════════════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { xlsxToHtmlSheets, SHEET_CSS, escapeHtml } from './xlsxToHtml.js';

const FICHES_ROOT = process.env.FICHES_ROOT || './fiches-test';

// Hauteur réservée au bandeau « Fiche n/N » en haut de chaque page (px)
const CAPTION_HEIGHT = 46;

// ─── Résolution du chemin ─────────────────────────────────────────────────────

function searchFile(dir, targetName) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = searchFile(full, targetName);
      if (found) return found;
    } else if (entry.name.toLowerCase() === targetName.toLowerCase()) {
      return full;
    }
  }
  return null;
}

function resolveFilePath(ficheUrl) {
  if (!ficheUrl) return null;

  let clean = String(ficheUrl).trim();
  const paramMatch = clean.match(/[?&]path=([^&]+)/);
  if (paramMatch) clean = decodeURIComponent(paramMatch[1]);

  clean = clean.replace(/\\/g, '/').replace(/^\/+/, '').replace(/[?#].*$/, '').trim();

  // Sécurité : pas de remontée de répertoire ni de chemin absolu Windows
  if (!clean || clean.includes('..') || /^[a-zA-Z]:/.test(clean)) return null;

  const direct = path.join(FICHES_ROOT, clean);
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;

  const fileName = path.basename(clean);
  return fileName ? searchFile(FICHES_ROOT, fileName) : null;
}

// ─── Rendu d'une fiche ────────────────────────────────────────────────────────

async function ficheToPages(filePath, titre, index, total, dateLabel) {
  const { sheets } = await xlsxToHtmlSheets(filePath, { reservedHeight: CAPTION_HEIGHT });
  if (sheets.length === 0) throw new Error('Classeur sans feuille exploitable');

  return sheets.map((sheet, i) => {
    const suffix = sheets.length > 1 ? ` — ${escapeHtml(sheet.name)}` : '';
    return `
      <section class="xl-page${sheet.landscape ? ' landscape' : ''}">
        <div class="xl-caption">
          <span class="badge">Fiche ${index}/${total}</span>
          <span class="titre">${escapeHtml(titre)}${suffix}</span>
          <span class="meta">${escapeHtml(dateLabel || '')}${sheets.length > 1 ? ` · feuille ${i + 1}/${sheets.length}` : ''}</span>
        </div>
        ${sheet.html}
      </section>`;
  }).join('\n');
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); }
    catch { return res.status(400).json({ error: 'Body JSON invalide' }); }
  }

  const { date, fiches } = body || {};
  if (!Array.isArray(fiches) || fiches.length === 0) {
    return res.status(400).json({ error: 'fiches array required' });
  }

  const dateLabel = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
      })
    : '';

  const pages = [];
  const errors = [];

  for (let i = 0; i < fiches.length; i++) {
    const fiche = fiches[i];
    const filePath = resolveFilePath(fiche.url);

    if (!filePath) {
      errors.push({ titre: fiche.titre, reason: 'Fichier introuvable sur le serveur' });
      continue;
    }

    try {
      pages.push(await ficheToPages(filePath, fiche.titre, i + 1, fiches.length, dateLabel));
    } catch (err) {
      console.error(`Conversion « ${fiche.titre} » :`, err.message);
      errors.push({ titre: fiche.titre, reason: err.message });
    }
  }

  if (pages.length === 0) {
    return res.status(422).json({
      error: 'Aucune fiche convertie',
      details: errors,
    });
  }

  const errorsHtml = errors.length === 0 ? '' : `
    <div class="errors-block no-print">
      <h3>${errors.length} fiche${errors.length > 1 ? 's' : ''} non convertie${errors.length > 1 ? 's' : ''}</h3>
      ${errors.map(e => `<p>• <b>${escapeHtml(e.titre)}</b> — ${escapeHtml(e.reason)}</p>`).join('')}
    </div>`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Fiches d'inspection — ${escapeHtml(dateLabel)}</title>
  <style>${SHEET_CSS}</style>
</head>
<body>

  <div class="toolbar no-print">
    <h1>Fiches d'inspection</h1>
    <span class="info">
      ${escapeHtml(dateLabel)} · ${pages.length} fiche${pages.length > 1 ? 's' : ''} prête${pages.length > 1 ? 's' : ''}
      ${errors.length > 0 ? ` · ${errors.length} en erreur` : ''}
    </span>
    <button class="btn-print" onclick="window.print()">Imprimer</button>
  </div>

  ${pages.join('\n')}
  ${errorsHtml}

  <script>
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        window.print();
      }
    });
  </script>

</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  return res.send(html);
}