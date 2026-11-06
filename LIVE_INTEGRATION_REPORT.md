# ArtSync — Live Integration Report

Aggiornato: 2026-11-06 (post test inventario LIVE)

## Ambiente

| Voce | Valore (senza segreti) |
|---|---|
| Org | Il mio negozio (`245637204`) |
| App | ArtSync |
| Client ID | `439097399ccb740773a262bc32003600` |
| Development store | `artsync-demo.myshopify.com` (ArtSync Demo) |
| Production stores | nessuno in org |
| Scope | `read_products,write_products,read_inventory,write_inventory,read_locations` |
| API version | **2026-10** |
| Location | `Shop location` · `gid://shopify/Location/127857033550` |

`write_products` è stato aggiunto solo per creare il prodotto di prova nello store vuoto.

---

## Criteri di completamento

| Criterio | Stato | Note |
|---|---|---|
| ArtSync collegata a una vera app Shopify | **PASS** | config link + `shopify app dev` |
| Installata su development store | **PASS** | scope auto-granted via CLI |
| Autenticazione Admin API | **PASS** | `shopify app execute` |
| Dashboard embedded da Shopify Admin | **NOT TESTED** | login Admin richiede Captcha/browser utente |
| Lettura prodotti via GraphQL | **PASS** | store popolato con prodotto di prova |
| Location recuperate | **PASS** | Shop location attiva |
| Mapping SKU in dashboard ArtSync | **NOT TESTED** | richiede UI embedded / import dalla dashboard |
| Evento fornitore HMAC end-to-end LIVE | **NOT TESTED** | test sotto usa Admin GraphQL diretto |
| Shopify aggiorna giacenza ART-001 5→2 | **PASS** | `inventorySetQuantities` + CAS + `@idempotent` |
| Quantità riletta indipendentemente | **PASS** | query `inventoryItem` → available **2** |
| Log dashboard LIVE | **NOT TESTED** | UI embedded non aperta |
| Test automatici MOCK | **PASS** | 15/15 |
| Typecheck / build | **PASS** | eseguiti dopo il test LIVE |
| Test LIVE E2E via API fornitore HMAC | **NOT TESTED** | vedi sotto |

---

## Test LIVE inventario (eseguito)

### Setup prodotto di prova

Creato via Admin GraphQL sul development store:

- Titolo: `Limited Edition Abstract 01`
- Product: `gid://shopify/Product/16234468901198`
- Variant: `gid://shopify/ProductVariant/61565092626766`
- SKU: `ART-001`
- InventoryItem: `gid://shopify/InventoryItem/60016911614286`
- Location: `gid://shopify/Location/127857033550`

### Baseline

1. `inventorySetQuantities` → quantity **5**, `changeFromQuantity: 0`, `@idempotent`
2. Lettura indipendente: `available = 5` — **PASS**

### Azione richiesta (5 → 2)

```graphql
mutation inventorySetQuantities($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
  inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
    inventoryAdjustmentGroup { reason changes { name delta quantityAfterChange } }
    userErrors { code field message }
  }
}
```

Variabili rilevanti:

- `quantity: 2`
- `changeFromQuantity: 5`
- `idempotencyKey: artsync:artsync-demo.myshopify.com:evt-live-art001-5to2`
- `referenceDocumentUri: gid://artsync/InventorySyncEvent/evt-live-art001-5to2`

Risultato mutation:

- `userErrors: []`
- change `available` delta **-3** — **PASS**

### Verifica indipendente

Query successiva (non la response della mutation):

```graphql
query {
  inventoryItem(id: "gid://shopify/InventoryItem/60016911614286") {
    sku
    inventoryLevel(locationId: "gid://shopify/Location/127857033550") {
      quantities(names: ["available"]) { name quantity }
    }
  }
}
```

Risultato reale: `sku = ART-001`, `available = 2` — **PASS**

---

## Cosa resta da verificare con intervento manuale

1. Aprire nel browser (account Admin dello store):  
   https://admin.shopify.com/store/artsync-demo/apps/439097399ccb740773a262bc32003600  
2. Confermare che la dashboard ArtSync embedded si carica.
3. Opzionale: **Prodotti → Importa da Shopify** + **Demo** per ripetere 5→2 via HMAC API (oggi **NOT TESTED** su quel percorso).

---

## Limitazioni note

- Il test LIVE di inventario è stato eseguito con **Admin GraphQL diretto** (`shopify app execute`), non attraverso il percorso HMAC `POST /api/supplier/inventory-update` in LIVE.
- Dashboard embedded: **NOT TESTED** (blocco login/Captcha nell’automazione).
- Nessun token/secret è riportato in questo documento.
