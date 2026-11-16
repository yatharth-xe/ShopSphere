import mongoose from "mongoose";
import { InventoryEffectModel } from "../models/InventoryEffectModel.js";
import { OrderModel } from "../models/OrderModel.js";
import { ProductModel } from "../models/ProductModel.js";

export class InventoryError extends Error {
  constructor(message, { code = "INVENTORY_ERROR", status = 409 } = {}) {
    super(message);
    this.name = "InventoryError";
    this.code = code;
    this.status = status;
  }
}

export class InventoryIntegrityError extends InventoryError {
  constructor(message) {
    super(message, { code: "INVENTORY_INTEGRITY_ERROR", status: 409 });
    this.name = "InventoryIntegrityError";
  }
}

export class InsufficientStockError extends InventoryError {
  constructor(message = "Insufficient stock") {
    super(message, { code: "INSUFFICIENT_STOCK", status: 400 });
    this.name = "InsufficientStockError";
  }
}

class InventoryConcurrentModificationError extends InventoryError {
  constructor() {
    super("Inventory changed while this request was being processed", {
      code: "INVENTORY_CONCURRENT_MODIFICATION",
      status: 409,
    });
  }
}

const assertSession = (session) => {
  if (!session?.inTransaction?.()) {
    throw new InventoryIntegrityError("Inventory operations require an active transaction session");
  }
};

const assertOperationInput = ({ orderId, subOrderId, productId, variantId, quantity, sourceType, sourceId }) => {
  if (!["order", "return"].includes(sourceType) || !orderId || !subOrderId || !productId || !variantId || !sourceId) {
    throw new InventoryIntegrityError("Inventory operation context is incomplete");
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new InventoryIntegrityError("Inventory quantity must be a positive integer");
  }
};

const assertOrderLifecycleSource = ({ orderId, sourceType, sourceId }) => {
  if (sourceType !== "order" || !sourceId || !orderId || sourceId.toString() !== orderId.toString()) {
    throw new InventoryIntegrityError("Order lifecycle inventory operations must be sourced by their order");
  }
};

const assertRestoreSource = ({ orderId, sourceType, sourceId }) => {
  if (sourceType === "order" && (!sourceId || !orderId || sourceId.toString() !== orderId.toString())) {
    throw new InventoryIntegrityError("Order restoration operations must be sourced by their order");
  }
};

const effectFilter = ({ effectType, sourceType, sourceId, orderId, subOrderId, productId, variantId }) => ({
  effectType,
  sourceType,
  sourceId,
  order: orderId,
  subOrder: subOrderId,
  product: productId,
  variantId,
});

const existingEffect = async (operation, session) =>
  InventoryEffectModel.findOne(effectFilter(operation)).session(session);

const returnExistingOrThrow = async (operation, session) => {
  const existing = await existingEffect(operation, session);
  if (!existing) return null;
  if (existing.quantity !== operation.quantity || existing.reason !== operation.reason) {
    throw new InventoryIntegrityError("A conflicting inventory operation already exists");
  }
  return { applied: false, effect: existing };
};

const createEffect = async (operation, session) => {
  const [effect] = await InventoryEffectModel.create([{
    ...effectFilter(operation),
    quantity: operation.quantity,
    reason: operation.reason,
  }], { session });
  return effect;
};

const getVariantSnapshot = async ({ productId, variantId, session }) => {
  const product = await ProductModel.findOne({ _id: productId, "variants._id": variantId }).session(session);
  const variant = product?.variants.id(variantId);
  if (!variant) throw new InventoryIntegrityError("Product variant no longer exists");
  return { product, variant };
};

const compareAndIncrement = async ({ productId, variantId, snapshot, increment, session, requireActive = false }) => {
  const variantFilter = {
    _id: variantId,
    stock: snapshot.stock,
    reservedStock: snapshot.reservedStock,
  };
  if (requireActive) variantFilter.isActive = true;
  const result = await ProductModel.updateOne(
    { _id: productId, variants: { $elemMatch: variantFilter } },
    { $inc: Object.fromEntries(Object.entries(increment).map(([field, value]) => [`variants.$.${field}`, value])) },
    { session }
  );
  if (result.modifiedCount !== 1) throw new InventoryConcurrentModificationError();
};

const ensureReservation = async (operation, session, { allowPartial = false } = {}) => {
  const reservation = await InventoryEffectModel.findOne({
    effectType: "reserve",
    sourceType: "order",
    sourceId: operation.orderId,
    order: operation.orderId,
    subOrder: operation.subOrderId,
    product: operation.productId,
    variantId: operation.variantId,
  }).session(session);
  if (!reservation) {
    throw new InventoryIntegrityError("A reservation effect is required before this inventory operation");
  }
  if ((allowPartial && reservation.quantity < operation.quantity) || (!allowPartial && reservation.quantity !== operation.quantity)) {
    throw new InventoryIntegrityError("Inventory operation quantity conflicts with its reservation");
  }
  return reservation;
};

const ensureCommittedReservation = async (operation, session) => {
  const committed = await InventoryEffectModel.findOne({
    effectType: "commit",
    sourceType: "order",
    sourceId: operation.orderId,
    order: operation.orderId,
    subOrder: operation.subOrderId,
    product: operation.productId,
    variantId: operation.variantId,
  }).session(session);
  if (!committed) {
    throw new InventoryIntegrityError("A committed reservation is required before stock can be restored");
  }
  return committed;
};

const remainingReservation = async (operation, session) => {
  const effects = await InventoryEffectModel.aggregate([
    {
      $match: {
        order: new mongoose.Types.ObjectId(operation.orderId),
        subOrder: new mongoose.Types.ObjectId(operation.subOrderId),
        product: new mongoose.Types.ObjectId(operation.productId),
        variantId: new mongoose.Types.ObjectId(operation.variantId),
        effectType: { $in: ["commit", "release"] },
      },
    },
    { $group: { _id: null, processed: { $sum: "$quantity" } } },
  ]).session(session);
  return operation.quantity - (effects[0]?.processed || 0);
};

const originalOrderQuantity = async (operation, session) => {
  const order = await OrderModel.findById(operation.orderId).session(session);
  const subOrder = order?.subOrders.id(operation.subOrderId);
  if (!subOrder) throw new InventoryIntegrityError("Order item context no longer exists");
  const quantity = subOrder.items
    .filter((item) => item.product.toString() === operation.productId.toString() && item.variantId.toString() === operation.variantId.toString())
    .reduce((total, item) => total + item.quantity, 0);
  if (quantity < 1) throw new InventoryIntegrityError("Order item context does not match this inventory operation");
  return quantity;
};

const restoredQuantity = async (operation, session) => {
  const effects = await InventoryEffectModel.aggregate([
    {
      $match: {
        order: new mongoose.Types.ObjectId(operation.orderId),
        subOrder: new mongoose.Types.ObjectId(operation.subOrderId),
        product: new mongoose.Types.ObjectId(operation.productId),
        variantId: new mongoose.Types.ObjectId(operation.variantId),
        effectType: "restore",
      },
    },
    { $group: { _id: null, restored: { $sum: "$quantity" } } },
  ]).session(session);
  return effects[0]?.restored || 0;
};

const applyLifecycleOperation = async (operation, session, apply) => {
  assertSession(session);
  assertOperationInput(operation);
  const duplicate = await returnExistingOrThrow(operation, session);
  if (duplicate) return duplicate;
  const effect = await apply();
  return { applied: true, effect };
};

export const reserveStock = async (input) => {
  assertOrderLifecycleSource(input);
  const operation = { ...input, effectType: "reserve", reason: "checkout" };
  return applyLifecycleOperation(operation, input.session, async () => {
    const { variant } = await getVariantSnapshot(input);
    if (!variant.isActive || variant.stock - variant.reservedStock < input.quantity) {
      throw new InsufficientStockError();
    }
    await compareAndIncrement({
      ...input,
      snapshot: variant,
      increment: { reservedStock: input.quantity },
      requireActive: true,
    });
    return createEffect(operation, input.session);
  });
};

export const commitReservation = async (input) => {
  assertOrderLifecycleSource(input);
  const operation = { ...input, effectType: "commit", reason: "checkout" };
  return applyLifecycleOperation(operation, input.session, async () => {
    await ensureReservation(operation, input.session);
    if (await remainingReservation(operation, input.session) < input.quantity) {
      throw new InventoryIntegrityError("Reservation has already been fully processed");
    }
    const { variant } = await getVariantSnapshot(input);
    if (variant.stock < input.quantity || variant.reservedStock < input.quantity) {
      throw new InventoryIntegrityError("Reserved inventory is no longer available to commit");
    }
    await compareAndIncrement({
      ...input,
      snapshot: variant,
      increment: { stock: -input.quantity, reservedStock: -input.quantity },
    });
    return createEffect(operation, input.session);
  });
};

export const releaseReservation = async (input) => {
  assertOrderLifecycleSource(input);
  const operation = { ...input, effectType: "release", reason: "cancellation" };
  return applyLifecycleOperation(operation, input.session, async () => {
    await ensureReservation(operation, input.session);
    if (await remainingReservation(operation, input.session) < input.quantity) {
      throw new InventoryIntegrityError("Reservation has already been fully processed");
    }
    const { variant } = await getVariantSnapshot(input);
    if (variant.reservedStock < input.quantity) {
      throw new InventoryIntegrityError("Reserved inventory is no longer available to release");
    }
    await compareAndIncrement({
      ...input,
      snapshot: variant,
      increment: { reservedStock: -input.quantity },
    });
    return createEffect(operation, input.session);
  });
};

export const restoreStock = async (input) => {
  assertRestoreSource(input);
  const operation = { ...input, effectType: "restore", reason: input.reason || "return" };
  return applyLifecycleOperation(operation, input.session, async () => {
    await ensureReservation(operation, input.session, { allowPartial: true });
    await ensureCommittedReservation(operation, input.session);
    const originalQuantity = await originalOrderQuantity(operation, input.session);
    if (await restoredQuantity(operation, input.session) + input.quantity > originalQuantity) {
      throw new InventoryIntegrityError("Restoration exceeds the quantity purchased for this order item");
    }
    const { variant } = await getVariantSnapshot(input);
    await compareAndIncrement({
      ...input,
      snapshot: variant,
      increment: { stock: input.quantity },
    });
    return createEffect(operation, input.session);
  });
};

export const setSellerStock = async ({ productId, variantId, stock, session }) => {
  assertSession(session);
  if (!Number.isInteger(stock) || stock < 0) {
    throw new InventoryIntegrityError("Stock must be a non-negative integer");
  }
  const { variant } = await getVariantSnapshot({ productId, variantId, session });
  if (stock < variant.reservedStock) {
    throw new InventoryError("Stock cannot be lower than reserved stock", {
      code: "STOCK_BELOW_RESERVED",
      status: 400,
    });
  }
  const result = await ProductModel.updateOne(
    {
      _id: productId,
      variants: { $elemMatch: { _id: variantId, stock: variant.stock, reservedStock: variant.reservedStock } },
    },
    { $set: { "variants.$.stock": stock } },
    { session }
  );
  if (result.modifiedCount !== 1 && stock !== variant.stock) throw new InventoryConcurrentModificationError();
  return { ...variant.toObject(), stock };
};

const isDuplicateKeyError = (error) => error?.code === 11000 || error?.cause?.code === 11000;

export const runInventoryTransaction = async (work, { maxAttempts = 3 } = {}) => {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(() => work(session));
    } catch (error) {
      lastError = error;
      const shouldRetry = isDuplicateKeyError(error) || error?.code === "INVENTORY_CONCURRENT_MODIFICATION";
      if (!shouldRetry || attempt === maxAttempts) throw error;
    } finally {
      await session.endSession();
    }
  }
  throw lastError;
};
