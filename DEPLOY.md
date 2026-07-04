# VITRINE — CI/CD & Déploiement

## Vue d'ensemble

| Branche   | Backend (Cloud Run)      | Mobile (EAS → artefacts GitHub)                    |
| --------- | ------------------------ | -------------------------------------------------- |
| `develop` | `vitrine-api-dev` (DEV)  | profil `preview` : APK Android + iOS **simulateur**|
| `main`    | `vitrine-api-prod` (PROD)| profil `production` : APK Android **signé** + iOS simulateur |

- Backend : **scale-to-zero** (0 instance quand personne n'utilise → ~0€). Auth GitHub→GCP par **Workload Identity Federation** (aucune clé JSON). Secrets applicatifs dans **GCP Secret Manager**.
- Mobile : builds **EAS cloud**, binaires récupérés et déposés dans les **artefacts GitHub** (onglet Actions → run → Artifacts), téléchargeables.
- Migrations Neon jouées automatiquement à chaque déploiement backend.

Les workflows : `.github/workflows/ci.yml` (checks), `deploy-backend.yml`, `build-mobile.yml`.

---

## Setup unique (à faire une fois)

### 1. GCP (backend)

Prérequis : `gcloud` installé, projet GCP avec **facturation activée**.

```bash
gcloud auth login
PROJECT_ID=<ton-project-id> REGION=europe-west1 GITHUB_REPO=tomwallyn/vitrine \
  bash infra/gcp-setup.sh
```

Le script crée tout (Artifact Registry, service accounts, WIF, IAM, conteneurs de secrets) et **affiche à la fin** les valeurs à mettre dans GitHub.

Ensuite :

```bash
# a) Valeurs des secrets applicatifs (Secret Manager)
printf '%s' "postgres://…dev"   | gcloud secrets versions add vitrine-database-url-dev  --data-file=-
printf '%s' "postgres://…prod"  | gcloud secrets versions add vitrine-database-url-prod --data-file=-
printf '%s' "sk_test_…"         | gcloud secrets versions add vitrine-clerk-secret-dev  --data-file=-
printf '%s' "sk_live_…"         | gcloud secrets versions add vitrine-clerk-secret-prod --data-file=-
printf '%s' "<FAL_KEY>"         | gcloud secrets versions add vitrine-fal-key            --data-file=-
printf '%s' "<FAL_WEBHOOK_SECRET>"        | gcloud secrets versions add vitrine-fal-webhook-secret --data-file=-
printf '%s' "<REVENUECAT_WEBHOOK_SECRET>" | gcloud secrets versions add vitrine-revenuecat-webhook-secret --data-file=-

# b) Accès des buckets GCS au service account d'exécution
gsutil iam ch serviceAccount:vitrine-api-run@<PROJECT_ID>.iam.gserviceaccount.com:roles/storage.objectAdmin gs://<bucket-dev>
gsutil iam ch serviceAccount:vitrine-api-run@<PROJECT_ID>.iam.gserviceaccount.com:roles/storage.objectAdmin gs://<bucket-prod>
```

### 2. GitHub — secrets & variables

Repo → **Settings → Secrets and variables → Actions**.

**Secrets** (onglet _Secrets_) :
| Nom                 | Valeur                                             |
| ------------------- | -------------------------------------------------- |
| `GCP_WIF_PROVIDER`  | (affiché par le script)                            |
| `GCP_DEPLOY_SA`     | `github-deployer@<PROJECT_ID>.iam.gserviceaccount.com` |
| `GCP_RUNTIME_SA`    | `vitrine-api-run@<PROJECT_ID>.iam.gserviceaccount.com` |
| `EXPO_TOKEN`        | token robot Expo (expo.dev → Account → Access Tokens) |

**Variables** (onglet _Variables_) :
| Nom               | Valeur                    |
| ----------------- | ------------------------- |
| `GCP_PROJECT_ID`  | `<ton-project-id>`        |
| `GCP_REGION`      | `europe-west1`            |
| `GCP_AR_REPO`     | `vitrine`                 |
| `GCS_BUCKET_DEV`  | `<bucket-dev>`            |
| `GCS_BUCKET_PROD` | `<bucket-prod>`           |

(Optionnel mais recommandé) Repo → **Settings → Environments** → créer `production` avec _Required reviewers_ = toi : un déploiement prod attendra ta validation.

### 3. Expo (mobile)

```bash
cd apps/mobile
eas login
eas init            # lie le projet Expo (écrit owner + extra.eas.projectId dans app.json)
```

Puis remplace dans **`apps/mobile/eas.json`** les `REPLACE_ME…` :
- `EXPO_PUBLIC_API_URL` dev/prod = URLs Cloud Run (dispo après le 1er déploiement backend, cf. logs du workflow).
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` = `pk_test_…` (dev) / `pk_live_…` (prod). Ces clés `pk_` sont publiques → OK dans le repo.

Enfin, **seed des credentials Android** (une fois, pour que la CI puisse signer l'APK prod sans interaction) :

```bash
cd apps/mobile
eas build --platform android --profile production   # laisse EAS générer/stocker le keystore
```

---

## Au quotidien

- **Développer** → commits sur `develop`. Le push déclenche : checks + déploiement `vitrine-api-dev` + build mobile `preview` (APK + iOS simulateur dans les artefacts).
- **Mettre en prod** → merge `develop` → `main`. Le push déclenche : déploiement `vitrine-api-prod` + build mobile `production`.

Récupérer les binaires : GitHub → **Actions** → le run _Build mobile_ → section **Artifacts**.

---

## Notes

- **Neon (dev/prod séparés)** : crée 2 bases (ou 2 branches Neon). Mets chaque `DATABASE_URL` dans le secret correspondant.
- **Clerk (dev/prod séparés)** : instance de test (`sk_test_`/`pk_test_`) pour dev, instance de production (`sk_live_`/`pk_live_`) pour prod.
- **iOS installable sur iPhone (plus tard)** : dès que tu as un compte Apple Developer, dans `eas.json` passe `production.ios` (et `preview.ios`) de `{ "simulator": true }` à `{}`, puis `eas credentials` pour configurer certificat + provisioning. La CI produira alors un `.ipa` signé.
- **GCS signés sur Cloud Run** : l'API signe les URLs via le service account d'exécution (droit `serviceAccountTokenCreator` sur lui-même, posé par le script) — aucun fichier de clé à gérer.
