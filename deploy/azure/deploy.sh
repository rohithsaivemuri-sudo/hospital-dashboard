#!/bin/sh
# Deploy the latest main to the Azure demo server (docs/azure.md), from your laptop:
#
#   deploy/azure/deploy.sh            build and start the latest origin/main
#   deploy/azure/deploy.sh --fresh    the same, rebuilding every image layer (a new client build id)
#
# Needs the ssh host alias "hms-azure" (docs/azure.md, "SSH"); HMS_AZURE_HOST overrides it.
# On start the app container backs up the database and applies any new migrations before serving.
# Secrets stay on the server in /srv/hms/config/hms.env; nothing secret passes through this script.
set -eu
HOST="${HMS_AZURE_HOST:-hms-azure}"
URL="${HMS_AZURE_URL:-https://hms-demo-in.indonesiacentral.cloudapp.azure.com}"
FRESH=""
[ "${1:-}" = "--fresh" ] && FRESH="--no-cache"

echo "[deploy] updating /srv/hms/app to origin/main on $HOST"
ssh "$HOST" "set -eu
  sudo -u hms git -C /srv/hms/app fetch -q origin main
  sudo -u hms git -C /srv/hms/app checkout -q main
  sudo -u hms git -C /srv/hms/app merge -q --ff-only origin/main
  echo \"[deploy] commit \$(sudo -u hms git -C /srv/hms/app log --oneline -1)\"
  sudo -u hms /srv/hms/hms-compose build $FRESH app 2>&1 | grep -E 'ERROR|error:' || true
  sudo -u hms /srv/hms/hms-compose up -d --remove-orphans 2>&1 | grep -v -E '^\\s*$' || true
  for i in \$(seq 1 90); do
    s=\$(sudo -u hms docker inspect -f '{{.State.Health.Status}}' hospital-app-1 2>/dev/null || echo starting)
    [ \"\$s\" = healthy ] && break
    [ \"\$s\" = unhealthy ] && { sudo -u hms /srv/hms/hms-compose logs --tail 40 app; exit 1; }
    sleep 5
  done
  [ \"\$s\" = healthy ] || { echo '[deploy] app did not become healthy'; sudo -u hms /srv/hms/hms-compose logs --tail 40 app; exit 1; }
  sudo -u hms docker image prune -f >/dev/null"

echo "[deploy] public health: $(curl -s "$URL/health")"
echo "[deploy] build: $(curl -s "$URL/version.json")"
echo "[deploy] done: $URL"
