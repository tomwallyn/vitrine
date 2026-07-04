/**
 * Benchmark IA M3.0 (VITRINE) — exécution.
 *
 * Pour chaque photo de vêtement déposée dans `inputs/` :
 *   - FASHN v1.6  (rendu « sur modèle », image mannequin par défaut)
 *   - Kling Kolors (rendu « sur modèle », même mannequin)
 *   - Nano Banana  (édition : cintre / plié / studio, prompts de fidélité)
 * Mesure la latence par appel, estime le coût, sauvegarde chaque rendu dans
 * `outputs/{vêtement}/{modèle}-{type}.png`, puis génère `outputs/report.html`.
 *
 * Usage :
 *   export FAL_KEY=...   # clé sur https://fal.ai/dashboard/keys
 *   pnpm --filter @vitrine/benchmark bench
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fal } from '@fal-ai/client';
import type { RenderType } from '@vitrine/shared';

import {
  COST_USD_PER_CALL,
  DEFAULT_MANNEQUIN,
  FAL_ENDPOINTS,
  INPUT_EXTENSIONS,
  MANNEQUIN_IMAGES,
  NANO_PROMPTS,
  type BenchModel,
} from './config.js';
import { writeReport, type BenchRecord, type GarmentEntry, type ResultsPayload } from './report.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INPUTS_DIR = path.join(HERE, 'inputs');
const OUTPUTS_DIR = path.join(HERE, 'outputs');

/** Un appel de benchmark = (vêtement, modèle, type de rendu, payload fal). */
interface CallTask {
  garment: string;
  model: BenchModel;
  renderType: RenderType;
  endpoint: string;
  input: Record<string, unknown>;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Slug de dossier sûr à partir du nom de fichier (sans extension, sans accents). */
function slugify(fileName: string): string {
  return path
    .parse(fileName)
    .name.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'garment';
}

/** Upload une image locale vers le stockage fal → URL publique utilisable en input. */
async function uploadToFal(absPath: string): Promise<string> {
  const data = await readFile(absPath);
  const ext = path.extname(absPath).toLowerCase();
  const type = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const file = new File([data], path.basename(absPath), { type });
  return fal.storage.upload(file);
}

/** Extrait l'URL du rendu, quel que soit le schéma de sortie (images[] ou image). */
function extractImageUrl(data: unknown): string | undefined {
  const d = data as
    | { images?: Array<{ url?: string } | undefined>; image?: { url?: string } }
    | null
    | undefined;
  return d?.images?.[0]?.url ?? d?.image?.url;
}

async function downloadTo(url: string, destAbsPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} au téléchargement du rendu`);
  await writeFile(destAbsPath, Buffer.from(await res.arrayBuffer()));
}

/** Les 5 appels d'un vêtement : FASHN + Kling (sur modèle) + Nano ×3 (cintre/plié/studio). */
function buildTasks(garment: string, garmentUrl: string, mannequinUrl: string): CallTask[] {
  const nano = (renderType: 'hanger' | 'folded' | 'studio'): CallTask => ({
    garment,
    model: 'nanobanana',
    renderType,
    endpoint: FAL_ENDPOINTS.nanobanana,
    input: {
      prompt: NANO_PROMPTS[renderType],
      image_urls: [garmentUrl],
      num_images: 1,
      output_format: 'png',
    },
  });

  return [
    {
      garment,
      model: 'fashn',
      renderType: 'model',
      endpoint: FAL_ENDPOINTS.fashn,
      input: {
        model_image: mannequinUrl,
        garment_image: garmentUrl,
        // Les photos d'inputs sont des vêtements sur cintre (≈ flat-lay pour FASHN).
        garment_photo_type: 'flat-lay',
        mode: 'balanced',
        output_format: 'png',
      },
    },
    {
      garment,
      model: 'kling',
      renderType: 'model',
      endpoint: FAL_ENDPOINTS.kling,
      input: {
        human_image_url: mannequinUrl,
        garment_image_url: garmentUrl,
      },
    },
    nano('hanger'),
    nano('folded'),
    nano('studio'),
  ];
}

/** Exécute un appel fal : latence mesurée, coût estimé, rendu sauvegardé. Ne throw jamais. */
async function runTask(task: CallTask): Promise<BenchRecord> {
  const base: Omit<BenchRecord, 'ok' | 'latencyMs' | 'costUsd'> = {
    garment: task.garment,
    model: task.model,
    renderType: task.renderType,
  };
  const startedAt = Date.now();
  try {
    const result = await fal.subscribe(task.endpoint, {
      input: task.input,
      logs: false,
    });
    const latencyMs = Date.now() - startedAt;
    const url = extractImageUrl(result.data);
    if (!url) throw new Error(`réponse fal sans URL d'image (${JSON.stringify(result.data).slice(0, 200)})`);
    const outputFile = `${task.garment}/${task.model}-${task.renderType}.png`;
    await downloadTo(url, path.join(OUTPUTS_DIR, outputFile));
    const costUsd = COST_USD_PER_CALL[task.model];
    console.log(
      `  ✓ ${task.model.padEnd(10)} ${task.renderType.padEnd(6)} ${(latencyMs / 1000).toFixed(1)}s  ~$${costUsd.toFixed(3)}  → ${outputFile}`,
    );
    return { ...base, ok: true, latencyMs, costUsd, outputFile };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const message = errorMessage(err);
    console.error(`  ✗ ${task.model.padEnd(10)} ${task.renderType.padEnd(6)} après ${(latencyMs / 1000).toFixed(1)}s : ${message}`);
    return { ...base, ok: false, latencyMs, costUsd: 0, error: message };
  }
}

function printSummary(records: BenchRecord[]): void {
  const groups = new Map<string, BenchRecord[]>();
  for (const r of records) {
    const key = `${r.model} (${r.renderType})`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  console.log('\nRécapitulatif par modèle :');
  for (const [key, list] of groups) {
    const ok = list.filter((r) => r.ok);
    const avgLatency = ok.length > 0 ? ok.reduce((s, r) => s + r.latencyMs, 0) / ok.length : 0;
    const totalCost = ok.reduce((s, r) => s + r.costUsd, 0);
    console.log(
      `  ${key.padEnd(22)} ${ok.length}/${list.length} réussis · latence moy. ${(avgLatency / 1000).toFixed(1)}s · coût ~$${totalCost.toFixed(2)}`,
    );
  }
  const totalCost = records.reduce((s, r) => s + r.costUsd, 0);
  console.log(`  Coût total estimé du run : ~$${totalCost.toFixed(2)}`);
}

async function main(): Promise<void> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    console.error(
      [
        'FAL_KEY manquante — le benchmark appelle les APIs fal.ai et a besoin d’une clé.',
        '',
        '  1. Crée une clé sur https://fal.ai/dashboard/keys',
        '  2. export FAL_KEY=xxxxxxxx-xxxx-xxxx-xxxx:yyyyyyyyyyyyyyyy',
        '  3. Relance : pnpm --filter @vitrine/benchmark bench',
      ].join('\n'),
    );
    process.exitCode = 1;
    return;
  }
  fal.config({ credentials: falKey });

  let files: string[];
  try {
    files = (await readdir(INPUTS_DIR))
      .filter((f) => (INPUT_EXTENSIONS as readonly string[]).includes(path.extname(f).toLowerCase()))
      .sort();
  } catch {
    files = [];
  }
  if (files.length === 0) {
    console.error(
      `Aucune image trouvée dans ${INPUTS_DIR}\n` +
        'Dépose 10-15 photos JPG/PNG de vêtements sur cintre (fond neutre), puis relance.',
    );
    process.exitCode = 1;
    return;
  }

  const mannequinUrl = MANNEQUIN_IMAGES[DEFAULT_MANNEQUIN];
  console.log(`Benchmark M3.0 — ${files.length} vêtement(s), mannequin par défaut : ${DEFAULT_MANNEQUIN}`);
  console.log(`Modèles : ${Object.values(FAL_ENDPOINTS).join(' · ')}\n`);

  await mkdir(OUTPUTS_DIR, { recursive: true });

  const garments: GarmentEntry[] = [];
  const records: BenchRecord[] = [];

  for (const [index, file] of files.entries()) {
    const garment = slugify(file);
    garments.push({ name: garment, sourceFile: file });
    console.log(`[${index + 1}/${files.length}] ${file}`);

    let garmentUrl: string;
    try {
      garmentUrl = await uploadToFal(path.join(INPUTS_DIR, file));
    } catch (err) {
      const message = `upload fal.storage échoué : ${errorMessage(err)}`;
      console.error(`  ✗ ${message}`);
      for (const task of buildTasks(garment, '', mannequinUrl)) {
        records.push({
          garment,
          model: task.model,
          renderType: task.renderType,
          ok: false,
          latencyMs: 0,
          costUsd: 0,
          error: message,
        });
      }
      continue;
    }

    await mkdir(path.join(OUTPUTS_DIR, garment), { recursive: true });
    // Les 5 appels d'un même vêtement partent en parallèle (latences mesurées par appel).
    const results = await Promise.all(buildTasks(garment, garmentUrl, mannequinUrl).map(runTask));
    records.push(...results);
  }

  const payload: ResultsPayload = {
    generatedAt: new Date().toISOString(),
    mannequin: DEFAULT_MANNEQUIN,
    endpoints: FAL_ENDPOINTS,
    garments,
    records,
  };
  await writeFile(path.join(OUTPUTS_DIR, 'results.json'), JSON.stringify(payload, null, 2));
  await writeReport(payload, path.join(OUTPUTS_DIR, 'report.html'));

  printSummary(records);
  console.log(`\nRapport : ${path.join(OUTPUTS_DIR, 'report.html')}`);
}

main().catch((err) => {
  console.error(`Erreur inattendue du benchmark : ${errorMessage(err)}`);
  process.exitCode = 1;
});
