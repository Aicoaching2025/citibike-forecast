#!/usr/bin/env bash
# Deploy DockCast to Google Cloud Run from Cloud Shell (or any machine with gcloud).
#
# Live data:   bash deploy/cloudrun.sh
# Demo data:   DEMO_MODE=1 bash deploy/cloudrun.sh
# New token:   ROTATE_TOKEN=1 bash deploy/cloudrun.sh
#
# Safe to re-run: every step checks before it creates anything.
set -euo pipefail

cd "$(dirname "$0")/.."   # the web/ folder, where the Dockerfile lives

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${REGION:-us-east4}"
SERVICE="${SERVICE:-dockcast}"
DEMO_MODE="${DEMO_MODE:-0}"
CITIBIKE_SCHEMA="${CITIBIKE_SCHEMA:-workspace.citibike}"
SECRET="databricks-token"
SA_NAME="dockcast-run"

if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "(unset)" ]]; then
  echo "No Google Cloud project selected. Run: gcloud config set project YOUR_PROJECT_ID" >&2
  exit 1
fi
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
BUILD_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "==> Project $PROJECT_ID | region $REGION | service $SERVICE | demo=$DEMO_MODE"

echo "==> 1/5 Enabling APIs (first run takes about a minute)"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com --quiet

echo "==> 2/5 Runtime service account"
if ! gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" --display-name="DockCast Cloud Run runtime" --quiet
fi

echo "==> 3/5 Build permissions for source deploys"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${BUILD_SA}" --role="roles/run.builder" \
  --condition=None --quiet >/dev/null

ENV_VARS="DEMO_MODE=${DEMO_MODE}"
SECRET_FLAGS=()
if [[ "$DEMO_MODE" != "1" ]]; then
  echo "==> 4/5 Databricks connection"
  : "${DATABRICKS_HOST:=}"; : "${DATABRICKS_WAREHOUSE_ID:=}"
  [[ -z "$DATABRICKS_HOST" ]] && read -rp "Databricks host (https://dbc-....cloud.databricks.com): " DATABRICKS_HOST
  [[ -z "$DATABRICKS_WAREHOUSE_ID" ]] && read -rp "SQL warehouse ID: " DATABRICKS_WAREHOUSE_ID
  DATABRICKS_HOST="${DATABRICKS_HOST%/}"
  if [[ ! "$DATABRICKS_HOST" =~ ^https://[A-Za-z0-9.-]+$ ]]; then
    echo "Host must look like https://dbc-xxxx.cloud.databricks.com (no path)." >&2; exit 1
  fi
  if [[ ! "$DATABRICKS_WAREHOUSE_ID" =~ ^[A-Za-z0-9]+$ ]]; then
    echo "Warehouse ID is the last part of the HTTP path, letters and digits only." >&2; exit 1
  fi

  # The token goes into Secret Manager, never into env vars, logs or the repo.
  if ! gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
    read -rsp "Databricks token (input hidden): " TOKEN; echo
    printf '%s' "$TOKEN" | gcloud secrets create "$SECRET" --data-file=- --replication-policy=automatic --quiet
    unset TOKEN
  elif [[ "${ROTATE_TOKEN:-0}" == "1" ]]; then
    read -rsp "New Databricks token (input hidden): " TOKEN; echo
    printf '%s' "$TOKEN" | gcloud secrets versions add "$SECRET" --data-file=- --quiet
    unset TOKEN
  fi
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:${SA_EMAIL}" --role="roles/secretmanager.secretAccessor" \
    --condition=None --quiet >/dev/null

  ENV_VARS="${ENV_VARS},DATABRICKS_HOST=${DATABRICKS_HOST},DATABRICKS_WAREHOUSE_ID=${DATABRICKS_WAREHOUSE_ID},CITIBIKE_SCHEMA=${CITIBIKE_SCHEMA}"
  SECRET_FLAGS=(--set-secrets "DATABRICKS_TOKEN=${SECRET}:latest")
else
  echo "==> 4/5 Demo mode: skipping Databricks settings"
  SECRET_FLAGS=(--clear-secrets)
fi

echo "==> 5/5 Building and deploying (3-6 minutes)"
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --service-account "$SA_EMAIL" \
  --allow-unauthenticated \
  --port 8080 --cpu 1 --memory 512Mi \
  --min-instances 0 --max-instances 3 --concurrency 80 --timeout 60 \
  --set-env-vars "$ENV_VARS" \
  "${SECRET_FLAGS[@]}" \
  --quiet

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
echo
echo "DockCast is live: $URL"
echo "Check the connection: $URL/status"
