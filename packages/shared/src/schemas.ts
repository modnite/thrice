import { z } from "zod";

export const emailSchema = z.string().trim().email().toLowerCase();

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(200),
});

export const productStatusSchema = z.enum(["PUBLIC", "HIDDEN"]);
export const orderStatusSchema = z.enum(["UPCOMING", "ACTIVE", "COMPLETED", "CANCELLED"]);
export const paymentStatusSchema = z.enum(["PAID", "UNPAID", "PARTIAL"]);
export const orderChannelSchema = z.enum(["ONLINE", "ADMIN", "CHECKIN"]);

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  displayOrder: z.number().int().default(0),
});

export const productInputSchema = z.object({
  name: z.string().trim().min(1).max(300),
  status: productStatusSchema.default("PUBLIC"),
  tags: z.array(z.string().trim().min(1)).default([]),
  salesChannels: z.array(z.string().trim().min(1)).default([]),
  categoryIds: z.array(z.string()).default([]),
  priceFrom: z.coerce.number().min(0),
  deposit: z.coerce.number().min(0).default(0),
  taxPercentage: z.coerce.number().min(0).max(100).optional().nullable(),
});

export const skuInputSchema = z.object({
  productId: z.string(),
  code: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(300),
  trackedIndividually: z.boolean().default(false),
});

export const articleInputSchema = z.object({
  skuId: z.string(),
  articleCode: z.string().trim().min(1).max(100),
  status: z.enum(["IN_USE", "OUT_OF_USE", "LOST"]).default("IN_USE"),
  allocation: z.enum(["RENTAL", "SALE"]).default("RENTAL"),
  quantity: z.number().int().min(1).default(1),
  currentState: z.enum(["IN", "OUT"]).default("IN"),
  purchaseDate: z.coerce.date().optional().nullable(),
  purchasePrice: z.coerce.number().min(0).optional().nullable(),
  purchaseCurrency: z.string().trim().max(10).optional().nullable(),
});

export const customerInputSchema = z.object({
  name: z.string().trim().min(1).max(300),
  email: emailSchema.optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
  company: z.string().trim().max(300).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

/** One person attached to an order. Exactly one across the order should be the liable customer. */
export const personInputSchema = z.object({
  customerId: z.string().optional(),
  name: z.string().trim().min(1).max(300),
  email: emailSchema.optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
  isLiableCustomer: z.boolean().optional(),
});

/**
 * One "product added to cart" booking. Which physical SKU/article fulfills
 * it, and what it costs, are both resolved server-side from the variant —
 * the client only says which variant, how many, and for whom.
 */
export const orderBookingInputSchema = z.object({
  variantId: z.string(),
  quantity: z.number().int().min(1),
  personIndex: z.number().int().min(0).optional(),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
});

export const createOrderSchema = z
  .object({
    persons: z.array(personInputSchema).min(1),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    deliveryRequired: z.boolean().default(false),
    returnMethod: z.enum(["STORE", "PICKUP"]).default("STORE"),
    channel: orderChannelSchema.default("ADMIN"),
    notes: z.string().trim().max(2000).optional().nullable(),
    /** BOOK NOW: server sets startAt = now and keeps the requested duration. */
    bookNow: z.boolean().default(false),
    /** Staff override for pickup/return outside the store opening hours. */
    allowOutsideHours: z.boolean().default(false),
    lines: z.array(orderBookingInputSchema).min(1),
  })
  .refine((data) => data.endAt > data.startAt, {
    message: "endAt must be after startAt",
    path: ["endAt"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type ProductInput = z.infer<typeof productInputSchema>;
export type SkuInput = z.infer<typeof skuInputSchema>;
export type ArticleInput = z.infer<typeof articleInputSchema>;
export type CustomerInput = z.infer<typeof customerInputSchema>;
export type PersonInput = z.infer<typeof personInputSchema>;
export type OrderBookingInput = z.infer<typeof orderBookingInputSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
