import type { LoaderFunctionArgs } from "react-router";
import { getDemoShop, isMockMode } from "../lib/config";
import { ensureDemoSeeded } from "./demo/seed";
import { createShopifyInventoryClient } from "./shopify/factory";
import type { ShopifyInventoryClient } from "./shopify/types";

export type ShopContext = {
  shop: string;
  mode: "mock" | "live";
  client: ShopifyInventoryClient;
  /** Present only in live mode */
  admin?: {
    graphql: (
      query: string,
      options?: { variables?: Record<string, unknown> },
    ) => Promise<Response>;
  };
};

/**
 * Resolves shop + Shopify adapter for authenticated app routes.
 * In mock mode, skips Shopify OAuth and seeds demo data.
 */
export async function requireShopContext(
  request: Request,
  authenticateAdmin: (request: Request) => Promise<{
    session: { shop: string };
    admin: ShopContext["admin"];
  }>,
): Promise<ShopContext> {
  if (isMockMode()) {
    const shop = getDemoShop();
    await ensureDemoSeeded(shop);
    return {
      shop,
      mode: "mock",
      client: createShopifyInventoryClient(),
    };
  }

  const { session, admin } = await authenticateAdmin(request);
  return {
    shop: session.shop,
    mode: "live",
    admin,
    client: createShopifyInventoryClient(admin),
  };
}

export async function loadShopContext(
  args: LoaderFunctionArgs,
  authenticateAdmin: (request: Request) => Promise<{
    session: { shop: string };
    admin: ShopContext["admin"];
  }>,
) {
  return requireShopContext(args.request, authenticateAdmin);
}
