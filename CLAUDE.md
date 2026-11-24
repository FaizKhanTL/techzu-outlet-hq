# CLAUDE.md

Rules for anyone (human or AI) changing this codebase. Read this before writing code. When a rule here and a habit
disagree, the rule wins. When a rule is wrong, change this file in the same pull request as the code.

## What this is

Outlet HQ: one company, many F&B outlets. HQ owns the master menu, assigns items to outlets (with an optional price
per outlet) and reads reports. Each outlet sells only what it was assigned and keeps its own stock.

```
backend/    Express 5 + TypeScript API over PostgreSQL 16
frontend/   React 19 + Vite + TypeScript (HQ console and outlet POS)
docs/       ARCHITECTURE.md: ERD, flows, scaling, microservices, offline POS
```

## Commands

Run from the folder named.

| Where | Command | What |
|---|---|---|
| root | `docker compose up --build` | Postgres, API (migrates on start) and web on http://localhost:8080 |
| root | `docker compose run --rm api node dist/db/seed.js` | Load demo data |
| backend | `npm run dev` | API with reload (needs `DATABASE_URL`) |
| backend | `npm run migrate` / `npm run seed` | Apply migrations / load demo data |
| backend | `npm test` | Integration tests against a real Postgres (`TEST_DATABASE_URL`) |
| backend | `npm run lint && npm run typecheck` | Must pass before a commit |
| frontend | `npm run dev` / `npm run build` | Vite dev server (proxies `/api`) / production build |

## Architecture rules (backend)

1. **Layers, one direction only:** `routes → controllers → services → repositories`. A layer may only call the one
   below it.
   - **routes** wire paths, auth and validation middleware. No logic.
   - **controllers** read the validated input, call one service function, shape the HTTP response. No SQL, no
     business rules.
   - **services** hold the business rules and own transactions. No `req`/`res`, no SQL strings.
   - **repositories** are the only place with SQL. Each function takes a `Queryable` (pool or transaction client) as
     its first argument so the service decides the transaction.
2. **Code is grouped by module** (`src/modules/<name>/`), each with `*.routes.ts`, `*.controller.ts`,
   `*.service.ts`, `*.repository.ts`, `*.schemas.ts`. Shared code lives in `src/lib`, `src/middleware`, `src/db`.
3. **Validate at the edge.** Every route validates `params`, `query` and `body` with a zod schema through the
   `validate` middleware. Services receive typed, already-valid input. Unknown body keys are rejected (`.strict()`).
4. **Errors are typed.** Throw `AppError` subclasses from `src/lib/errors.ts` (`NotFoundError`, `ConflictError`,
   ...), each with a stable machine `code`. Never `res.status(...).json(...)` an error by hand; the error
   middleware formats every error as `{ "error": { "code", "message", "details?", "requestId" } }`. Unknown errors
   become a generic 500 and are logged, never echoed.
5. **Success bodies** are `{ "data": ... }`, lists `{ "data": [...], "meta": { "limit", "offset", "total" } }`.
6. **Configuration** comes only from `src/config/env.ts` (zod-validated at start-up; the process refuses to start on a
   bad value). No `process.env` anywhere else.

## Data rules

1. **Money is integer minor units** (`*_cents`, `INTEGER` for prices, `BIGINT` for totals). Never floats, never
   `NUMERIC` in application code. One currency per deployment (`CURRENCY`).
2. **Prices are computed on the server** at sale time from the outlet assignment (`price_override_cents` or the
   master `base_price_cents`) and snapshotted on the sale line. A price sent by a client is never trusted.
3. **Stock can never go negative.** It is guarded twice: a `CHECK (quantity >= 0)` constraint and conditional updates
   inside the transaction. Every stock change writes an `inventory_movements` row (the ledger).
4. **Sale creation is one transaction**: lock stock rows in `menu_item_id` order (avoids deadlocks), check, deduct,
   take the next receipt number from `outlet_receipt_counters` (row lock: sequential and gap-free per outlet), write
   the sale, its lines and the ledger. Any failure rolls everything back, including the receipt number.
5. **Retries are safe:** `POST /sales` accepts an `Idempotency-Key`. The same key with the same body returns the
   original sale; with a different body it is a `409`.
6. **Schema changes are new migration files** in `backend/migrations` (`NNN_description.sql`), never edits to an
   applied one. Add foreign keys, `NOT NULL`, `CHECK` and unique constraints for every rule the database can hold,
   and an index for every frequent filter or join.
7. **IDs are UUIDs** (`gen_random_uuid()`); timestamps are `timestamptz` in UTC, kept by the `set_updated_at` trigger.
8. **SQL is parameterised** (`$1`, `$2`). Never build SQL from user input.

## Security rules

- Every route except `/health`, `/ready` and `POST /api/v1/auth/login` requires a JWT.
- Authorise by role and by outlet: `OUTLET_STAFF` can only read or write their own `outletId`; HQ-only routes use
  `authorize('HQ_ADMIN')`. Check the outlet scope in the route, not in the UI.
- Passwords are hashed with `scrypt` and compared in constant time; login is rate-limited and gives the same error for
  an unknown user and a wrong password.
- Never log tokens, passwords or full request bodies (`authorization` is redacted in the logger).

## Frontend rules

- Server state goes through TanStack Query hooks in `src/api`; components never call `fetch` directly.
- Format money only with `formatMoney` from `src/lib/money.ts`; never do arithmetic on formatted strings.
- Every request that changes data shows its error message from the API (`error.message`) and disables its button
  while pending.
- The UI hides what a role cannot do, but the API is the authority.

## Testing rules

- Backend tests are integration tests against a real Postgres (no mocked database): `backend/test`. Each test starts
  from an empty schema state (`resetDatabase`).
- Every business rule above has a test, including concurrency: parallel sales must give unique, gap-free receipt
  numbers and must never oversell.
- A bug fix comes with the test that would have caught it.

## Style

- TypeScript `strict`. No `any` (use `unknown` and narrow). ESLint and Prettier must pass.
- Names say what a thing is; comments say why, not what. Keep comments to one or two lines.
- Commits: Conventional Commits (`feat(api): ...`, `fix(web): ...`, `docs: ...`), one logical change each, present
  tense, no generated noise.
