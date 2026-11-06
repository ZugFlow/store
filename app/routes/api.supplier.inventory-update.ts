import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { inventoryUpdateSchema } from "../lib/validation";
import { logger } from "../lib/logger";
import { isMockMode } from "../lib/config";
import { authenticateSupplierRequest } from "../services/suppliers/authenticate";
import { createShopifyInventoryClient } from "../services/shopify/factory";
import { syncSupplierInventory } from "../services/sync/sync-supplier-inventory";
import { unauthenticated } from "../shopify.server";

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export const loader = async (_args: LoaderFunctionArgs) => {
  return json(
    {
      service: "ArtSync supplier inventory API",
      method: "POST",
      path: "/api/supplier/inventory-update",
    },
    200,
  );
};

/**
 * POST /api/supplier/inventory-update
 * Server-to-server endpoint for supplier inventory events.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const auth = await authenticateSupplierRequest(request);
  if (!auth.ok) {
    logger.warn("supplier_auth_failed", {
      code: auth.code,
      status: auth.status,
    });
    return json(
      { ok: false, error: auth.code, message: auth.message },
      auth.status,
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(auth.rawBody);
  } catch {
    return json(
      { ok: false, error: "invalid_json", message: "Invalid JSON body" },
      400,
    );
  }

  const parsed = inventoryUpdateSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return json(
      {
        ok: false,
        error: "validation_error",
        message: "Invalid payload",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      400,
    );
  }

  // Body supplierId must match authenticated supplier.
  if (parsed.data.supplierId !== auth.supplierExternalId) {
    return json(
      {
        ok: false,
        error: "supplier_mismatch",
        message: "supplierId does not match credentials",
      },
      403,
    );
  }

  // LIVE uses the offline session installed for this shop (template API).
  // MOCK never opens a real Admin GraphQL client.
  let client;
  try {
    if (isMockMode()) {
      client = createShopifyInventoryClient();
    } else {
      const { admin } = await unauthenticated.admin(auth.shop);
      client = createShopifyInventoryClient(admin);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Shopify session unavailable";
    logger.error("supplier_shopify_client_failed", {
      shop: auth.shop,
      message,
    });
    return json(
      {
        ok: false,
        error: "shopify_session_missing",
        message:
          "No offline Shopify session for this shop. Install the app on the store first.",
      },
      503,
    );
  }

  const result = await syncSupplierInventory({
    shop: auth.shop,
    payload: parsed.data,
    client,
  });

  logger.info("supplier_inventory_update", {
    shop: auth.shop,
    eventId: parsed.data.eventId,
    status: result.status,
    mode: client.mode,
  });

  return json(
    {
      ok: result.status === "succeeded" || result.status === "duplicate" || result.status === "stale",
      status: result.status,
      message: result.message,
      eventId: parsed.data.eventId,
      previousQuantity: result.previousQuantity,
      newQuantity: result.newQuantity,
    },
    result.httpStatus,
  );
};
