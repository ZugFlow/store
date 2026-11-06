import prisma from "../../db.server";
import {
  SUPPLIER_PAYLOAD_MAX_BYTES,
  SUPPLIER_TIMESTAMP_TOLERANCE_MS,
} from "../../lib/config";
import { verifySignature } from "../../lib/hmac";
import { checkRateLimit } from "../../lib/rate-limit";

export type SupplierAuthFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

export type SupplierAuthSuccess = {
  ok: true;
  shop: string;
  supplierId: string;
  supplierExternalId: string;
  rawBody: string;
};

export type SupplierAuthResult = SupplierAuthSuccess | SupplierAuthFailure;

/**
 * Authenticates a supplier inventory-update request.
 * Headers:
 * - X-ArtSync-Shop
 * - X-ArtSync-Supplier-Id (externalId)
 * - X-ArtSync-Timestamp (ISO-8601)
 * - X-ArtSync-Signature (hex HMAC-SHA256 of `${timestamp}.${rawBody}`)
 */
export async function authenticateSupplierRequest(
  request: Request,
): Promise<SupplierAuthResult> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > SUPPLIER_PAYLOAD_MAX_BYTES) {
    return {
      ok: false,
      status: 413,
      code: "payload_too_large",
      message: "Payload too large",
    };
  }

  const shop = request.headers.get("x-artsync-shop")?.trim();
  const supplierExternalId = request.headers
    .get("x-artsync-supplier-id")
    ?.trim();
  const timestamp = request.headers.get("x-artsync-timestamp")?.trim();
  const signature = request.headers.get("x-artsync-signature")?.trim();

  if (!shop || !supplierExternalId || !timestamp || !signature) {
    return {
      ok: false,
      status: 401,
      code: "missing_auth_headers",
      message: "Missing authentication headers",
    };
  }

  const rate = checkRateLimit(`${shop}:${supplierExternalId}`);
  if (!rate.allowed) {
    return {
      ok: false,
      status: 429,
      code: "rate_limited",
      message: "Too many requests",
    };
  }

  const ts = Date.parse(timestamp);
  if (Number.isNaN(ts)) {
    return {
      ok: false,
      status: 401,
      code: "invalid_timestamp",
      message: "Invalid timestamp",
    };
  }

  const skew = Math.abs(Date.now() - ts);
  if (skew > SUPPLIER_TIMESTAMP_TOLERANCE_MS) {
    return {
      ok: false,
      status: 401,
      code: "timestamp_expired",
      message: "Timestamp outside allowed window",
    };
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > SUPPLIER_PAYLOAD_MAX_BYTES) {
    return {
      ok: false,
      status: 413,
      code: "payload_too_large",
      message: "Payload too large",
    };
  }

  const supplier = await prisma.supplier.findUnique({
    where: { shop_externalId: { shop, externalId: supplierExternalId } },
    include: { credentials: true },
  });

  if (!supplier?.credentials) {
    return {
      ok: false,
      status: 401,
      code: "invalid_credentials",
      message: "Invalid credentials",
    };
  }

  const valid = verifySignature(
    supplier.credentials.secretHash,
    timestamp,
    rawBody,
    signature,
  );

  if (!valid) {
    return {
      ok: false,
      status: 401,
      code: "invalid_signature",
      message: "Invalid signature",
    };
  }

  return {
    ok: true,
    shop,
    supplierId: supplier.id,
    supplierExternalId,
    rawBody,
  };
}
