import { useAuth } from '@clerk/clerk-expo';
import { useMemo } from 'react';

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

/**
 * Client API authentifié : injecte le Bearer token Clerk sur chaque requête.
 * À consommer via TanStack Query (`queryFn` / `mutationFn`).
 */
export function useApi() {
  const { getToken } = useAuth();

  return useMemo(() => {
    const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
      const token = await getToken();
      const res = await fetch(`${API_URL}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });

      if (!res.ok) {
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
    };
  }, [getToken]);
}

export type Api = ReturnType<typeof useApi>;
