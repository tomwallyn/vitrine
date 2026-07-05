import type {
  GarmentSlot,
  MannequinOption,
  ObjectRenderType,
  Provider,
  SceneLighting,
} from './enums.js';

/**
 * Configuration IA partagée (benchmark M3.0 + pipeline API M3a).
 *
 * Slugs & schémas d'input/output vérifiés sur fal.ai le 2026-07-02
 * (pages /models/<slug>/api) — source de vérité unique, réutilisée par
 * `infra/benchmark` et `apps/api/src/services/ai` :
 *
 * 1. FASHN Virtual Try-On v1.6 — `fal-ai/fashn/tryon/v1.6`
 *    Input  : { model_image: string (URL), garment_image: string (URL),
 *               category?: "auto"|"tops"|"bottoms"|"one-pieces" (def "auto"),
 *               mode?: "performance"|"balanced"|"quality" (def "balanced"),
 *               garment_photo_type?: "auto"|"model"|"flat-lay" (def "auto"),
 *               seed?, num_samples?, output_format?: "png"|"jpeg" (def "png") }
 *    Output : { images: [{ url, content_type, file_name, file_size }] }
 *
 * 2. Kling Kolors Virtual Try-On — `fal-ai/kling/v1-5/kolors-virtual-try-on`
 *    Input  : { human_image_url: string, garment_image_url: string, sync_mode? }
 *    Output : { image: { url, width, height, content_type } }  (objet unique, pas de liste)
 *
 * 3. Nano Banana Pro (Gemini 3 Pro Image) édition — `fal-ai/nano-banana-pro/edit`
 *    Input  : { prompt: string, image_urls: string[], num_images?, aspect_ratio?,
 *               output_format?: "jpeg"|"png"|"webp", resolution?, seed?, sync_mode? }
 *    Output : { images: [{ url, content_type, width, height }], description: string }
 *    Variante moins chère (Gemini 2.5 Flash Image) : `fal-ai/nano-banana/edit`
 *    (même schéma prompt + image_urls → images[]) — swap possible ci-dessous.
 */

/** Slugs d'endpoints fal réellement appelés, par provider. */
export const FAL_ENDPOINTS: Record<Provider, string> = {
  fashn: 'fal-ai/fashn/tryon/v1.6',
  kling: 'fal-ai/kling/v1-5/kolors-virtual-try-on',
  // Décision plan : Nano Banana Pro (Gemini 3 Pro Image).
  // Pour tester la variante ~3x moins chère : 'fal-ai/nano-banana/edit' (~0,039 $/image).
  nanobanana: 'fal-ai/nano-banana-pro/edit',
};

/**
 * Prompts d'édition Nano Banana par type de rendu (hors `model`, servi par le try-on).
 * Consigne commune : fidélité absolue au vêtement — texture, motif, couleur, coupe.
 */
export const NANO_PROMPTS: Record<'hanger' | 'folded' | 'studio', string> = {
  hanger:
    "Photo produit e-commerce professionnelle : le MÊME vêtement que sur l'image source, " +
    'présenté sur un cintre en bois élégant, devant un fond studio crème uni et doux. ' +
    'Garde la texture, le motif, la couleur et la coupe STRICTEMENT identiques au vêtement source. ' +
    "Ne modifie ni les proportions, ni les détails (boutons, coutures, logos, étiquettes). " +
    'Éclairage studio diffus, ombres légères, cadrage centré vertical.',
  folded:
    "Photo produit e-commerce professionnelle : le MÊME vêtement que sur l'image source, " +
    'plié à plat avec soin, vu du dessus (flat lay, top-down), sur une surface neutre claire. ' +
    'Garde la texture, le motif, la couleur et la coupe STRICTEMENT identiques au vêtement source. ' +
    "Ne modifie ni les proportions, ni les détails (boutons, coutures, logos, étiquettes). " +
    'Lumière douce homogène, style catalogue minimaliste.',
  studio:
    "Packshot e-commerce professionnel : le MÊME vêtement que sur l'image source, " +
    'détouré et présenté en volume (effet ghost mannequin) sur fond studio blanc cassé uniforme. ' +
    'Garde la texture, le motif, la couleur et la coupe STRICTEMENT identiques au vêtement source. ' +
    "Ne modifie ni les proportions, ni les détails (boutons, coutures, logos, étiquettes). " +
    'Éclairage studio professionnel, ombre portée subtile, cadrage produit centré.',
};

/**
 * Suffixe ajouté au prompt Nano Banana quand un fond personnalisé est fourni
 * (le fond est passé en 2ᵉ image dans `image_urls`).
 */
export const NANO_CUSTOM_BACKGROUND_SUFFIX =
  " Utilise la DEUXIÈME image fournie comme fond/arrière-plan de la scène, " +
  'en intégrant le vêtement dessus de façon naturelle (perspective et éclairage cohérents).';

/**
 * Suffixe ajouté au prompt Nano Banana quand plusieurs vues du même vêtement
 * sont fournies (multi-détails : avant + arrière et/ou détail matière,
 * passées après la source dans `image_urls`).
 */
export const NANO_MULTI_VIEW_SUFFIX =
  " Plusieurs images du MÊME vêtement sont fournies (vue avant, puis vue arrière " +
  "et/ou détail de la matière) : combine ces vues pour restituer fidèlement le " +
  'vêtement (texture, motif, couleur, coupe) dans UN SEUL rendu final.';

/**
 * Variante de {@link NANO_CUSTOM_BACKGROUND_SUFFIX} quand des vues
 * additionnelles précèdent le fond dans `image_urls` : le fond n'est alors
 * plus la 2ᵉ image mais la DERNIÈRE.
 */
export const NANO_CUSTOM_BACKGROUND_LAST_SUFFIX =
  " Utilise la DERNIÈRE image fournie comme fond/arrière-plan de la scène, " +
  'en intégrant le vêtement dessus de façon naturelle (perspective et éclairage cohérents).';

/**
 * Rendu « sur modèle » servi par Nano Banana (au lieu du try-on FASHN) :
 * la PREMIÈRE image passée est le mannequin de référence (cohérent d'un visuel
 * à l'autre), la/les suivante(s) sont le vêtement (source + vues additionnelles).
 * On habille le mannequin en gardant son identité et la fidélité du vêtement.
 * Le fond est ajouté par un suffixe (studio par défaut, ou custom en dernière image).
 */
export const NANO_MODEL_DRESS_PROMPT =
  'Photo e-commerce plein pied, photoréaliste : la personne de la PREMIÈRE image ' +
  '(garde son visage, son corps, ses cheveux et sa pose EXACTEMENT identiques) porte le ' +
  'vêtement présenté dans la ou les image(s) SUIVANTE(S). Retire tout cintre et habille-la ' +
  'avec ce vêtement de façon naturelle et bien ajustée (drapé réaliste). Garde la texture, ' +
  'le motif, la couleur, la forme et les détails du vêtement (col, boutons, coutures, zip, ' +
  'logos) STRICTEMENT identiques.';

/**
 * Suffixe « aucune tenue complétée » : on garde le bas de base neutre du mannequin.
 * Utilisé quand aucune pièce de complétion (bas/haut/chaussures) n'est fournie.
 */
export const NANO_MODEL_KEEP_BASE_SUFFIX =
  ' Conserve le bas de base du mannequin (legging gris neutre).';

/**
 * Suffixe « compléter la tenue » : décrit les pièces additionnelles (fournies
 * après le vêtement principal dans image_urls) à faire porter AUSSI au mannequin,
 * en remplaçant entièrement ses vêtements de base. `present` liste les slots réellement fournis.
 */
export function nanoOutfitSuffix(present: {
  top?: boolean;
  bottom?: boolean;
  shoes?: boolean;
}): string {
  const pieces: string[] = [];
  if (present.top) pieces.push('un haut');
  if (present.bottom) pieces.push('un bas');
  if (present.shoes) pieces.push('des chaussures');
  const list = pieces.join(', ');
  return (
    ` En plus du vêtement principal, fais porter au mannequin ${list} — ` +
    'chaque pièce est fournie dans une image suivante — de façon cohérente et naturelle, ' +
    'en REMPLAÇANT entièrement ses vêtements de base (aucun legging gris ne doit rester). ' +
    'Garde chaque pièce STRICTEMENT fidèle (texture, couleur, coupe, détails).'
  );
}

/** Suffixe fond studio par défaut du rendu « sur modèle » Nano. */
export const NANO_MODEL_BG_STUDIO =
  ' Garde un fond studio gris clair uni, éclairage doux homogène.';

/**
 * Images de mannequins « de base » pour le try-on (FASHN & Kling exigent une photo
 * de personne : model_image / human_image_url).
 *
 * ⚠️ URLs publiques PAR DÉFAUT, à REMPLACER par vos propres mannequins de référence
 * (idéalement : mannequins synthétiques cohérents par boutique, cf. plan §Router IA,
 * et images licenciées — les URLs ci-dessous ne sont que des placeholders de dev).
 * - femme      : asset d'exemple officiel FASHN sur le CDN fal (femme debout, frontal, plein pied)
 * - homme      : photo Unsplash (homme debout, plein pied) — qualité try-on correcte mais non idéale
 * - silhouette : placeholder (réutilise « femme ») — à remplacer par un rendu mannequin
 *                neutre/synthétique généré une fois pour toutes.
 */
/** Un mannequin de référence sélectionnable (variante d'une catégorie). */
export interface Mannequin {
  /** Id stable (ex. 'femme-1'). */
  id: string;
  /** Libellé affiché (ex. « Femme 1 »). */
  name: string;
  /** URL publique de l'image plein pied (fond studio). */
  url: string;
}

/**
 * Catalogue des mannequins par catégorie (femme / homme / silhouette) : plusieurs
 * variantes par catégorie, chacune avec sa vignette — l'app affiche un choix de
 * modèles sous les chips de catégorie. `studio` n'a pas de mannequin (packshot ghost).
 * À ENRICHIR au fil des mannequins générés (cf. prompt fourni au dev).
 */
export const MANNEQUINS: Record<Exclude<MannequinOption, 'studio'>, Mannequin[]> = {
  femme: [
    { id: 'femme-1', name: 'Femme 1', url: 'https://v3b.fal.media/files/b/0aa0e663/NVBj5HD29eCmi-5bxy-W7_femme-1.png' },
    { id: 'femme-2', name: 'Femme 2', url: 'https://v3b.fal.media/files/b/0aa0e663/kr3cU_iEF-fSz6udco0Cl_femme-2.png' },
    { id: 'femme-3', name: 'Femme 3', url: 'https://v3b.fal.media/files/b/0aa0e664/6R67O98x5fu46ljvhtixh_femme-3.png' },
  ],
  homme: [
    { id: 'homme-1', name: 'Homme 1', url: 'https://v3b.fal.media/files/b/0aa0e664/oGw2ma0SmC7FOc4tK6MB1_homme-1.png' },
    { id: 'homme-2', name: 'Homme 2', url: 'https://v3b.fal.media/files/b/0aa0e66e/iTCxbGKisL45qYqXGXyq0_homme-2.png' },
    { id: 'homme-3', name: 'Homme 3', url: 'https://v3b.fal.media/files/b/0aa0e664/eCvolSZUq7sDBOES1iRa3_homme-3.png' },
  ],
  // ⚠️ silhouette : encore un placeholder — Tom le fera plus tard.
  silhouette: [
    {
      id: 'silhouette-1',
      name: 'Silhouette',
      url: 'https://v3.fal.media/files/penguin/aOzrM7vPOSLksKfxSovG6_model.png',
    },
  ],
};

/** Mannequin résolu depuis (catégorie, id) — repli sur la 1ʳᵉ variante. */
export function resolveMannequin(
  option: Exclude<MannequinOption, 'studio'>,
  id?: string | null,
): Mannequin {
  const list = MANNEQUINS[option];
  return list.find((m) => m.id === id) ?? list[0]!;
}

/** Image « de base » par catégorie (1ʳᵉ variante) — benchmark + repli. */
export const MANNEQUIN_IMAGES: Record<Exclude<MannequinOption, 'studio'>, string> = {
  femme: MANNEQUINS.femme[0]!.url,
  homme: MANNEQUINS.homme[0]!.url,
  silhouette: MANNEQUINS.silhouette[0]!.url,
};

/** Mannequin de repli (benchmark + garde-fou du router). */
export const DEFAULT_MANNEQUIN: Exclude<MannequinOption, 'studio'> = 'femme';

/** Une suggestion de vêtement par défaut (packshot hébergé sur CDN). */
export interface DefaultGarment {
  /** Clé stable (ex. 'jean-brut'). */
  key: string;
  /** Libellé affiché (ex. « Jean brut »). */
  name: string;
  /** URL publique de l'image packshot (ghost mannequin, fond blanc). */
  url: string;
}

/**
 * Suggestions de vêtements par défaut, par slot, pour « Compléter la tenue »
 * (même rôle que {@link MANNEQUIN_IMAGES} : des images hébergées passées telles
 * quelles à Nano). À REMPLIR une fois les packshots générés (cf. prompts du plan)
 * et hébergés sur le CDN fal.
 */
export const DEFAULT_GARMENT_IMAGES: Record<GarmentSlot, DefaultGarment[]> = {
  bas: [
    { key: 'jean-brut', name: 'Jean brut', url: 'https://v3b.fal.media/files/b/0aa0e33e/oamZFAgMKE0FHBqqzWbJz_jean-brut.png' },
    { key: 'pantalon-noir', name: 'Pantalon noir', url: 'https://v3b.fal.media/files/b/0aa0e33f/v7AcxUBIMGbAfAzZEFwyo_pantalon-noir.png' },
    { key: 'chino-beige', name: 'Chino beige', url: 'https://v3b.fal.media/files/b/0aa0e340/wVkFO-F9S4gA28RSmsi8u_chino-beige.png' },
    { key: 'jupe-midi', name: 'Jupe midi', url: 'https://v3b.fal.media/files/b/0aa0e341/8IfNP8BeTFrg3z32Db1_O_jupe-midi.png' },
    { key: 'short', name: 'Short', url: 'https://v3b.fal.media/files/b/0aa0e342/mpjRbMmgtDBikS-0Xkp9G_short.png' },
  ],
  haut: [
    { key: 'tshirt-blanc', name: 'T-shirt blanc', url: 'https://v3b.fal.media/files/b/0aa0e34d/hEYB6pH5d1_SHx9SRSPXv_tshirt-blanc.png' },
    { key: 'chemise-blanche', name: 'Chemise blanche', url: 'https://v3b.fal.media/files/b/0aa0e34e/uGSoMFLG71yNGqUoSDiVm_chemise-blanche.png' },
    { key: 'pull-noir', name: 'Pull noir', url: 'https://v3b.fal.media/files/b/0aa0e345/F0x1NfAlp9Ei2_cKvhi60_pull-noir.png' },
  ],
  chaussures: [
    { key: 'baskets-blanches', name: 'Baskets blanches', url: 'https://v3b.fal.media/files/b/0aa0e346/AB1OfjE0bmw2-mpjkePLg_baskets-blanches.png' },
    { key: 'bottines-noires', name: 'Bottines noires', url: 'https://v3b.fal.media/files/b/0aa0e347/1cdMLQldgv4n7zoCRsg2X_bottines-noires.png' },
    { key: 'mocassins-camel', name: 'Mocassins camel', url: 'https://v3b.fal.media/files/b/0aa0e352/DI-ugNPU-1t3IgnVBVSsg_mocassins-camel.png' },
  ],
};

// ─────────────────────────────────────────────────────────────────
// OBJETS (v2) — rendu « mise en situation » par prompt texte (Nano Banana).
// L'objet source reste STRICTEMENT fidèle ; surface/fond/accessoires/lumière
// sont des presets texte composés en suffixes (aucun asset à héberger).
// Validé en live 2026-07 : objet préservé, scène crédible, 2K natif.
// ─────────────────────────────────────────────────────────────────

/** Préambule de fidélité objet (garder l'objet exactement identique). */
export const NANO_OBJECT_FIDELITY =
  "Photo produit e-commerce professionnelle : le MÊME objet que sur l'image source. Garde sa forme, " +
  'sa matière, sa couleur, son motif et ses proportions STRICTEMENT identiques — ne modifie AUCUN ' +
  "détail de l'objet.";

/** Style de base par type de rendu objet (ajouté après {@link NANO_OBJECT_FIDELITY}). */
export const NANO_OBJECT_PROMPTS: Record<ObjectRenderType, string> = {
  studio_uni:
    ' Présente-le en packshot studio sur un fond uni clair, éclairage doux et homogène, ombre portée ' +
    'subtile, cadrage produit centré, photoréaliste.',
  texture:
    ' Présente-le en packshot sur un support/fond texturé haut de gamme (béton, lin ou pierre), matière ' +
    'bien visible, éclairage doux, cadrage produit centré, photoréaliste.',
  mise_en_situation:
    " Mets l'objet en situation dans une scène d'intérieur réaliste et vendeuse (lifestyle), " +
    'photoréaliste, cadrage produit.',
  ambiance:
    ' Mets-le en valeur dans une ambiance chaleureuse et atmosphérique (lumière et ombres travaillées), ' +
    'rendu photoréaliste, cadrage produit.',
  macro:
    " Rends un gros plan macro sur le détail et la matière de l'objet, faible profondeur de champ, " +
    "très net sur l'objet, photoréaliste.",
  exterieur:
    ' Mets-le en situation en extérieur (terrasse, jardin, lumière naturelle) de façon réaliste et ' +
    'vendeuse, photoréaliste, cadrage produit.',
};

/** Catégorie de décor (onglets de l'écran OBJET·3). */
export const OBJECT_SCENE_CATEGORIES = [
  { key: 'interieurs', name: 'Intérieurs' },
  { key: 'exterieurs', name: 'Extérieurs' },
  { key: 'unis', name: 'Unis' },
] as const;
export type ObjectSceneCategory = (typeof OBJECT_SCENE_CATEGORIES)[number]['key'];

/** Un preset texte (surface / décor / accessoire). */
export interface ObjectPreset {
  key: string;
  name: string;
  /** Fragment injecté dans le prompt Nano. */
  prompt: string;
}

/** Surfaces proposées (slot SURFACE de « Compléter la scène »). */
export const OBJECT_SURFACES: ObjectPreset[] = [
  { key: 'bois-clair', name: 'Bois clair', prompt: 'en bois clair' },
  { key: 'marbre', name: 'Marbre', prompt: 'en marbre blanc veiné' },
  { key: 'beton', name: 'Béton', prompt: 'en béton ciré gris clair' },
  { key: 'lin', name: 'Lin', prompt: "recouverte d'un lin naturel" },
  { key: 'ardoise', name: 'Ardoise', prompt: 'en ardoise noire mate' },
  { key: 'verre', name: 'Verre', prompt: 'en verre transparent' },
];

/** Décors/scènes proposés, par catégorie (picker OBJET·3). */
export const OBJECT_SCENES: (ObjectPreset & { category: ObjectSceneCategory })[] = [
  { key: 'salon-minimal', name: 'Salon minimal', category: 'interieurs', prompt: 'un salon minimaliste, mur clair, décor épuré' },
  { key: 'table-lin', name: 'Table lin', category: 'interieurs', prompt: 'une table dressée en lin naturel, intérieur chaleureux' },
  { key: 'etagere-bois', name: 'Étagère bois', category: 'interieurs', prompt: 'une étagère en bois avec quelques objets déco' },
  { key: 'terrasse', name: 'Terrasse', category: 'exterieurs', prompt: 'une terrasse extérieure ensoleillée avec des plantes' },
  { key: 'jardin', name: 'Jardin', category: 'exterieurs', prompt: 'un jardin verdoyant en lumière naturelle' },
  { key: 'mur-brique', name: 'Mur brique', category: 'exterieurs', prompt: 'un mur de brique extérieur, ambiance urbaine' },
  { key: 'blanc', name: 'Fond blanc', category: 'unis', prompt: 'un fond blanc pur uni' },
  { key: 'creme', name: 'Fond crème', category: 'unis', prompt: 'un fond crème clair uni' },
  { key: 'gris', name: 'Fond gris', category: 'unis', prompt: 'un fond gris clair uni' },
];

/** Accessoires proposés (slot ACCESSOIRES, optionnel). */
export const OBJECT_ACCESSORIES: ObjectPreset[] = [
  { key: 'aucun', name: 'Aucun', prompt: '' },
  { key: 'branche-livres', name: 'Branche & livres', prompt: 'quelques livres et une branche végétale séchée' },
  { key: 'fleurs', name: 'Fleurs séchées', prompt: 'un bouquet de fleurs séchées' },
  { key: 'plante', name: 'Plante verte', prompt: 'une petite plante verte en pot' },
  { key: 'vaisselle', name: 'Vaisselle', prompt: 'de la vaisselle assortie discrète' },
];

const OBJECT_LIGHTING_PROMPT: Record<SceneLighting, string> = {
  douce: 'douce et naturelle',
  doree: 'chaude et dorée (golden hour)',
  contrastee: 'contrastée et directionnelle',
};

/** Suffixe ambiance lumière du rendu objet. */
export function objectLightingSuffix(lighting?: SceneLighting | null): string {
  return lighting ? ` Éclairage ${OBJECT_LIGHTING_PROMPT[lighting]}.` : '';
}

/**
 * Suffixe surface : clé de {@link OBJECT_SURFACES} OU **texte libre** (surface
 * décrite par l'utilisateur). Vide si absente.
 */
export function objectSurfaceSuffix(value?: string | null): string {
  if (!value) return '';
  const s = OBJECT_SURFACES.find((x) => x.key === value);
  return s ? ` Pose l'objet sur une surface ${s.prompt}.` : ` Pose l'objet sur ${value}.`;
}

/**
 * Suffixe décor/arrière-plan : clé de {@link OBJECT_SCENES} OU **texte libre**.
 * Vide si absent.
 */
export function objectSceneSuffix(value?: string | null): string {
  if (!value) return '';
  const s = OBJECT_SCENES.find((x) => x.key === value);
  return s ? ` Arrière-plan : ${s.prompt}.` : ` Arrière-plan : ${value}.`;
}

/**
 * Suffixe accessoires : clé de {@link OBJECT_ACCESSORIES} (dont 'aucun' = vide)
 * OU **texte libre**. Vide si absent.
 */
export function objectAccessoriesSuffix(value?: string | null): string {
  if (!value) return '';
  const a = OBJECT_ACCESSORIES.find((x) => x.key === value);
  if (a) return a.prompt ? ` Ajoute discrètement en accessoires ${a.prompt}.` : '';
  return ` Ajoute discrètement en accessoires ${value}.`;
}

/**
 * Suffixe « décor perso » (image de référence passée en dernier dans image_urls).
 * Insiste sur l'INTÉGRATION de l'objet DANS le lieu (posé sur une surface réelle
 * de la scène, ombre de contact, perspective/échelle/lumière du lieu) — surtout
 * pas un simple collage devant un arrière-plan.
 */
export const NANO_OBJECT_DECOR_SUFFIX =
  " La DERNIÈRE image fournie est le LIEU réel dans lequel placer l'objet. INTÈGRE l'objet À " +
  "L'INTÉRIEUR de cette scène : pose-le sur une surface plausible du lieu (sol, table, étagère, " +
  'plan de travail…), comme s\'il y avait vraiment été photographié — même point de vue et même ' +
  'perspective que le lieu, échelle réaliste, éclairage et température de couleur du lieu, avec une ' +
  "ombre de contact au sol. NE colle PAS l'objet en avant-plan devant l'image : il doit faire " +
  'partie intégrante de la pièce, à un emplacement naturel et crédible.';
