import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import type { SignUploadResponse, UploadKind } from '@vitrine/shared';

import type { Api } from './api';

/** Phase courante de l'upload (affichage de progression). */
export type UploadPhase = 'signing' | 'uploading';

/**
 * Upload d'une image locale vers GCS :
 * 0. **normalisation en JPEG** — les photos iPhone sont en HEIC, un format que
 *    fal (et beaucoup de services) ne savent pas lire ; on convertit toujours,
 * 1. POST /uploads/sign → URL signée PUT v4 (~10 min) rangée par shop,
 * 2. PUT du binaire (Content-Type verrouillé dans la signature),
 * 3. renvoie { publicUrl, objectPath } à stocker dans le brouillon de rendu.
 */
export async function uploadImageAsync(
  api: Api,
  localUri: string,
  kind: UploadKind,
  onPhase?: (phase: UploadPhase) => void,
): Promise<SignUploadResponse> {
  // Toujours en JPEG : garantit un format lisible côté fal (le HEIC iPhone échoue).
  const { uri: jpegUri } = await manipulateAsync(localUri, [], {
    compress: 0.9,
    format: SaveFormat.JPEG,
  });
  const contentType = 'image/jpeg' as const;

  onPhase?.('signing');
  const signed = await api.post<SignUploadResponse>('/uploads/sign', { contentType, kind });

  onPhase?.('uploading');
  // fetch(file://…) → blob : lecture binaire native, sans dépendance supplémentaire.
  const file = await fetch(jpegUri);
  const blob = await file.blob();

  const res = await fetch(signed.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!res.ok) {
    throw new Error(`Échec de l'envoi de l'image (${res.status})`);
  }

  return signed;
}
