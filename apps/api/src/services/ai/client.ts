import { fal, type QueueStatus } from '@fal-ai/client';

/**
 * Client fal.ai — soumission ASYNCHRONE via la queue avec webhook (génération
 * 8-60 s : on ne bloque jamais une requête HTTP). fal rappellera
 * `POST /webhooks/fal?generationId=<id>` (cf. routes/webhooks.ts).
 *
 * Init paresseuse (même pattern que getDb/getGcs) : FAL_KEY n'est lue qu'au
 * premier submit, l'app compile et démarre sans clé.
 */

let configured = false;

function getFal(): typeof fal {
  if (!configured) {
    const key = process.env.FAL_KEY;
    if (!key) {
      throw new Error('FAL_KEY manquant — copiez apps/api/.env.example vers .env');
    }
    fal.config({ credentials: key });
    configured = true;
  }
  return fal;
}

/**
 * URL publique du webhook fal pour une génération :
 * `${API_PUBLIC_URL}/webhooks/fal?generationId=<id>` (+ `secret` si
 * FAL_WEBHOOK_SECRET est défini — vérifié à la réception).
 */
export function buildFalWebhookUrl(generationId: string): string {
  const base = process.env.API_PUBLIC_URL;
  if (!base) {
    throw new Error('API_PUBLIC_URL manquant — requis pour le webhook fal (URL publique de l’API)');
  }
  const url = new URL('/webhooks/fal', base);
  url.searchParams.set('generationId', generationId);
  const secret = process.env.FAL_WEBHOOK_SECRET;
  if (secret) url.searchParams.set('secret', secret);
  return url.toString();
}

/**
 * Soumet une génération à la queue fal (asynchrone, webhook de complétion).
 * @returns le request_id fal (stocké en provider_request_id).
 */
export async function submitToFal(
  endpoint: string,
  input: Record<string, unknown>,
  generationId: string,
): Promise<string> {
  const webhookUrl = buildFalWebhookUrl(generationId);
  const { request_id: requestId } = await getFal().queue.submit(endpoint, {
    input,
    webhookUrl,
  });
  return requestId;
}

/**
 * Appel fal SYNCHRONE via la queue (`fal.subscribe` = submit + polling jusqu'à
 * complétion) — pour les tâches courtes hors pipeline webhook (ex. OCR
 * d'étiquette, quelques secondes). À n'utiliser que depuis des chemins
 * non bloquants (fire-and-forget), jamais dans une requête HTTP entrante.
 *
 * @returns le payload de sortie du modèle (`result.data`).
 */
export async function subscribeToFal(
  endpoint: string,
  input: Record<string, unknown>,
  timeoutMs?: number,
): Promise<unknown> {
  const result = await getFal().subscribe(endpoint, {
    input,
    ...(timeoutMs ? { timeout: timeoutMs } : {}),
  });
  return result.data;
}

/**
 * Statut queue fal d'une requête soumise — polling DEV/local où le webhook
 * (localhost) est injoignable par fal. `status` ∈ IN_QUEUE | IN_PROGRESS |
 * COMPLETED (cf. types @fal-ai/client).
 */
export async function getFalQueueStatus(endpoint: string, requestId: string): Promise<QueueStatus> {
  return getFal().queue.status(endpoint, { requestId });
}

/**
 * Résultat final d'une requête fal terminée — `data` = payload de sortie du
 * modèle (même forme que `payload` du webhook). Lève un `ApiError` si la
 * requête a échoué côté fal (le résultat stocké est l'erreur d'origine).
 */
export async function getFalQueueResult(
  endpoint: string,
  requestId: string,
): Promise<{ data: unknown }> {
  return getFal().queue.result(endpoint, { requestId });
}
