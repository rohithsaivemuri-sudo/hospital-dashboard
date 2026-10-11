#!/bin/sh
# Start the Azure demo VM again (docs/azure.md): npm run azure:start
# Nothing else to do: on boot Docker and hms.service bring up MySQL, the app and Caddy by themselves.
# This waits until the public health check reports the app and the database as ok.
set -eu
RG="${HMS_AZURE_RG:-hms-demo-rg}"; VM="${HMS_AZURE_VM:-hms-demo}"
URL="${HMS_AZURE_URL:-https://hms-demo-in.indonesiacentral.cloudapp.azure.com}"
echo "[azure] starting $VM..."
az vm start -g "$RG" -n "$VM" -o none
echo "[azure] $VM: $(az vm get-instance-view -g "$RG" -n "$VM" --query "instanceView.statuses[?starts_with(code,'PowerState/')].displayStatus | [0]" -o tsv); waiting for the app..."
i=0
until body=$(curl -sf -m 5 "$URL/health" 2>/dev/null) && echo "$body" | grep -q '"database":"ok"'; do
  i=$((i + 1)); [ "$i" -ge 60 ] && { echo "[azure] the app did not come back within 5 minutes; see docs/azure.md, Read the logs"; exit 1; }
  sleep 5
done
echo "[azure] up: $URL/health -> $body"
