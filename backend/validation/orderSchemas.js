import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier");
const positiveInteger = z.number().int().positive();

export const cartItemSchema = z.object({
  productId: objectId,
  variantId: objectId,
  quantity: positiveInteger.default(1),
}).strict();

export const cartItemParamsSchema = z.object({ itemId: objectId });
export const cartQuantitySchema = z.object({ quantity: positiveInteger }).strict();

const shippingAddressSchema = z.object({
  label: z.string().trim().min(1).max(50).optional(),
  line1: z.string().trim().min(1).max(160),
  line2: z.string().trim().max(160).optional(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  pincode: z.string().trim().min(1).max(20),
  country: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().max(32).optional(),
}).strict();

export const checkoutSchema = z.object({
  shippingAddress: shippingAddressSchema,
  paymentMethod: z.enum(["cod", "card", "upi", "netbanking"]).default("cod"),
}).strict();

export const orderStatusParamsSchema = z.object({
  id: objectId,
  subOrderId: objectId,
});

export const orderStatusSchema = z.object({
  status: z.enum(["placed", "confirmed", "packed", "shipped", "delivered", "cancelled", "returned", "refunded"]),
  note: z.string().trim().max(1000).optional(),
}).strict();

export const positiveIntegerSchema = positiveInteger;
