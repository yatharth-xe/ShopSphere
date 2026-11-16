import { z } from "zod";

const email = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const password = z.string().min(8).max(128);

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email,
  password,
  phone: z.string().trim().max(32).optional(),
}).strict();

export const loginSchema = z.object({ email, password: z.string().min(1).max(128) }).strict();
export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(4096) }).strict();
export const logoutSchema = z.object({ refreshToken: z.string().min(20).max(4096).optional() }).strict();
export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1).max(128),
  newPassword: password,
}).strict().refine((value) => value.oldPassword !== value.newPassword, {
  message: "New password must be different from the old password",
  path: ["newPassword"],
});
export const forcedPasswordChangeSchema = z.object({ newPassword: password }).strict();
export const forgotPasswordSchema = z.object({ email }).strict();
export const resetPasswordSchema = z.object({ token: z.string().min(32).max(256), newPassword: password }).strict();
export const verifyEmailParamsSchema = z.object({ token: z.string().min(32).max(256) });

export const createStaffSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email,
  phone: z.string().trim().max(32).optional(),
  role: z.enum(["seller", "support", "delivery"]),
}).strict();
