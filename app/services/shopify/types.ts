export type ShopifyUserError = {
  code?: string | null;
  field?: string[] | null;
  message: string;
};

export type InventoryQuantityResult = {
  inventoryItemId: string;
  locationId: string;
  available: number;
};

export type SetQuantityInput = {
  shop: string;
  inventoryItemId: string;
  locationId: string;
  quantity: number;
  changeFromQuantity: number;
  idempotencyKey: string;
  referenceDocumentUri: string;
  reason?: string;
};

export type SetQuantitySuccess = {
  ok: true;
  quantityAfter: number;
  delta: number;
};

export type SetQuantityFailure = {
  ok: false;
  kind: "cas_conflict" | "user_error" | "api_error" | "rate_limited" | "transient";
  code?: string;
  message: string;
  retryable: boolean;
};

export type SetQuantityResult = SetQuantitySuccess | SetQuantityFailure;

export type VariantBySku = {
  variantId: string;
  inventoryItemId: string;
  sku: string;
  title: string;
  productTitle: string;
};

/**
 * Adapter boundary: real GraphQL vs in-process mock.
 * Mock never mutates a live Shopify store.
 */
export interface ShopifyInventoryClient {
  readonly mode: "mock" | "live";
  getAvailableQuantity(
    shop: string,
    inventoryItemId: string,
    locationId: string,
  ): Promise<number>;
  setAvailableQuantity(input: SetQuantityInput): Promise<SetQuantityResult>;
  findVariantBySku(shop: string, sku: string): Promise<VariantBySku | null>;
  listPrimaryLocationId(shop: string): Promise<string | null>;
}
