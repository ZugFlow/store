import { z } from "zod";

export const inventoryUpdateSchema = z.object({
  eventId: z.string().min(1).max(128),
  supplierId: z.string().min(1).max(128),
  sku: z.string().min(1).max(128),
  quantity: z.number().int().min(0).max(1_000_000),
  timestamp: z.string().datetime({ offset: true }),
});

export type InventoryUpdatePayload = z.infer<typeof inventoryUpdateSchema>;

export const supplierCreateSchema = z.object({
  name: z.string().min(1).max(200),
  externalId: z.string().min(1).max(128).optional(),
});

export const supplierUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const demoSimulateSchema = z.object({
  mappingId: z.string().min(1),
  quantity: z.number().int().min(0).max(1_000_000),
  /** When set, reuse this eventId to demonstrate duplicate detection. */
  eventId: z.string().min(1).max(128).optional(),
});
