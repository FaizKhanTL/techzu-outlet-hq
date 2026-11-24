# Deployment

The whole system runs from `docker-compose.yml`: Postgres, the API and the web app (nginx serving the React build and
forwarding `/api`). The simplest production setup is one small Linux server with Docker and a reverse proxy for HTTPS
in front of the web container.

## One server with HTTPS (recommended for this project)

Any provider works (AWS Lightsail or EC2, DigitalOcean, Hetzner, Google Compute Engine). 2 vCPU and 2 GB RAM is
plenty for the target load.

1. Point a DNS name at the server, for example `outlet-hq.example.com`, and open ports 80 and 443 only.
2. Install Docker Engine with the Compose plugin.
3. Copy the repository to the server and create `.env`:

   ```bash
   cp .env.example .env
   # Set strong values:
   #   POSTGRES_PASSWORD=<random>
   #   JWT_SECRET=<at least 32 random characters, e.g. from: openssl rand -hex 32>
   #   SEED_DEMO_DATA=true only for a demo instance
   #   WEB_PORT=8080
   ```

4. Do not publish the API or the database to the internet. The API is reached through the web container; remove the
   `ports:` entry of the `api` service (or bind it to localhost: `127.0.0.1:${API_PORT:-3000}:3000`).
5. Put Caddy (automatic Let's Encrypt certificates) in front of the web container. `/etc/caddy/Caddyfile`:

   ```
   outlet-hq.example.com {
     encode gzip
     reverse_proxy 127.0.0.1:8080
   }
   ```

   With Caddy in front of nginx in front of the API there are two proxies, so set `TRUST_PROXY_HOPS: 2` on the `api`
   service. This makes the login rate limit count the real client address.

6. Start it:

   ```bash
   docker compose up -d --build
   docker compose ps          # all services healthy
   curl https://outlet-hq.example.com/api/v1/auth/me   # 401 TOKEN_REQUIRED: the API answers
   ```

The API applies migrations on start (guarded by an advisory lock, so two instances starting at once are safe).

### Operations

- **Backups:** `docker compose exec db pg_dump -U outlet_hq -Fc outlet_hq > backup.dump` on a schedule, copied off the
  server; test a restore with `pg_restore`. For anything beyond a demo, use a managed Postgres with point-in-time
  recovery instead of the container and set `DATABASE_URL` to it.
- **Logs:** `docker compose logs -f api` (JSON, one line per request, with the request id that also appears in error
  responses).
- **Updates:** `git pull && docker compose up -d --build`. New migrations run before the new API starts serving.
- **Demo data** loads only when the database has no users; it never touches an existing database.

## Managed platforms

The two images also run on container platforms (Render, Railway, Fly.io, Google Cloud Run, AWS App Runner):

- Run the **API** image with `DATABASE_URL` pointing at a managed Postgres, `JWT_SECRET`, `CURRENCY`,
  `RUN_MIGRATIONS=true`, and `TRUST_PROXY_HOPS` set to the number of proxies the platform puts in front (usually 1).
- Run the **web** image with `API_UPSTREAM` set to the API's internal URL (for example `http://outlet-hq-api:3000`).
  If the platform cannot route internally, serve the web build from a static host and set `CORS_ORIGINS` on the API
  to the web origin instead.
- Health checks: API `GET /ready`, web `GET /`.

## Environment reference (API)

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `DATABASE_URL` | yes | | Postgres connection string |
| `JWT_SECRET` | yes | | At least 32 characters; signs login tokens |
| `JWT_EXPIRES_IN` | | `8h` | Token lifetime (`30m`, `8h`, `7d`) |
| `CURRENCY` | | `MYR` | ISO 4217 code; all `*_cents` values are in it |
| `PORT` | | `3000` | Listening port |
| `CORS_ORIGINS` | | none | Comma-separated browser origins, only when the web app is on another origin |
| `TRUST_PROXY_HOPS` | | `1` | Proxies in front of the API |
| `RUN_MIGRATIONS` | | `false` | Apply migrations on start |
| `SEED_DEMO_DATA` | | `false` | Load demo data on start when the database has no users |
| `DATABASE_POOL_MAX` | | `10` | Connections per API instance |
| `LOG_LEVEL` | | `info` | `fatal` to `trace`, or `silent` |
| `LOGIN_RATE_LIMIT_PER_MINUTE` | | `10` | Sign-in attempts per client address per minute; raise it only for test stacks |
