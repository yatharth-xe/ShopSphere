import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app, clearTestDatabase, closeTestDatabase, connectTestDatabase } from "./helpers.js";
import { CartModel } from "../models/CartModel.js";
import { CategoryModel } from "../models/CategoryModel.js";
import { OrderModel } from "../models/OrderModel.js";
import { ProductModel } from "../models/ProductModel.js";
import { StoreModel } from "../models/StoreModel.js";
import { UserModel } from "../models/UserModel.js";
import { orderStatusSchema } from "../validation/orderSchemas.js";

process.env.ACCESS_TOKEN_SECRET = "test-access-secret-at-least-32-characters";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret-at-least-32-characters";
process.env.NODE_ENV = "test";

before(connectTestDatabase);
beforeEach(clearTestDatabase);
after(closeTestDatabase);

const password = "temporary-password-123";

const login = async (user) => {
  const response = await request(app).post("/api/auth/login").send({
    email: user.email,
    password,
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.accessToken;
};

const makeProductFixture = async ({ stock = 5, reservedStock = 0, secondVariant } = {}) => {
  const seller = await UserModel.create({
    name: "Seller",
    email: `seller-${Date.now()}-${Math.random()}@example.com`,
    password,
    role: "seller",
  });
  const store = await StoreModel.create({
    seller: seller._id,
    storeName: "Fixture Store",
    slug: `fixture-store-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    status: "approved",
  });
  const category = await CategoryModel.create({
    name: "Fixture Category",
    slug: `fixture-category-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  });
  const variants = [{
    sku: `SKU-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    attributes: { size: "M" },
    price: 100,
    stock,
    reservedStock,
  }];
  if (secondVariant) variants.push(secondVariant);

  const product = await ProductModel.create({
    store: store._id,
    category: category._id,
    title: "Fixture Product",
    slug: `fixture-product-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    variants,
    basePrice: 100,
    status: "active",
  });
  return { seller, store, category, product };
};

const makeCustomerCart = async (product) => {
  const customer = await UserModel.create({
    name: "Customer",
    email: `customer-${Date.now()}-${Math.random()}@example.com`,
    password,
    role: "customer",
  });
  const cart = await CartModel.create({ user: customer._id, items: [] });
  return { customer, cart, variant: product.variants[0] };
};

test("cart endpoints accept positive integer quantities and reject invalid quantities", async () => {
  const { product } = await makeProductFixture();
  const { customer, variant } = await makeCustomerCart(product);
  const accessToken = await login(customer);

  const added = await request(app).post("/api/cart/items")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ productId: product._id.toString(), variantId: variant._id.toString(), quantity: 2 });
  assert.equal(added.status, 200, JSON.stringify(added.body));

  for (const quantity of [1.5, 0, -1, "2", null]) {
    const response = await request(app).post("/api/cart/items")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ productId: product._id.toString(), variantId: variant._id.toString(), quantity });
    assert.equal(response.status, 400, `quantity ${String(quantity)}: ${JSON.stringify(response.body)}`);
  }
});

test("order item quantities must be positive integers at the schema boundary", async () => {
  const { product, store } = await makeProductFixture();
  const { customer, variant } = await makeCustomerCart(product);
  const order = new OrderModel({
    orderNumber: `SS-invalid-${Date.now()}`,
    customer: customer._id,
    shippingAddress: { line1: "1 Test Road", city: "Pune", state: "Maharashtra", pincode: "411001" },
    subOrders: [{
      store: store._id,
      items: [{ product: product._id, variantId: variant._id, title: product.title, sku: variant.sku, price: 100, quantity: 1.5 }],
      subtotal: 150,
      total: 150,
    }],
    grandTotal: 150,
  });
  await assert.rejects(order.validate());
});

test("order status payload validation permits only existing statuses", () => {
  assert.equal(orderStatusSchema.safeParse({ status: "packed", note: "Ready for dispatch" }).success, true);
  assert.equal(orderStatusSchema.safeParse({ status: "processing" }).success, false);
  assert.equal(orderStatusSchema.safeParse({ status: "packed", unexpected: true }).success, false);
});

test("checkout validates a complete address and existing payment methods before creating an order", async () => {
  const { product } = await makeProductFixture();
  const { customer, variant } = await makeCustomerCart(product);
  const accessToken = await login(customer);
  await request(app).post("/api/cart/items").set("Authorization", `Bearer ${accessToken}`)
    .send({ productId: product._id.toString(), variantId: variant._id.toString(), quantity: 1 }).expect(200);

  const invalidAddress = await request(app).post("/api/orders/checkout").set("Authorization", `Bearer ${accessToken}`)
    .send({ shippingAddress: { line1: "1 Test Road", city: "Pune", pincode: "411001" }, paymentMethod: "cod" });
  assert.equal(invalidAddress.status, 400);

  const invalidPayment = await request(app).post("/api/orders/checkout").set("Authorization", `Bearer ${accessToken}`)
    .send({ shippingAddress: { line1: "1 Test Road", city: "Pune", state: "Maharashtra", pincode: "411001" }, paymentMethod: "cash" });
  assert.equal(invalidPayment.status, 400);
  assert.equal(await OrderModel.countDocuments(), 0);
});

test("product schema rejects fractional stock and reservations above stock", async () => {
  const { product } = await makeProductFixture();
  product.variants[0].stock = 1.5;
  await assert.rejects(product.validate());

  product.variants[0].stock = 2;
  product.variants[0].reservedStock = 3;
  await assert.rejects(product.validate());
});

test("seller stock endpoint rejects invalid values, direct reservations, and stock below reservations", async () => {
  const { seller, product } = await makeProductFixture({ stock: 5, reservedStock: 3 });
  const accessToken = await login(seller);
  const path = `/api/products/${product._id}/variants/${product.variants[0]._id}/stock`;

  for (const stock of [1.5, -1, "5", null]) {
    const response = await request(app).patch(path).set("Authorization", `Bearer ${accessToken}`).send({ stock });
    assert.equal(response.status, 400, `stock ${String(stock)}: ${JSON.stringify(response.body)}`);
  }
  const directReservation = await request(app).patch(path).set("Authorization", `Bearer ${accessToken}`)
    .send({ stock: 5, reservedStock: 0 });
  assert.equal(directReservation.status, 400);
  const belowReservation = await request(app).patch(path).set("Authorization", `Bearer ${accessToken}`).send({ stock: 2 });
  assert.equal(belowReservation.status, 400);
});

test("seller product edits preserve existing variant identities and reservations", async () => {
  const { seller, product } = await makeProductFixture({ stock: 5, reservedStock: 2 });
  const accessToken = await login(seller);
  const variant = product.variants[0];
  const directReservation = await request(app).patch(`/api/products/${product._id}`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({
      variants: [{ _id: variant._id.toString(), sku: variant.sku, attributes: { size: "M" }, price: 100, stock: 5, reservedStock: 0 }],
    });
  assert.equal(directReservation.status, 400);

  const response = await request(app).patch(`/api/products/${product._id}`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({
      variants: [{ _id: variant._id.toString(), sku: variant.sku, attributes: { size: "L" }, price: 120, stock: 6 }],
    });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const updated = await ProductModel.findById(product._id);
  assert.equal(updated.variants.length, 1);
  assert.equal(updated.variants[0]._id.toString(), variant._id.toString());
  assert.equal(updated.variants[0].reservedStock, 2);
  assert.equal(updated.variants[0].stock, 6);
});

test("seller product edits cannot remove a variant with outstanding reservations", async () => {
  const heldSku = `HELD-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { seller, product } = await makeProductFixture({
    secondVariant: { sku: heldSku, attributes: { size: "L" }, price: 110, stock: 3, reservedStock: 1 },
  });
  const accessToken = await login(seller);
  const retained = product.variants[0];
  const response = await request(app).patch(`/api/products/${product._id}`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ variants: [{ _id: retained._id.toString(), sku: retained.sku, attributes: { size: "M" }, price: 100, stock: 5 }] });
  assert.equal(response.status, 400);
  const unchanged = await ProductModel.findById(product._id);
  assert.equal(unchanged.variants.length, 2);
});

test("seller product edits can remove a variant with no outstanding reservations", async () => {
  const removableSku = `REMOVABLE-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { seller, product } = await makeProductFixture({
    secondVariant: { sku: removableSku, attributes: { size: "L" }, price: 110, stock: 3, reservedStock: 0 },
  });
  const accessToken = await login(seller);
  const retained = product.variants[0];
  const response = await request(app).patch(`/api/products/${product._id}`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ variants: [{ _id: retained._id.toString(), sku: retained.sku, attributes: { size: "M" }, price: 100, stock: 5 }] });
  assert.equal(response.status, 200, JSON.stringify(response.body));

  const updated = await ProductModel.findById(product._id);
  assert.equal(updated.variants.length, 1);
  assert.equal(updated.variants[0]._id.toString(), retained._id.toString());
});

test("seller product edits reject duplicate existing variant IDs", async () => {
  const { seller, product } = await makeProductFixture();
  const accessToken = await login(seller);
  const variant = product.variants[0];
  const duplicateVariant = { _id: variant._id.toString(), sku: variant.sku, attributes: { size: "M" }, price: 100, stock: 5 };
  const response = await request(app).patch(`/api/products/${product._id}`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ variants: [duplicateVariant, duplicateVariant] });
  assert.equal(response.status, 400);
});

test("seller product edits reject a variant ID that belongs to another product", async () => {
  const { seller, product } = await makeProductFixture();
  const { product: otherProduct } = await makeProductFixture();
  const accessToken = await login(seller);
  const foreignVariant = otherProduct.variants[0];
  const response = await request(app).patch(`/api/products/${product._id}`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({
      variants: [{ _id: foreignVariant._id.toString(), sku: foreignVariant.sku, attributes: { size: "M" }, price: 100, stock: 5 }],
    });
  assert.equal(response.status, 400);
});

test("seller product edits can add a new variant and initialize its reservation to zero", async () => {
  const { seller, product } = await makeProductFixture({ stock: 5, reservedStock: 2 });
  const accessToken = await login(seller);
  const existing = product.variants[0];
  const newSku = `NEW-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const response = await request(app).patch(`/api/products/${product._id}`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({
      variants: [
        { _id: existing._id.toString(), sku: existing.sku, attributes: { size: "M" }, price: 100, stock: 5 },
        { sku: newSku, attributes: { size: "XL" }, price: 120, stock: 4 },
      ],
    });
  assert.equal(response.status, 200, JSON.stringify(response.body));

  const updated = await ProductModel.findById(product._id);
  const addedVariant = updated.variants.find((variant) => variant.sku === newSku);
  assert.ok(addedVariant);
  assert.equal(addedVariant.reservedStock, 0);
  assert.equal(updated.variants.find((variant) => variant._id.equals(existing._id)).reservedStock, 2);
});
