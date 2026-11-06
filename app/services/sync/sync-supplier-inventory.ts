import prisma from "../../db.server";
import {
  SYNC_MAX_RETRIES,
  SYNC_RETRY_BASE_MS,
} from "../../lib/config";
import { logger } from "../../lib/logger";
import type { InventoryUpdatePayload } from "../../lib/validation";
import type { ShopifyInventoryClient } from "../shopify/types";

export type SyncResult = {
  status:
    | "succeeded"
    | "failed"
    | "duplicate"
    | "stale"
    | "rejected"
    | "not_found";
  eventDbId?: string;
  message: string;
  previousQuantity?: number;
  newQuantity?: number;
  httpStatus: number;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function idempotencyKeyFor(shop: string, eventId: string): string {
  // Stable per distinct supplier event — retries reuse the same key.
  return `artsync:${shop}:${eventId}`;
}

async function writeLog(params: {
  shop: string;
  eventId?: string;
  syncEventId?: string;
  supplierId?: string;
  sku?: string;
  previousQuantity?: number | null;
  newQuantity?: number | null;
  outcome: string;
  message?: string;
}) {
  await prisma.inventorySyncLog.create({
    data: {
      shop: params.shop,
      eventId: params.eventId,
      syncEventId: params.syncEventId,
      supplierId: params.supplierId,
      sku: params.sku,
      previousQuantity: params.previousQuantity ?? null,
      newQuantity: params.newQuantity ?? null,
      outcome: params.outcome,
      message: params.message,
    },
  });
}

/**
 * Core sync pipeline shared by supplier API and demo simulator.
 */
export async function syncSupplierInventory(params: {
  shop: string;
  payload: InventoryUpdatePayload;
  client: ShopifyInventoryClient;
}): Promise<SyncResult> {
  const { shop, payload, client } = params;
  const { eventId, supplierId: supplierExternalId, sku, quantity } = payload;
  const eventTimestamp = new Date(payload.timestamp);

  const supplier = await prisma.supplier.findUnique({
    where: {
      shop_externalId: { shop, externalId: supplierExternalId },
    },
  });

  if (!supplier) {
    await writeLog({
      shop,
      eventId,
      sku,
      outcome: "rejected",
      message: "Unknown supplier",
    });
    return {
      status: "rejected",
      message: "Unknown supplier",
      httpStatus: 404,
    };
  }

  if (supplier.status !== "active") {
    await writeLog({
      shop,
      eventId,
      supplierId: supplier.id,
      sku,
      outcome: "rejected",
      message: "Supplier inactive",
    });
    return {
      status: "rejected",
      message: "Supplier inactive",
      httpStatus: 403,
    };
  }

  const existing = await prisma.inventorySyncEvent.findUnique({
    where: { shop_eventId: { shop, eventId } },
  });

  if (existing) {
    await writeLog({
      shop,
      eventId,
      syncEventId: existing.id,
      supplierId: supplier.id,
      sku,
      previousQuantity: existing.previousQuantity,
      newQuantity: existing.newQuantity,
      outcome: "duplicate",
      message: "Duplicate eventId — no inventory change",
    });
    return {
      status: "duplicate",
      eventDbId: existing.id,
      message: "Duplicate event acknowledged",
      previousQuantity: existing.previousQuantity ?? undefined,
      newQuantity: existing.newQuantity ?? undefined,
      httpStatus: 200,
    };
  }

  const mapping = await prisma.supplierProductMapping.findUnique({
    where: {
      shop_supplierId_sku: {
        shop,
        supplierId: supplier.id,
        sku,
      },
    },
  });

  if (!mapping || !mapping.shopifyInventoryItemId || !mapping.shopifyLocationId) {
    const event = await prisma.inventorySyncEvent.create({
      data: {
        shop,
        eventId,
        supplierId: supplier.id,
        sku,
        quantity,
        eventTimestamp,
        status: "failed",
        attempts: 1,
        errorMessage: "SKU mapping not found",
        rawPayload: JSON.stringify(payload),
        processedAt: new Date(),
      },
    });
    await writeLog({
      shop,
      eventId,
      syncEventId: event.id,
      supplierId: supplier.id,
      sku,
      outcome: "failed",
      message: "SKU mapping not found",
    });
    return {
      status: "not_found",
      eventDbId: event.id,
      message: "SKU mapping not found",
      httpStatus: 404,
    };
  }

  // Out-of-order protection: ignore older events for same SKU mapping.
  const newer = await prisma.inventorySyncEvent.findFirst({
    where: {
      shop,
      supplierId: supplier.id,
      sku,
      status: "succeeded",
      eventTimestamp: { gt: eventTimestamp },
    },
    orderBy: { eventTimestamp: "desc" },
  });

  if (newer) {
    const event = await prisma.inventorySyncEvent.create({
      data: {
        shop,
        eventId,
        supplierId: supplier.id,
        sku,
        quantity,
        eventTimestamp,
        status: "stale",
        attempts: 1,
        previousQuantity: mapping.shopifyQuantity,
        newQuantity: mapping.shopifyQuantity,
        errorMessage: "Stale event — newer sync already applied",
        rawPayload: JSON.stringify(payload),
        processedAt: new Date(),
      },
    });
    await writeLog({
      shop,
      eventId,
      syncEventId: event.id,
      supplierId: supplier.id,
      sku,
      previousQuantity: mapping.shopifyQuantity,
      newQuantity: mapping.shopifyQuantity,
      outcome: "stale",
      message: "Out-of-order event ignored",
    });
    return {
      status: "stale",
      eventDbId: event.id,
      message: "Stale event ignored",
      previousQuantity: mapping.shopifyQuantity,
      newQuantity: mapping.shopifyQuantity,
      httpStatus: 200,
    };
  }

  const event = await prisma.inventorySyncEvent.create({
    data: {
      shop,
      eventId,
      supplierId: supplier.id,
      sku,
      quantity,
      eventTimestamp,
      status: "processing",
      attempts: 0,
      idempotencyKey: idempotencyKeyFor(shop, eventId),
      rawPayload: JSON.stringify(payload),
    },
  });

  let lastError = "Unknown failure";
  let previousQuantity = mapping.shopifyQuantity;

  for (let attempt = 1; attempt <= SYNC_MAX_RETRIES; attempt++) {
    await prisma.inventorySyncEvent.update({
      where: { id: event.id },
      data: { attempts: attempt },
    });

    try {
      previousQuantity = await client.getAvailableQuantity(
        shop,
        mapping.shopifyInventoryItemId,
        mapping.shopifyLocationId,
      );

      const setResult = await client.setAvailableQuantity({
        shop,
        inventoryItemId: mapping.shopifyInventoryItemId,
        locationId: mapping.shopifyLocationId,
        quantity,
        changeFromQuantity: previousQuantity,
        idempotencyKey: idempotencyKeyFor(shop, eventId),
        referenceDocumentUri: `gid://artsync/InventorySyncEvent/${eventId}`,
        reason: "correction",
      });

      if (setResult.ok) {
        await prisma.$transaction([
          prisma.inventorySyncEvent.update({
            where: { id: event.id },
            data: {
              status: "succeeded",
              previousQuantity,
              newQuantity: setResult.quantityAfter,
              errorMessage: null,
              processedAt: new Date(),
            },
          }),
          prisma.supplierProductMapping.update({
            where: { id: mapping.id },
            data: {
              supplierQuantity: quantity,
              shopifyQuantity: setResult.quantityAfter,
              syncStatus: "synced",
              lastSyncedAt: new Date(),
            },
          }),
          prisma.supplier.update({
            where: { id: supplier.id },
            data: { lastSyncAt: new Date() },
          }),
        ]);

        await writeLog({
          shop,
          eventId,
          syncEventId: event.id,
          supplierId: supplier.id,
          sku,
          previousQuantity,
          newQuantity: setResult.quantityAfter,
          outcome: "succeeded",
          message: `Synced via ${client.mode} adapter`,
        });

        logger.info("sync_succeeded", {
          shop,
          eventId,
          sku,
          mode: client.mode,
          previousQuantity,
          newQuantity: setResult.quantityAfter,
        });

        return {
          status: "succeeded",
          eventDbId: event.id,
          message: "Inventory synchronized",
          previousQuantity,
          newQuantity: setResult.quantityAfter,
          httpStatus: 200,
        };
      }

      lastError = setResult.message;

      if (setResult.kind === "cas_conflict") {
        await writeLog({
          shop,
          eventId,
          syncEventId: event.id,
          supplierId: supplier.id,
          sku,
          previousQuantity,
          outcome: "retry",
          message: `CAS conflict on attempt ${attempt}`,
        });
        await sleep(SYNC_RETRY_BASE_MS * 2 ** (attempt - 1));
        continue;
      }

      if (setResult.retryable && attempt < SYNC_MAX_RETRIES) {
        await writeLog({
          shop,
          eventId,
          syncEventId: event.id,
          supplierId: supplier.id,
          sku,
          outcome: "retry",
          message: `${setResult.kind}: ${setResult.message}`,
        });
        await sleep(SYNC_RETRY_BASE_MS * 2 ** (attempt - 1));
        continue;
      }

      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unexpected error";
      logger.error("sync_attempt_failed", { eventId, attempt, message: lastError });
      if (attempt < SYNC_MAX_RETRIES) {
        await sleep(SYNC_RETRY_BASE_MS * 2 ** (attempt - 1));
        continue;
      }
    }
  }

  await prisma.$transaction([
    prisma.inventorySyncEvent.update({
      where: { id: event.id },
      data: {
        status: "failed",
        previousQuantity,
        errorMessage: lastError,
        processedAt: new Date(),
      },
    }),
    prisma.supplierProductMapping.update({
      where: { id: mapping.id },
      data: { syncStatus: "failed" },
    }),
  ]);

  await writeLog({
    shop,
    eventId,
    syncEventId: event.id,
    supplierId: supplier.id,
    sku,
    previousQuantity,
    outcome: "failed",
    message: lastError,
  });

  return {
    status: "failed",
    eventDbId: event.id,
    message: lastError,
    previousQuantity,
    httpStatus: 502,
  };
}

/**
 * Safe retry of a previously failed event — reuses same eventId / idempotency key.
 */
export async function retryFailedSyncEvent(params: {
  shop: string;
  eventDbId: string;
  client: ShopifyInventoryClient;
}): Promise<SyncResult> {
  const event = await prisma.inventorySyncEvent.findFirst({
    where: { id: params.eventDbId, shop: params.shop },
    include: { supplier: true },
  });

  if (!event) {
    return { status: "not_found", message: "Event not found", httpStatus: 404 };
  }

  if (event.status === "succeeded" || event.status === "duplicate") {
    return {
      status: "duplicate",
      eventDbId: event.id,
      message: "Event already completed",
      httpStatus: 200,
    };
  }

  // Allow re-processing by clearing the unique row and recreating via pipeline
  // while keeping the same eventId (idempotent toward Shopify).
  const payload: InventoryUpdatePayload = {
    eventId: event.eventId,
    supplierId: event.supplier.externalId,
    sku: event.sku,
    quantity: event.quantity,
    timestamp: event.eventTimestamp.toISOString(),
  };

  await prisma.inventorySyncLog.create({
    data: {
      shop: params.shop,
      eventId: event.eventId,
      syncEventId: event.id,
      supplierId: event.supplierId,
      sku: event.sku,
      outcome: "retry",
      message: "Manual retry requested",
    },
  });

  await prisma.inventorySyncEvent.delete({ where: { id: event.id } });

  return syncSupplierInventory({
    shop: params.shop,
    payload,
    client: params.client,
  });
}
