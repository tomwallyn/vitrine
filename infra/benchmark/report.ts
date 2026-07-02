/**
 * Benchmark IA M3.0 (VITRINE) — génération du rapport HTML.
 *
 * Grille visuelle : lignes = vêtements ; colonnes = Source, FASHN (modèle),
 * Kling (modèle), Nano Banana (cintre / plié / studio) — avec latence & coût
 * par cellule, puis tableau récapitulatif par modèle.
 *
 * Appelé automatiquement à la fin de `run.ts`, ou seul pour regénérer le
 * rapport depuis `outputs/results.json` : `pnpm --filter @vitrine/benchmark report`.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { RenderType } from '@vitrine/shared';

import type { BenchModel } from './config.js';

/** Un vêtement benché (nom de dossier + fichier source dans inputs/). */
export interface GarmentEntry {
  name: string;
  sourceFile: string;
}

/** Résultat d'un appel (vêtement × modèle × type de rendu). */
export interface BenchRecord {
  garment: string;
  model: BenchModel;
  renderType: RenderType;
  ok: boolean;
  latencyMs: number;
  /** Coût estimé en USD (0 si l'appel a échoué). */
  costUsd: number;
  /** Chemin du rendu, relatif à outputs/ (ex. `veste-verte/fashn-model.png`). */
  outputFile?: string;
  error?: string;
}

/** Contenu de outputs/results.json. */
export interface ResultsPayload {
  generatedAt: string;
  mannequin: string;
  endpoints: Record<BenchModel, string>;
  garments: GarmentEntry[];
  records: BenchRecord[];
}

/** Colonnes de rendu de la grille (la colonne Source est ajoutée à part). */
const COLUMNS: Array<{ model: BenchModel; renderType: RenderType; label: string }> = [
  { model: 'fashn', renderType: 'model', label: 'FASHN v1.6 · modèle' },
  { model: 'kling', renderType: 'model', label: 'Kling Kolors · modèle' },
  { model: 'nanobanana', renderType: 'hanger', label: 'Nano Banana · cintre' },
  { model: 'nanobanana', renderType: 'folded', label: 'Nano Banana · plié' },
  { model: 'nanobanana', renderType: 'studio', label: 'Nano Banana · studio' },
];

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatLatency(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

function formatCost(usd: number): string {
  return `${usd.toFixed(3).replace('.', ',')} $`;
}

function renderCell(record: BenchRecord | undefined): string {
  if (!record) {
    return '<td class="cell empty">—</td>';
  }
  if (!record.ok || !record.outputFile) {
    return `<td class="cell failed"><span class="cross">✗ échec</span><span class="meta">${escapeHtml(
      (record.error ?? 'erreur inconnue').slice(0, 160),
    )}</span></td>`;
  }
  const src = escapeHtml(record.outputFile.split('/').map(encodeURIComponent).join('/'));
  return `<td class="cell"><a href="${src}" target="_blank"><img src="${src}" loading="lazy" alt="${escapeHtml(
    `${record.model} ${record.renderType} — ${record.garment}`,
  )}"></a><span class="meta">${formatLatency(record.latencyMs)} · ${formatCost(record.costUsd)}</span></td>`;
}

function renderSummaryRows(records: BenchRecord[]): string {
  return COLUMNS.map(({ model, renderType, label }) => {
    const all = records.filter((r) => r.model === model && r.renderType === renderType);
    const ok = all.filter((r) => r.ok);
    const avgLatency = ok.length > 0 ? ok.reduce((s, r) => s + r.latencyMs, 0) / ok.length : 0;
    const avgCost = ok.length > 0 ? ok.reduce((s, r) => s + r.costUsd, 0) / ok.length : 0;
    const totalCost = ok.reduce((s, r) => s + r.costUsd, 0);
    return `<tr>
      <td>${escapeHtml(label)}</td>
      <td>${ok.length}/${all.length}</td>
      <td>${ok.length > 0 ? formatLatency(avgLatency) : '—'}</td>
      <td>${ok.length > 0 ? formatCost(avgCost) : '—'}</td>
      <td>${formatCost(totalCost)}</td>
    </tr>`;
  }).join('\n');
}

export function generateReportHtml(payload: ResultsPayload): string {
  const byKey = new Map<string, BenchRecord>();
  for (const record of payload.records) {
    byKey.set(`${record.garment}|${record.model}|${record.renderType}`, record);
  }

  const gridRows = payload.garments
    .map((garment) => {
      const sourceSrc = `../inputs/${encodeURIComponent(garment.sourceFile)}`;
      const cells = COLUMNS.map(({ model, renderType }) =>
        renderCell(byKey.get(`${garment.name}|${model}|${renderType}`)),
      ).join('\n');
      return `<tr>
        <th scope="row" class="garment-name">${escapeHtml(garment.name)}</th>
        <td class="cell source"><a href="${sourceSrc}" target="_blank"><img src="${sourceSrc}" loading="lazy" alt="${escapeHtml(
          garment.sourceFile,
        )}"></a><span class="meta">${escapeHtml(garment.sourceFile)}</span></td>
        ${cells}
      </tr>`;
    })
    .join('\n');

  const totalCost = payload.records.reduce((s, r) => s + r.costUsd, 0);
  const generatedAt = new Date(payload.generatedAt).toLocaleString('fr-FR');

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VITRINE — Benchmark IA M3.0</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Manrope:wght@400;600&display=swap" rel="stylesheet">
<style>
  :root {
    --ink: #111111;
    --paper: #f5f3ec;
    --paper-2: #eeece4;
    --paper-3: #e3e1d9;
    --grey: #8a8a8a;
    --grey-2: #6b6b6b;
    --white: #ffffff;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 40px 32px 64px;
    background: var(--paper);
    color: var(--ink);
    font-family: 'Manrope', system-ui, sans-serif;
    font-size: 14px;
  }
  h1, h2 {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    letter-spacing: -0.02em;
  }
  h1 { font-size: 28px; margin: 0 0 4px; }
  h2 { font-size: 18px; margin: 40px 0 12px; }
  .subtitle { color: var(--grey-2); margin: 0 0 32px; }
  table {
    border-collapse: collapse;
    background: var(--white);
    border: 1px solid var(--paper-3);
    width: 100%;
  }
  thead th {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    background: var(--paper-2);
    padding: 10px 12px;
    border: 1px solid var(--paper-3);
    position: sticky;
    top: 0;
  }
  td, tbody th { border: 1px solid var(--paper-3); padding: 10px 12px; vertical-align: top; }
  .garment-name {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 13px;
    text-align: left;
    max-width: 140px;
    word-break: break-word;
    background: var(--paper-2);
  }
  .cell { text-align: center; min-width: 150px; }
  .cell img {
    width: 160px;
    height: 200px;
    object-fit: contain;
    background: var(--paper);
    border: 1px solid var(--paper-3);
    display: block;
    margin: 0 auto;
  }
  .cell .meta {
    display: block;
    margin-top: 6px;
    color: var(--grey-2);
    font-size: 12px;
  }
  .cell.failed { color: var(--grey-2); }
  .cell.failed .cross { font-weight: 600; display: block; }
  .cell.failed .meta { font-style: italic; max-width: 170px; margin: 6px auto 0; }
  .cell.empty { color: var(--grey); }
  .summary { max-width: 760px; }
  .summary td:first-child { font-weight: 600; }
  .summary tfoot td { background: var(--paper-2); font-weight: 600; }
  .footnote { color: var(--grey-2); font-size: 12px; margin-top: 12px; }
  code { background: var(--paper-2); padding: 1px 5px; border-radius: 3px; font-size: 12px; }
</style>
</head>
<body>
  <h1>VITRINE — Benchmark IA M3.0</h1>
  <p class="subtitle">
    ${payload.garments.length} vêtement(s) · mannequin « ${escapeHtml(payload.mannequin)} » ·
    généré le ${escapeHtml(generatedAt)} ·
    endpoints : <code>${escapeHtml(payload.endpoints.fashn)}</code> ·
    <code>${escapeHtml(payload.endpoints.kling)}</code> ·
    <code>${escapeHtml(payload.endpoints.nanobanana)}</code>
  </p>

  <h2>Grille comparative</h2>
  <div style="overflow-x:auto">
  <table>
    <thead>
      <tr>
        <th>Vêtement</th>
        <th>Source</th>
        ${COLUMNS.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('\n        ')}
      </tr>
    </thead>
    <tbody>
      ${gridRows}
    </tbody>
  </table>
  </div>
  <p class="footnote">
    Critère n°1 : fidélité au vêtement source (texture, motif, couleur, coupe, logos).
    Cliquer sur une image pour l'ouvrir en taille réelle.
  </p>

  <h2>Récapitulatif latence &amp; coût</h2>
  <table class="summary">
    <thead>
      <tr><th>Modèle</th><th>Réussites</th><th>Latence moy.</th><th>Coût moy. / appel</th><th>Coût total</th></tr>
    </thead>
    <tbody>
      ${renderSummaryRows(payload.records)}
    </tbody>
    <tfoot>
      <tr><td colspan="4">Coût total estimé du run</td><td>${formatCost(totalCost)}</td></tr>
    </tfoot>
  </table>
  <p class="footnote">Coûts estimés d'après la table de prix de <code>config.ts</code> — à re-vérifier sur fal.ai/pricing.</p>
</body>
</html>
`;
}

export async function writeReport(payload: ResultsPayload, outAbsPath: string): Promise<void> {
  await writeFile(outAbsPath, generateReportHtml(payload), 'utf8');
}

// Exécution directe (`pnpm --filter @vitrine/benchmark report`) :
// regénère outputs/report.html depuis outputs/results.json sans relancer d'appels fal.
const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const outputsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'outputs');
  const resultsPath = path.join(outputsDir, 'results.json');
  try {
    const payload = JSON.parse(await readFile(resultsPath, 'utf8')) as ResultsPayload;
    const reportPath = path.join(outputsDir, 'report.html');
    await writeReport(payload, reportPath);
    console.log(`Rapport regénéré : ${reportPath}`);
  } catch (err) {
    console.error(
      `Impossible de lire ${resultsPath} (${err instanceof Error ? err.message : String(err)}).\n` +
        'Lance d’abord : pnpm --filter @vitrine/benchmark bench',
    );
    process.exitCode = 1;
  }
}
