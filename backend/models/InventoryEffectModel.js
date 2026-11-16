import { Schema, model } from "mongoose";

const inventoryEffectSchema = new Schema(
  {
    effectType: { type: String, enum: ["reserve", "commit", "release", "restore"], required: true },
    sourceType: { type: String, enum: ["order", "return"], required: true },
    sourceId: { type: Schema.Types.ObjectId, required: true },
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    subOrder: { type: Schema.Types.ObjectId, required: true },
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId, required: true },
    quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
    reason: { type: String, enum: ["checkout", "cancellation", "return"], required: true },
  },
  { timestamps: true }
);

inventoryEffectSchema.index(
  { effectType: 1, sourceType: 1, sourceId: 1, order: 1, subOrder: 1, product: 1, variantId: 1 },
  { unique: true }
);
inventoryEffectSchema.index({ order: 1, subOrder: 1, product: 1, variantId: 1, effectType: 1 });

export const InventoryEffectModel = model("InventoryEffect", inventoryEffectSchema);
