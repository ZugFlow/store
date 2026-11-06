import {
  SUPPLIER_RATE_LIMIT_MAX,
  SUPPLIER_RATE_LIMIT_WINDOW_MS,
} from "./config";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + SUPPLIER_RATE_LIMIT_WINDOW_MS };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  const remaining = Math.max(0, SUPPLIER_RATE_LIMIT_MAX - bucket.count);
  return {
    allowed: bucket.count <= SUPPLIER_RATE_LIMIT_MAX,
    remaining,
    resetAt: bucket.resetAt,
  };
}

/** Test helper */
export function resetRateLimits() {
  buckets.clear();
}
