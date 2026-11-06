import { beforeEach, describe, expect, it } from "vitest";
import { signPayload } from "../app/lib/hmac";
import { authenticateSupplierRequest } from "../app/services/suppliers/authenticate";
import { demoSecretFor } from "../app/services/demo/seed";
import { TEST_SHOP, resetTestDb } from "./helpers";

function buildRequest(opts: {
  body: string;
  timestamp?: string;
  signature?: string;
  supplierId?: string;
  shop?: string;
}) {
  const timestamp = opts.timestamp ?? new Date().toISOString();
  const supplierId = opts.supplierId ?? "supplier-petcare-nord";
  const secret = demoSecretFor(supplierId);
  const signature =
    opts.signature ?? signPayload(secret, timestamp, opts.body);

  return new Request("http://localhost/api/supplier/inventory-update", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ArtSync-Shop": opts.shop ?? TEST_SHOP,
      "X-ArtSync-Supplier-Id": supplierId,
      "X-ArtSync-Timestamp": timestamp,
      "X-ArtSync-Signature": signature,
    },
    body: opts.body,
  });
}

describe("supplier authentication", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("5. rejects invalid signature", async () => {
    const body = JSON.stringify({ hello: "world" });
    const result = await authenticateSupplierRequest(
      buildRequest({ body, signature: "00".repeat(32) }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid_signature");
      expect(result.status).toBe(401);
    }
  });

  it("6. rejects expired timestamp", async () => {
    const body = JSON.stringify({ hello: "world" });
    const old = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    // Temporarily shrink tolerance via direct old timestamp vs default 1h in setup — use 2 days old
    const veryOld = "2020-01-01T00:00:00.000Z";
    const result = await authenticateSupplierRequest(
      buildRequest({ body, timestamp: veryOld }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("timestamp_expired");
    }
    void old;
  });

  it("accepts a correctly signed request", async () => {
    const body = JSON.stringify({ hello: "world" });
    const result = await authenticateSupplierRequest(buildRequest({ body }));
    expect(result.ok).toBe(true);
  });
});
