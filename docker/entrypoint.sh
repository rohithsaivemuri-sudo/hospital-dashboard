#!/bin/sh
# Container start: wait for MySQL, make sure the restricted app account exists, apply migrations
# (as the admin account), then run the server as the restricted account.
set -eu
cd /app/server
node scripts/ensure-app-user.js
node scripts/migrate.js --db "$DB_NAME"
exec node server.js
