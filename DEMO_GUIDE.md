# ArtSync Demo Guide

For showing the product to a non-technical partner in ~5 minutes.

## Before you start

On the demo laptop:

```bash
cd artsync
npm install
cp .env.example .env
npx prisma migrate deploy
npm run demo:seed
npm run demo
```

Open **http://localhost:3000/app**.  
Confirm the top-right badge says **MOCK** (no real Shopify store is modified).

## Story to tell

> ArtSync lets galleries and print houses (suppliers) push stock levels into a luxury Shopify store. When a supplier updates availability, ArtSync validates the event, updates inventory safely, and keeps a full audit log.

## Walkthrough

### 1. Dashboard

Show:

- Connected suppliers (3)
- Monitored products
- Successful / failed sync counters
- Recent events (empty at first is fine)

### 2. Fornitori

Show Atelier Milano, Fine Art London, Luxury Prints Paris.  
Mention each supplier has its own API secret (only last 4 chars visible).

### 3. Prodotti

Point at **Limited Edition Abstract 01** (`ART-001`) with quantity **5**.

### 4. Demo — simulate a supplier update

1. Open **Demo**
2. Select **Limited Edition Abstract 01**
3. Set quantity to **2**
4. Click **Simula aggiornamento fornitore**
5. Show the JSON response: `status: "succeeded"`, `previousQuantity: 5`, `newQuantity: 2`

### 5. Prove it landed

- **Prodotti**: Shopify qty is now **2**
- **Log**: new row with outcome **succeeded**
- **Dashboard**: sync counters updated

### 6. Prove duplicates are safe

On Demo, enter the **same Event ID** shown in the previous response and submit again.

Expected: response `status: "duplicate"` — quantity stays **2**, no double write.

### 7. Optional talking points

- HMAC signatures so only trusted suppliers can push updates
- Compare-and-swap so two updates at once do not silently overwrite each other
- MOCK vs LIVE: same code path; LIVE uses Shopify Admin GraphQL `inventorySetQuantities` (API 2026-10)

## If something looks wrong

1. Stop the server (`Ctrl+C`)
2. `npm run demo:seed`
3. `npm run demo`
4. Hard-refresh the browser

## What not to claim

- Do not say inventory was updated on a real Shopify store while the badge shows **MOCK**
- Do not share demo HMAC secrets outside the controlled demo environment
