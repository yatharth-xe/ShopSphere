import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app, connectTestDatabase, clearTestDatabase, closeTestDatabase } from "./helpers.js";
import { registerSchema, createStaffSchema } from "../validation/authSchemas.js";
import { createTicketSchema, ticketMessageSchema } from "../validation/supportSchemas.js";
import { UserModel } from "../models/UserModel.js";
import { SupportTicketModel } from "../models/SupportTicketModel.js";

process.env.ACCESS_TOKEN_SECRET = "test-access-secret-at-least-32-characters";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret-at-least-32-characters";
process.env.NODE_ENV = "test";
process.env.EXPOSE_DEV_RESET_TOKEN = "true";

before(connectTestDatabase);
beforeEach(clearTestDatabase);
after(closeTestDatabase);

const makeUser = async (role, email, extras = {}) => UserModel.create({
  name: role,
  email,
  password: "temporary-password-123",
  role,
  ...extras,
});

const login = async (email, password = "temporary-password-123") => {
  const response = await request(app).post("/api/auth/login").send({ email, password });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body;
};

test("backend test harness can exercise the Express app without starting the server", async () => {
  const response = await request(app).get("/api/auth/not-a-route");
  assert.equal(response.status, 404);
});

test("authentication routes reject an empty registration request", async () => {
  const response = await request(app).post("/api/auth/register").send({});
  assert.equal(response.status, 400);
});

test("registration schema accepts customers only and normalizes email", () => {
  const customer = registerSchema.safeParse({ name: "A Customer", email: "BUYER@EXAMPLE.COM", password: "secure-pass-1" });
  assert.equal(customer.success, true);
  assert.equal(customer.data.email, "buyer@example.com");
  assert.equal(registerSchema.safeParse({ name: "Seller", email: "seller@example.com", password: "secure-pass-1", role: "seller" }).success, false);
});

test("staff creation schema excludes admin and rejects unknown fields", () => {
  assert.equal(createStaffSchema.safeParse({ name: "Agent", email: "agent@example.com", role: "support" }).success, true);
  assert.equal(createStaffSchema.safeParse({ name: "Admin", email: "admin@example.com", role: "admin" }).success, false);
});

test("support schemas bound message lengths and validate linked identifiers", () => {
  assert.equal(createTicketSchema.safeParse({ subject: "Issue", message: "Help", relatedOrder: "not-an-id" }).success, false);
  assert.equal(ticketMessageSchema.safeParse({ text: "x".repeat(5001) }).success, false);
});

test("existing users default to no forced password change", () => {
  assert.equal(UserModel.schema.path("mustChangePassword").defaultValue, false);
});

test("public registration creates only customers and rejects a role field", async () => {
  const blocked = await request(app).post("/api/auth/register").send({
    name: "Attempted seller", email: "seller-try@example.com", password: "long-password-123", role: "seller",
  });
  assert.equal(blocked.status, 400);
  const created = await request(app).post("/api/auth/register").send({
    name: "Customer", email: "customer@example.com", password: "long-password-123",
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.user.role, "customer");
});

test("admin can provision a staff account but cannot create another admin", async () => {
  await makeUser("admin", "admin@example.com");
  const admin = await login("admin@example.com");
  const response = await request(app).post("/api/users/staff")
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .send({ name: "Support Agent", email: "agent@example.com", role: "support" });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  assert.equal(response.body.user.mustChangePassword, true);
  assert.equal(typeof response.body.temporaryPassword, "string");

  const staff = await login("agent@example.com", response.body.temporaryPassword);
  assert.equal(staff.user.mustChangePassword, true);
  const restricted = await request(app).get("/api/notifications")
    .set("Authorization", `Bearer ${staff.accessToken}`);
  assert.equal(restricted.status, 403);
  assert.equal(restricted.body.code, "PASSWORD_CHANGE_REQUIRED");

  const changed = await request(app).patch("/api/auth/force-change-password")
    .set("Authorization", `Bearer ${staff.accessToken}`)
    .send({ newPassword: "new-staff-password-456" });
  assert.equal(changed.status, 200);
  const allowed = await request(app).get("/api/notifications")
    .set("Authorization", `Bearer ${staff.accessToken}`);
  assert.notEqual(allowed.status, 403);

  const forbiddenAdmin = await request(app).post("/api/users/staff")
    .set("Authorization", `Bearer ${admin.accessToken}`)
    .send({ name: "Nope", email: "not-admin@example.com", role: "admin" });
  assert.equal(forbiddenAdmin.status, 400);
  const nonAdmin = await request(app).post("/api/users/staff")
    .set("Authorization", `Bearer ${staff.accessToken}`)
    .send({ name: "Nope", email: "other-agent@example.com", role: "support" });
  assert.equal(nonAdmin.status, 403);
});

test("refresh rotates its token and rejects replay", async () => {
  await makeUser("customer", "refresh@example.com");
  const session = await login("refresh@example.com");
  const refreshed = await request(app).post("/api/auth/refresh-token").send({ refreshToken: session.refreshToken });
  assert.equal(refreshed.status, 200, JSON.stringify(refreshed.body));
  assert.equal(refreshed.body.refreshToken !== session.refreshToken, true);
  const replay = await request(app).post("/api/auth/refresh-token").send({ refreshToken: session.refreshToken });
  assert.equal(replay.status, 401);
});

test("simultaneous refresh requests cannot both consume the same token", async () => {
  await makeUser("customer", "parallel-refresh@example.com");
  const session = await login("parallel-refresh@example.com");
  const attempts = await Promise.all([
    request(app).post("/api/auth/refresh-token").send({ refreshToken: session.refreshToken }),
    request(app).post("/api/auth/refresh-token").send({ refreshToken: session.refreshToken }),
  ]);
  assert.deepEqual(attempts.map((response) => response.status).sort(), [200, 401]);
});

test("password reset token is available only with explicit non-production opt-in", async () => {
  await makeUser("customer", "reset@example.com");
  process.env.EXPOSE_DEV_RESET_TOKEN = "false";
  const hidden = await request(app).post("/api/auth/forgot-password").send({ email: "reset@example.com" });
  assert.equal(hidden.status, 200);
  assert.equal("devResetToken" in hidden.body, false);

  process.env.EXPOSE_DEV_RESET_TOKEN = "true";
  const development = await request(app).post("/api/auth/forgot-password").send({ email: "reset@example.com" });
  assert.equal(development.status, 200);
  assert.equal(typeof development.body.devResetToken, "string");

  process.env.NODE_ENV = "production";
  const production = await request(app).post("/api/auth/forgot-password").send({ email: "reset@example.com" });
  assert.equal(production.status, 200);
  assert.equal("devResetToken" in production.body, false);
  process.env.NODE_ENV = "test";
});

test("profile access remains available and customers cannot read another customer ticket", async () => {
  await makeUser("customer", "owner@example.com");
  await makeUser("customer", "stranger@example.com");
  const owner = await login("owner@example.com");
  const stranger = await login("stranger@example.com");
  const profile = await request(app).get("/api/users/me").set("Authorization", `Bearer ${owner.accessToken}`);
  assert.equal(profile.status, 200);
  const updated = await request(app).patch("/api/users/me")
    .set("Authorization", `Bearer ${owner.accessToken}`).send({ name: "Updated Owner", phone: "1234567890" });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.user.name, "Updated Owner");
  const created = await request(app).post("/api/support")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ subject: "Order issue", message: "Please help" });
  assert.equal(created.status, 201);
  const forbidden = await request(app).get(`/api/support/${created.body.ticket._id}`)
    .set("Authorization", `Bearer ${stranger.accessToken}`);
  assert.equal(forbidden.status, 403);
  const logout = await request(app).post("/api/auth/logout")
    .set("Authorization", `Bearer ${owner.accessToken}`).send({ refreshToken: owner.refreshToken });
  assert.equal(logout.status, 200);
  const revoked = await request(app).post("/api/auth/refresh-token").send({ refreshToken: owner.refreshToken });
  assert.equal(revoked.status, 401);
});

test("support agents may access unassigned tickets but not tickets assigned to another agent", async () => {
  const customer = await makeUser("customer", "ticket-customer@example.com");
  const agentOne = await makeUser("support", "agent-one@example.com");
  const agentTwo = await makeUser("support", "agent-two@example.com");
  const seller = await makeUser("seller", "seller@example.com");
  const delivery = await makeUser("delivery", "delivery@example.com");
  const ticket = await SupportTicketModel.create({ customer: customer._id, subject: "Help", messages: [{ sender: customer._id, text: "Need help" }] });
  const one = await login(agentOne.email);
  const two = await login(agentTwo.email);
  const sellerSession = await login(seller.email);
  const deliverySession = await login(delivery.email);

  const unassigned = await request(app).get(`/api/support/${ticket._id}`).set("Authorization", `Bearer ${one.accessToken}`);
  assert.equal(unassigned.status, 200);
  ticket.assignedTo = agentTwo._id;
  await ticket.save();

  const otherAgent = await request(app).get(`/api/support/${ticket._id}`).set("Authorization", `Bearer ${one.accessToken}`);
  assert.equal(otherAgent.status, 403);
  const assignedAgent = await request(app).post(`/api/support/${ticket._id}/messages`)
    .set("Authorization", `Bearer ${two.accessToken}`).send({ text: "I can help" });
  assert.equal(assignedAgent.status, 200);
  for (const token of [sellerSession.accessToken, deliverySession.accessToken]) {
    const denied = await request(app).get(`/api/support/${ticket._id}`).set("Authorization", `Bearer ${token}`);
    assert.equal(denied.status, 403);
  }
});

test("login endpoint applies its rate limit", async () => {
  const attempts = await Promise.all(Array.from({ length: 12 }, () =>
    request(app).post("/api/auth/login").send({ email: "rate-limit@example.com", password: "incorrect-password" })
  ));
  assert.equal(attempts.some((response) => response.status === 429), true);
});
