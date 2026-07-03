import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import type { GenerationStatus, RenderType } from '@vitrine/shared';

/** Génération suivie en arrière-plan (tuile galerie + badge onglet + notifs). */
export type TrackedGeneration = {
  id: string;
  renderType: RenderType;
  sourceImageUrl?: string;
  status: GenerationStatus;
  /** Timestamp de mise en suivi — ordonne les tuiles « en cours ». */
  startedAt: number;
};

type TrackInput = {
  id: string;
  renderType: RenderType;
  sourceImageUrl?: string;
};

type GenerationTrackerState = {
  /** Générations en cours de suivi, indexées par id. */
  active: Record<string, TrackedGeneration>;
  /**
   * Génération actuellement affichée par l'écran 04 (generating/[id]) :
   * l'écran gère lui-même la transition vers le résultat, le tracker ne doit
   * pas la notifier (toast / notification locale) en doublon.
   */
  watchedId: string | null;

  /** Met une génération en suivi (idempotent — conserve le startedAt initial). */
  track: (gen: TrackInput) => void;
  setStatus: (id: string, status: GenerationStatus) => void;
  remove: (id: string) => void;
  setWatched: (id: string | null) => void;
};

/**
 * Suivi global des générations « non bloquantes » : alimenté à la création
 * (render-config) ou par l'écran 04, consommé par GenerationTrackerHost
 * (polling), la galerie (tuiles en cours) et la TabBar (badge).
 */
export const useGenerationTracker = create<GenerationTrackerState>((set) => ({
  active: {},
  watchedId: null,

  track: ({ id, renderType, sourceImageUrl }) =>
    set((state) => {
      if (state.active[id]) return state;
      return {
        active: {
          ...state.active,
          [id]: {
            id,
            renderType,
            ...(sourceImageUrl ? { sourceImageUrl } : {}),
            status: 'queued' as GenerationStatus,
            startedAt: Date.now(),
          },
        },
      };
    }),

  setStatus: (id, status) =>
    set((state) => {
      const current = state.active[id];
      if (!current || current.status === status) return state;
      return { active: { ...state.active, [id]: { ...current, status } } };
    }),

  remove: (id) =>
    set((state) => {
      if (!state.active[id]) return state;
      const next = { ...state.active };
      delete next[id];
      return { active: next };
    }),

  setWatched: (id) => set({ watchedId: id }),
}));

/** Générations suivies, de la plus ancienne à la plus récente. */
export function useActiveGenerations(): TrackedGeneration[] {
  return useGenerationTracker(
    useShallow((state) =>
      Object.values(state.active).sort((a, b) => a.startedAt - b.startedAt),
    ),
  );
}

/** Nombre de générations suivies (badge onglet Galerie). */
export function useActiveGenerationCount(): number {
  return useGenerationTracker((state) => Object.keys(state.active).length);
}
