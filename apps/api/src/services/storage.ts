import { randomUUID } from 'node:crypto';

import { Storage } from '@google-cloud/storage';
import type { SignUploadResponse, UploadContentType, UploadKind } from '@vitrine/shared';

/** Durée de validité des URLs signées d'upload (~10 min). */
const SIGNED_UPLOAD_TTL_MS = 10 * 60 * 1000;

/** Extension de fichier par type MIME accepté (contrat partagé). */
const EXTENSION_BY_CONTENT_TYPE: Record<UploadContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

/** Sous-dossier GCS par destination d'upload. */
const FOLDER_BY_KIND: Record<UploadKind, string> = {
  source: 'sources',
  background: 'backgrounds',
};

type Gcs = { storage: Storage; bucket: string };

let gcs: Gcs | null = null;

/**
 * Singleton paresseux (même pattern que getDb) : le client GCS n'est créé
 * qu'au premier appel, pour que l'API compile et démarre sans credentials.
 * Auth via ADC : GOOGLE_APPLICATION_CREDENTIALS (clé de service account)
 * ou `gcloud auth application-default login` en local.
 */
export function getGcs(): Gcs {
  if (!gcs) {
    const bucket = process.env.GCS_BUCKET;
    if (!bucket) {
      throw new Error('GCS_BUCKET manquant — copiez apps/api/.env.example vers .env');
    }
    const storage = new Storage({
      ...(process.env.GCS_PROJECT_ID ? { projectId: process.env.GCS_PROJECT_ID } : {}),
    });
    gcs = { storage, bucket };
  }
  return gcs;
}

/**
 * Génère une URL signée PUT v4 (~10 min) pour uploader une image, rangée
 * par shop : shops/{authUserId}/sources/{uuid} (ou .../backgrounds/{uuid}).
 * Le Content-Type est verrouillé dans la signature : le PUT doit l'envoyer
 * à l'identique.
 */
export async function createSignedUpload(
  authUserId: string,
  kind: UploadKind,
  contentType: UploadContentType,
): Promise<SignUploadResponse> {
  const { storage, bucket } = getGcs();

  const extension = EXTENSION_BY_CONTENT_TYPE[contentType];
  const objectPath = `shops/${authUserId}/${FOLDER_BY_KIND[kind]}/${randomUUID()}.${extension}`;

  const [uploadUrl] = await storage
    .bucket(bucket)
    .file(objectPath)
    .getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + SIGNED_UPLOAD_TTL_MS,
      contentType,
    });

  return {
    uploadUrl,
    objectPath,
    publicUrl: `https://storage.googleapis.com/${bucket}/${objectPath}`,
  };
}
