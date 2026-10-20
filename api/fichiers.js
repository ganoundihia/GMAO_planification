// api/fichiers.js
// ══════════════════════════════════════════════════════════════════════════════
//  Consultation / téléchargement des fiches .xlsx.
//  Le rendu HTML utilise le même moteur que l'impression groupée, donc la
//  prévisualisation à l'écran est identique au PDF final.
// ══════════════════════════════════════════════════════════════════════════════

import express from 'express';
import fs from 'fs';
import path from 'path';
import { xlsxToHtmlSheets, SHEET_CSS, escapeHtml } from './xlsxToHtml.js';

const router = express.Router();
const FICHES_ROOT = process.env.FICHES_ROOT || './fiches-test';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// ─── Génération de la page de consultation ────────────────────────────────────

async function generateHTML(filePath) {
  const { sheets, fileName } = await xlsxToHtmlSheets(filePath);
  const title = path.basename(filePath, path.extname(filePath));

  const pages = sheets.map((sheet, i) => `
    <section class="xl-page${sheet.landscape ? ' landscape' : ''}">
      ${sheets.length > 1 ? `
        <div class="xl-caption">
          <span class="badge">Feuille ${i + 1}/${sheets.length}</span>
          <span class="titre">${escapeHtml(sheet.name)}</span>
        </div>` : ''}
      ${sheet.html}
    </section>`).join('\n');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${SHEET_CSS}</style>
</head>
<body>
  <div class="toolbar no-print">
    <h1>${escapeHtml(title)}</h1>
    <span class="info">${escapeHtml(fileName)} · ${sheets.length} feuille${sheets.length > 1 ? 's' : ''}</span>
    <button class="btn-print" onclick="window.print()">Imprimer / PDF</button>
  </div>
  ${pages}
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
}

// ─── Chemins ──────────────────────────────────────────────────────────────────

function safeResolve(relPath) {
  const clean = String(relPath).replace(/\\/g, '/').replace(/^\/+/, '');
  if (!clean || clean.includes('..') || /^[a-zA-Z]:/.test(clean)) return null;
  const full = path.join(FICHES_ROOT, clean);
  // Vérifier que le chemin reste bien dans la racine
  const root = path.resolve(FICHES_ROOT);
  if (!path.resolve(full).startsWith(root + path.sep)) return null;
  return full;
}

function findByName(dir, name) {
  const target = String(name).split('/').pop().toLowerCase();
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findByName(full, target);
      if (found) return found;
    } else if (entry.name.toLowerCase() === target) {
      return full;
    }
  }
  return null;
}

function walkXlsx(dir, base = '') {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...walkXlsx(path.join(dir, entry.name), rel));
    } else if (/\.xlsx?$/i.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get('/fiches', async (req, res) => {
  const { path: relPath, format } = req.query;
  if (!relPath) return res.status(400).json({ error: 'Paramètre "path" requis' });

  const filePath = safeResolve(relPath);
  if (!filePath) return res.status(403).json({ error: 'Chemin non autorisé' });
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fiche introuvable' });

  if (format === 'html') {
    try {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(await generateHTML(filePath));
    } catch (err) {
      console.error('Rendu HTML :', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  res.setHeader('Content-Type', XLSX_MIME);
  return fs.createReadStream(filePath).pipe(res);
});

router.get('/fiches-list', (req, res) => {
  const files = walkXlsx(FICHES_ROOT);
  res.json({ root: FICHES_ROOT, count: files.length, files });
});

router.get('/fiches-search', async (req, res) => {
  const { name, format } = req.query;
  if (!name) return res.status(400).json({ error: 'Paramètre "name" requis' });

  const found = findByName(FICHES_ROOT, name);
  if (!found) return res.status(404).json({ error: 'Fiche introuvable' });

  if (format === 'html') {
    try {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(await generateHTML(found));
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.setHeader('Content-Type', XLSX_MIME);
  return fs.createReadStream(found).pipe(res);
});

export default router;