import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../server.js";

let mongoServer;

export const connectTestDatabase = async () => {
  if (!mongoServer) mongoServer = await MongoMemoryServer.create();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoServer.getUri());
  }
};

export const clearTestDatabase = async () => {
  if (mongoose.connection.readyState !== 1) return;
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({}))
  );
};

export const closeTestDatabase = async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = undefined;
  }
};

export const app = createApp();

export const signIn = async (request, user) => {
  const response = await request.post("/api/auth/login").send({
    email: user.email,
    password: user.password,
  });
  return response.body;
};
