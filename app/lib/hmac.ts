import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

/**
 * Supplier S2S auth: HMAC-SHA256 over `${timestamp}.${rawBody}`.
 * Signature header: hex digest.
 */

export function generateSupplierSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function signPayload(
  secret: string,
  timestamp: string,
  rawBody: string,
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
}

export function verifySignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
): boolean {
  if (!signature || !timestamp) return false;
  const expected = signPayload(secret, timestamp, rawBody);
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(signature, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function secretLastFour(secret: string): string {
  return secret.slice(-4);
}
