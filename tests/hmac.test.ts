import { describe, expect, it } from "vitest";
import { signPayload, verifySignature } from "../app/lib/hmac";

describe("HMAC supplier signatures", () => {
  it("accepts a valid signature", () => {
    const secret = "test-secret";
    const ts = "2026-11-06T09:00:00.000Z";
    const body = '{"eventId":"evt-1"}';
    const sig = signPayload(secret, ts, body);
    expect(verifySignature(secret, ts, body, sig)).toBe(true);
  });

  it("rejects an invalid signature", () => {
    const secret = "test-secret";
    const ts = "2026-11-06T09:00:00.000Z";
    const body = '{"eventId":"evt-1"}';
    expect(verifySignature(secret, ts, body, "deadbeef")).toBe(false);
  });
});
