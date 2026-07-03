import { eq, inArray } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { pushTokens } from '../db/schema.js';
import type { GenerationLogger } from './generations.js';

/** Expo Push API — accepte un batch de messages (max 100 par requête). */
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_BATCH_SIZE = 100;

/** Contenu d'une notification (titre + corps + data opaque pour l'app). */
export interface PushNotification {
  title: string;
  body: string;
  /** Payload remis à l'app au tap (ex. { generationId }) — JSON-compatible. */
  data?: Record<string, unknown>;
}

/** Ticket de la réponse Expo — `details.error` porte les tokens à purger. */
interface ExpoPushTicket {
  status?: string;
  message?: string;
  details?: { error?: string };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Envoie une notification push Expo à **tous les appareils** du shop.
 *
 * - Aucun token enregistré → no-op silencieux.
 * - POST par lots de 100 vers l'Expo Push API (`{ to, title, body, data,
 *   sound: 'default' }`).
 * - Les tokens signalés `DeviceNotRegistered` par la réponse (app désinstallée,
 *   token expiré) sont **supprimés** de `push_tokens`.
 * - **Ne throw JAMAIS** : tout échec (DB, réseau, réponse Expo) est loggé en
 *   warn — l'envoi est best-effort et ne doit jamais bloquer une finalisation.
 */
export async function sendPushToShop(
  db: Db,
  shopId: string,
  notification: PushNotification,
  log: GenerationLogger,
): Promise<void> {
  try {
    const rows = await db
      .select({ token: pushTokens.token })
      .from(pushTokens)
      .where(eq(pushTokens.shopId, shopId));
    if (rows.length === 0) return;

    const tokens = rows.map((r) => r.token);
    const staleTokens: string[] = [];

    for (let i = 0; i < tokens.length; i += EXPO_PUSH_BATCH_SIZE) {
      const batch = tokens.slice(i, i + EXPO_PUSH_BATCH_SIZE);
      const messages = batch.map((to) => ({
        to,
        title: notification.title,
        body: notification.body,
        data: notification.data ?? {},
        sound: 'default' as const,
      }));

      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(messages),
      });
      if (!res.ok) {
        log.warn(
          { shopId, status: res.status, body: (await res.text()).slice(0, 300) },
          'Push Expo : réponse non-2xx — envoi abandonné pour ce lot',
        );
        continue;
      }

      // Réponse : { data: [ticket, ...] } — 1 ticket par message, même ordre.
      const payload = (await res.json()) as { data?: ExpoPushTicket[] };
      const tickets = Array.isArray(payload.data) ? payload.data : [];
      tickets.forEach((ticket, idx) => {
        if (ticket.status === 'error') {
          const token = batch[idx];
          if (ticket.details?.error === 'DeviceNotRegistered' && token) {
            staleTokens.push(token);
          } else {
            log.warn(
              { shopId, error: ticket.details?.error, message: ticket.message },
              'Push Expo : ticket en erreur',
            );
          }
        }
      });
    }

    // Purge des appareils désenregistrés (app désinstallée, token expiré).
    if (staleTokens.length > 0) {
      await db.delete(pushTokens).where(inArray(pushTokens.token, staleTokens));
      log.info({ shopId, removed: staleTokens.length }, 'Push Expo : tokens invalides purgés');
    }
  } catch (err) {
    // Best-effort : jamais de throw, la finalisation ne dépend pas du push.
    log.warn({ shopId, error: errorMessage(err) }, 'Push Expo : envoi échoué (ignoré)');
  }
}
