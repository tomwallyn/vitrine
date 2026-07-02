import {
  signUploadRequestSchema,
  signUploadResponseSchema,
  type SignUploadResponse,
} from '@vitrine/shared';
import type { FastifyInstance } from 'fastify';

import { createSignedUpload } from '../services/storage.js';

/**
 * Upload GCS (écrans 02/03) :
 * - POST /uploads/sign : URL signée PUT v4 (~10 min) pour la photo source
 *   (`kind: 'source'`) ou un fond personnalisé (`kind: 'background'`),
 *   rangée par type puis par shop ({sources|backgrounds}/{authUserId}/...,
 *   les sources sont purgées à 30 jours — infra/gcs/lifecycle.json).
 */
export function registerUploadRoutes(app: FastifyInstance): void {
  app.post('/uploads/sign', async (req, reply): Promise<SignUploadResponse | void> => {
    const parsed = signUploadRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Bad Request', details: parsed.error.flatten().fieldErrors });
    }

    const { kind, contentType } = parsed.data;
    const signed = await createSignedUpload(req.authUserId, kind, contentType);
    return signUploadResponseSchema.parse(signed);
  });
}
