#!/usr/bin/env bash
#
# Setup GCP one-shot pour la CI/CD backend VITRINE (Cloud Run dev + prod).
#
# À lancer UNE fois, avec gcloud authentifié en tant qu'owner du projet :
#   gcloud auth login
#   PROJECT_ID=xxx REGION=europe-west1 GITHUB_REPO=tomwallyn/vitrine \
#     bash infra/gcp-setup.sh
#
# Idempotent : relançable sans casse (les créations déjà faites sont ignorées).
# Crée : APIs, Artifact Registry, 2 service accounts (deploy + runtime),
# Workload Identity Federation (GitHub → GCP sans clé), droits IAM, conteneurs
# Secret Manager (vides — tu ajoutes les valeurs ensuite), et affiche à la fin
# les 2 valeurs à coller dans les secrets GitHub.
set -euo pipefail

# ── Paramètres ───────────────────────────────────────────────────
PROJECT_ID="${PROJECT_ID:?Défini PROJECT_ID=... (ID du projet GCP)}"
REGION="${REGION:-europe-west1}"
GITHUB_REPO="${GITHUB_REPO:-tomwallyn/vitrine}" # owner/repo

AR_REPO="vitrine"                              # Artifact Registry (images Docker)
RUNTIME_SA="vitrine-api-run"                   # SA d'exécution Cloud Run
DEPLOY_SA="github-deployer"                    # SA impersonné par GitHub Actions
POOL="github-pool"
PROVIDER="github-provider"

RUNTIME_SA_EMAIL="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOY_SA_EMAIL="${DEPLOY_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "▸ Projet ${PROJECT_ID} · région ${REGION} · repo ${GITHUB_REPO}"
gcloud config set project "${PROJECT_ID}" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"

# ── 1. APIs nécessaires ──────────────────────────────────────────
echo "▸ Activation des APIs…"
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  cloudresourcemanager.googleapis.com >/dev/null

# ── 2. Artifact Registry (images Docker) ─────────────────────────
echo "▸ Artifact Registry ${AR_REPO}…"
gcloud artifacts repositories create "${AR_REPO}" \
  --repository-format=docker --location="${REGION}" \
  --description="Images VITRINE API" 2>/dev/null || echo "  (déjà créé)"

# ── 3. Service accounts ──────────────────────────────────────────
echo "▸ Service accounts…"
gcloud iam service-accounts create "${RUNTIME_SA}" \
  --display-name="VITRINE API (runtime Cloud Run)" 2>/dev/null || echo "  (runtime déjà créé)"
gcloud iam service-accounts create "${DEPLOY_SA}" \
  --display-name="GitHub Actions deployer" 2>/dev/null || echo "  (deploy déjà créé)"

# La création d'un SA est asynchrone : on attend sa propagation avant de l'utiliser
# dans des bindings IAM (sinon INVALID_ARGUMENT: service account does not exist).
wait_for_sa() {
  local email="$1"
  for _ in $(seq 1 30); do
    gcloud iam service-accounts describe "${email}" >/dev/null 2>&1 && return 0
    sleep 2
  done
  echo "  ✗ SA ${email} introuvable après 60s" >&2
  return 1
}
echo "▸ Attente de la propagation des service accounts…"
wait_for_sa "${RUNTIME_SA_EMAIL}"
wait_for_sa "${DEPLOY_SA_EMAIL}"

# ── 4. Droits du SA d'exécution (runtime) ────────────────────────
# Accès aux secrets + signature d'URLs GCS (signBlob sur lui-même) via ADC.
echo "▸ IAM runtime SA…"
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor" --condition=None >/dev/null
# Signature d'URLs GCS sans clé : le SA doit pouvoir se signer lui-même.
gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA_EMAIL}" \
  --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
  --role="roles/iam.serviceAccountTokenCreator" >/dev/null
echo "  → pense à donner à ${RUNTIME_SA_EMAIL} l'accès aux buckets GCS :"
echo "    gsutil iam ch serviceAccount:${RUNTIME_SA_EMAIL}:roles/storage.objectAdmin gs://TON_BUCKET_DEV"
echo "    gsutil iam ch serviceAccount:${RUNTIME_SA_EMAIL}:roles/storage.objectAdmin gs://TON_BUCKET_PROD"

# ── 5. Droits du SA de déploiement (GitHub Actions) ──────────────
echo "▸ IAM deploy SA…"
for ROLE in \
  roles/run.admin \
  roles/artifactregistry.writer \
  roles/secretmanager.secretAccessor \
  roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
    --role="${ROLE}" --condition=None >/dev/null
done
# Autoriser le deploy SA à "act as" le runtime SA (déployer un service qui tourne sous lui).
gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA_EMAIL}" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser" >/dev/null

# ── 6. Workload Identity Federation (GitHub → GCP, sans clé) ──────
echo "▸ Workload Identity Federation…"
gcloud iam workload-identity-pools create "${POOL}" \
  --location=global --display-name="GitHub Actions" 2>/dev/null || echo "  (pool déjà créé)"
gcloud iam workload-identity-pools providers create-oidc "${PROVIDER}" \
  --location=global --workload-identity-pool="${POOL}" \
  --display-name="GitHub OIDC" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='${GITHUB_REPO}'" 2>/dev/null || echo "  (provider déjà créé)"

WIF_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}"
# Autoriser SEULEMENT ce repo GitHub à impersonner le deploy SA.
gcloud iam service-accounts add-iam-policy-binding "${DEPLOY_SA_EMAIL}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${GITHUB_REPO}" >/dev/null

# ── 7. Conteneurs de secrets (valeurs à ajouter ensuite) ─────────
echo "▸ Secret Manager (conteneurs vides)…"
create_secret() {
  gcloud secrets create "$1" --replication-policy=automatic 2>/dev/null \
    && echo "  + $1 (créé, vide)" || echo "  = $1 (existe)"
}
# Par environnement
create_secret "vitrine-database-url-dev"
create_secret "vitrine-database-url-prod"
create_secret "vitrine-clerk-secret-dev"
create_secret "vitrine-clerk-secret-prod"
# Partagés dev/prod (tu peux dupliquer par env si besoin)
create_secret "vitrine-fal-key"
create_secret "vitrine-fal-webhook-secret"
create_secret "vitrine-revenuecat-webhook-secret"

cat <<EOF

────────────────────────────────────────────────────────────────
✅ Setup GCP terminé.

1) Ajoute les VALEURS des secrets (exemple) :
   printf '%s' "postgres://..."  | gcloud secrets versions add vitrine-database-url-dev  --data-file=-
   printf '%s' "postgres://..."  | gcloud secrets versions add vitrine-database-url-prod --data-file=-
   printf '%s' "sk_test_..."     | gcloud secrets versions add vitrine-clerk-secret-dev  --data-file=-
   printf '%s' "sk_live_..."     | gcloud secrets versions add vitrine-clerk-secret-prod --data-file=-
   printf '%s' "FAL_KEY..."      | gcloud secrets versions add vitrine-fal-key           --data-file=-
   printf '%s' "whsec..."        | gcloud secrets versions add vitrine-fal-webhook-secret --data-file=-
   printf '%s' "..."             | gcloud secrets versions add vitrine-revenuecat-webhook-secret --data-file=-

2) Donne au runtime SA l'accès aux buckets GCS (cf. plus haut).

3) Ajoute ces SECRETS dans GitHub (repo → Settings → Secrets and variables → Actions) :
   GCP_WIF_PROVIDER = ${WIF_PROVIDER}
   GCP_DEPLOY_SA    = ${DEPLOY_SA_EMAIL}
   GCP_RUNTIME_SA   = ${RUNTIME_SA_EMAIL}

   Et ces VARIABLES (onglet Variables) :
   GCP_PROJECT_ID   = ${PROJECT_ID}
   GCP_REGION       = ${REGION}
   GCP_AR_REPO      = ${AR_REPO}
────────────────────────────────────────────────────────────────
EOF
