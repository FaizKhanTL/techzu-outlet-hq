# Deployment on Railway

Live at https://outlet-hq.up.railway.app, API docs at https://outlet-hq.up.railway.app/api/docs. Three services in one
Railway project, all in Southeast Asia (Singapore): `Postgres` (Railway's template), `api` (`backend/Dockerfile`) and
`web` (`frontend/Dockerfile`, nginx). Only `web` has a public domain; it forwards `/api` to the API over Railway's
private network, exactly as in docker compose.
`backend/railway.json` and `frontend/railway.json` set the Dockerfile builder, the region and the health checks
(`/ready` for the API, so a deploy goes live only when the database answers).

```bash
railway login
railway init --name techzu-outlet-hq
railway add --database postgres
railway add --service api \
  --variables 'NODE_ENV=production' --variables 'PORT=3000' \
  --variables 'DATABASE_URL=${{Postgres.DATABASE_URL}}' \
  --variables "JWT_SECRET=$(openssl rand -hex 32)" \
  --variables 'CURRENCY=SGD' --variables 'RUN_MIGRATIONS=true' --variables 'SEED_DEMO_DATA=true' \
  --variables 'DATABASE_POOL_MAX=5' --variables 'TRUST_PROXY_HOPS=3'
railway add --service web --variables 'PORT=8080' --variables 'API_UPSTREAM=http://api.railway.internal:3000'
# Move the database next to the API. The trial plan allows one region per service, so also set the region it was
# created in (iad here) to 0. api and web take their region from railway.json.
railway service scale --service Postgres southeast-asia=1 iad=0

railway up backend --path-as-root --service api --ci
railway up frontend --path-as-root --service web --ci
railway domain --service web --port 8080
```

`TRUST_PROXY_HOPS=3`, measured on the live deployment: the API sees `X-Forwarded-For: <client>, <Railway edge>,
<Railway internal proxy>` from nginx. Railway's edge replaces any `X-Forwarded-For` the client sends, so the first
entry cannot be forged. With 2 the login limit counted Railway's edge nodes instead of clients and never tripped; with
3 the eleventh failed sign-in in a minute gets `429`. Recount the hops if anything is put in front of the web service.
