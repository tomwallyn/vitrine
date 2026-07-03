import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

import type { Api } from '@/lib/api';

/**
 * Notifications de fin de génération (locales + push distant Expo).
 *
 * IMPORTANT — expo-notifications a un support limité dans Expo Go (SDK 54) :
 * chaque appel est enveloppé dans un try/catch et ne doit JAMAIS crasher si
 * le module natif est indisponible. Le banner in-app (GenerationToast) reste
 * le chemin principal ; la notification locale couvre le cas « app
 * backgroundée mais JS encore vivant » (Android surtout — iOS suspend le JS).
 *
 * Le vrai push « app fermée » est envoyé côté serveur (Expo Push API) au
 * token enregistré par `registerPushTokenAsync` — il exige un dev build et
 * un `projectId` EAS (`extra.eas.projectId`) ; sans eux, tout no-op proprement.
 */

let handlerConfigured = false;

/**
 * Handler de présentation : on ne montre PAS la notification système quand
 * l'app est au premier plan (le banner in-app s'en charge), on la présente
 * seulement si l'app n'est pas active.
 */
export function configureNotificationHandling(): void {
  if (handlerConfigured) return;
  handlerConfigured = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => {
        const foreground = AppState.currentState === 'active';
        return {
          shouldShowBanner: !foreground,
          shouldShowList: !foreground,
          shouldPlaySound: false,
          shouldSetBadge: false,
        };
      },
    });
  } catch {
    // expo-notifications indisponible (Expo Go) : le banner in-app suffit.
  }
}

let permissionRequested = false;

/** Demande la permission de notifier — une seule fois par session. */
export async function ensureNotificationPermission(): Promise<void> {
  if (permissionRequested) return;
  permissionRequested = true;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('generations', {
        name: 'Générations',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const settings = await Notifications.getPermissionsAsync();
    if (!settings.granted && settings.canAskAgain) {
      await Notifications.requestPermissionsAsync();
    }
  } catch {
    // Permission impossible à demander (Expo Go) : on continue sans notif.
  }
}

let pushTokenRegistered = false;

/**
 * Enregistre le token push Expo de l'appareil auprès de l'API
 * (POST /me/push-token) pour que le serveur pousse « Ton visuel VITRINE est
 * prêt » quand l'app est fermée. À appeler une fois au boot, signed-in.
 *
 * No-op propre (log info, JAMAIS de crash) si :
 * - plateforme non mobile (web) ;
 * - pas de `projectId` EAS (`extra.eas.projectId` vide → Expo Go / pas de
 *   `eas init`) ;
 * - permission refusée ;
 * - `getExpoPushTokenAsync` throw (Expo Go / simulateur sans dev build) ;
 * - erreur réseau à l'enregistrement (retenté au prochain boot).
 */
export async function registerPushTokenAsync(api: Api): Promise<void> {
  if (pushTokenRegistered) return;
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;

  const projectId: unknown = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== 'string' || projectId === '') {
    console.info(
      '[push] projectId EAS absent : push distant non configuré (Expo Go ou eas init manquant).',
    );
    return;
  }

  try {
    await ensureNotificationPermission();
    const settings = await Notifications.getPermissionsAsync();
    if (!settings.granted) {
      console.info('[push] permission notifications refusée : token non enregistré.');
      return;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.me.registerPushToken({ token, platform: Platform.OS });
    pushTokenRegistered = true;
  } catch (error) {
    // Expo Go / simulateur / réseau : on log et on continue, jamais de crash.
    console.info('[push] enregistrement du token impossible :', error);
  }
}

/** Notification locale immédiate de fin de génération (app non active). */
export async function notifyGenerationFinished(
  generationId: string,
  ok: boolean,
): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: ok ? 'Ton visuel VITRINE est prêt' : 'La génération a échoué',
        body: ok
          ? 'Touche pour découvrir le rendu.'
          : 'Ton crédit a été remboursé automatiquement.',
        data: { generationId },
      },
      trigger: null, // immédiat
    });
  } catch {
    // Notification impossible (Expo Go) : silencieux, jamais de crash.
  }
}

/**
 * Tap sur une notification → callback avec l'id de génération (navigation
 * vers /result/:id). Couvre les notifications locales ET les push distants
 * Expo : les deux exposent leur payload au même endroit
 * (`request.content.data.generationId`). Renvoie une fonction de désabonnement.
 */
export function addGenerationNotificationResponseListener(
  onGeneration: (generationId: string) => void,
): () => void {
  try {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const generationId =
          response.notification.request.content.data?.generationId;
        if (typeof generationId === 'string' && generationId) {
          onGeneration(generationId);
        }
      },
    );
    return () => subscription.remove();
  } catch {
    return () => {};
  }
}
