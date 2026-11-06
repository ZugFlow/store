import prisma from "../../db.server";
import { logger } from "../../lib/logger";
import type {
  SetQuantityInput,
  SetQuantityResult,
  ShopifyInventoryClient,
  VariantBySku,
} from "./types";

/**
 * In-process Shopify stand-in backed by MockInventoryLevel.
 * Used when ARTSync_MODE=mock — never calls Shopify Admin API.
 */
export class MockShopifyInventoryClient implements ShopifyInventoryClient {
  readonly mode = "mock" as const;

  /** Injected failure modes for tests / demo edge cases. */
  failNext: null | "api_error" | "cas_conflict" | "rate_limited" = null;

  async getAvailableQuantity(
    shop: string,
    inventoryItemId: string,
    locationId: string,
  ): Promise<number> {
    const row = await prisma.mockInventoryLevel.findUnique({
      where: {
        shop_inventoryItemId_locationId: {
          shop,
          inventoryItemId,
          locationId,
        },
      },
    });
    return row?.available ?? 0;
  }

  async setAvailableQuantity(input: SetQuantityInput): Promise<SetQuantityResult> {
    if (this.failNext === "api_error") {
      this.failNext = null;
      return {
        ok: false,
        kind: "api_error",
        message: "Simulated Shopify API error",
        retryable: true,
      };
    }
    if (this.failNext === "rate_limited") {
      this.failNext = null;
      return {
        ok: false,
        kind: "rate_limited",
        message: "Simulated rate limit",
        retryable: true,
      };
    }
    if (this.failNext === "cas_conflict") {
      this.failNext = null;
      return {
        ok: false,
        kind: "cas_conflict",
        code: "CHANGE_FROM_QUANTITY_STALE",
        message: "Simulated CAS conflict",
        retryable: true,
      };
    }

    const current = await this.getAvailableQuantity(
      input.shop,
      input.inventoryItemId,
      input.locationId,
    );

    if (current !== input.changeFromQuantity) {
      logger.warn("mock_cas_conflict", {
        current,
        expected: input.changeFromQuantity,
        inventoryItemId: input.inventoryItemId,
      });
      return {
        ok: false,
        kind: "cas_conflict",
        code: "CHANGE_FROM_QUANTITY_STALE",
        message: `Expected quantity ${input.changeFromQuantity} but found ${current}`,
        retryable: true,
      };
    }

    await prisma.mockInventoryLevel.upsert({
      where: {
        shop_inventoryItemId_locationId: {
          shop: input.shop,
          inventoryItemId: input.inventoryItemId,
          locationId: input.locationId,
        },
      },
      create: {
        shop: input.shop,
        inventoryItemId: input.inventoryItemId,
        locationId: input.locationId,
        available: input.quantity,
      },
      update: { available: input.quantity },
    });

    logger.info("mock_inventory_set", {
      shop: input.shop,
      inventoryItemId: input.inventoryItemId,
      from: current,
      to: input.quantity,
      idempotencyKey: input.idempotencyKey,
    });

    return {
      ok: true,
      quantityAfter: input.quantity,
      delta: input.quantity - current,
    };
  }

  async findVariantBySku(shop: string, sku: string): Promise<VariantBySku | null> {
    const mapping = await prisma.supplierProductMapping.findFirst({
      where: { shop, sku },
    });
    if (!mapping?.shopifyVariantId || !mapping.shopifyInventoryItemId) {
      return null;
    }
    return {
      variantId: mapping.shopifyVariantId,
      inventoryItemId: mapping.shopifyInventoryItemId,
      sku: mapping.sku,
      title: mapping.productTitle,
      productTitle: mapping.productTitle,
    };
  }

  async listPrimaryLocationId(shop: string): Promise<string | null> {
    const mapping = await prisma.supplierProductMapping.findFirst({
      where: { shop, shopifyLocationId: { not: null } },
    });
    return mapping?.shopifyLocationId ?? `gid://shopify/Location/mock-${shop}`;
  }
}

let singleton: MockShopifyInventoryClient | null = null;

export function getMockShopifyClient(): MockShopifyInventoryClient {
  if (!singleton) singleton = new MockShopifyInventoryClient();
  return singleton;
}

export function resetMockShopifyClient() {
  singleton = new MockShopifyInventoryClient();
}
