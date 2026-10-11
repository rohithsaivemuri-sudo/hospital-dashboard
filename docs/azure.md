# Azure demo deployment

The demo runs at **https://hms-demo-in.indonesiacentral.cloudapp.azure.com** on one Ubuntu 24.04
virtual machine in the "Azure for Students" subscription. It uses the repository's
`docker-compose.yml` (MySQL 8.4 and the app) plus a server-only override that adds Caddy for HTTPS.
The files in [`deploy/azure/`](../deploy/azure/) are copies of what is on the server, without secrets.

## What exists

| Resource (group `hms-demo-rg`) | Details |
|---|---|
| VM `hms-demo` | Standard_B2als_v2 (2 vCPU, 4 GB), Ubuntu 24.04 LTS, region **Indonesia Central**, no zone |
| Disks | `hms-demo-osdisk` 32 GB Standard SSD (system); 32 GB Standard SSD data disk mounted at `/srv/hms` |
| Public IP `hms-demo-ip` | static, DNS name `hms-demo-in.indonesiacentral.cloudapp.azure.com` |
| Network `hms-demo-vnet` + NSG `hms-demo-nsg` | inbound 80 and 443 from anywhere; 22 only from the owner's IP |
| Budget `hms-demo-credit` (subscription) | 100, email alerts at 50%, 80%, 100% and forecast 100% |

**Why Indonesia Central:** the subscription's built-in policy (`sys.regionrestriction`) allows only
UAE North, Korea Central, Poland Central, East Asia and Indonesia Central. No India region is
allowed, and UAE North offers no B2 sizes to this subscription. Indonesia Central was the cheapest
of the rest.

**Cost:** about US$39.69 a month (VM $31.24, two disks $2.40 each, IP $3.65; outbound traffic is
free up to 100 GB a month). US$100 of credit lasts about 2.5 months.

On the server (`/srv/hms`, the data disk):

| Path | What |
|---|---|
| `app/` | git checkout of `main` (owner `hms`) |
| `config/hms.env` | **secrets**: MySQL root and app-account passwords, JWT secret, allowed origin. Owner `hms`, mode 600 |
| `config/docker-compose.override.yml`, `config/Caddyfile` | demo database name, data on `/srv/hms`, HTTPS proxy |
| `mysql/`, `uploads/`, `backups/` | MySQL data, uploaded lab reports, backups (`backups/nightly`: the last 7) |
| `caddy/` | the Let's Encrypt certificate (renewed automatically) |
| `hms-compose` | `docker compose` with the env file and override: run as `sudo -u hms /srv/hms/hms-compose …` |

- **The web server process** runs as the restricted MySQL account `hospital_app`, and gets no admin
  credentials: the override removes `DB_ADMIN_*` before it starts. The admin (root) credentials are
  used only by the start-up steps (account, migrations) and by commands run with `exec`.
- **On boot**, Docker and `hms.service` start MySQL, the app and Caddy.
- **Nightly**, `hms-backup.timer` runs `backup-nightly` at 02:15 IST.
- **Security updates** install automatically (unattended-upgrades, including Docker's packages).
  When an update needs a reboot, the VM reboots at 04:30 IST and the demo comes back by itself.

## SSH

The key is `~/.ssh/hms_azure_ed25519` on the owner's laptop. Password login and root login are
disabled. `~/.ssh/config` has:

```
Host hms-azure
  HostName hms-demo-in.indonesiacentral.cloudapp.azure.com
  User azureuser
  IdentityFile ~/.ssh/hms_azure_ed25519
  IdentitiesOnly yes
```

SSH is only open to the IP address the VM was created from. When yours changes (you get a timeout
on `ssh hms-azure`), allow the new one:

```bash
az network nsg rule update -g hms-demo-rg --nsg-name hms-demo-nsg -n allow-ssh-from-owner \
  --source-address-prefixes "$(curl -s https://api.ipify.org)/32"
```

## Redeploy the latest main

```bash
deploy/azure/deploy.sh            # from the repository on your laptop
deploy/azure/deploy.sh --fresh    # also rebuilds every layer (a new client build id)
```

The script:
1. updates `/srv/hms/app` to `origin/main` (fast-forward only);
2. rebuilds the app image and restarts the stack;
3. waits for the app to report healthy, then prints the public health check and build id.

On start, the app backs up the database into `/srv/hms/backups` and applies any new migrations. The
site is unavailable for about 10 seconds while the app restarts. Open tabs on the old build then show
"A new version is available", and the sign-in page reloads by itself.

## Stop and start the server

```bash
npm run azure:stop     # deallocate the VM: the site goes offline and the VM charge stops
npm run azure:start    # start it again; waits until the site and its database answer
```

These run `deploy/azure/stop.sh` and `deploy/azure/start.sh` with the Azure CLI on your laptop.

- **Stopping keeps everything:** the disks (database, uploads, backups), the static IP and the DNS
  name stay, so the address does not change. Disks and the IP are still charged, about US$8.45 a
  month; the VM (about US$1 a day) is not.
- **Starting needs nothing else.** On boot, Docker and `hms.service` start MySQL, the app and Caddy
  by themselves, with the same certificate.
- **A nightly backup missed while stopped** runs shortly after the next start.

**Tested (2026-10-11):**
- **Stop:** the site stopped answering.
- **Start:** `/health` reported the database ok within seconds of the VM booting, with no manual steps.
- **After the start:** Docker, `hms.service` and the backup timer were active; db and app healthy,
  Caddy running, the data disk mounted, the certificate valid.
- **Unchanged:** the same data (patient count) and the same IP address.

## Reset the demo data

```bash
deploy/azure/reset-demo.sh        # asks you to type RESET
```

The script:
1. rebuilds `hospital_demo` from the seed data, every migration and today's sample activity;
2. gives all 17 demo accounts new random passwords, written only to `~/hospital_azure_accounts.txt`
   (mode 600).

Everything entered since the last reset is deleted; backups are kept. The site shows an error page
for about a minute while it runs.

## Read the logs

```bash
ssh hms-azure
sudo -u hms /srv/hms/hms-compose ps                     # state and health of db, app, caddy
sudo -u hms /srv/hms/hms-compose logs -f --tail 100 app # the API (JSON lines; 5xx have a request_id)
sudo -u hms /srv/hms/hms-compose logs --tail 100 caddy  # HTTPS proxy and certificate renewal
sudo -u hms /srv/hms/hms-compose logs --tail 100 db     # MySQL
journalctl -u hms.service -u hms-backup.service --since today
systemctl list-timers hms-backup.timer                  # next nightly backup
sudo ls -l /srv/hms/backups/nightly
```

## Restore a backup

The nightly backups are in `/srv/hms/backups/nightly` (inside the app container:
`/data/backups/nightly`). The backups taken before each migration are in `/srv/hms/backups`. To
restore one over the demo database:

```bash
ssh hms-azure
sudo ls -1t /srv/hms/backups/nightly                    # pick a file
sudo -u hms /srv/hms/hms-compose exec -T app sh -c \
  'MYSQL_PWD="$DB_ADMIN_PASSWORD" mysql -h db -u "$DB_ADMIN_USER" hospital_demo < /data/backups/nightly/hospital_demo_YYYYMMDD_HHMMSS.sql'
sudo -u hms /srv/hms/hms-compose restart app
```

The dumps contain the schema, data, triggers and routines, and replace each table they contain.

**Tested (2026-10-11):** the latest nightly backup was restored into a scratch database. Its tables,
triggers, routines, patients and audit rows matched the live database exactly.

To copy a backup to your laptop:

```bash
ssh hms-azure 'sudo cat /srv/hms/backups/nightly/hospital_demo_YYYYMMDD_HHMMSS.sql' > backup.sql
```

The copy contains patient records: keep it private.

## Check the remaining credit

Azure does not report Students credit to the CLI or the cost APIs; they refuse this offer type.
To see it:

- **Remaining credit and expiry:** https://www.microsoftazuresponsorships.com/Balance, or in the
  portal: Subscriptions → Azure for Students → Overview.
- **What this deployment costs:** portal → Cost Management → Cost analysis, scope `hms-demo-rg`.
- **The budget** `hms-demo-credit` sends email alerts if Azure reports costs for it. Because the cost
  APIs refuse this offer type, it may never fire: check the balance page yourself.
- **The real safeguard:** the subscription has a **spending limit**. When the credit runs out, Azure
  stops the resources; it does not charge a card.

To save credit while nobody is using the demo, stop it with `npm run azure:stop` and start it
again with `npm run azure:start` (see "Stop and start the server").

## Delete everything

This removes the VM, disks (all demo data and backups), IP, network and budget. It cannot be undone:
copy any backup you want to keep first.

```bash
az group delete -n hms-demo-rg --yes
az consumption budget delete --budget-name hms-demo-credit
```

Then, on the laptop, remove the `hms-azure` entry from `~/.ssh/config` and its host key, the key
pair and the logins file:

```bash
ssh-keygen -R hms-demo-in.indonesiacentral.cloudapp.azure.com
rm ~/.ssh/hms_azure_ed25519 ~/.ssh/hms_azure_ed25519.pub ~/hospital_azure_accounts.txt
```

The resource providers registered for this (Microsoft.Compute, .Network, .Storage) cost nothing
and can stay.

## Run the browser tests against the live site

The patient-journey test (and the other browser tests) can drive the deployed site. The database
lookups go through an SSH tunnel, using the restricted app account. It creates made-up patients in
the demo, so reset the demo afterwards if you want a clean set.

```bash
DBIP=$(ssh hms-azure 'sudo -u hms docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" hospital-db-1')
ssh -f -N -L 127.0.0.1:13306:$DBIP:3306 hms-azure          # stop it afterwards with kill
UI_DB_PASSWORD="$(ssh hms-azure 'sudo -u hms sed -n "s/^DB_PASSWORD=//p" /srv/hms/config/hms.env')" \
UI_LIVE_URL=https://hms-demo-in.indonesiacentral.cloudapp.azure.com \
UI_ACCOUNTS_FILE=$HOME/hospital_azure_accounts.txt \
UI_DB_HOST=127.0.0.1 UI_DB_PORT=13306 UI_DB_USER=hospital_app UI_DB_NAME=hospital_demo \
node --test --test-timeout=120000 --test-concurrency=1 --test-global-setup=tests/ui/global-setup.js tests/ui/patient-journey.ui.test.js
```

## Rebuilding the server from scratch

The commands below are an outline of how this server was set up: Docker from download.docker.com,
the `hms` system user in the `docker` group, and the files from `deploy/azure/`.

1. Create the VM as in the table above, with key login only, and open ports 80 and 443 to the
   internet and 22 to your IP only.
2. Format the data disk, add it to `/etc/fstab` by UUID with `nofail`, and mount it at `/srv/hms`.
   Set the time zone to Asia/Kolkata and turn on unattended-upgrades with automatic reboot at 04:30.
3. Install `docker-ce` and the compose plugin. Create the `hms` user and the folders above:
   - `uploads` and `backups` owned by uid 10001 (the app container's user), mode 700;
   - `config` mode 750.
4. As `hms`:
   - clone the repository into `/srv/hms/app`;
   - copy `docker-compose.override.yml` and `Caddyfile` into `/srv/hms/config`;
   - copy `hms-compose` and `backup-nightly` into `/srv/hms`.
   
   Then write `/srv/hms/config/hms.env` (mode 600) with new random values for `MYSQL_ROOT_PASSWORD`,
   `DB_PASSWORD` and `JWT_SECRET`, plus:
   
   ```
   CLIENT_URL=https://<dns name>
   SITE_ADDRESS=<dns name>
   TRUST_PROXY=1
   APP_PORT=8080
   DEMO_DB_NAME=hospital_demo
   ```
5. Copy the three systemd units to `/etc/systemd/system`, then
   `systemctl enable --now hms.service hms-backup.timer`.
6. Run `deploy/azure/reset-demo.sh` for the demo data and logins.
