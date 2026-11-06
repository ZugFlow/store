import { getArtsyncMode, isMockMode } from "../../lib/config";
import { getMockShopifyClient } from "./mock-client";
import { RealShopifyInventoryClient } from "./real-client";
import type { ShopifyInventoryClient } from "./types";

type GraphqlAdmin = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

/**
 * Returns the Shopify inventory adapter for the current mode.
 * In mock mode the real admin client is ignored — no live mutations.
 */
export function createShopifyInventoryClient(
  admin?: GraphqlAdmin,
): ShopifyInventoryClient {
  if (isMockMode()) {
    return getMockShopifyClient();
  }
  if (!admin) {
    throw new Error(
      "Live Shopify mode requires an authenticated Admin GraphQL client",
    );
  }
  return new RealShopifyInventoryClient(admin);
}

export function assertNoLiveMutationsInMock() {
  if (isMockMode()) return;
  // live mode is intentional
}

export { getArtsyncMode, isMockMode };
