import { useAuth } from '@clerk/clerk-expo';
import { useMemo } from 'react';

import type {
  AddToGalleryRequest,
  AddToGalleryResponse,
  BackgroundsResponse,
  CreateBackgroundRequest,
  CreateBackgroundResponse,
  CreateBatchRequest,
  CreateBatchResponse,
  CreateGenerationRequest,
  CreateGenerationResponse,
  CreateVariantsRequest,
  CreateVariantsResponse,
  ClassifyGarmentResponse,
  CreateGarmentRequest,
  CreateGarmentResponse,
  CreateScenePresetRequest,
  CreateScenePresetResponse,
  CreditPacksResponse,
  CreditsResponse,
  GalleryFilter,
  GalleryResponse,
  GallerySort,
  GarmentSlot,
  GarmentsResponse,
  GetGenerationResponse,
  RegisterPushTokenRequest,
  RegisterPushTokenResponse,
  ScenePresetSlot,
  ScenePresetsResponse,
} from '@vitrine/shared';

/** Base URL de l'API Fastify (device réel : IP LAN de la machine, pas localhost). */
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** 402 Payment Required — solde de crédits insuffisant (écran Crédits à proposer). */
export function isInsufficientCredits(err: unknown): boolean {
  return err instanceof ApiError && err.status === 402;
}

type RequestOptions = {
  /**
   * Statuts non-2xx dont le corps JSON reste un payload métier valide.
   * Ex. POST /generations renvoie 502 avec la génération `failed` (crédit
   * remboursé) quand la soumission fal échoue : on veut la génération, pas
   * une exception.
   */
  allowStatuses?: readonly number[];
};

/**
 * Client API authentifié : injecte le Bearer token Clerk sur chaque requête.
 * À consommer via TanStack Query (`queryFn` / `mutationFn`).
 */
export function useApi() {
  const { getToken } = useAuth();

  return useMemo(() => {
    const request = async <T>(
      method: string,
      path: string,
      body?: unknown,
      options?: RequestOptions,
    ): Promise<T> => {
      const token = await getToken();
      const res = await fetch(`${API_URL}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });

      if (!res.ok && !options?.allowStatuses?.includes(res.status)) {
        let message = `Erreur API (${res.status})`;
        try {
          const data = (await res.json()) as { error?: unknown };
          if (typeof data.error === 'string') message = data.error;
        } catch {
          // corps non-JSON : on garde le message générique
        }
        throw new ApiError(res.status, message);
      }
      return (await res.json()) as T;
    };

    return {
      get: <T>(path: string) => request<T>('GET', path),
      post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
      patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),

      /** Compte / appareil courant. */
      me: {
        /**
         * POST /me/push-token — enregistre le token push Expo de l'appareil
         * (upsert idempotent côté serveur : ré-enregistrer est sans effet,
         * un appareil qui change de compte est ré-attaché au shop courant).
         */
        registerPushToken: (payload: RegisterPushTokenRequest) =>
          request<RegisterPushTokenResponse>('POST', '/me/push-token', payload),
      },

      /** Pipeline de génération IA (écrans 03 → 04 → 05). */
      generations: {
        /** POST /generations — réserve 1 crédit, crée la génération (502 = failed + refund). */
        create: (payload: CreateGenerationRequest) =>
          request<CreateGenerationResponse>('POST', '/generations', payload, {
            allowStatuses: [502],
          }),
        /**
         * POST /generations/batch — lot avec style commun (1 crédit / item,
         * pré-check global du solde → 402 si insuffisant). Un item dont la
         * soumission fal échoue revient `failed` (crédit remboursé), sans
         * bloquer le reste du lot.
         */
        createBatch: (payload: CreateBatchRequest) =>
          request<CreateBatchResponse>('POST', '/generations/batch', payload),
        /** GET /generations/:id — polling écran 04. */
        get: (id: string) => request<GetGenerationResponse>('GET', `/generations/${id}`),
        /** POST /generations/:id/regenerate — mêmes params, 1 crédit. */
        regenerate: (id: string) =>
          request<CreateGenerationResponse>('POST', `/generations/${id}/regenerate`, undefined, {
            allowStatuses: [502],
          }),
        /** POST /generations/:id/variants — autres types de rendu (1 crédit / type). */
        createVariants: (id: string, payload: CreateVariantsRequest) =>
          request<CreateVariantsResponse>('POST', `/generations/${id}/variants`, payload),
      },

      /** Crédits & packs (écrans 07 + Facturation). */
      credits: {
        /** GET /credits — solde + historique paginé du ledger (?limit&offset). */
        get: (params?: { limit?: number; offset?: number }) => {
          const query = new URLSearchParams();
          if (params?.limit !== undefined) query.set('limit', String(params.limit));
          if (params?.offset !== undefined) query.set('offset', String(params.offset));
          const qs = query.toString();
          return request<CreditsResponse>('GET', qs ? `/credits?${qs}` : '/credits');
        },
        /** GET /credit-packs — les 3 packs avec prix/visuel calculé. */
        packs: () => request<CreditPacksResponse>('GET', '/credit-packs'),
      },

      /** Galerie « Mes créations » (écran 06 + CTA écran 05). */
      gallery: {
        /** GET /gallery — items filtrés/triés/paginés, joints à leur génération. */
        list: (params: {
          filter: GalleryFilter;
          q?: string;
          sort?: GallerySort;
          limit?: number;
          offset?: number;
        }) => {
          const query = new URLSearchParams({ filter: params.filter });
          if (params.q) query.set('q', params.q);
          if (params.sort) query.set('sort', params.sort);
          if (params.limit !== undefined) query.set('limit', String(params.limit));
          if (params.offset !== undefined) query.set('offset', String(params.offset));
          return request<GalleryResponse>('GET', `/gallery?${query.toString()}`);
        },
        /** POST /gallery — ré-ajout manuel (idempotent). L'auto-save couvre le cas nominal. */
        add: (payload: AddToGalleryRequest) =>
          request<AddToGalleryResponse>('POST', '/gallery', payload),
        /** DELETE /gallery/:id — retire un visuel de la galerie (par id d'item). */
        remove: (id: string) => request<{ ok: boolean }>('DELETE', `/gallery/${id}`),
        /** DELETE /gallery/generation/:id — retire par id de génération (écran résultat). */
        removeByGeneration: (generationId: string) =>
          request<{ ok: boolean }>('DELETE', `/gallery/generation/${generationId}`),
      },

      /** Fonds personnalisés réutilisables (écran 03 — FOND). */
      backgrounds: {
        list: () => request<BackgroundsResponse>('GET', '/backgrounds'),
        create: (payload: CreateBackgroundRequest) =>
          request<CreateBackgroundResponse>('POST', '/backgrounds', payload),
      },

      /** Presets texte perso de « Compléter la scène » (rendu objet). */
      scenePresets: {
        list: (slot: ScenePresetSlot) =>
          request<ScenePresetsResponse>('GET', `/scene-presets?slot=${slot}`),
        create: (payload: CreateScenePresetRequest) =>
          request<CreateScenePresetResponse>('POST', '/scene-presets', payload),
      },

      /** Garde-robe : pièces custom réutilisables (« Compléter la tenue »). */
      garments: {
        list: (slot?: GarmentSlot) =>
          request<GarmentsResponse>('GET', slot ? `/garments?slot=${slot}` : '/garments'),
        create: (payload: CreateGarmentRequest) =>
          request<CreateGarmentResponse>('POST', '/garments', payload),
        /** Devine le type de la pièce importée (« Compléter la tenue »). */
        classify: (imageUrl: string) =>
          request<ClassifyGarmentResponse>('POST', '/garments/classify', { imageUrl }),
      },
    };
  }, [getToken]);
}

export type Api = ReturnType<typeof useApi>;
