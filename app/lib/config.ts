/**
 * ArtSync runtime configuration.
 * MOCK never performs real Shopify mutations.
 */

export type ArtsyncMode = "mock" | "live";

export function getArtsyncMode(): ArtsyncMode {
  const raw = (process.env.ARTSYNC_MODE || "mock").toLowerCase();
  return raw === "live" ? "live" : "mock";
}

export function isMockMode(): boolean {
  return getArtsyncMode() === "mock";
}

/** Default shop domain used for local demo data. */
export function getDemoShop(): string {
  return process.env.ARTSYNC_DEMO_SHOP || "artsync-demo.myshopify.com";
}

/** Max accepted payload size for supplier API (bytes). */
export const SUPPLIER_PAYLOAD_MAX_BYTES = Number(
  process.env.ARTSYNC_PAYLOAD_MAX_BYTES || 16_384,
);

/** Reject supplier requests whose timestamp skew exceeds this (ms). */
export const SUPPLIER_TIMESTAMP_TOLERANCE_MS = Number(
  process.env.ARTSYNC_TIMESTAMP_TOLERANCE_MS || 5 * 60 * 1000,
);

/** Simple in-memory rate limit window. */
export const SUPPLIER_RATE_LIMIT_WINDOW_MS = 60_000;
export const SUPPLIER_RATE_LIMIT_MAX = Number(
  process.env.ARTSYNC_RATE_LIMIT_MAX || 60,
);

export const SYNC_MAX_RETRIES = 3;
export const SYNC_RETRY_BASE_MS = 250;
