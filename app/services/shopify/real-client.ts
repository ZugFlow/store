import { logger } from "../../lib/logger";
import type {
  SetQuantityInput,
  SetQuantityResult,
  ShopifyInventoryClient,
  VariantBySku,
} from "./types";

type GraphqlAdmin = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const SET_QUANTITIES = `#graphql
mutation inventorySetQuantities($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
  inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
    inventoryAdjustmentGroup {
      reason
      referenceDocumentUri
      changes {
        name
        delta
        quantityAfterChange
      }
    }
    userErrors {
      code
      field
      message
    }
  }
}`;

const GET_LEVEL = `#graphql
query inventoryLevel($inventoryItemId: ID!, $locationId: ID!) {
  inventoryItem(id: $inventoryItemId) {
    id
    inventoryLevel(locationId: $locationId) {
      quantities(names: ["available"]) {
        name
        quantity
      }
    }
  }
}`;

const FIND_SKU = `#graphql
query findVariantBySku($query: String!) {
  productVariants(first: 1, query: $query) {
    nodes {
      id
      sku
      title
      product { title }
      inventoryItem { id }
    }
  }
}`;

const PRIMARY_LOCATION = `#graphql
query primaryLocation {
  locations(first: 1, query: "active:true") {
    nodes { id name }
  }
}`;

/**
 * Live Shopify Admin GraphQL client (API 2026-10).
 * Requires an authenticated admin GraphQL handle from the Shopify app package.
 */
export class RealShopifyInventoryClient implements ShopifyInventoryClient {
  readonly mode = "live" as const;

  constructor(private readonly admin: GraphqlAdmin) {}

  async getAvailableQuantity(
    _shop: string,
    inventoryItemId: string,
    locationId: string,
  ): Promise<number> {
    const response = await this.admin.graphql(GET_LEVEL, {
      variables: { inventoryItemId, locationId },
    });
    const json = await response.json();
    if (json.errors?.length) {
      throw new Error(json.errors[0]?.message || "Shopify GraphQL error");
    }
    const qty =
      json.data?.inventoryItem?.inventoryLevel?.quantities?.find(
        (q: { name: string }) => q.name === "available",
      )?.quantity ?? 0;
    return Number(qty);
  }

  async setAvailableQuantity(input: SetQuantityInput): Promise<SetQuantityResult> {
    try {
      const response = await this.admin.graphql(SET_QUANTITIES, {
        variables: {
          input: {
            name: "available",
            reason: input.reason || "correction",
            referenceDocumentUri: input.referenceDocumentUri,
            quantities: [
              {
                inventoryItemId: input.inventoryItemId,
                locationId: input.locationId,
                quantity: input.quantity,
                changeFromQuantity: input.changeFromQuantity,
              },
            ],
          },
          idempotencyKey: input.idempotencyKey,
        },
      });

      if (response.status === 429) {
        return {
          ok: false,
          kind: "rate_limited",
          message: "Shopify rate limit exceeded",
          retryable: true,
        };
      }

      const json = await response.json();
      if (json.errors?.length) {
        const msg = json.errors[0]?.message || "Shopify GraphQL error";
        const transient = /throttl|timeout|unavailable|5\d\d/i.test(msg);
        return {
          ok: false,
          kind: transient ? "transient" : "api_error",
          message: msg,
          retryable: transient,
        };
      }

      const payload = json.data?.inventorySetQuantities;
      const userErrors = payload?.userErrors || [];
      if (userErrors.length) {
        const err = userErrors[0];
        const code = err.code || "";
        if (
          code === "CHANGE_FROM_QUANTITY_STALE" ||
          /stale|compare/i.test(err.message || "")
        ) {
          return {
            ok: false,
            kind: "cas_conflict",
            code,
            message: err.message,
            retryable: true,
          };
        }
        return {
          ok: false,
          kind: "user_error",
          code,
          message: err.message,
          retryable: false,
        };
      }

      const change = payload?.inventoryAdjustmentGroup?.changes?.find(
        (c: { name: string }) => c.name === "available",
      );
      const quantityAfter =
        typeof change?.quantityAfterChange === "number"
          ? change.quantityAfterChange
          : input.quantity;

      logger.info("shopify_inventory_set", {
        inventoryItemId: input.inventoryItemId,
        quantity: input.quantity,
        idempotencyKey: input.idempotencyKey,
      });

      return {
        ok: true,
        quantityAfter,
        delta: change?.delta ?? input.quantity - input.changeFromQuantity,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("shopify_set_quantity_failed", { message });
      return {
        ok: false,
        kind: "transient",
        message,
        retryable: true,
      };
    }
  }

  async findVariantBySku(_shop: string, sku: string): Promise<VariantBySku | null> {
    const response = await this.admin.graphql(FIND_SKU, {
      variables: { query: `sku:${JSON.stringify(sku)}` },
    });
    const json = await response.json();
    const node = json.data?.productVariants?.nodes?.[0];
    if (!node?.inventoryItem?.id) return null;
    return {
      variantId: node.id,
      inventoryItemId: node.inventoryItem.id,
      sku: node.sku || sku,
      title: node.title,
      productTitle: node.product?.title || node.title,
    };
  }

  async listPrimaryLocationId(_shop: string): Promise<string | null> {
    const response = await this.admin.graphql(PRIMARY_LOCATION);
    const json = await response.json();
    return json.data?.locations?.nodes?.[0]?.id ?? null;
  }
}
