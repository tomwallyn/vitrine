import type { GenerationScene } from '@vitrine/shared';

/** État d'upload d'un décor perso (« Mes scènes »). */
export type SceneUploadStatus = 'idle' | 'uploading' | 'done' | 'error';

/** Décor perso choisi (image de référence réutilisable). */
export type SceneDecor = {
  /** URL canonique envoyée à la génération. null pendant l'upload. */
  url: string | null;
  /** Vignette à afficher (image locale / displayUrl signé). */
  thumbUrl: string | null;
  status: SceneUploadStatus;
};

/**
 * Configuration de « Compléter la scène » (rendu objet) : surface/décor/
 * accessoires = clés de preset texte ; `decor` = décor perso (image) qui prime
 * sur le preset `background` s'il est présent.
 */
export type SceneState = {
  surface: string | null;
  background: string | null;
  accessoires: string | null;
  decor: SceneDecor | null;
};

export const EMPTY_SCENE: SceneState = {
  surface: null,
  background: null,
  accessoires: null,
  decor: null,
};

/** Scène du store → payload `GenerationScene` (undefined si vide). */
export function sceneToPayload(scene: SceneState): GenerationScene | undefined {
  const p: GenerationScene = {};
  if (scene.surface) p.surface = scene.surface;
  if (scene.decor?.url) p.decorUrl = scene.decor.url;
  else if (scene.background) p.background = scene.background;
  if (scene.accessoires) p.accessoires = scene.accessoires;
  return Object.keys(p).length > 0 ? p : undefined;
}

/** La surface (requise) est choisie et aucun décor n'est en cours d'upload. */
export function sceneReady(scene: SceneState): boolean {
  return !!scene.surface && scene.decor?.status !== 'uploading';
}

/** Un décor perso est-il en cours d'upload ? (bloque le CTA « Générer »). */
export function sceneUploading(scene: SceneState): boolean {
  return scene.decor?.status === 'uploading';
}
