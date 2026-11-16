import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { app, clearTestDatabase, closeTestDatabase, connectTestDatabase } from "./helpers.js";
import { CategoryModel } from "../models/CategoryModel.js";
import { InventoryEffectModel } from "../models/InventoryEffectModel.js";
import { OrderModel } from "../models/OrderModel.js";
import { ProductModel } from "../models/ProductModel.js";
import { StoreModel } from "../models/StoreModel.js";
import { UserModel } from "../models/UserModel.js";
import {
  InventoryIntegrityError,
  InsufficientStockError,
  commitReservation,
  releaseReservation,
  reserveStock,
  restoreStock,
  runInventoryTransaction,
  setSellerStock,
} from "../services/inventoryService.js";

process.env.ACCESS_TOKEN_SECRET = "test-access-secret-at-least-32-characters";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret-at-least-32-characters";
process.env.NODE_ENV = "test";

before(connectTestDatabase);
beforeEach(clearTestDatabase);
after(closeTestDatabase);

const objectId = () => new mongoose.Types.ObjectId();

const makeFixture = async ({ stock = 5 } = {}) => {
  const product = await ProductModel.create({
    store: objectId(),
    category: objectId(),
    title: "Inventory Fixture",
    slug: `inventory-fixture-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    basePrice: 100,
    status: "active",
    variants: [{ sku: `SKU-${Date.now()}-${Math.random().toString(16).slice(2)}`, price: 100, stock }],
  });
  const order = await OrderModel.create({
    orderNumber: `SS-INVENTORY-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    customer: objectId(),
    shippingAddress: { line1: "1 Test Road", city: "Pune", state: "Maharashtra", pincode: "411001" },
    subOrders: [{
      store: product.store,
      items: [{
        product: product._id,
        variantId: product.variants[0]._id,
        title: product.title,
        sku: product.variants[0].sku,
        price: 100,
        quantity: 3,
      }],
      subtotal: 300,
      total: 300,
    }],
    grandTotal: 300,
  });
  return { product, order, variant: product.variants[0], subOrder: order.subOrders[0] };
};

const operation = ({ product, order, subOrder, variant, quantity = 3, sourceType = "order", sourceId = order._id }) => ({
  orderId: order._id,
  subOrderId: subOrder._id,
  productId: product._id,
  variantId: variant._id,
  quantity,
  sourceType,
  sourceId,
});

const getVariant = async (productId, variantId) => {
  const product = await ProductModel.findById(productId);
  return product.variants.id(variantId);
};

const createBarrier = (participants) => {
  let arrivals = 0;
  let release;
  const ready = new Promise((resolve) => { release = resolve; });
  return async () => {
    arrivals += 1;
    if (arrivals === participants) release();
    if (arrivals <= participants) await ready;
  };
};

const makeSellerProductFixture = async () => {
  const password = "temporary-password-123";
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const seller = await UserModel.create({
    name: "Inventory Seller",
    email: `inventory-seller-${suffix}@example.com`,
    password,
    role: "seller",
  });
  const store = await StoreModel.create({
    seller: seller._id,
    storeName: "Inventory Seller Store",
    slug: `inventory-seller-store-${suffix}`,
    status: "approved",
  });
  const category = await CategoryModel.create({ name: "Inventory Category", slug: `inventory-category-${suffix}` });
  const product = await ProductModel.create({
    store: store._id,
    category: category._id,
    title: "Concurrent Product",
    slug: `concurrent-product-${suffix}`,
    description: "Before concurrent update",
    basePrice: 100,
    status: "active",
    variants: [{ sku: `CONCURRENT-${suffix}`, attributes: { size: "M" }, price: 100, stock: 5 }],
  });
  const order = await OrderModel.create({
    orderNumber: `SS-CONCURRENT-${suffix}`,
    customer: objectId(),
    shippingAddress: { line1: "1 Test Road", city: "Pune", state: "Maharashtra", pincode: "411001" },
    subOrders: [{
      store: store._id,
      items: [{ product: product._id, variantId: product.variants[0]._id, title: product.title, sku: product.variants[0].sku, price: 100, quantity: 2 }],
      subtotal: 200,
      total: 200,
    }],
    grandTotal: 200,
  });
  const login = await request(app).post("/api/auth/login").send({ email: seller.email, password });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return { seller, product, order, subOrder: order.subOrders[0], variant: product.variants[0], accessToken: login.body.accessToken };
};

test("reserveStock records one effect and retries idempotently", async () => {
  const fixture = await makeFixture();
  const input = operation(fixture);
  const first = await runInventoryTransaction((session) => reserveStock({ ...input, session }));
  const second = await runInventoryTransaction((session) => reserveStock({ ...input, session }));

  assert.equal(first.applied, true);
  assert.equal(second.applied, false);
  const variant = await getVariant(fixture.product._id, fixture.variant._id);
  assert.equal(variant.stock, 5);
  assert.equal(variant.reservedStock, 3);
  assert.equal(await InventoryEffectModel.countDocuments({ effectType: "reserve" }), 1);
});

test("reservation lifecycle requires a matching reservation and cannot process it twice", async () => {
  const fixture = await makeFixture();
  const input = operation(fixture);
  await assert.rejects(
    runInventoryTransaction((session) => reserveStock({ ...input, sourceType: "return", sourceId: objectId(), session })),
    (error) => error instanceof InventoryIntegrityError
  );
  await assert.rejects(
    runInventoryTransaction((session) => commitReservation({ ...input, session })),
    (error) => error instanceof InventoryIntegrityError
  );

  await runInventoryTransaction((session) => reserveStock({ ...input, session }));
  const committed = await runInventoryTransaction((session) => commitReservation({ ...input, session }));
  const retriedCommit = await runInventoryTransaction((session) => commitReservation({ ...input, session }));
  assert.equal(committed.applied, true);
  assert.equal(retriedCommit.applied, false);
  await assert.rejects(
    runInventoryTransaction((session) => releaseReservation({ ...input, session })),
    (error) => error instanceof InventoryIntegrityError
  );

  const variant = await getVariant(fixture.product._id, fixture.variant._id);
  assert.equal(variant.stock, 2);
  assert.equal(variant.reservedStock, 0);
});

test("releaseReservation requires a matching reservation and is idempotent", async () => {
  const fixture = await makeFixture();
  const input = operation(fixture);
  await runInventoryTransaction((session) => reserveStock({ ...input, session }));
  const released = await runInventoryTransaction((session) => releaseReservation({ ...input, session }));
  const retriedRelease = await runInventoryTransaction((session) => releaseReservation({ ...input, session }));

  assert.equal(released.applied, true);
  assert.equal(retriedRelease.applied, false);
  const variant = await getVariant(fixture.product._id, fixture.variant._id);
  assert.equal(variant.stock, 5);
  assert.equal(variant.reservedStock, 0);
});

test("restoreStock enforces the original order quantity across different workflows", async () => {
  const fixture = await makeFixture();
  const lifecycleInput = operation(fixture);
  await runInventoryTransaction((session) => reserveStock({ ...lifecycleInput, session }));
  await runInventoryTransaction((session) => commitReservation({ ...lifecycleInput, session }));

  const returnSource = objectId();
  await runInventoryTransaction((session) => restoreStock({
    ...operation({ ...fixture, quantity: 2, sourceType: "return", sourceId: returnSource }),
    reason: "return",
    session,
  }));
  await assert.rejects(
    runInventoryTransaction((session) => restoreStock({
      ...operation({ ...fixture, quantity: 2, sourceType: "order", sourceId: fixture.order._id }),
      reason: "return",
      session,
    })),
    (error) => error instanceof InventoryIntegrityError
  );
  await runInventoryTransaction((session) => restoreStock({
    ...operation({ ...fixture, quantity: 1, sourceType: "return", sourceId: objectId() }),
    reason: "return",
    session,
  }));

  const variant = await getVariant(fixture.product._id, fixture.variant._id);
  assert.equal(variant.stock, 5);
  assert.equal(await InventoryEffectModel.countDocuments({ effectType: "restore" }), 2);
});

test("concurrent cross-workflow restores cannot exceed the purchased quantity", async () => {
  const fixture = await makeFixture();
  const lifecycleInput = operation(fixture);
  await runInventoryTransaction((session) => reserveStock({ ...lifecycleInput, session }));
  await runInventoryTransaction((session) => commitReservation({ ...lifecycleInput, session }));

  const waitForBothTransactions = createBarrier(2);
  const directRestore = operation({ ...fixture, quantity: 2, sourceType: "order", sourceId: fixture.order._id });
  const returnRestore = operation({ ...fixture, quantity: 2, sourceType: "return", sourceId: objectId() });
  const runSynchronizedRestore = (input) => runInventoryTransaction(async (session) => {
    await ProductModel.findById(fixture.product._id).session(session);
    await waitForBothTransactions();
    return restoreStock({ ...input, reason: "return", session });
  });
  const results = await Promise.allSettled([
    runSynchronizedRestore(directRestore),
    runSynchronizedRestore(returnRestore),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && result.reason instanceof InventoryIntegrityError).length, 1);
  const variant = await getVariant(fixture.product._id, fixture.variant._id);
  const effects = await InventoryEffectModel.find({ effectType: "restore" });
  assert.equal(variant.stock, 4);
  assert.equal(effects.length, 1);
  assert.equal(effects.reduce((total, effect) => total + effect.quantity, 0), 2);
});

test("duplicate-key retry uses a fresh session and observes the committed matching effect", async () => {
  const fixture = await makeFixture();
  const input = operation(fixture);
  await runInventoryTransaction((session) => reserveStock({ ...input, session }));

  const originalStartSession = mongoose.startSession;
  const sessions = [];
  const endedSessions = [];
  let attempts = 0;
  mongoose.startSession = async (...args) => {
    const session = await originalStartSession.apply(mongoose, args);
    const originalEndSession = session.endSession.bind(session);
    session.endSession = async (...endArgs) => {
      endedSessions.push(session);
      return originalEndSession(...endArgs);
    };
    sessions.push(session);
    return session;
  };

  try {
    const result = await runInventoryTransaction(async (session) => {
      attempts += 1;
      if (attempts === 1) {
        const duplicateKeyError = new Error("simulated duplicate key");
        duplicateKeyError.code = 11000;
        throw duplicateKeyError;
      }
      return reserveStock({ ...input, session });
    });
    assert.equal(result.applied, false);
    assert.equal(attempts, 2);
    assert.equal(sessions.length, 2);
    assert.notEqual(sessions[0], sessions[1]);
    assert.deepEqual(endedSessions, sessions);
    assert.equal(await InventoryEffectModel.countDocuments({ effectType: "reserve" }), 1);
  } finally {
    mongoose.startSession = originalStartSession;
  }
});

test("concurrent retries of one reservation produce one effect and one stock hold", async () => {
  const fixture = await makeFixture();
  const input = operation(fixture, { quantity: 1 });
  const results = await Promise.all([
    runInventoryTransaction((session) => reserveStock({ ...input, quantity: 1, session })),
    runInventoryTransaction((session) => reserveStock({ ...input, quantity: 1, session })),
  ]);

  assert.deepEqual(results.map((result) => result.applied).sort(), [false, true]);
  const variant = await getVariant(fixture.product._id, fixture.variant._id);
  assert.equal(variant.reservedStock, 1);
  assert.equal(await InventoryEffectModel.countDocuments({ effectType: "reserve" }), 1);
});

test("concurrent reservations for the final unit allow only one order", async () => {
  const first = await makeFixture({ stock: 1 });
  const secondOrder = await OrderModel.create({
    orderNumber: `SS-INVENTORY-${Date.now()}-SECOND`,
    customer: objectId(),
    shippingAddress: { line1: "2 Test Road", city: "Pune", state: "Maharashtra", pincode: "411001" },
    subOrders: [{
      store: first.product.store,
      items: [{ product: first.product._id, variantId: first.variant._id, title: first.product.title, sku: first.variant.sku, price: 100, quantity: 1 }],
      subtotal: 100,
      total: 100,
    }],
    grandTotal: 100,
  });
  const firstInput = operation({ ...first, quantity: 1 });
  const secondInput = operation({
    product: first.product,
    order: secondOrder,
    subOrder: secondOrder.subOrders[0],
    variant: first.variant,
    quantity: 1,
  });
  const results = await Promise.allSettled([
    runInventoryTransaction((session) => reserveStock({ ...firstInput, session })),
    runInventoryTransaction((session) => reserveStock({ ...secondInput, session })),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && result.reason instanceof InsufficientStockError).length, 1);
  const variant = await getVariant(first.product._id, first.variant._id);
  assert.equal(variant.reservedStock, 1);
  assert.equal(await InventoryEffectModel.countDocuments({ effectType: "reserve" }), 1);
});

test("failed transactions roll back inventory effects and stock changes", async () => {
  const fixture = await makeFixture();
  const input = operation(fixture);
  await assert.rejects(runInventoryTransaction(async (session) => {
    await reserveStock({ ...input, session });
    throw new Error("forced rollback");
  }));
  const variant = await getVariant(fixture.product._id, fixture.variant._id);
  assert.equal(variant.reservedStock, 0);
  assert.equal(await InventoryEffectModel.countDocuments(), 0);
});

test("setSellerStock preserves reservations and requires a transaction", async () => {
  const fixture = await makeFixture();
  const input = operation({ ...fixture, quantity: 2 });
  await runInventoryTransaction((session) => reserveStock({ ...input, session }));
  await assert.rejects(
    runInventoryTransaction((session) => setSellerStock({
      productId: fixture.product._id, variantId: fixture.variant._id, stock: 1, session,
    })),
    (error) => error.code === "STOCK_BELOW_RESERVED"
  );
  await runInventoryTransaction((session) => setSellerStock({
    productId: fixture.product._id, variantId: fixture.variant._id, stock: 6, session,
  }));
  await assert.rejects(
    reserveStock({ ...input, session: null }),
    (error) => error instanceof InventoryIntegrityError
  );
  const variant = await getVariant(fixture.product._id, fixture.variant._id);
  assert.equal(variant.stock, 6);
  assert.equal(variant.reservedStock, 2);
});

test("product edits preserve a concurrent reservation and variant identity", async () => {
  const fixture = await makeSellerProductFixture();
  const reservation = operation({ ...fixture, quantity: 2 });
  const productEdit = request(app)
    .patch(`/api/products/${fixture.product._id}`)
    .set("Authorization", `Bearer ${fixture.accessToken}`)
    .send({
      description: "Updated alongside reservation",
      variants: [{
        _id: fixture.variant._id.toString(),
        sku: fixture.variant.sku,
        attributes: { size: "L" },
        price: 120,
        stock: 6,
      }],
    });
  const [editResponse, reservationResult] = await Promise.all([
    productEdit,
    runInventoryTransaction((session) => reserveStock({ ...reservation, session })),
  ]);

  assert.equal(editResponse.status, 200, JSON.stringify(editResponse.body));
  assert.equal(reservationResult.applied, true);
  const product = await ProductModel.findById(fixture.product._id);
  const variant = product.variants.id(fixture.variant._id);
  assert.equal(product.description, "Updated alongside reservation");
  assert.equal(variant._id.toString(), fixture.variant._id.toString());
  assert.equal(variant.stock, 6);
  assert.equal(variant.reservedStock, 2);
  assert.equal(await InventoryEffectModel.countDocuments({ effectType: "reserve" }), 1);
});
