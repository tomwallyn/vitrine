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

`GET /health` répond `{ status: "ok" }`. `GET/PATCH /me` (M1) et
`POST /uploads/sign` (M2, URL signée GCS) sont fonctionnels (auth Clerk
obligatoire) ; les autres endpoints sont des stubs `501` — voir
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
| `GCS_BUCKET`, `GCS_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS` | Google Cloud Storage (M2, `POST /uploads/sign`) — voir ci-dessous. |
| `FAL_KEY`, `REVENUECAT_WEBHOOK_SECRET` | Jalon M3+ — peuvent rester vides. |

#### Google Cloud Storage (M2 — upload des photos)

1. Créer un projet GCP (`GCS_PROJECT_ID`) puis un bucket (par ex.
   `vitrine-images`, région `europe-west1`) → `GCS_BUCKET` :
   `gcloud storage buckets create gs://vitrine-images --location=europe-west1`.
2. Créer un service account et lui donner le rôle **Storage Object Admin**
   sur le bucket :
   `gcloud iam service-accounts create vitrine-api` puis
   `gcloud storage buckets add-iam-policy-binding gs://vitrine-images --member="serviceAccount:vitrine-api@<PROJET>.iam.gserviceaccount.com" --role="roles/storage.objectAdmin"`.
3. En local : exporter une clé JSON
   (`gcloud iam service-accounts keys create key.json --iam-account=vitrine-api@<PROJET>.iam.gserviceaccount.com`)
   et pointer `GOOGLE_APPLICATION_CREDENTIALS` vers ce fichier — ou utiliser
   `gcloud auth application-default login` (laisser la variable vide).
   Sur Cloud Run : attacher le service account au service, aucune clé à gérer.

L'API compile et démarre sans ces variables (init GCS paresseuse) : seul
`POST /uploads/sign` échouera tant qu'elles ne sont pas renseignées.

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
- **M1 — Auth + Profil** : Clerk (mobile + vérification JWT API), garde d'auth
  expo-router, création du shop au premier `GET /me`, profil branché (TanStack Query),
  écran « Ma boutique » (`PATCH /me`), solde de crédits réel (SUM du ledger).
- **M2 — Capture + Upload** (ce commit) : écran caméra (expo-camera : flash,
  switch, guide de cadrage) + import galerie (expo-image-picker),
  `POST /uploads/sign` (URL signée GCS PUT v4, init paresseuse), upload mobile
  (`uploadImageAsync`), écran « Choisir le rendu » branché (STYLE / MANNEQUIN /
  FOND personnalisé uploadé), brouillon de rendu Zustand.
- M3 — Moteur IA (fal.ai) · M4 — Crédits & IAP (RevenueCat) ·
  M5 — Galerie & Export · M6 — Finitions & stores.
