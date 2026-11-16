import rateLimit from "express-rate-limit";

const createLimiter = (windowMs, limit, message) => rateLimit({
  windowMs,
  limit,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message },
});

export const loginLimiter = createLimiter(15 * 60 * 1000, 10, "Too many login attempts. Try again later.");
export const registrationLimiter = createLimiter(60 * 60 * 1000, 10, "Too many registration attempts. Try again later.");
export const passwordRecoveryLimiter = createLimiter(15 * 60 * 1000, 5, "Too many password recovery attempts. Try again later.");
export const refreshLimiter = createLimiter(15 * 60 * 1000, 30, "Too many token refresh attempts. Try again later.");
export const emailVerificationLimiter = createLimiter(15 * 60 * 1000, 10, "Too many verification attempts. Try again later.");
export const passwordChangeLimiter = createLimiter(15 * 60 * 1000, 5, "Too many password change attempts. Try again later.");
