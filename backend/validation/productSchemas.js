import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier");
const nonNegativeInteger = z.number().int().nonnegative();
const attributes = z.record(z.string(), z.string()).optional();

const variantFields = {
  sku: z.string().trim().min(1).max(100),
  attributes,
  price: z.number().finite().nonnegative(),
  compareAtPrice: z.number().finite().nonnegative().optional(),
  stock: nonNegativeInteger,
  imageUrls: z.array(z.string().trim().url().max(2048)).optional(),
  isActive: z.boolean().optional(),
};

export const productCreateVariantsSchema = z.array(z.object(variantFields).strict()).min(1);
export const productUpdateVariantsSchema = z.array(z.object({
  _id: objectId.optional(),
  ...variantFields,
}).strict()).min(1);

export const stockParamsSchema = z.object({ id: objectId, variantId: objectId });
export const stockUpdateSchema = z.object({ stock: nonNegativeInteger }).strict();
