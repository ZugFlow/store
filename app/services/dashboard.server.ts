import prisma from "../db.server";

export async function getDashboardStats(shop: string) {
  const [
    suppliersConnected,
    productsMonitored,
    succeeded,
    failed,
    lastSync,
    recentEvents,
  ] = await Promise.all([
    prisma.supplier.count({ where: { shop, status: "active" } }),
    prisma.supplierProductMapping.count({ where: { shop } }),
    prisma.inventorySyncEvent.count({ where: { shop, status: "succeeded" } }),
    prisma.inventorySyncEvent.count({ where: { shop, status: "failed" } }),
    prisma.inventorySyncEvent.findFirst({
      where: { shop, status: "succeeded" },
      orderBy: { processedAt: "desc" },
    }),
    prisma.inventorySyncLog.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { supplier: true },
    }),
  ]);

  return {
    suppliersConnected,
    productsMonitored,
    succeeded,
    failed,
    lastSyncAt: lastSync?.processedAt?.toISOString() ?? null,
    recentEvents: recentEvents.map((e) => ({
      id: e.id,
      createdAt: e.createdAt.toISOString(),
      eventId: e.eventId,
      supplier: e.supplier?.name ?? "—",
      sku: e.sku,
      previousQuantity: e.previousQuantity,
      newQuantity: e.newQuantity,
      outcome: e.outcome,
      message: e.message,
    })),
  };
}

export async function listSuppliers(shop: string) {
  const rows = await prisma.supplier.findMany({
    where: { shop },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { products: true } },
      credentials: { select: { secretLastFour: true } },
    },
  });

  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    externalId: s.externalId,
    status: s.status,
    mode: s.mode,
    productsLinked: s._count.products,
    lastSyncAt: s.lastSyncAt?.toISOString() ?? null,
    secretLastFour: s.credentials?.secretLastFour ?? null,
  }));
}

export async function listProducts(shop: string) {
  const rows = await prisma.supplierProductMapping.findMany({
    where: { shop },
    orderBy: { productTitle: "asc" },
    include: { supplier: true },
  });

  return rows.map((p) => ({
    id: p.id,
    imageUrl: p.imageUrl,
    title: p.productTitle,
    sku: p.sku,
    supplierName: p.supplier.name,
    supplierId: p.supplierId,
    supplierQuantity: p.supplierQuantity,
    shopifyQuantity: p.shopifyQuantity,
    syncStatus: p.syncStatus,
    lastSyncedAt: p.lastSyncedAt?.toISOString() ?? null,
  }));
}

export async function listLogs(shop: string, take = 100) {
  const rows = await prisma.inventorySyncLog.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take,
    include: { supplier: true },
  });

  return rows.map((l) => ({
    id: l.id,
    createdAt: l.createdAt.toISOString(),
    eventId: l.eventId,
    supplier: l.supplier?.name ?? "—",
    sku: l.sku,
    previousQuantity: l.previousQuantity,
    newQuantity: l.newQuantity,
    outcome: l.outcome,
    message: l.message,
  }));
}
