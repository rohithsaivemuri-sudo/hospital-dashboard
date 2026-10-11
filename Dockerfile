# Hospital Management System: one image with the API server, the built client and the migration
# tooling. Runs as an unprivileged user (app); see docker-compose.yml and docs/deploy.md.

# 1. Build the client.
FROM node:22-bookworm-slim AS client
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY client/ ./
RUN npm run build

# 2. Server production dependencies.
FROM node:22-bookworm-slim AS server-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# 3. Runtime: Ubuntu 24.04 for Oracle's MySQL client (mysql, mysqldump), used by migrations (.sql
# files) and backups. Debian's default-mysql-client is MariaDB's, whose mysqldump does not support
# MySQL's options. Node comes from the official image (same major version as the build stages).
FROM ubuntu:24.04
RUN apt-get update \
 && apt-get install -y --no-install-recommends mysql-client-8.0 tini ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --create-home --uid 10001 app
COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node
ENV NODE_ENV=production \
    PORT=5000 \
    CLIENT_DIST=/app/client/dist \
    UPLOAD_DIR=/data/uploads \
    BACKUP_DIR=/data/backups
WORKDIR /app
COPY --from=server-deps /app/server/node_modules server/node_modules
COPY server/ server/
COPY database/ database/
COPY --from=client /app/client/dist client/dist
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 755 /usr/local/bin/entrypoint.sh \
 && mkdir -p /data/uploads /data/backups \
 && chown -R app:app /data
USER app
EXPOSE 5000
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
ENTRYPOINT ["tini", "--", "/usr/local/bin/entrypoint.sh"]
