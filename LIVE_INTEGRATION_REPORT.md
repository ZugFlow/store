# ArtSync — Live Integration Report

Aggiornato: 2026-11-06

## Collegamento effettuato

| Voce | Valore (senza segreti) |
|---|---|
| Org | Il mio negozio (`245637204`) |
| App | ArtSync |
| Client ID | `439097399ccb740773a262bc32003600` |
| Development store | `artsync-demo.myshopify.com` (ArtSync Demo) |
| Production stores | nessuno in org (verificato) |
| Scope | `read_products,read_inventory,write_inventory,read_locations` |
| API version (app code) | 2026-10 |
| `shopify app dev` | **RUNNING** |
| Tunnel | Cloudflare (trycloudflare) attivo |
| Preview URL | `https://admin.shopify.com/store/artsync-demo/apps/439097399ccb740773a262bc32003600?dev-console=show` |

Backup locali: `shopify.app.toml.backup-pre-link`, `package.json.backup-pre-link`.

## Criteri di completamento

| Criterio | Stato |
|---|---|
| ArtSync collegata a una vera app Shopify | **PASS** |
| Installata su development store | **PASS** (scope auto-granted via CLI; install UI richiede login Admin nel browser) |
| Autenticazione funziona | **PASS** (CLI + Admin API execute) |
| Dashboard si apre dal pannello Shopify | **NOT TESTED** (serve login Admin nel browser — Captcha) |
| Prodotti letti via GraphQL | **PASS** (query OK; store ha **0 prodotti**) |
| Location recuperate | **PASS** (`Shop location` · `gid://shopify/Location/127857033550`) |
| Mapping SKU funziona | **NOT TESTED** (nessun prodotto nello store) |
| Evento fornitore LIVE | **NOT TESTED** |
| Shopify aggiorna giacenza | **NOT TESTED** (nessuna mutazione eseguita — in attesa autorizzazione) |
| Quantità riletta | **NOT TESTED** |
| Log | **NOT TESTED** (LIVE) |
| Test automatici | **PASS** (15/15) |
| Test LIVE E2E | **NOT TESTED** |
| Documentazione | **PASS** (questo file) |

## Verifica GraphQL reale eseguita

Query read-only su `artsync-demo.myshopify.com` via `shopify app execute`:

```graphql
{ shop { name myshopifyDomain } products(first: 3) { nodes { id title } } }
```

Risultato reale:

- `shop.name` = `ArtSync Demo`
- `shop.myshopifyDomain` = `artsync-demo.myshopify.com`
- `products.nodes` = `[]` (store vuoto)

Locations (query reale dopo aggiunta `read_locations`):

- `Shop location` — `gid://shopify/Location/127857033550` — active

**Nessuna mutation di inventario è stata eseguita.**

## Problemi rimasti / prossimi passi

1. **Login Admin Shopify nel browser** per aprire la dashboard embedded (Captcha impedisce automazione).
2. **Creare nel development store** il prodotto di prova:
   - Titolo: `Limited Edition Abstract 01`
   - SKU: `ART-001`
   - Quantità disponibile: `5` sulla location `Shop location`
3. In ArtSync → Prodotti → **Importa prodotti da Shopify** (fornitore Atelier Milano, solo SKU `ART-001`).
4. Solo dopo tua autorizzazione: simulare aggiornamento fornitore 5 → 2 e verificare in Admin.

## Fix applicati durante il collegamento

- Shopify CLI installato (`5.0.1`)
- App remota ArtSync creata e linkata al progetto esistente (nessun rewrite del codice app)
- Scope ripristinati dopo link (il remote defaultava a `write_products`)
- Aggiunto `shopify.web.toml` (prima c’era solo `.liquid` → tunnel non partiva)
- `application_url` placeholder `shopify.dev/...` sostituito (rompeva i webhook)

## Limitazioni

- Store senza prodotti: import/sync E2E non ancora dimostrabili
- Mutazioni inventario non eseguite di proposito
- Dashboard embedded non verificata visualmente (login Admin richiesto)
