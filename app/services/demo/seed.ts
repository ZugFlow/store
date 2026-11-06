import { createHash } from "node:crypto";
import prisma from "../../db.server";
import { getDemoShop } from "../../lib/config";
import { generateSupplierSecret, secretLastFour } from "../../lib/hmac";

/**
 * Deterministic demo secret for a supplier (docs / local demo only).
 * Live deployments should rotate via generateSupplierSecret().
 */
export function demoSecretFor(externalId: string): string {
  return createHash("sha256")
    .update(`artsync-demo-secret:${externalId}`)
    .digest("base64url");
}

const DEMO_SUPPLIERS = [
  {
    externalId: "supplier-atelier-milano",
    name: "Atelier Milano",
    products: [
      {
        sku: "ART-001",
        title: "Limited Edition Abstract 01",
        quantity: 5,
        imageUrl:
          "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png",
      },
      {
        sku: "ART-004",
        title: "Milanese Bronze Relief",
        quantity: 3,
        imageUrl:
          "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png",
      },
    ],
  },
  {
    externalId: "supplier-fine-art-london",
    name: "Fine Art London",
    products: [
      {
        sku: "ART-002",
        title: "Contemporary Sculpture 02",
        quantity: 2,
        imageUrl:
          "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png",
      },
    ],
  },
  {
    externalId: "supplier-luxury-prints-paris",
    name: "Luxury Prints Paris",
    products: [
      {
        sku: "ART-003",
        title: "Fine Art Print 03",
        quantity: 12,
        imageUrl:
          "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png",
      },
    ],
  },
] as const;

export type SeedResult = {
  shop: string;
  suppliers: Array<{ externalId: string; name: string; secret: string }>;
};

/**
 * Idempotent seed for mock demo data. Safe to re-run.
 */
export async function seedDemoData(shop = getDemoShop()): Promise<SeedResult> {
  const secrets: SeedResult["suppliers"] = [];

  for (const def of DEMO_SUPPLIERS) {
    const secret = demoSecretFor(def.externalId);
    secrets.push({
      externalId: def.externalId,
      name: def.name,
      secret,
    });

    const supplier = await prisma.supplier.upsert({
      where: {
        shop_externalId: { shop, externalId: def.externalId },
      },
      create: {
        shop,
        externalId: def.externalId,
        name: def.name,
        status: "active",
        mode: "mock",
      },
      update: {
        name: def.name,
        status: "active",
        mode: "mock",
      },
    });

    await prisma.supplierCredential.upsert({
      where: { supplierId: supplier.id },
      create: {
        supplierId: supplier.id,
        secretHash: secret,
        secretLastFour: secretLastFour(secret),
      },
      update: {
        secretHash: secret,
        secretLastFour: secretLastFour(secret),
        rotatedAt: new Date(),
      },
    });

    for (const product of def.products) {
      const inventoryItemId = `gid://shopify/InventoryItem/mock-${product.sku}`;
      const locationId = `gid://shopify/Location/mock-primary`;
      const variantId = `gid://shopify/ProductVariant/mock-${product.sku}`;

      await prisma.supplierProductMapping.upsert({
        where: {
          shop_supplierId_sku: {
            shop,
            supplierId: supplier.id,
            sku: product.sku,
          },
        },
        create: {
          shop,
          supplierId: supplier.id,
          sku: product.sku,
          productTitle: product.title,
          imageUrl: product.imageUrl,
          shopifyVariantId: variantId,
          shopifyInventoryItemId: inventoryItemId,
          shopifyLocationId: locationId,
          supplierQuantity: product.quantity,
          shopifyQuantity: product.quantity,
          syncStatus: "synced",
          lastSyncedAt: new Date(),
        },
        update: {
          productTitle: product.title,
          imageUrl: product.imageUrl,
          shopifyVariantId: variantId,
          shopifyInventoryItemId: inventoryItemId,
          shopifyLocationId: locationId,
        },
      });

      await prisma.mockInventoryLevel.upsert({
        where: {
          shop_inventoryItemId_locationId: {
            shop,
            inventoryItemId,
            locationId,
          },
        },
        create: {
          shop,
          inventoryItemId,
          locationId,
          available: product.quantity,
        },
        update: {},
      });
    }
  }

  return { shop, suppliers: secrets };
}

export async function ensureDemoSeeded(shop = getDemoShop()) {
  const count = await prisma.supplier.count({ where: { shop, mode: "mock" } });
  if (count === 0) {
    return seedDemoData(shop);
  }
  return {
    shop,
    suppliers: DEMO_SUPPLIERS.map((s) => ({
      externalId: s.externalId,
      name: s.name,
      secret: demoSecretFor(s.externalId),
    })),
  };
}

export { generateSupplierSecret };
