# VITRINE

App mobile (iOS + Android) pour petites boutiques de vêtements indépendantes :
photographiez un vêtement sur cintre → l'IA génère un visuel produit pro
(sur mannequin, cintre restylé, plié à plat ou fond studio). Monétisation par
crédits prépayés (1 crédit = 1 visuel).

## Structure du monorepo (pnpm workspaces)

```
vitrine/
  apps/
    mobile/    # Expo (expo-router, NativeWind) — les 8 écrans
    api/       # Fastify + Drizzle + Neon (Dockerfile Cloud Run)
  packages/
    shared/    # @vitrine/shared : types, schémas zod (contrats API), packs de crédits, theme tokens
  infra/       # scripts déploiement, config Neon/GCS (à venir)
```

## Prérequis

- Node ≥ 22, pnpm ≥ 9 (`packageManager` épinglé à pnpm 11)
- Un compte Neon / fal.ai / GCP / Clerk / RevenueCat pour l'API (voir `.env.example`)

## Démarrage

```bash
pnpm install            # installe tout le workspace (build @vitrine/shared via prepare)
pnpm typecheck          # tsc --noEmit sur tous les packages
pnpm build              # build shared + api
pnpm lint               # eslint sur tous les packages
```

### API (apps/api)

```bash
cp apps/api/.env.example apps/api/.env   # puis remplir les clés (voir ci-dessous)
pnpm --filter api dev                    # dev local (tsx watch)
pnpm --filter api db:generate            # génère les migrations SQL Drizzle
pnpm --filter api db:migrate             # applique les migrations sur DATABASE_URL
```

`GET /health` répond `{ status: "ok" }`. `GET/PATCH /me` sont fonctionnels (M1,
auth Clerk obligatoire) ; les autres endpoints sont des stubs `501` — voir
`apps/api/src/app.ts`.

### Mobile (apps/mobile)

```bash
cp apps/mobile/.env.example apps/mobile/.env   # clé Clerk + URL de l'API
pnpm --filter mobile exec expo start           # dev server Expo (device réel conseillé)
```

## Variables d'environnement

### `apps/api/.env`

| Variable | Où l'obtenir |
|---|---|
| `DATABASE_URL` | [Neon](https://neon.tech) → créer un projet → *Connection string* (garder `?sslmode=require`). |
| `CLERK_SECRET_KEY` | [Clerk](https://dashboard.clerk.com) → votre application → **API Keys** → *Secret key* (`sk_test_…` en dev). Sert à vérifier les JWT côté API. |
| `FAL_KEY`, `GCS_*`, `REVENUECAT_WEBHOOK_SECRET` | Jalon M2+ — peuvent rester vides pour M1. |

### `apps/mobile/.env`

| Variable | Où l'obtenir |
|---|---|
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk → **API Keys** → *Publishable key* (`pk_test_…`). Même application Clerk que l'API. |
| `EXPO_PUBLIC_API_URL` | URL de l'API Fastify. En local : `http://localhost:8080` (simulateur) ou `http://<IP LAN de votre machine>:8080` (device réel). |

Côté Clerk, activer **Email + mot de passe** (avec code de vérification email)
et, si souhaité, les connexions **Apple** / **Google** (OAuth) dans
*User & Authentication → Email, Phone, Username / Social connections*.

## Jalons

- **M0 — Fondations** : monorepo, design system, 8 écrans shells, API stub + schéma Drizzle, Dockerfile Cloud Run.
- **M1 — Auth + Profil** (ce commit) : Clerk (mobile + vérification JWT API), garde d'auth
  expo-router, création du shop au premier `GET /me`, profil branché (TanStack Query),
  écran « Ma boutique » (`PATCH /me`), solde de crédits réel (SUM du ledger).
- M2 — Capture + Upload GCS · M3 — Moteur IA (fal.ai) ·
  M4 — Crédits & IAP (RevenueCat) · M5 — Galerie & Export · M6 — Finitions & stores.
