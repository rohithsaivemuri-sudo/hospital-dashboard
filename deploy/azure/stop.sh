#!/bin/sh
# Stop (deallocate) the Azure demo VM (docs/azure.md): npm run azure:stop
# The VM charge stops; the disks (all data) and the static IP and DNS name are kept, and still cost
# a little. The site is offline until npm run azure:start.
set -eu
RG="${HMS_AZURE_RG:-hms-demo-rg}"; VM="${HMS_AZURE_VM:-hms-demo}"
echo "[azure] deallocating $VM (the site goes offline)..."
az vm deallocate -g "$RG" -n "$VM" -o none
echo "[azure] $VM: $(az vm get-instance-view -g "$RG" -n "$VM" --query "instanceView.statuses[?starts_with(code,'PowerState/')].displayStatus | [0]" -o tsv)"
