import { verifyToken } from '@clerk/backend';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** Clerk user id (claim `sub` du JWT), attaché par le middleware d'auth. */
    authUserId: string;
  }
}

/** Routes publiques : health check + webhooks (signés par leur provider). */
const PUBLIC_PATHS = new Set(['/health']);
const PUBLIC_PREFIXES = ['/webhooks/'];

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Middleware d'auth Clerk : vérifie le JWT `Authorization: Bearer <token>`
 * via CLERK_SECRET_KEY et attache `req.authUserId`. 401 si absent/invalide.
 */
export function registerAuth(app: FastifyInstance): void {
  app.decorateRequest('authUserId', '');

  app.addHook('onRequest', async (req, reply) => {
    const path = req.url.split('?')[0] ?? req.url;
    if (isPublicPath(path)) return;

    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      req.log.error('CLERK_SECRET_KEY manquant — auth impossible');
      return reply.code(500).send({ error: 'Server misconfigured' });
    }

    const authorization = req.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    try {
      const payload = await verifyToken(authorization.slice('Bearer '.length), { secretKey });
      req.authUserId = payload.sub;
    } catch (err) {
      // Token expiré = cas normal (app en cache → l'app rafraîchit et rejoue) :
      // log concis sans stack. Autres cas (malformé, signature) → détail complet.
      const reason = (err as { reason?: string } | null)?.reason;
      if (reason === 'token-expired') {
        req.log.info('JWT Clerk expiré → 401 (rafraîchissement client attendu)');
      } else {
        req.log.warn({ err }, 'JWT Clerk invalide');
      }
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });
}
