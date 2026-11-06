import prisma from "../../db.server";
import { logger } from "../../lib/logger";

type GraphqlAdmin = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const PRODUCTS_QUERY = `#graphql
query ArtsyncImportProducts($cursor: String) {
  products(first: 50, after: $cursor) {
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      id
      title
      featuredImage {
        url
      }
      variants(first: 50) {
        nodes {
          id
          title
          sku
          inventoryItem {
            id
            inventoryLevels(first: 10) {
              nodes {
                location {
                  id
                  name
                }
                quantities(names: ["available"]) {
                  name
                  quantity
                }
              }
            }
          }
        }
      }
    }
  }
}`;

export type ImportedVariantPreview = {
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  variantId: string;
  inventoryItemId: string | null;
  locationId: string | null;
  locationName: string | null;
  available: number | null;
  imageUrl: string | null;
  issue?: string;
};

export type ImportProductsResult = {
  scanned: number;
  imported: number;
  updated: number;
  skipped: number;
  issues: string[];
  previews: ImportedVariantPreview[];
};

/**
 * Imports Shopify product variants into SupplierProductMapping for a shop.
 * Does not auto-assign ambiguous SKUs to a supplier — caller must pass supplierId.
 * Skips variants without SKU or inventory item; never creates duplicate (shop, supplier, sku).
 */
export async function importProductsFromShopify(params: {
  shop: string;
  admin: GraphqlAdmin;
  supplierId: string;
  /** When set, only import this SKU (e.g. PET-001). */
  onlySku?: string;
}): Promise<ImportProductsResult> {
  const supplier = await prisma.supplier.findFirst({
    where: { id: params.supplierId, shop: params.shop },
  });
  if (!supplier) {
    throw new Error("Supplier not found for this shop");
  }

  const result: ImportProductsResult = {
    scanned: 0,
    imported: 0,
    updated: 0,
    skipped: 0,
    issues: [],
    previews: [],
  };

  let cursor: string | null = null;
  let hasNext = true;

  while (hasNext) {
    const response = await params.admin.graphql(PRODUCTS_QUERY, {
      variables: { cursor },
    });
    const json = await response.json();
    if (json.errors?.length) {
      throw new Error(json.errors[0]?.message || "Shopify products query failed");
    }

    const connection = json.data?.products;
    const nodes = connection?.nodes || [];

    for (const product of nodes) {
      for (const variant of product.variants?.nodes || []) {
        result.scanned += 1;
        const sku = variant.sku?.trim() || null;
        const inventoryItemId = variant.inventoryItem?.id || null;
        const levels = variant.inventoryItem?.inventoryLevels?.nodes || [];
        const primary = levels[0];
        const locationId = primary?.location?.id || null;
        const available =
          primary?.quantities?.find((q: { name: string }) => q.name === "available")
            ?.quantity ?? null;

        const preview: ImportedVariantPreview = {
          productTitle: product.title,
          variantTitle: variant.title,
          sku,
          variantId: variant.id,
          inventoryItemId,
          locationId,
          locationName: primary?.location?.name || null,
          available: typeof available === "number" ? available : null,
          imageUrl: product.featuredImage?.url || null,
        };

        if (params.onlySku && sku !== params.onlySku) {
          continue;
        }

        if (!sku) {
          preview.issue = "SKU mancante";
          result.skipped += 1;
          result.issues.push(`${product.title} / ${variant.title}: SKU mancante`);
          result.previews.push(preview);
          continue;
        }
        if (!inventoryItemId) {
          preview.issue = "Inventory item mancante";
          result.skipped += 1;
          result.issues.push(`${sku}: inventory item mancante`);
          result.previews.push(preview);
          continue;
        }
        if (!locationId) {
          preview.issue = "Nessuna location inventario";
          result.skipped += 1;
          result.issues.push(`${sku}: nessuna location`);
          result.previews.push(preview);
          continue;
        }

        // Ambiguous: same SKU already mapped to a different supplier on this shop.
        const other = await prisma.supplierProductMapping.findFirst({
          where: {
            shop: params.shop,
            sku,
            NOT: { supplierId: supplier.id },
          },
          include: { supplier: true },
        });
        if (other) {
          preview.issue = `SKU già associato a ${other.supplier.name}`;
          result.skipped += 1;
          result.issues.push(
            `${sku}: già associato a ${other.supplier.name} — non riassegnato automaticamente`,
          );
          result.previews.push(preview);
          continue;
        }

        const existing = await prisma.supplierProductMapping.findUnique({
          where: {
            shop_supplierId_sku: {
              shop: params.shop,
              supplierId: supplier.id,
              sku,
            },
          },
        });

        const qty = typeof available === "number" ? available : 0;

        if (existing) {
          await prisma.supplierProductMapping.update({
            where: { id: existing.id },
            data: {
              productTitle: product.title,
              imageUrl: product.featuredImage?.url || existing.imageUrl,
              shopifyVariantId: variant.id,
              shopifyInventoryItemId: inventoryItemId,
              shopifyLocationId: locationId,
              shopifyQuantity: qty,
              syncStatus: "synced",
              lastSyncedAt: new Date(),
            },
          });
          result.updated += 1;
        } else {
          await prisma.supplierProductMapping.create({
            data: {
              shop: params.shop,
              supplierId: supplier.id,
              sku,
              productTitle: product.title,
              imageUrl: product.featuredImage?.url || null,
              shopifyVariantId: variant.id,
              shopifyInventoryItemId: inventoryItemId,
              shopifyLocationId: locationId,
              supplierQuantity: qty,
              shopifyQuantity: qty,
              syncStatus: "synced",
              lastSyncedAt: new Date(),
            },
          });
          result.imported += 1;
        }

        result.previews.push(preview);
      }
    }

    hasNext = Boolean(connection?.pageInfo?.hasNextPage);
    cursor = connection?.pageInfo?.endCursor || null;
  }

  logger.info("shopify_products_imported", {
    shop: params.shop,
    supplierId: supplier.id,
    imported: result.imported,
    updated: result.updated,
    skipped: result.skipped,
  });

  return result;
}
