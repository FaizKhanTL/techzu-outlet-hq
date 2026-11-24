# Outlet HQ

A central HQ system for a company with many F&B outlets. HQ manages the master menu, assigns items to outlets (with
an optional outlet price) and watches sales across outlets. Each outlet sells only what it was assigned, deducts its
own stock and gets sequential receipt numbers.

**Single company → multiple outlets → HQ assigns menu → outlets create sales → HQ sees reports.**

| | |
|---|---|
| Stack | PostgreSQL 16, Node.js 22, Express 5, React 19 (Vite), TypeScript everywhere |
| API | `backend/`: layered (routes → controllers → services → repositories), zod validation, JWT auth |
| Web | `frontend/`: HQ console and outlet point of sale |
| Docs | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): ERD, flows, scaling plan, microservices, offline POS and KDS |
| Deploy | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| Rules for contributors | [CLAUDE.md](CLAUDE.md) |

## Contents

- [Features](#features)
- [Quick start (Docker)](#quick-start-docker)
- [Demo accounts](#demo-accounts)
- [Local development](#local-development)
- [Tests](#tests)
- [API endpoints](#api-endpoints)
- [Schema](#schema)
- [Architecture](#architecture)
- [Scaling strategy](#scaling-strategy)
- [Design decisions and trade-offs](#design-decisions-and-trade-offs)
- [Project structure](#project-structure)

## Features

**HQ**
- Create, edit and deactivate outlets.
- Maintain the master menu (SKU, name, category, base price, active or retired).
- Assign items to an outlet, override the price per outlet (or clear it back to the master price), pause or resume,
  unassign.
- Restock or correct any outlet's stock.
- Reports: revenue by outlet (outlets with no sales included) and the top 5 items per outlet, for any date range.

**Outlet staff**
- See only their own outlet's menu, at their outlet's prices.
- Point of sale: multi-item sales, cash, card or e-wallet, a receipt numbered `CODE-000001`, `CODE-000002`, ...
- Inventory with restock, waste and corrections, and a per-item ledger.
- Sales history and their own outlet's top items.

**Guarantees** (each one is covered by an integration test against a real Postgres)
- Stock never goes negative, also under many simultaneous sales (`CHECK` constraint plus row locks).
- Receipt numbers are sequential and gap-free per outlet, also under concurrency, and a failed sale does not use one.
- A sale is all or nothing: stock, receipt number, sale, lines and ledger commit together or not at all.
- Prices come from the server, never from the client, and are kept on the receipt.
- Retried sales with the same `Idempotency-Key` are recorded once.
- Staff can never read or change another outlet's data.

## Quick start (Docker)

Requires Docker with Compose v2.

```bash
cp .env.example .env          # then set POSTGRES_PASSWORD and JWT_SECRET (32+ characters)
docker compose up --build
```

- Web app: http://localhost:8080 (`WEB_PORT` in `.env`)
- API: http://localhost:3000/api/v1 (`API_PORT`), health at `/health` and `/ready`

The API applies migrations on start. With `SEED_DEMO_DATA=true` (the default in `.env.example`) it also loads demo
data the first time, when the database has no users: three outlets, ten menu items, assignments with some outlet
prices, opening stock and 24 sales made through the real sale path.

## Demo accounts

Every demo account uses the password `Password123!`. The login page has buttons that fill them in.

| Role | Email | Outlet |
|---|---|---|
| HQ admin | `hq@example.com` | all |
| Outlet staff | `klcc.staff@example.com` | KLCC Flagship |
| Outlet staff | `pj.staff@example.com` | Petaling Jaya |
| Outlet staff | `penang.staff@example.com` | Penang Gurney |

These are demo credentials. For a real deployment set `SEED_DEMO_DATA=false` and create real users.

## Local development

Node 22 (`.nvmrc`) and a PostgreSQL 16 you can reach.

```bash
# API
cd backend
cp .env.example .env            # point DATABASE_URL at your database
npm install
npm run migrate
npm run seed                    # optional demo data
npm run dev                     # http://localhost:3000

# Web (another terminal)
cd frontend
npm install
npm run dev                     # http://localhost:5173, proxies /api to :3000
```

A throwaway database for both: `docker compose up -d db` and use
`postgres://outlet_hq:<POSTGRES_PASSWORD>@localhost:5432/outlet_hq` (publish port 5432 on the `db` service first), or
`docker run -d -p 5432:5432 -e POSTGRES_USER=outlet_hq -e POSTGRES_PASSWORD=outlet_hq -e POSTGRES_DB=outlet_hq postgres:16-alpine`.

## Tests

```bash
cd backend
# A database the tests may wipe; its name must contain "test".
export TEST_DATABASE_URL=postgres://outlet_hq:outlet_hq@localhost:5432/outlet_hq_test
npm test                        # 47 integration tests against real Postgres
npm run lint && npm run typecheck

cd ../frontend
npm test                        # unit tests (money parsing, the POS cart)
npm run lint && npm run build
```

The backend tests rebuild the schema from the migrations, empty every table before each test and cover: auth and
role/outlet scoping, validation and error formats, menu assignment and outlet prices, stock adjustments, sales,
idempotency, reports, and concurrency (40 parallel sales give receipts 1 to 40 with no gaps; 30 parallel sales against
10 in stock give exactly 10 sales; opposite item order does not deadlock; outlets number independently). CI runs all
of it on every push (`.github/workflows/ci.yml`).

## API endpoints

Base path `/api/v1`. All endpoints except login need `Authorization: Bearer <token>`. Request and response bodies are
JSON; amounts are integer cents. Success: `{ "data": ... }`, lists add `"meta": { "limit", "offset", "total" }`.
Errors: `{ "error": { "code", "message", "details?", "requestId" } }`.

| Method | Path | Who | What |
|---|---|---|---|
| POST | `/auth/login` | anyone | `{ email, password }` → `{ token, tokenType, expiresIn, user }`. Rate-limited. |
| GET | `/auth/me` | signed in | The current user (with `role`, `outletId`, `currency`). |
| GET | `/outlets` | HQ | List; `search`, `isActive`, `limit`, `offset`. |
| POST | `/outlets` | HQ | Create `{ code, name, address? }`. Code: 2-16 letters/digits/dashes, unique. |
| GET | `/outlets/:outletId` | HQ, own staff | One outlet. |
| PATCH | `/outlets/:outletId` | HQ | `{ name?, address?, isActive? }`. The code is fixed (it is on receipts). |
| GET | `/menu-items` | HQ | Master menu; `search`, `category`, `isActive`, `limit`, `offset`. |
| POST | `/menu-items` | HQ | Create `{ sku, name, category?, description?, basePriceCents }`. |
| GET | `/menu-items/:menuItemId` | HQ | One item, with how many outlets sell it. |
| PATCH | `/menu-items/:menuItemId` | HQ | `{ name?, category?, description?, basePriceCents?, isActive? }`. |
| GET | `/outlets/:outletId/menu-items` | HQ, own staff | The outlet's assigned items with `priceCents` (effective), stock and flags. `sellable=true` for what the till can sell now. |
| PUT | `/outlets/:outletId/menu-items/:menuItemId` | HQ | Assign or update `{ priceOverrideCents?: number \| null, isAvailable? }`. `201` new, `200` updated. |
| PATCH | `/outlets/:outletId/menu-items/:menuItemId` | HQ, own staff | `{ isAvailable }`; HQ may also send `priceOverrideCents`. |
| DELETE | `/outlets/:outletId/menu-items/:menuItemId` | HQ | Unassign (removes the stock row; past sales keep their copy). |
| GET | `/outlets/:outletId/inventory` | HQ, own staff | Stock per assigned item. |
| POST | `/outlets/:outletId/inventory/:menuItemId/adjustments` | HQ, own staff | `{ quantityDelta, reason: RESTOCK\|WASTE\|CORRECTION, note? }`. Never below zero (`409 INSUFFICIENT_STOCK`). |
| GET | `/outlets/:outletId/inventory/:menuItemId/movements` | HQ, own staff | The item's stock ledger, newest first. |
| POST | `/outlets/:outletId/sales` | HQ, own staff | `{ items: [{ menuItemId, quantity }], paymentMethod: CASH\|CARD\|E_WALLET, note? }`, optional `Idempotency-Key` header. `201` with the receipt. |
| GET | `/outlets/:outletId/sales` | HQ, own staff | History, newest first; `from`, `to`, `limit`, `offset`. |
| GET | `/outlets/:outletId/sales/:saleId` | HQ, own staff | One sale with its lines. |
| GET | `/reports/revenue-by-outlet` | HQ | Revenue, sales and items per outlet plus totals; `from`, `to`. |
| GET | `/reports/top-items` | HQ, staff (own outlet) | Top items per outlet by quantity; `from`, `to`, `outletId`, `limit` (default 5). |
| GET | `/health`, `/ready` | anyone | Liveness, and readiness (database reachable). |

Dates are ISO 8601 with a time zone; `from` is inclusive and `to` exclusive.

Error codes a client may want to handle: `VALIDATION_ERROR` (400, `details` lists each field), `INVALID_CREDENTIALS`,
`TOKEN_REQUIRED`, `INVALID_TOKEN`, `ACCOUNT_DISABLED` (401), `ROLE_FORBIDDEN`, `OUTLET_FORBIDDEN`,
`PRICE_CHANGE_FORBIDDEN` (403), `NOT_FOUND`, `NOT_ASSIGNED` (404), `OUTLET_CODE_TAKEN`, `SKU_TAKEN`,
`INSUFFICIENT_STOCK`, `IDEMPOTENCY_KEY_REUSED` (409), `ITEMS_NOT_SELLABLE`, `OUTLET_INACTIVE`, `MENU_ITEM_INACTIVE`
(422), `RATE_LIMITED` (429).

Example sale:

```bash
curl -X POST http://localhost:3000/api/v1/outlets/$OUTLET_ID/sales \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"items":[{"menuItemId":"'$ITEM_ID'","quantity":2}],"paymentMethod":"CARD"}'
```

```json
{
  "data": {
    "id": "6f0c…",
    "receiptNumber": "KLCC-000012",
    "receiptSeq": 12,
    "totalCents": 2600,
    "itemCount": 2,
    "paymentMethod": "CARD",
    "currency": "MYR",
    "items": [{ "menuItemId": "…", "sku": "COF-LATTE", "name": "Cafe Latte", "unitPriceCents": 1300, "quantity": 2, "lineTotalCents": 2600 }],
    "createdAt": "2026-11-24T10:15:00.000Z"
  }
}
```

## Schema

Full ERD and reasoning: [docs/ARCHITECTURE.md, section 3](docs/ARCHITECTURE.md#3-data-model-and-erd). Migrations:
`backend/migrations`.

| Table | Holds |
|---|---|
| `outlets` | The outlets; `code` is unique and printed on receipts. |
| `users` | HQ admins and outlet staff (`outlet_id` required for staff, forbidden for HQ, by a `CHECK`). |
| `menu_items` | The master menu; `base_price_cents`, unique `sku`. |
| `outlet_menu_items` | What an outlet sells: the assignment, its optional `price_override_cents` and `is_available`. |
| `inventory` | Stock per outlet per assigned item, `CHECK (quantity >= 0)`. |
| `outlet_receipt_counters` | The last receipt number per outlet. |
| `sales` | One row per sale: receipt number (unique per outlet and globally), totals, payment, idempotency key. |
| `sale_items` | Sale lines with snapshot SKU, name and unit price; `line_total = unit x quantity` is a `CHECK`. |
| `inventory_movements` | The stock ledger: every change with its reason, the stock after it and the sale that caused it. |

All money is integer cents. Foreign keys, unique and check constraints hold every rule the database can hold, and
indexes match the frequent queries (sales by outlet and time, lines by sale and by item, assignments by item).

## Architecture

```
browser ── nginx (web) ──/api──> Express API ──> PostgreSQL
```

- **Layered API:** routes (paths, guards, validation) → controllers (HTTP in and out) → services (rules, transactions)
  → repositories (SQL only). One module per business area under `backend/src/modules`.
- **Validation at the edge** with zod; unknown fields are rejected. **One error middleware** turns typed errors into
  one shape with a stable code and the request id.
- **Config** is validated at start-up (`src/config/env.ts`); the process will not start with a bad value.
- **Sales** run in one transaction that locks stock rows in a fixed order, deducts them, takes the next receipt number
  from a per-outlet counter row and writes the sale, lines and ledger.
- **Auth:** JWT; the user and their outlet are re-checked on every request; staff are confined to their outlet on
  every outlet route.
- **Web:** React with TanStack Query for server state, one API client, money only in cents.

Details and diagrams: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Scaling strategy

10 outlets and 100,000 sales a month is under one sale a second at peak. Measured on a laptop, one outlet handles about
180 sales a second through the full transaction, so the plan is about reliability and growth, not raw speed:

- **Database:** managed Postgres with a standby and point-in-time recovery; PgBouncer once there are several API
  instances; monthly partitions for sales, lines and the ledger past tens of millions of rows; a read replica for reports.
- **Reporting:** a daily per-outlet, per-item rollup updated with each sale (or from an outbox event), per-outlet
  business dates, caching of closed periods, and later a warehouse fed by change data capture.
- **Infrastructure:** two or more stateless API instances across zones behind a load balancer, the web app on a CDN,
  a shared rate-limit store, secrets in a secret manager, metrics and tracing with alerts.
- **Evolution:** modular monolith → separate read side → transactional outbox and events → services where justified.

The full plan, the microservices split and the offline POS and KDS strategy are in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#5-scaling-plan-10-outlets-100000-transactions-a-month).

## Design decisions and trade-offs

- **Gap-free receipt numbers** come from a per-outlet counter row locked for the length of the sale transaction. That
  serialises sales within one outlet (fine: a few milliseconds each), and in exchange a rolled-back sale never leaves
  a hole. A database sequence would be faster but leaves gaps on rollback.
- **Stock is checked under a lock**, not just with a conditional update, so a refused sale can say exactly which items
  are short and by how much.
- **Inventory changes are deltas with a ledger**, not absolute values, so concurrent changes never overwrite each
  other and stock can always be explained.
- **The price is snapshotted on the sale line**, so receipts and reports never change when the menu does.
- **Assignment is a `PUT`** (create or update) and the stock row is created with it, so an assigned item always has
  stock to check.
- **Outlet codes and SKUs cannot change** after creation: they are printed on receipts and used by people.
- **No hard deletes** for outlets or menu items: they are deactivated, so history stays intact.
- **Same-origin web and API** via nginx: no CORS in production, and the token never travels to another host.
- **Token in session storage** (per tab, cleared when the tab closes) rather than local storage. An httpOnly cookie
  with CSRF protection would be stronger and is the next step for a production rollout.

Not included, on purpose, to keep the scope to the brief: user management screens (users are seeded or inserted by an
admin), refunds and voids, taxes and discounts, multiple currencies, and the offline outlet hub itself (designed in
section 7 of the architecture document; the API's idempotency keys and UUIDs are already what it needs).

## Project structure

```
.
├── CLAUDE.md                     rules for working on this codebase
├── docker-compose.yml            Postgres + API + web
├── docs/
│   ├── ARCHITECTURE.md           ERD, flows, scaling, microservices, offline POS/KDS
│   └── DEPLOYMENT.md             how to run it on a server with HTTPS
├── backend/
│   ├── migrations/               SQL migrations, applied in order, checksummed
│   ├── src/
│   │   ├── config/               validated environment
│   │   ├── db/                   pool, transactions, migration runner, demo seed
│   │   ├── lib/                  errors, pg error mapping, shared schemas, logger
│   │   ├── middleware/           request id, validation, auth, errors
│   │   ├── modules/              auth, outlets, menu-items, outlet-menu, inventory, sales, reports
│   │   ├── app.ts                the Express app
│   │   └── server.ts             start-up and graceful shutdown
│   └── test/                     integration tests (real Postgres)
└── frontend/
    ├── src/
    │   ├── api/                  client, types, TanStack Query hooks
    │   ├── auth/                 auth context
    │   ├── components/           layout, shared UI, stock form, top-items table
    │   ├── lib/                  money, dates, POS cart (with tests)
    │   └── pages/                login, hq/*, outlet/*
    └── nginx.conf.template       production web server
```
