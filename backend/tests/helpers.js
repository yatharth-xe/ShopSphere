import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createApp } from "../server.js";

let mongoReplSet;

export const connectTestDatabase = async () => {
  if (!mongoReplSet) {
    mongoReplSet = await MongoMemoryReplSet.create({
      instanceOpts: [{ launchTimeout: 30000 }],
      replSet: {
        count: 1,
        storageEngine: "wiredTiger",
      },
    });
  }
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoReplSet.getUri());
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
  if (mongoReplSet) {
    await mongoReplSet.stop();
    mongoReplSet = undefined;
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
