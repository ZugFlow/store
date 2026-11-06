# ArtSync Supplier API

Base path: `/api/supplier`

## Authentication

Every mutating request must include:

| Header | Description |
|---|---|
| `X-ArtSync-Shop` | Shop domain, e.g. `artsync-demo.myshopify.com` |
| `X-ArtSync-Supplier-Id` | Supplier `externalId` |
| `X-ArtSync-Timestamp` | ISO-8601 timestamp |
| `X-ArtSync-Signature` | Hex HMAC-SHA256 |

Signature input (UTF-8):

```text
${timestamp}.${rawBody}
```

Node example:

```js
import { createHmac } from "node:crypto";

const signature = createHmac("sha256", secret)
  .update(`${timestamp}.${rawBody}`)
  .digest("hex");
```

Requests with timestamp skew larger than `ARTSYNC_TIMESTAMP_TOLERANCE_MS` (default 5 minutes) are rejected (`timestamp_expired`).

## POST `/api/supplier/inventory-update`

### Request body

```json
{
  "eventId": "evt-10001",
  "supplierId": "supplier-atelier-milano",
  "sku": "ART-001",
  "quantity": 5,
  "timestamp": "2026-11-06T09:00:00.000Z"
}
```

| Field | Rules |
|---|---|
| `eventId` | Required, unique per shop |
| `supplierId` | Must match auth header |
| `sku` | Must exist in mapping for that supplier |
| `quantity` | Integer ≥ 0 |
| `timestamp` | ISO-8601 with offset |

### Success response (`200`)

```json
{
  "ok": true,
  "status": "succeeded",
  "message": "Inventory synchronized",
  "eventId": "evt-10001",
  "previousQuantity": 5,
  "newQuantity": 2
}
```

### Duplicate (`200`)

```json
{
  "ok": true,
  "status": "duplicate",
  "message": "Duplicate event acknowledged",
  "eventId": "evt-10001",
  "previousQuantity": 5,
  "newQuantity": 2
}
```

### Stale / out-of-order (`200`)

```json
{
  "ok": true,
  "status": "stale",
  "message": "Stale event ignored",
  "eventId": "evt-old",
  "previousQuantity": 8,
  "newQuantity": 8
}
```

### Error examples

**Invalid signature (`401`)**

```json
{ "ok": false, "error": "invalid_signature", "message": "Invalid signature" }
```

**Expired timestamp (`401`)**

```json
{ "ok": false, "error": "timestamp_expired", "message": "Timestamp outside allowed window" }
```

**Validation (`400`)**

```json
{
  "ok": false,
  "error": "validation_error",
  "message": "Invalid payload",
  "issues": [{ "path": "quantity", "message": "Too small: expected number to be >=0" }]
}
```

**Unknown SKU (`404`)**

```json
{
  "ok": false,
  "status": "not_found",
  "message": "SKU mapping not found",
  "eventId": "evt-x"
}
```

**Sync failure after Shopify/mock error (`502`)**

```json
{
  "ok": false,
  "status": "failed",
  "message": "Simulated Shopify API error",
  "eventId": "evt-x",
  "previousQuantity": 5
}
```

## cURL (mock demo)

After `npm run demo:seed`, use the printed secret for `supplier-atelier-milano`:

```bash
SHOP=artsync-demo.myshopify.com
SUPPLIER=supplier-atelier-milano
SECRET='<from seed output>'
TS=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
BODY='{"eventId":"evt-curl-1","supplierId":"supplier-atelier-milano","sku":"ART-001","quantity":2,"timestamp":"'"$TS"'"}'
SIG=$(node -e "const c=require('crypto');const s=process.argv[1],t=process.argv[2],b=process.argv[3];process.stdout.write(c.createHmac('sha256',s).update(t+'.'+b).digest('hex'))" "$SECRET" "$TS" "$BODY")

curl -sS -X POST http://localhost:3000/api/supplier/inventory-update \
  -H "Content-Type: application/json" \
  -H "X-ArtSync-Shop: $SHOP" \
  -H "X-ArtSync-Supplier-Id: $SUPPLIER" \
  -H "X-ArtSync-Timestamp: $TS" \
  -H "X-ArtSync-Signature: $SIG" \
  -d "$BODY"
```

## Idempotency contract

- Replaying the same `eventId` never applies a second inventory change
- Retries of a failed event reuse the same Shopify `@idempotent` key derived from `eventId`
