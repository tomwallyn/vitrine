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
cp .env.example apps/api/.env       # puis remplir les clés
pnpm --filter api dev               # dev local (tsx watch)
pnpm --filter api db:generate       # génère les migrations SQL Drizzle
```

`GET /health` répond `{ status: "ok" }` ; tous les autres endpoints sont des
stubs `501` (M0) — voir `apps/api/src/app.ts`.

### Mobile (apps/mobile)

```bash
pnpm --filter mobile exec expo start   # dev server Expo (device réel conseillé)
```

Les 8 écrans sont des shells statiques (M0) : onboarding, auth, capture,
config rendu, génération, résultat, et les 4 tabs (Accueil · Galerie ·
Crédits · Profil).

## Jalons

- **M0 — Fondations** (ce commit) : monorepo, design system, 8 écrans shells, API stub + schéma Drizzle, Dockerfile Cloud Run.
- M1 — Auth + Profil (Clerk) · M2 — Capture + Upload GCS · M3 — Moteur IA (fal.ai) ·
  M4 — Crédits & IAP (RevenueCat) · M5 — Galerie & Export · M6 — Finitions & stores.
