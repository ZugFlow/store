# ArtSync — Shopify Inventory Bridge

Custom Shopify app that receives inventory availability events from external suppliers and synchronizes them into a Shopify store using the **Admin GraphQL API** (`inventorySetQuantities`, API version **2026-10**).

Built on the official [Shopify React Router app template](https://github.com/Shopify/shopify-app-template-react-router).

ArtSync is designed as a **technical demonstration** for art / luxury / B2B inventory integrations: real backend logic, authenticated supplier APIs, and a clear separation between **MOCK** and **LIVE** Shopify modes.

---

## Verified status (honest)

| Area | Status |
|---|---|
| MOCK end-to-end (local API → sync → dashboard/logs) | **Verified** |
| Automated unit/integration tests (Vitest) | **Verified — 15/15** |
| Typecheck / production build | **Verified** |
| App linked to a Shopify Development Store | **Verified** (dev store only) |
| Admin GraphQL read (shop, products, locations) | **Verified** |
| LIVE inventory mutation ART-001 `5 → 2` via `inventorySetQuantities` + independent re-read | **Verified** (dev store) |
| Embedded dashboard open from Shopify Admin UI | **Not verified yet** (requires merchant Admin login / Captcha) |
| LIVE end-to-end via supplier HMAC API (`POST /api/supplier/inventory-update`) | **Not verified yet** |

Details: [`LIVE_INTEGRATION_REPORT.md`](./LIVE_INTEGRATION_REPORT.md).

---

## What this project demonstrates

- Backend inventory sync pipeline with **idempotency**, **compare-and-swap (CAS)**, retries, and out-of-order protection
- Supplier-facing REST API authenticated with **HMAC** + timestamp anti-replay
- Shopify Admin GraphQL client with mock/live adapters
- Admin dashboard (suppliers, products, logs, demo simulator) using **shadcn/ui** + Tailwind CSS v4
- Shop-scoped data isolation in Prisma/SQLite
- Structured logging with secret redaction

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js `>= 22.12`, TypeScript |
| App framework | React Router 7 (Shopify official template) |
| Shopify | `@shopify/shopify-app-react-router`, Admin GraphQL **2026-10** |
| Database | Prisma + SQLite |
| Validation | Zod |
| UI | shadcn/ui, Tailwind CSS v4, Lucide |
| Tests | Vitest |

---

## Architecture

```text
Supplier systems
      │  HMAC-signed POST
      ▼
 Supplier API  →  syncSupplierInventory()  →  Shopify adapter
                                              ├─ MOCK (SQLite MockInventoryLevel)
                                              └─ LIVE (inventorySetQuantities + @idempotent)
      ▲
 Admin dashboard (React Router + shadcn)
```

Details: [`ARCHITECTURE.md`](./ARCHITECTURE.md)

---

## Integrations

### Shopify Admin GraphQL (LIVE)

- Auth: official React Router template session (`authenticate.admin` / `unauthenticated.admin`)
- Scopes: `read_products`, `write_products`, `read_inventory`, `write_inventory`, `read_locations`
- Mutation: `inventorySetQuantities` with required `changeFromQuantity` and `@idempotent(key: …)`
- Absolute quantity updates only when the supplier mapping is the source of truth for that SKU/location

### Supplier inventory API

`POST /api/supplier/inventory-update`

Headers:

- `X-ArtSync-Shop`
- `X-ArtSync-Supplier-Id`
- `X-ArtSync-Timestamp` (ISO-8601)
- `X-ArtSync-Signature` = hex HMAC-SHA256(secret, `` `${timestamp}.${rawBody}` ``)

Full contract: [`API_DOCUMENTATION.md`](./API_DOCUMENTATION.md)

---

## Quick start — MOCK (no Shopify login)

```bash
git clone https://github.com/ZugFlow/store.git
cd store
npm install
cp .env.example .env
npx prisma migrate deploy
npm run demo:seed
npm run demo
```

Open [http://localhost:3000/app](http://localhost:3000/app).

Use **Demo → Simula aggiornamento fornitore** to send a real signed POST through the local supplier API.

Non-technical walkthrough: [`DEMO_GUIDE.md`](./DEMO_GUIDE.md)

---

## LIVE mode (Development Store only)

```bash
npm install -g @shopify/cli@latest
shopify auth login
shopify app config link   # or use existing shopify.app.toml client_id
npm run dev:live          # ARTSYNC_MODE=live shopify app dev
```

Then:

1. Install/open the app on a **development store** only
2. Create a test product (e.g. SKU `ART-001`) with inventory
3. **Prodotti → Importa prodotti da Shopify**
4. Run a supplier simulation and verify quantity in Shopify Admin with an independent GraphQL read

Current LIVE progress and remaining gaps: [`LIVE_INTEGRATION_REPORT.md`](./LIVE_INTEGRATION_REPORT.md)

---

## Commands

| Command | Purpose |
|---|---|
| `npm run demo` | Local UI in `ARTSYNC_MODE=mock` |
| `npm run demo:seed` | Seed demo suppliers/products |
| `npm run dev:live` | Shopify CLI + LIVE mode |
| `npm test` | Vitest suite (MOCK) |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Production build |
| `npm run setup` | `prisma generate` + migrate deploy |

---

## Database

Prisma models: `Session`, `Supplier`, `SupplierCredential`, `SupplierProductMapping`, `InventorySyncEvent`, `InventorySyncLog`, `MockInventoryLevel`.

Local SQLite file is **gitignored**. Migrations under `prisma/migrations/` are committed.

---

## Tests

```bash
npm test
```

Covered behaviours include: valid event, duplicate eventId, unknown SKU/supplier, invalid HMAC, expired timestamp, negative quantity validation, Shopify API error, CAS conflict retry, concurrent updates, stale/out-of-order events, failed-event retry.

LIVE Shopify mutation tests are intentionally **not** automated in CI (require store credentials).

---

## Documentation

| Doc | Content |
|---|---|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | System design |
| [`API_DOCUMENTATION.md`](./API_DOCUMENTATION.md) | Supplier API |
| [`DEMO_GUIDE.md`](./DEMO_GUIDE.md) | Demo script for non-technical audiences |
| [`LIVE_INTEGRATION_REPORT.md`](./LIVE_INTEGRATION_REPORT.md) | LIVE link status / verified GraphQL reads |
| [`.env.example`](./.env.example) | Environment template (no secrets) |

---

## Security notes

- Dashboard auth (LIVE): Shopify session from the official template
- Supplier auth: per-supplier HMAC secrets (never exposed to the browser except one-time create in MOCK)
- Secrets belong in `.env` / Shopify CLI — never commit them
- Demo seed HMAC secrets are deterministic for local demos only — rotate for any shared environment

---

## Limitations

- MOCK does not call Shopify; quantities live in SQLite
- In-memory rate limiting resets on process restart
- One mapped location per SKU in the current UI
- Not App Store distribution-ready (custom / demo app)
- LIVE inventory write path is implemented but **not yet E2E-verified** on a real SKU

---

## License

Scaffolding inherits the Shopify React Router template license (MIT). Application code in this repository is provided as a technical demonstration.
