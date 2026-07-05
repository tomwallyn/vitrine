import type { GarmentSlot, GarmentType, RenderType } from '@vitrine/shared';

import { i18n, type SupportedLocale } from './index';

/**
 * Libellés i18n des ENUMS partagés (render types, slots/pièces) — mappés ici
 * plutôt que dans les catalogues d'écran, car ils reflètent des enums de
 * @vitrine/shared (côté serveur ils restent en FR pour les titres par défaut).
 * + format de date localisé et noms par défaut des éléments enregistrés.
 */

const RENDER_TYPE: Record<SupportedLocale, Record<RenderType, string>> = {
  fr: {
    model: 'Sur modèle', hanger: 'Sur cintre', folded: 'Plié à plat', studio: 'Fond studio',
    studio_uni: 'Studio uni', texture: 'Texturé', mise_en_situation: 'Mise en situation',
    ambiance: 'Ambiance', macro: 'Macro détail', exterieur: 'Extérieur',
  },
  'en-US': {
    model: 'On a model', hanger: 'On a hanger', folded: 'Folded flat', studio: 'Studio background',
    studio_uni: 'Plain studio', texture: 'Textured', mise_en_situation: 'In context',
    ambiance: 'Ambiance', macro: 'Macro detail', exterieur: 'Outdoor',
  },
  'en-GB': {
    model: 'On a model', hanger: 'On a hanger', folded: 'Folded flat', studio: 'Studio background',
    studio_uni: 'Plain studio', texture: 'Textured', mise_en_situation: 'In context',
    ambiance: 'Ambience', macro: 'Macro detail', exterieur: 'Outdoor',
  },
  es: {
    model: 'En modelo', hanger: 'En percha', folded: 'Doblado', studio: 'Fondo de estudio',
    studio_uni: 'Estudio liso', texture: 'Con textura', mise_en_situation: 'En contexto',
    ambiance: 'Ambiente', macro: 'Detalle macro', exterieur: 'Exterior',
  },
  pt: {
    model: 'Em modelo', hanger: 'No cabide', folded: 'Dobrado', studio: 'Fundo de estúdio',
    studio_uni: 'Estúdio liso', texture: 'Com textura', mise_en_situation: 'Em contexto',
    ambiance: 'Ambiente', macro: 'Detalhe macro', exterieur: 'Exterior',
  },
  de: {
    model: 'Am Model', hanger: 'Am Bügel', folded: 'Gefaltet', studio: 'Studio-Hintergrund',
    studio_uni: 'Einfarbiges Studio', texture: 'Strukturiert', mise_en_situation: 'Im Kontext',
    ambiance: 'Ambiente', macro: 'Makro-Detail', exterieur: 'Außen',
  },
};

// Slots (haut/bas/chaussures) + types de pièce (haut/bas/robe) — clés fusionnées.
const GARMENT: Record<SupportedLocale, Record<GarmentSlot | GarmentType, string>> = {
  fr: { haut: 'Haut', bas: 'Bas', chaussures: 'Chaussures', robe: 'Robe' },
  'en-US': { haut: 'Top', bas: 'Bottom', chaussures: 'Shoes', robe: 'Dress' },
  'en-GB': { haut: 'Top', bas: 'Bottom', chaussures: 'Shoes', robe: 'Dress' },
  es: { haut: 'Superior', bas: 'Inferior', chaussures: 'Zapatos', robe: 'Vestido' },
  pt: { haut: 'Cima', bas: 'Baixo', chaussures: 'Sapatos', robe: 'Vestido' },
  de: { haut: 'Oberteil', bas: 'Unterteil', chaussures: 'Schuhe', robe: 'Kleid' },
};

const DECOR_WORD: Record<SupportedLocale, string> = {
  fr: 'Décor', 'en-US': 'Backdrop', 'en-GB': 'Backdrop', es: 'Decorado', pt: 'Cenário', de: 'Setting',
};

function loc(): SupportedLocale {
  return (i18n.locale in RENDER_TYPE ? i18n.locale : 'en-US') as SupportedLocale;
}

export const renderTypeLabel = (rt: RenderType): string => RENDER_TYPE[loc()][rt];
export const slotLabel = (slot: GarmentSlot): string => GARMENT[loc()][slot];
export const garmentTypeLabel = (type: GarmentType): string => GARMENT[loc()][type];

/** Date formatée selon la langue du device (au lieu de 'fr-FR' en dur). */
export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(i18n.locale, options);
}

/** Nom par défaut d'un décor perso enregistré (« Décor · 05/07/2026 »). */
export const defaultDecorName = (): string => `${DECOR_WORD[loc()]} · ${formatDate(new Date())}`;

/** Nom par défaut d'une pièce de tenue enregistrée (« Haut · 05/07/2026 »). */
export const defaultGarmentName = (slot: GarmentSlot): string =>
  `${slotLabel(slot)} · ${formatDate(new Date())}`;
