# Deploying the Hospital Management System

This covers running the app in production mode on one machine, running it with Docker Compose,
configuration, migrations, backups and restore, the demo database, staff accounts, and what a hosting
provider must support. Nothing here exposes the app to the internet by itself: put it behind a
TLS-terminating reverse proxy (or a load balancer) that you control.

## How it fits together

- **One Node.js process** (`server/server.js`) serves the API (`/api`), live updates (`/socket.io`,
  WebSockets) and, in production, the built client (pages and `/assets`), all on one port.
- **MySQL 8** holds all data. The app connects as a **restricted account** (`DB_USER`, data access
  only: SELECT, INSERT, UPDATE, DELETE, EXECUTE). Migrations, backups and test-database builds use a
  separate **admin account** (`DB_ADMIN_USER`). The app refuses to start if `DB_USER` is root.
- **Uploaded files** (lab reports) live on disk under `UPLOAD_DIR`. They are patient data: keep the
  folder on a persistent, backed-up, access-controlled disk.

## What a hosting provider must support

| Need | Why |
|---|---|
| **MySQL 8.0 or later** (8.4 LTS tested), InnoDB | Schema, transactions and row locking |
| **Triggers, stored procedures and views** | The schema uses 7 triggers (stock, admissions, an append-only audit log), 5 procedures and 9 views. The admin account needs CREATE, ALTER, DROP, INDEX, TRIGGER, CREATE ROUTINE, CREATE VIEW, REFERENCES. With binary logging on (the default on managed MySQL) creating triggers/procedures also needs SUPER **or** the server setting `log_bin_trust_function_creators = 1` (a parameter-group setting on AWS RDS, Azure, Google Cloud SQL). |
| **Two MySQL accounts** | The admin account (migrations, backups) and the restricted app account (see `docs/mysql-app-user.sql`) |
| **Node.js 22** (or run the Docker image) | The server |
| **WebSockets** through the proxy/load balancer | Live updates (`/socket.io`). Enable WebSocket upgrades and allow long-lived connections. |
| **One app instance** (or sticky sessions) | Login rate limits and live-update rooms are kept in memory per process |
| **A persistent disk** | `UPLOAD_DIR` (lab reports) and backups must survive restarts and redeploys |
| **TLS in front of the app** | The app sends HSTS in production; serve it only over HTTPS. Set `TRUST_PROXY` to the number of proxies in front so rate limits see client addresses. |
| **The MySQL client tools** (`mysql`, `mysqldump`) where migrations run | `.sql` migrations and backups use them (included in the Docker image) |

## Configuration (environment variables)

All settings come from the environment; for local runs, from `server/.env` (copy
`server/.env.example`; it lists every variable with placeholders). The server checks the
configuration at startup and refuses to start, listing every problem, if anything is missing or weak.

| Variable | Required | Meaning |
|---|---|---|
| `NODE_ENV` | | `development` (default) or `production`. Production serves the client and adds CSP/HSTS. |
| `PORT` | | HTTP port (default 5000) |
| `DB_HOST`, `DB_PORT` | yes / | MySQL address (port default 3306) |
| `DB_NAME` | yes | Database (`hospital_db`). A name ending in `_demo` means demo mode. |
| `DB_USER`, `DB_PASSWORD` | yes | The restricted app account. Never root. |
| `DB_ADMIN_USER`, `DB_ADMIN_PASSWORD` | for tools | Admin account for migrations, backups, schema diff, test/demo builds. Not used by the running app. |
| `JWT_SECRET` | yes | Signs login tokens. At least 32 random characters; placeholders are refused. Generate: `openssl rand -base64 48`. Changing it signs everyone out. |
| `CLIENT_URL` | production | The public origin, e.g. `https://hospital.example.org`. CORS and WebSockets allow only this origin. |
| `CLIENT_DIST` | | Built client folder (default `client/dist`) |
| `UPLOAD_DIR` | | Base folder for uploads (lab reports in `UPLOAD_DIR/lab-reports`; default `server/uploads`). `LAB_REPORT_DIR` overrides that one folder. |
| `TRUST_PROXY` | | Number of reverse proxies in front (e.g. `1`) |
| `LOGIN_WINDOW_MINUTES`, `LOGIN_MAX_PER_IP`, `LOGIN_MAX_FAILURES` | | Login rate limits (defaults 15 / 100 / 10): attempts per address and failed attempts per username per window → `429` |
| `JSON_BODY_LIMIT` | | Largest JSON request body (default `100kb`) |
| `LOG_REQUESTS` | | `false` turns off the request log (default on) |
| `SHUTDOWN_TIMEOUT_MS` | | Grace period for requests in flight on SIGTERM (default 10000) |
| `BACKUP_DIR` | | Where migrate/backup write dumps (default `~/hospital_backups`) |
| `DEMO_DB_NAME`, `DEMO_BUILD_PORT` | | Demo database name (must end in `_demo`) and the port `demo:reset` uses briefly |
| `VITE_ISSUES_URL` | build time | Where "Report a problem" opens a new issue (default this repository's GitHub issues) |

In production or demo mode the server also **refuses to start while any active account still has the
old shared password `password123`**; it names the accounts and the command to reset them.

## Local production run (one machine, no Docker)

```bash
npm run install:all
# server/.env: database settings, a strong JWT_SECRET (see above)
npm --prefix server run db:migrate        # once, and after every update
npm run start:prod                        # builds the client, serves everything on http://localhost:5000
```

`start:prod` sets `CLIENT_URL` to `http://localhost:5000` (override with `CLIENT_URL_PROD`, e.g. your
HTTPS address when it runs behind a proxy). Local development is unchanged: `npm run start` (Vite on
5173 with hot reload, API on 5000).

### A new, empty database

```bash
mysql -u root -p -e "CREATE DATABASE hospital_db"
mysql -u root -p < docs/mysql-app-user.sql       # restricted account; MySQL prints its password once
#   -> put that password in server/.env as DB_PASSWORD (DB_USER=hospital_app); root goes in DB_ADMIN_*
npm --prefix server run db:migrate               # builds the schema from database/migrations
npm run accounts -- create staff.csv             # the first accounts (see Staff accounts)
```

A new database has no departments, wards, beds, medicines or lab tests: load your hospital's own
reference data before going live (the demo database shows the expected shape).

## Docker Compose

`docker-compose.yml` runs MySQL 8.4 and the app. On every start the app container waits for MySQL,
creates or updates the restricted app account (from `DB_PASSWORD`), applies pending migrations (as
root, backing up first if the database already has tables), then starts the server as the restricted
account. MySQL has no host port; the app is published on **127.0.0.1 only**.

```bash
cp .env.docker.example .env          # repository root; git-ignored
# fill in MYSQL_ROOT_PASSWORD, DB_PASSWORD, JWT_SECRET (openssl rand -base64 32 / 48), and CLIENT_URL
docker compose up -d --build         # or docker-compose with the standalone binary
curl http://127.0.0.1:8080/health    # {"status":"ok","database":"ok",...}
docker compose exec -T app node server/scripts/accounts.js create - < staff.csv   # first accounts
docker compose logs -f app           # JSON lines
docker compose down                  # stop (data stays in the volumes)
```

Volumes: `db-data` (MySQL), `uploads` (lab reports), `backups` (pre-migration dumps). `docker compose
down -v` deletes them — that is all the data.

**Updating:** pull the new code, then `docker compose up -d --build`. Migrations run automatically on
start, after a backup into the `backups` volume. The container gets SIGTERM on stop and shuts down
gracefully.

Tested from a clean clone with Colima on macOS: the image builds, the database becomes healthy, all
migrations apply to the empty database, `/health` answers 200, pages are served with CSP/HSTS, the app
connects as `hospital_app` (DDL refused), a backup is written, and a restart is clean. Following this
guide on a clean clone, the first accounts were created with the command above and could sign in, and
the backup and restore commands below produced an identical copy (tables, triggers, procedures, data).

## Migrations

Schema changes are numbered files in `database/migrations/` (`.sql`, or `.js` for data steps), applied
in order and recorded in `schema_migrations`. They are additive and safe to re-run.

```bash
npm --prefix server run db:migrate:status   # what would run
npm --prefix server run db:migrate          # apply (admin account; backs up first)
npm --prefix server run db:schema-diff      # compare hospital_db with the rebuilt test database
```

`migrate.js` takes a full backup (`mysqldump`) before applying anything to a database that already has
tables, and stops if the backup fails.

## Backups and restore

**Back up** the database and the uploads folder together:

```bash
node server/scripts/backup-db.js --db hospital_db   # -> $BACKUP_DIR/hospital_db_<timestamp>.sql (mode 600)
tar -czf uploads_<date>.tar.gz -C "$UPLOAD_DIR" .   # lab reports
# Docker:
docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -uroot --single-transaction --routines --triggers --events hospital_db' > hospital_db_<date>.sql
docker run --rm -v hospital_uploads:/u -v "$PWD":/b ubuntu tar -czf /b/uploads_<date>.tar.gz -C /u .
```

Backups contain patient data: store them encrypted, off the server, with restricted access, and test a
restore regularly.

**Restore** (stop the app first so nothing writes during the restore):

```bash
mysql -u root -p -e "CREATE DATABASE hospital_db_restored"
mysql -u root -p hospital_db_restored < hospital_db_<timestamp>.sql
# check it, then point DB_NAME at it (or rename) and grant the app account on it:
#   GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON `hospital_db_restored`.* TO 'hospital_app'@'<host>';
# Docker:
docker compose stop app
docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot hospital_db' < hospital_db_<date>.sql
docker compose start app
```

Restore uploads by extracting the archive into `UPLOAD_DIR`.

## Demo database

A separate `hospital_demo` database for trying every role's workflow:

```bash
npm run demo:reset    # rebuild hospital_demo; prints a new random password for every demo account, once
npm run demo:start    # serve it in production mode on http://localhost:5000
```

`demo:reset` builds from the migrations and the bundled seed data, then creates "today" through the
app's own API (appointments and arrivals, a walk-in, triage with vitals, a visit in progress with a
note, lab work in every state, prescriptions waiting for pharmacy, a medication record, and
emergencies including one unregistered arrival). It **refuses any database whose name does not end in
`_demo`**, so it cannot touch `hospital_db`. Run it again for a fresh copy with new passwords.

## Staff accounts

```bash
npm run accounts -- create staff.csv          # or: create -  (read the list from stdin)
npm run accounts -- reset asha.rao kiran.m    # new passwords
# add --db <name> to use another database than DB_NAME
```

`staff.csv` needs a header row with `full_name,role` and optionally `username,email,phone` and, for
doctors, `department` (id or name), `specialization`, `shift` (`MORNING`, `AFTERNOON`, `NIGHT`),
`max_workload`:

```csv
full_name,role,email,phone,department,specialization,shift
Dr. Kiran Mehta,DOCTOR,kiran@hospital.example,9000011111,Cardiology,Cardiology,MORNING
Asha Rao,NURSE,,,,,
```

Every account gets a random password, **printed once and stored nowhere** (only its hash). All rows are
checked first and created together; one bad row creates nothing. A missing username is made from the
name; a missing email or phone gets a placeholder that is reported. Every change is in the audit log.

## Operations

- **Health:** `GET /health` → `200 {"status":"ok","database":"ok"}` or `503` if the database is
  unreachable. No login needed; use it for container and load-balancer checks.
- **Logs:** one JSON line per request on stdout: time, request id, method, the **route pattern**
  (`/api/patients/:id`, never the real path, query string or body), status, duration, staff user id
  and role. Server errors are logged as JSON with quoted values redacted; clients only ever see a
  generic message and the request id (also in the `X-Request-Id` header) to match them up.
- **Shutdown:** SIGTERM or SIGINT stops new connections, lets requests in flight finish (up to
  `SHUTDOWN_TIMEOUT_MS`), closes live connections and the database pool, and exits 0.
- **Problem reports:** every page has a "Report a problem" link that opens a new GitHub issue
  pre-filled with role, page (record numbers replaced by `:id`) and time. If the repository is public,
  remind staff never to include patient information (the issue form says so too).
