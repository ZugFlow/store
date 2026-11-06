import prisma from "../app/db.server";
import { resetRateLimits } from "../app/lib/rate-limit";
import { seedDemoData } from "../app/services/demo/seed";
import {
  getMockShopifyClient,
  resetMockShopifyClient,
} from "../app/services/shopify/mock-client";

export const TEST_SHOP = "artsync-test.myshopify.com";

export async function resetTestDb() {
  resetRateLimits();
  resetMockShopifyClient();

  await prisma.inventorySyncLog.deleteMany({ where: { shop: TEST_SHOP } });
  await prisma.inventorySyncEvent.deleteMany({ where: { shop: TEST_SHOP } });
  await prisma.supplierProductMapping.deleteMany({ where: { shop: TEST_SHOP } });
  await prisma.supplierCredential.deleteMany({
    where: { supplier: { shop: TEST_SHOP } },
  });
  await prisma.supplier.deleteMany({ where: { shop: TEST_SHOP } });
  await prisma.mockInventoryLevel.deleteMany({ where: { shop: TEST_SHOP } });

  return seedDemoData(TEST_SHOP);
}

export function mockClient() {
  return getMockShopifyClient();
}
