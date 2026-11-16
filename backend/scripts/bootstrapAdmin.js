import "dotenv/config";
import mongoose from "mongoose";
import { UserModel } from "../models/UserModel.js";
import { registerSchema } from "../validation/authSchemas.js";

const requiredEnvironment = ["ADMIN_NAME", "ADMIN_EMAIL", "ADMIN_PASSWORD"];
const expectedMongoUri = "mongodb://127.0.0.1:27018/shopsphere_demo?replicaSet=rs0";

const main = async () => {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Admin bootstrap is available only when NODE_ENV=development");
  }

  if (process.env.MONGODB_URI !== expectedMongoUri) {
    throw new Error("MONGODB_URI must exactly match the approved local shopsphere_demo replica-set URI");
  }

  const missing = requiredEnvironment.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Set these environment variables before running: ${missing.join(", ")}`);
  }

  const parsed = registerSchema.safeParse({
    name: process.env.ADMIN_NAME,
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  });
  if (!parsed.success) {
    throw new Error(`Admin details are invalid: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  }

  await mongoose.connect(expectedMongoUri);

  const existingAdmin = await UserModel.exists({ role: "admin" });
  if (existingAdmin) {
    throw new Error("An admin account already exists; refusing to create another");
  }

  const existingEmail = await UserModel.exists({ email: parsed.data.email });
  if (existingEmail) {
    throw new Error("That email already belongs to an account; no existing account was changed");
  }

  const admin = new UserModel({
    name: parsed.data.name,
    email: parsed.data.email,
    password: parsed.data.password,
    role: "admin",
  });
  await admin.save();

  console.log(`Local development admin created for ${admin.email}. The password was not displayed.`);
};

try {
  await main();
} catch (error) {
  console.error(`Admin bootstrap failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
