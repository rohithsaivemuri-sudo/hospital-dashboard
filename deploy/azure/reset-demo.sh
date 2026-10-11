#!/bin/sh
# Reset the Azure demo to a clean starting set (docs/azure.md), from your laptop:
#
#   deploy/azure/reset-demo.sh
#
# Rebuilds hospital_demo on the server (seed data + every migration + today's sample activity) and
# gives every demo account a new random password. The passwords are written only to
# ~/hospital_azure_accounts.txt on this laptop (mode 600), never printed. Everything entered on the
# demo since the last reset is deleted; the nightly backups on the server are kept.
set -eu
HOST="${HMS_AZURE_HOST:-hms-azure}"
URL="${HMS_AZURE_URL:-https://hms-demo-in.indonesiacentral.cloudapp.azure.com}"
OUT="${HMS_AZURE_ACCOUNTS:-$HOME/hospital_azure_accounts.txt}"
umask 077
RAW="$(mktemp)"
trap 'rm -f "$RAW"' EXIT

printf 'This deletes everything entered on the demo at %s. Type RESET to continue: ' "$URL"
read -r answer
[ "$answer" = "RESET" ] || { echo "Cancelled."; exit 1; }

ssh "$HOST" 'sudo -u hms /srv/hms/hms-compose stop app >/dev/null 2>&1
  sudo -u hms /srv/hms/hms-compose run --rm --no-deps -T --entrypoint "node server/scripts/demo-reset.js" app 2>&1; status=$?
  sudo -u hms /srv/hms/hms-compose up -d app >/dev/null 2>&1
  echo "RESET_EXIT=$status"' > "$RAW"
grep -q '^RESET_EXIT=0$' "$RAW" || { grep -v -E '^\s+(ADMIN|DOCTOR|NURSE|RECEPTIONIST|LABORATORY|PHARMACY)\s' "$RAW"; echo "[reset] failed; the old logins file is unchanged"; exit 1; }

{
  echo "Hospital demo on Azure (hospital_demo), logins created $(date '+%Y-%m-%d %H:%M')."
  echo "These passwords are stored nowhere else. A demo reset on the server replaces them all."
  echo "Address: $URL"
  echo
  printf "%-13s %-16s %-18s %s\n" ROLE USERNAME PASSWORD NAME
  grep -E '^\s+(ADMIN|DOCTOR|NURSE|RECEPTIONIST|LABORATORY|PHARMACY)\s' "$RAW" | sed -E 's/^\s+//' |
    awk '{ name=$4; for (i=5;i<=NF;i++) name=name" "$i; printf "%-13s %-16s %-18s %s\n", $1, $2, $3, name }'
} > "$OUT.new"
mv "$OUT.new" "$OUT"
chmod 600 "$OUT"
echo "[reset] done: $(grep -c -E '^(ADMIN|DOCTOR|NURSE|RECEPTIONIST|LABORATORY|PHARMACY) ' "$OUT") accounts, new passwords in $OUT"
