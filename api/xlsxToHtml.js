// api/xlsxToHtml.js
// ══════════════════════════════════════════════════════════════════════════════
//  Rendu FIDÈLE d'un classeur Excel en HTML prêt à imprimer.
//
//  Objectif : « imprimer comme si on exportait le .xlsx en PDF », en conservant
//  la charte graphique (bordures, fonds, polices, fusions, logo) et en tenant
//  sur une page A4 comme le fait l'option « Ajuster à la page » d'Excel.
//
//  Principe : on rend la feuille à sa taille NATIVE en pixels, puis on applique
//  un facteur d'échelle calculé côté serveur à toutes les dimensions (colonnes,
//  hauteurs de ligne, tailles de police). Aucune transformation CSS n'est
//  utilisée : la pagination reste donc exacte dans tous les navigateurs.
// ══════════════════════════════════════════════════════════════════════════════

import ExcelJS from 'exceljs';

// ─── Surface imprimable en px (96 dpi) ────────────────────────────────────────
// A4 = 210 × 297 mm. Avec 6 mm de marge : 198 × 285 mm.
const A4 = {
  portrait: { w: 748, h: 1075 },
  landscape: { w: 1075, h: 748 },
};
const SAFETY = 0.97; // marge pour la croissance des cellules à texte enveloppé
const PT_TO_PX = 4 / 3;

// ─── Couleurs ─────────────────────────────────────────────────────────────────

const THEME_PALETTE = [
  '#FFFFFF', '#000000', '#E7E6E6', '#44546A', '#4472C4', '#ED7D31',
  '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47', '#0563C1', '#954F72',
];

function argbToHex(argb) {
  if (!argb || typeof argb !== 'string') return null;
  const h = argb.replace(/^#/, '');
  if (h.length === 8) return '#' + h.slice(2);
  if (h.length === 6) return '#' + h;
  return null;
}

function applyTint(hex, tint) {
  if (!tint) return hex;
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  if (tint > 0) {
    r = Math.round(r + (255 - r) * tint);
    g = Math.round(g + (255 - g) * tint);
    b = Math.round(b + (255 - b) * tint);
  } else {
    const t = 1 + tint;
    r = Math.round(r * t);
    g = Math.round(g * t);
    b = Math.round(b * t);
  }
  const c = n => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

function resolveColor(color) {
  if (!color) return null;
  if (color.argb) return argbToHex(color.argb);
  if (typeof color.theme === 'number') {
    const base = THEME_PALETTE[color.theme] || '#000000';
    return applyTint(base, color.tint || 0);
  }
  return null;
}

// ─── Bordures ─────────────────────────────────────────────────────────────────
// ATTENTION : ExcelJS expose `cell.border` (singulier) et non `cell.borders`.

const BORDER_WIDTH = {
  hair: 0.5, thin: 1, dotted: 1, dashed: 1, dashDot: 1, dashDotDot: 1,
  medium: 2, mediumDashed: 2, mediumDashDot: 2, mediumDashDotDot: 2, slantDashDot: 2,
  thick: 3, double: 3,
};
const BORDER_STYLE = { dotted: 'dotted', dashed: 'dashed', mediumDashed: 'dashed', double: 'double' };

// ─── Utilitaires ──────────────────────────────────────────────────────────────

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cellText(cell) {
  const v = cell?.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    return v.toLocaleDateString('fr-FR');
  }
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text || '').join('');
    if (v.result !== undefined && v.result !== null) {
      return v.result instanceof Date ? v.result.toLocaleDateString('fr-FR') : String(v.result);
    }
    if (v.text !== undefined) return String(v.text);
    if (v.hyperlink) return String(v.text || v.hyperlink);
    if (v.formula !== undefined) return '';
    return '';
  }
  if (typeof v === 'number') {
    // Respecter grossièrement le format numérique
    const fmt = cell.numFmt || '';
    if (/%/.test(fmt)) return (v * 100).toFixed(/\.0/.test(fmt) ? 1 : 0) + ' %';
    if (Number.isInteger(v)) return String(v);
    return String(Math.round(v * 100) / 100).replace('.', ',');
  }
  return String(v);
}

// ─── Largeur de colonne : unités Excel → px ───────────────────────────────────
const colWidthToPx = w => Math.round((w || 8.43) * 7 + 5);

// ══════════════════════════════════════════════════════════════════════════════
//  RENDU D'UNE FEUILLE
// ══════════════════════════════════════════════════════════════════════════════

function renderSheet(ws, imagesByCell, opts = {}) {
  const colCount = Math.max(1, ws.actualColumnCount || ws.columnCount || 1);
  const rowCount = Math.max(1, ws.actualRowCount || ws.rowCount || 1);

  // ── Fusions ────────────────────────────────────────────────────────────────
  const merges = {};
  const rawMerges = ws.model?.merges || [];
  for (const ref of rawMerges) {
    const m = String(ref).match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
    if (!m) continue;
    const toIdx = l => l.toUpperCase().split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
    const sc = toIdx(m[1]), sr = +m[2], ec = toIdx(m[3]), er = +m[4];
    for (let r = sr; r <= er; r++) {
      for (let c = sc; c <= ec; c++) {
        merges[`${r}_${c}`] = (r === sr && c === sc)
          ? { rowspan: er - sr + 1, colspan: ec - sc + 1 }
          : { hidden: true };
      }
    }
  }

  // ── Dimensions natives ─────────────────────────────────────────────────────
  const defaultRowHeight = ws.properties?.defaultRowHeight || 15;
  const colPx = [];
  for (let c = 1; c <= colCount; c++) {
    colPx.push(colWidthToPx(ws.getColumn(c)?.width || ws.properties?.defaultColWidth));
  }
  const rowPt = [];
  for (let r = 1; r <= rowCount; r++) {
    rowPt.push(ws.getRow(r)?.height || defaultRowHeight);
  }

  const nativeW = colPx.reduce((a, b) => a + b, 0);
  const nativeH = rowPt.reduce((a, b) => a + b, 0) * PT_TO_PX;

  // ── Échelle « ajuster à la page » ──────────────────────────────────────────
  const landscape = (ws.pageSetup?.orientation || 'portrait') === 'landscape';
  const page = landscape ? A4.landscape : A4.portrait;
  const avail = { w: page.w, h: page.h - (opts.reservedHeight || 0) };
  const scale = Math.min(avail.w / nativeW, avail.h / nativeH, 1) * SAFETY;

  const sColPx = colPx.map(p => p * scale);
  const sRowPx = rowPt.map(p => p * PT_TO_PX * scale);
  const sheetW = sColPx.reduce((a, b) => a + b, 0);

  // ── Construction du tableau ────────────────────────────────────────────────
  let html = `<table class="xl-sheet" style="width:${sheetW.toFixed(0)}px"><colgroup>`;
  html += sColPx.map(p => `<col style="width:${p.toFixed(1)}px">`).join('');
  html += '</colgroup><tbody>';

  for (let r = 1; r <= rowCount; r++) {
    const row = ws.getRow(r);
    if (row?.hidden) continue;
    html += `<tr style="height:${sRowPx[r - 1].toFixed(1)}px">`;

    for (let c = 1; c <= colCount; c++) {
      const key = `${r}_${c}`;
      if (merges[key]?.hidden) continue;
      const col = ws.getColumn(c);
      if (col?.hidden) continue;

      const cell = row.getCell(c);
      const styles = [];

      // Police
      const font = cell.font || {};
      if (font.name) styles.push(`font-family:'${font.name}',Calibri,Arial,sans-serif`);
      styles.push(`font-size:${((font.size || 11) * scale).toFixed(2)}pt`);
      if (font.bold) styles.push('font-weight:700');
      if (font.italic) styles.push('font-style:italic');
      if (font.underline) styles.push('text-decoration:underline');
      const fc = resolveColor(font.color);
      if (fc && fc.toUpperCase() !== '#FFFFFF') styles.push(`color:${fc}`);

      // Fond — ExcelJS : cell.fill.fgColor (et non cell.fill.pattern.fgColor)
      const fill = cell.fill;
      if (fill && fill.type === 'pattern' && fill.pattern === 'solid') {
        const bg = resolveColor(fill.fgColor);
        if (bg && bg.toUpperCase() !== '#FFFFFF') styles.push(`background-color:${bg}`);
      }

      // Bordures
      const border = cell.border || {};
      for (const side of ['top', 'left', 'bottom', 'right']) {
        const b = border[side];
        if (!b || !b.style) continue;
        const w = (BORDER_WIDTH[b.style] || 1) * Math.max(scale, 0.6);
        const st = BORDER_STYLE[b.style] || 'solid';
        const clr = resolveColor(b.color) || '#000000';
        styles.push(`border-${side}:${w.toFixed(2)}px ${st} ${clr}`);
      }

      // Alignement
      const al = cell.alignment || {};
      const hMap = { left: 'flex-start', center: 'center', right: 'flex-end', justify: 'flex-start' };
      const vMap = { top: 'flex-start', middle: 'center', center: 'center', bottom: 'flex-end' };
      const justify = hMap[al.horizontal] || (typeof cell.value === 'number' ? 'flex-end' : 'flex-start');
      const alignItems = vMap[al.vertical] || 'center';
      const textAlign = { 'flex-start': 'left', center: 'center', 'flex-end': 'right' }[justify];
      styles.push(`text-align:${textAlign}`);

      // Fusion
      const merge = merges[key] || {};
      let attrs = '';
      if (merge.rowspan > 1) attrs += ` rowspan="${merge.rowspan}"`;
      if (merge.colspan > 1) attrs += ` colspan="${merge.colspan}"`;

      // Hauteur de la boîte interne = somme des lignes couvertes.
      // Les cellules à retour à la ligne peuvent grandir (min-height),
      // les autres sont rognées comme dans Excel (height + overflow hidden).
      const span = merge.rowspan || 1;
      let boxH = 0;
      for (let k = 0; k < span; k++) boxH += sRowPx[r - 1 + k] || 0;
      const hProp = al.wrapText ? 'min-height' : 'height';

      // Contenu : image ancrée ou texte
      const img = imagesByCell[key];
      let content;
      if (img) {
        content = `<img src="${img}" style="max-width:100%;max-height:${Math.max(10, boxH).toFixed(0)}px;object-fit:contain">`;
      } else {
        content = escapeHtml(cellText(cell)).replace(/\r?\n/g, '<br>');
      }

      html += `<td${attrs} style="${styles.join(';')}">` +
        `<div style="${hProp}:${boxH.toFixed(1)}px;overflow:hidden;display:flex;` +
        `align-items:${alignItems};justify-content:${justify}">${content}</div></td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table>';
  return { html, scale, width: sheetW, landscape };
}

// ══════════════════════════════════════════════════════════════════════════════
//  IMAGES : ExcelJS les ancre à la feuille, jamais à une valeur de cellule
// ══════════════════════════════════════════════════════════════════════════════

function collectImages(ws, wb) {
  const byCell = {};
  let list = [];
  try { list = ws.getImages() || []; } catch { return byCell; }

  for (const anchor of list) {
    try {
      const media = wb.getImage(Number(anchor.imageId));
      if (!media?.buffer) continue;
      const ext = (media.extension || 'png').toLowerCase();
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
        : ext === 'gif' ? 'image/gif' : 'image/png';
      const r = Math.round(anchor.range?.tl?.nativeRow ?? anchor.range?.tl?.row ?? 0) + 1;
      const c = Math.round(anchor.range?.tl?.nativeCol ?? anchor.range?.tl?.col ?? 0) + 1;
      byCell[`${r}_${c}`] = `data:${mime};base64,${Buffer.from(media.buffer).toString('base64')}`;
    } catch { /* image ignorée */ }
  }
  return byCell;
}

// ══════════════════════════════════════════════════════════════════════════════
//  API PUBLIQUE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Convertit un fichier .xlsx en blocs HTML, une page A4 par feuille.
 * @param {string} filePath  chemin du classeur
 * @param {object} opts      { reservedHeight } hauteur réservée à un bandeau (px)
 * @returns {Promise<{sheets: Array<{name, html, landscape}>, fileName: string}>}
 */
export async function xlsxToHtmlSheets(filePath, opts = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const sheets = [];
  for (const ws of wb.worksheets) {
    if (ws.state === 'hidden' || ws.state === 'veryHidden') continue;
    const images = collectImages(ws, wb);
    const rendered = renderSheet(ws, images, opts);
    sheets.push({ name: ws.name, html: rendered.html, landscape: rendered.landscape });
  }
  return { sheets, fileName: filePath.split(/[\\/]/).pop() };
}

/** Feuille de style commune aux deux routes. */
export const SHEET_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: Calibri, 'Segoe UI', Arial, sans-serif;
    background: #dfe6ed;
    color: #000;
  }

  /* Une feuille Excel = une page A4 */
  .xl-page {
    background: #fff;
    width: 210mm;
    min-height: 297mm;
    margin: 16px auto;
    padding: 6mm;
    box-shadow: 0 3px 14px rgba(0,0,0,.16);
    page-break-after: always;
    break-after: page;
  }
  .xl-page:last-child { page-break-after: auto; break-after: auto; }
  .xl-page.landscape { width: 297mm; min-height: 210mm; }

  .xl-sheet {
    border-collapse: collapse;
    table-layout: fixed;
    margin: 0 auto;
  }
  .xl-sheet td {
    padding: 0 2px;
    vertical-align: middle;
    overflow: hidden;
    line-height: 1.08;
    word-wrap: break-word;
  }

  /* Bandeau d'identification de la fiche */
  .xl-caption {
    display: flex; align-items: center; gap: 10px;
    margin-bottom: 4mm; padding-bottom: 2mm;
    border-bottom: 1.5px solid #1e2a5e;
  }
  .xl-caption .badge {
    background: #1e2a5e; color: #fff; font-size: 9pt; font-weight: 700;
    padding: 3px 10px; border-radius: 4px; white-space: nowrap;
  }
  .xl-caption .titre {
    font-size: 10pt; font-weight: 700; color: #1e2a5e;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .xl-caption .meta { margin-left: auto; font-size: 8pt; color: #64748b; white-space: nowrap; }

  /* Barre d'action, jamais imprimée */
  .toolbar {
    position: sticky; top: 0; z-index: 50;
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    background: #1e2a5e; color: #fff; padding: 10px 22px;
  }
  .toolbar h1 { font-size: 14px; font-weight: 700; }
  .toolbar .info { font-size: 12px; opacity: .85; }
  .btn-print {
    background: #fbbf24; color: #1e2a5e; border: 0; cursor: pointer;
    padding: 9px 20px; border-radius: 6px; font-weight: 700; font-size: 13px;
  }
  .btn-print:hover { background: #f59e0b; }

  .errors-block {
    max-width: 210mm; margin: 16px auto; padding: 14px 18px;
    background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;
    color: #991b1b; font-size: 12px;
  }
  .errors-block h3 { font-size: 13px; margin-bottom: 6px; }

  @media print {
    @page { size: A4 portrait; margin: 6mm; }
    html, body {
      background: #fff !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .no-print, .toolbar { display: none !important; }
    .xl-page {
      width: auto; min-height: 0; margin: 0; padding: 0;
      box-shadow: none; page-break-inside: avoid; break-inside: avoid;
    }
    tr, td { page-break-inside: avoid; break-inside: avoid; }
  }
`;