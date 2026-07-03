import { create } from 'zustand';

/**
 * Passerelle pour réutiliser l'écran caméra custom (`/capture`) hors du flux
 * « une seule photo » (multi-détails, lot). L'appelant enregistre une cible et
 * ouvre `/capture?mode=return` ; la caméra y dépose l'URI de la photo validée ;
 * l'appelant la consomme (via `takeFor`) quand elle arrive.
 *
 * `takeFor(prefix)` ne rend/retire le résultat que si la cible correspond au
 * préfixe de l'appelant — plusieurs écrans peuvent être montés simultanément
 * sans se voler le résultat.
 */
type CaptureResultState = {
  target: string | null;
  uri: string | null;
  request: (target: string) => void;
  deliver: (uri: string) => void;
  takeFor: (prefix: string) => { target: string; uri: string } | null;
};

export const useCaptureResult = create<CaptureResultState>((set, get) => ({
  target: null,
  uri: null,
  request: (target) => set({ target, uri: null }),
  deliver: (uri) => set({ uri }),
  takeFor: (prefix) => {
    const { target, uri } = get();
    if (!target || !uri || !target.startsWith(prefix)) return null;
    set({ target: null, uri: null });
    return { target, uri };
  },
}));
