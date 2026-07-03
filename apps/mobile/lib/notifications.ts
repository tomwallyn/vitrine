import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

/**
 * Notifications locales de fin de génération.
 *
 * IMPORTANT — expo-notifications a un support limité dans Expo Go (SDK 54) :
 * chaque appel est enveloppé dans un try/catch et ne doit JAMAIS crasher si
 * le module natif est indisponible. Le banner in-app (GenerationToast) reste
 * le chemin principal ; la notification locale ne couvre que le cas « app
 * backgroundée mais JS encore vivant » (Android surtout — iOS suspend le JS).
 *
 * Le vrai push « app fermée » nécessitera un dev build + envoi côté serveur
 * (Expo Push API) : volontairement non implémenté ici.
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
 * Tap sur la notification → callback avec l'id de génération (navigation
 * vers /result/:id). Renvoie une fonction de désabonnement.
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
