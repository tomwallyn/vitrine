import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { showGenerationToast } from '@/components/GenerationToast';
import { useApi } from '@/lib/api';
import { useGenerationTracker } from '@/lib/generation-tracker';
import {
  addGenerationNotificationResponseListener,
  configureNotificationHandling,
  ensureNotificationPermission,
  notifyGenerationFinished,
  registerPushTokenAsync,
} from '@/lib/notifications';
import type { GenerationStatus } from '@vitrine/shared';

/**
 * Cadence du polling en arrière-plan (le GET /generations/:id déclenche la
 * finalisation côté serveur) — un peu plus lâche que l'écran 04 (1,5 s).
 */
const POLL_INTERVAL_MS = 2_500;

/** Délai avant de retirer la tuile « en cours » une fois la génération finie. */
const REMOVE_DELAY_MS = 3_500;

/**
 * Composant invisible monté au root (utilisateur connecté uniquement) :
 * poll les générations suivies par le tracker, met leur statut à jour et
 * notifie la fin (banner in-app au premier plan, notification locale sinon).
 *
 * Le polling est mis en pause quand l'app n'est pas active (iOS suspend de
 * toute façon le JS) et reprend au retour au premier plan.
 */
export function GenerationTrackerHost() {
  const api = useApi();
  const queryClient = useQueryClient();
  const router = useRouter();

  const activeCount = useGenerationTracker(
    (state) => Object.keys(state.active).length,
  );
  const [appActive, setAppActive] = useState(
    AppState.currentState === 'active',
  );

  // Timers de retrait différé des tuiles « en cours » (nettoyés au démontage).
  const removeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  // Garde anti-chevauchement : jamais deux passes de polling simultanées.
  const pollingRef = useRef(false);

  // Handler de présentation + tap sur notification (locale OU push distant,
  // les deux portent data.generationId) → écran résultat.
  useEffect(() => {
    configureNotificationHandling();
    return addGenerationNotificationResponseListener((generationId) => {
      router.push(`/result/${generationId}`);
    });
  }, [router]);

  // Enregistrement du token push Expo au boot (utilisateur connecté) :
  // no-op propre sans projectId EAS / en Expo Go (cf. lib/notifications).
  useEffect(() => {
    void registerPushTokenAsync(api);
  }, [api]);

  // Permission de notifier : demandée (une fois) dès qu'un suivi démarre.
  useEffect(() => {
    if (activeCount > 0) void ensureNotificationPermission();
  }, [activeCount]);

  // Pause/reprise du polling selon l'état de l'app.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setAppActive(state === 'active'),
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const timers = removeTimersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  useEffect(() => {
    // Pas de poll si rien à suivre ou app en arrière-plan (repris au retour).
    if (!appActive || activeCount === 0) return;

    let cancelled = false;

    const scheduleRemoval = (id: string) => {
      if (removeTimersRef.current.has(id)) return;
      const timer = setTimeout(() => {
        removeTimersRef.current.delete(id);
        useGenerationTracker.getState().remove(id);
      }, REMOVE_DELAY_MS);
      removeTimersRef.current.set(id, timer);
    };

    const handleFinished = (id: string, status: 'done' | 'failed') => {
      const { watchedId } = useGenerationTracker.getState();
      // L'écran 04 affiche cette génération : il gère lui-même la suite
      // (navigation auto vers /result), pas de notification en doublon.
      if (watchedId !== id) {
        if (AppState.currentState === 'active') {
          showGenerationToast(id, status);
        } else {
          void notifyGenerationFinished(id, status === 'done');
        }
      }
      scheduleRemoval(id);
    };

    const poll = async () => {
      if (pollingRef.current) return;
      pollingRef.current = true;
      try {
        const pending = Object.values(
          useGenerationTracker.getState().active,
        ).filter((gen) => gen.status === 'queued' || gen.status === 'processing');

        await Promise.all(
          pending.map(async (gen) => {
            try {
              // Même queryKey que l'écran 04 : cache partagé + déduplication
              // des requêtes en vol.
              const data = await queryClient.fetchQuery({
                queryKey: ['generation', gen.id],
                queryFn: () => api.generations.get(gen.id),
                staleTime: 0,
              });
              if (cancelled) return;
              const status: GenerationStatus = data.generation.status;
              if (status === gen.status) return;
              useGenerationTracker.getState().setStatus(gen.id, status);
              if (status === 'done' || status === 'failed') {
                handleFinished(gen.id, status);
              }
            } catch {
              // Erreur réseau ponctuelle : on retentera au tick suivant.
            }
          }),
        );
      } finally {
        pollingRef.current = false;
      }
    };

    void poll();
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [appActive, activeCount, api, queryClient]);

  return null;
}
