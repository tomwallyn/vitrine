import { useBatchDraft } from './batch-draft';
import { useRenderDraft } from './render-draft';
import type { SceneState } from './scene';

/** Cible du sous-flux « Compléter la scène » : brouillon photo unique ou lot. */
export type SceneTarget = 'single' | 'batch';

export type SceneController = {
  scene: SceneState;
  setScene: (patch: Partial<SceneState>) => void;
  /** Vignette de l'objet importé (photo unique) — absente en lot (scène commune). */
  sourceThumb: string | null;
};

/**
 * Expose la scène du bon brouillon (render-draft en photo unique, batch-draft en
 * lot) sous une interface uniforme — les écrans /scene* sont agnostiques de la cible.
 */
export function useSceneTarget(target: SceneTarget): SceneController {
  const renderScene = useRenderDraft((s) => s.scene);
  const renderLocalUri = useRenderDraft((s) => s.localUri);
  const batchScene = useBatchDraft((s) => s.scene);

  if (target === 'batch') {
    return { scene: batchScene, setScene: useBatchDraft.getState().setScene, sourceThumb: null };
  }
  return {
    scene: renderScene,
    setScene: useRenderDraft.getState().setScene,
    sourceThumb: renderLocalUri,
  };
}
