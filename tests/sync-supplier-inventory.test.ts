import { beforeEach, describe, expect, it } from "vitest";
import { inventoryUpdateSchema } from "../app/lib/validation";
import { syncSupplierInventory, retryFailedSyncEvent } from "../app/services/sync/sync-supplier-inventory";
import { resetMockShopifyClient } from "../app/services/shopify/mock-client";
import { TEST_SHOP, mockClient, resetTestDb } from "./helpers";

function payload(overrides: Record<string, unknown> = {}) {
  return inventoryUpdateSchema.parse({
    eventId: "evt-10001",
    supplierId: "supplier-atelier-milano",
    sku: "ART-001",
    quantity: 2,
    timestamp: "2026-11-06T09:00:00.000Z",
    ...overrides,
  });
}

describe("syncSupplierInventory (mock)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("1. processes a valid event", async () => {
    const result = await syncSupplierInventory({
      shop: TEST_SHOP,
      payload: payload(),
      client: mockClient(),
    });
    expect(result.status).toBe("succeeded");
    expect(result.previousQuantity).toBe(5);
    expect(result.newQuantity).toBe(2);
  });

  it("2. detects duplicate events", async () => {
    const client = mockClient();
    const p = payload();
    await syncSupplierInventory({ shop: TEST_SHOP, payload: p, client });
    const dup = await syncSupplierInventory({ shop: TEST_SHOP, payload: p, client });
    expect(dup.status).toBe("duplicate");
    expect(dup.newQuantity).toBe(2);
  });

  it("3. rejects unknown SKU", async () => {
    const result = await syncSupplierInventory({
      shop: TEST_SHOP,
      payload: payload({ eventId: "evt-sku", sku: "NO-SUCH-SKU" }),
      client: mockClient(),
    });
    expect(result.status).toBe("not_found");
  });

  it("4. rejects unknown supplier", async () => {
    const result = await syncSupplierInventory({
      shop: TEST_SHOP,
      payload: payload({
        eventId: "evt-sup",
        supplierId: "supplier-does-not-exist",
      }),
      client: mockClient(),
    });
    expect(result.status).toBe("rejected");
  });

  it("5. validation rejects negative quantity", () => {
    const parsed = inventoryUpdateSchema.safeParse({
      eventId: "evt-neg",
      supplierId: "supplier-atelier-milano",
      sku: "ART-001",
      quantity: -1,
      timestamp: "2026-11-06T09:00:00.000Z",
    });
    expect(parsed.success).toBe(false);
  });

  it("8. surfaces Shopify API errors", async () => {
    const client = mockClient();
    client.failNext = "api_error";
    // Force non-retryable path by exhausting retries with persistent failure
    client.failNext = "api_error";
    const original = client.setAvailableQuantity.bind(client);
    let calls = 0;
    client.setAvailableQuantity = async (input) => {
      calls += 1;
      return {
        ok: false as const,
        kind: "api_error" as const,
        message: "Simulated Shopify API error",
        retryable: false,
      };
    };
    const result = await syncSupplierInventory({
      shop: TEST_SHOP,
      payload: payload({ eventId: "evt-api-err" }),
      client,
    });
    client.setAvailableQuantity = original;
    expect(result.status).toBe("failed");
    expect(result.message).toMatch(/Simulated Shopify API error/);
    expect(calls).toBeGreaterThanOrEqual(1);
  });

  it("9. retries CAS conflicts then succeeds", async () => {
    const client = mockClient();
    client.failNext = "cas_conflict";
    const result = await syncSupplierInventory({
      shop: TEST_SHOP,
      payload: payload({ eventId: "evt-cas", quantity: 3 }),
      client,
    });
    expect(result.status).toBe("succeeded");
    expect(result.newQuantity).toBe(3);
  });

  it("10. concurrent updates: second sees CAS and recovers", async () => {
    const client = mockClient();
    const first = syncSupplierInventory({
      shop: TEST_SHOP,
      payload: payload({ eventId: "evt-c1", quantity: 1 }),
      client,
    });
    const second = syncSupplierInventory({
      shop: TEST_SHOP,
      payload: payload({
        eventId: "evt-c2",
        quantity: 4,
        timestamp: "2026-11-06T09:00:01.000Z",
      }),
      client,
    });
    const results = await Promise.all([first, second]);
    const statuses = results.map((r) => r.status).sort();
    // Both should end succeeded thanks to CAS retry, or one may succeed after retry.
    expect(statuses.every((s) => s === "succeeded")).toBe(true);
  });

  it("11. ignores older events received after a newer one", async () => {
    const client = mockClient();
    await syncSupplierInventory({
      shop: TEST_SHOP,
      payload: payload({
        eventId: "evt-new",
        quantity: 8,
        timestamp: "2026-11-06T12:00:00.000Z",
      }),
      client,
    });
    const stale = await syncSupplierInventory({
      shop: TEST_SHOP,
      payload: payload({
        eventId: "evt-old",
        quantity: 1,
        timestamp: "2026-11-06T08:00:00.000Z",
      }),
      client,
    });
    expect(stale.status).toBe("stale");
    expect(stale.newQuantity).toBe(8);
  });

  it("12. retries a failed event safely", async () => {
    const client = mockClient();
    client.setAvailableQuantity = async () => ({
      ok: false as const,
      kind: "api_error" as const,
      message: "boom",
      retryable: false,
    });

    const failed = await syncSupplierInventory({
      shop: TEST_SHOP,
      payload: payload({ eventId: "evt-retry" }),
      client,
    });
    expect(failed.status).toBe("failed");
    expect(failed.eventDbId).toBeTruthy();

    resetMockShopifyClient();
    const retried = await retryFailedSyncEvent({
      shop: TEST_SHOP,
      eventDbId: failed.eventDbId!,
      client: mockClient(),
    });
    expect(retried.status).toBe("succeeded");
  });
});
