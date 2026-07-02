import type {
  SignUploadResponse,
  UploadContentType,
  UploadKind,
} from '@vitrine/shared';

import type { Api } from './api';

/** Phase courante de l'upload (affichage de progression). */
export type UploadPhase = 'signing' | 'uploading';

const CONTENT_TYPE_BY_EXTENSION: Record<string, UploadContentType> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
};

/** Type MIME déduit de l'extension de l'URI locale (JPEG par défaut). */
function guessContentType(localUri: string): UploadContentType {
  const extension = localUri.split('?')[0]?.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPE_BY_EXTENSION[extension] ?? 'image/jpeg';
}

/**
 * Upload d'une image locale vers GCS :
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
  const contentType = guessContentType(localUri);

  onPhase?.('signing');
  const signed = await api.post<SignUploadResponse>('/uploads/sign', { contentType, kind });

  onPhase?.('uploading');
  // fetch(file://…) → blob : lecture binaire native, sans dépendance supplémentaire.
  const file = await fetch(localUri);
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
