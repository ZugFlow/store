# ArtSync Architecture

## Overview

ArtSync bridges external supplier inventory feeds into Shopify. The design keeps the sync core independent of transport and of the Shopify adapter, so additional suppliers can be onboarded without rewriting the pipeline.

```
Supplier systems
      │  HMAC-signed POST
      ▼
┌─────────────────────────────┐
│  B. Supplier ingress API    │  /api/supplier/inventory-update
│  auth · validate · rate     │
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│  C. Sync service            │  syncSupplierInventory()
│  dedupe · order · CAS retry │
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│  D. Shopify adapter         │
│  MockShopifyInventoryClient │ ← ARTSync_MODE=mock
│  RealShopifyInventoryClient │ ← ARTSync_MODE=live (GraphQL 2026-10)
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│  E. Database (Prisma/SQLite)│
│  mappings · events · logs   │
└─────────────────────────────┘

A. Admin dashboard (React Router + App Shell)
F. Structured JSON logger (secrets redacted)
G. Demo simulator (signed fetch into the real API path)
```

## Layers

### A. Admin dashboard

Routes under `/app/*`:

| Route | Role |
|---|---|
| `/app` | KPIs + recent events |
| `/app/suppliers` | Supplier registry CRUD (demo) |
| `/app/products` | SKU mappings + quantities |
| `/app/logs` | Audit log + safe retry |
| `/app/demo` | Simulator UI |

In MOCK mode, Shopify OAuth is skipped so the UI can be presented without Partner login. In LIVE mode, the official `authenticate.admin` from `@shopify/shopify-app-react-router` is used.

### B. Supplier API

`app/routes/api.supplier.inventory-update.ts`

1. Payload size check  
2. Rate limit  
3. Timestamp skew check (anti-replay)  
4. HMAC verification per supplier secret  
5. Zod validation  
6. `syncSupplierInventory()`

### C. Sync service

`app/services/sync/sync-supplier-inventory.ts`

Guarantees:

- **Idempotency**: unique `(shop, eventId)`; duplicates return prior result without mutating inventory again
- **Ordering**: succeeded events with a newer `eventTimestamp` cause older events to be marked `stale`
- **CAS**: reads current quantity, sets with `changeFromQuantity`, retries on stale compare
- **Shopify idempotency key**: `artsync:{shop}:{eventId}` reused on retries (`@idempotent`)
- **Success only after adapter confirmation**

### D. Shopify clients

Interface: `ShopifyInventoryClient` in `app/services/shopify/types.ts`.

Live mutation (documented API 2026-10):

```graphql
mutation inventorySetQuantities($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
  inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
    inventoryAdjustmentGroup { changes { name delta quantityAfterChange } }
    userErrors { code field message }
  }
}
```

Each quantity includes required `changeFromQuantity` (CAS). Mock adapter mirrors the same contract against `MockInventoryLevel`.

### E. Database

Shop-scoped rows prevent cross-tenant leakage. Simulation rows use `Supplier.mode = mock` and mock GIDs; live mappings should store real Shopify GIDs.

### F. Logging

`app/lib/logger.ts` emits JSON lines and redacts keys matching secret/token patterns.

## Extending with a new supplier

1. Create `Supplier` + `SupplierCredential` (HMAC secret)
2. Insert `SupplierProductMapping` rows (SKU → inventoryItemId + locationId)
3. Share secret + header contract with the supplier
4. No sync-engine changes required

## Security notes

- Dashboard auth: Shopify session (live) / local-only (mock — not for production exposure)
- Supplier auth: independent HMAC channel; secrets never sent to the browser (except one-time display on create in mock)
- Errors returned to callers avoid stack traces and secret material
