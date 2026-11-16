import { Router } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { UserModel } from "../models/UserModel.js";
import { verifyToken } from "../middleware/VerifyToken.js";
import { validateRequest } from "../middleware/validateRequest.js";
import {
  registerSchema, loginSchema, refreshSchema, logoutSchema, changePasswordSchema,
  forcedPasswordChangeSchema, forgotPasswordSchema, resetPasswordSchema, verifyEmailParamsSchema,
} from "../validation/authSchemas.js";
import {
  loginLimiter, registrationLimiter, passwordRecoveryLimiter, refreshLimiter,
  emailVerificationLimiter, passwordChangeLimiter,
} from "../middleware/authRateLimits.js";

const router = Router();

// helper functions to make tokens — kept right here, no separate file needed
const makeAccessToken = (user) =>
  jwt.sign({ userId: user._id, role: user.role }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "15m",
  });

const makeRefreshToken = (user) =>
  jwt.sign({ userId: user._id, jti: crypto.randomUUID() }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: "7d",
  });

// POST /api/auth/register
router.post("/register", registrationLimiter, validateRequest(registerSchema), async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    // 1. Check existing user
    const existing = await UserModel.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "Email already in use" });
    }

    // 2. Generate token beforehand
    const rawEmailVerifyToken = crypto.randomBytes(32).toString("hex");
    const emailVerificationToken = crypto.createHash("sha256").update(rawEmailVerifyToken).digest("hex");

    // 3. Instantiate model once
    const user = new UserModel({
      name,
      email,
      password,
      phone,
      role: "customer",
      emailVerificationToken,
    });

    // 4. Generate JWT Tokens
    const accessToken = makeAccessToken(user);
    const refreshToken = makeRefreshToken(user);

    user.refreshTokens = [refreshToken];

    // 5. Save ONCE to Database
    await user.save();

    // Return response immediately
    return res.status(201).json({
      message: "Registered successfully",
      user: user.toJSON(),
      accessToken,
      refreshToken,
    });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "Email already in use" });
    console.error("Registration failed");
    // Explicitly send response back so frontend doesn't hang!
    return res.status(500).json({ 
      message: "Registration failed", 
      error: "Internal server error"
    });
  }
});

// POST /api/auth/login
router.post("/login", loginLimiter, validateRequest(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await UserModel.findOne({ email }).select("+password +refreshTokens");
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "This account has been deactivated" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const accessToken = makeAccessToken(user);
    const refreshToken = makeRefreshToken(user);

    user.refreshTokens.push(refreshToken);
    user.refreshTokens = user.refreshTokens.slice(-10);
    user.lastLoginAt = new Date();
    await user.save();

    res.status(200).json({ message: "Login successful", user, accessToken, refreshToken });
  } catch (err) {
    console.error("Login failed");
    res.status(500).json({ message: "Login failed" });
  }
});

// POST /api/auth/refresh-token
router.post("/refresh-token", refreshLimiter, validateRequest(refreshSchema), async (req, res) => {
  try {
    const { refreshToken: incomingToken } = req.body;
    let decoded;
    try {
      decoded = jwt.verify(incomingToken, process.env.REFRESH_TOKEN_SECRET);
    } catch {
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    const user = await UserModel.findById(decoded.userId).select("+refreshTokens");
    if (!user || !user.isActive || !user.refreshTokens.includes(incomingToken)) {
      return res.status(401).json({ message: "Refresh token not recognized" });
    }

    const newAccessToken = makeAccessToken(user);
    const newRefreshToken = makeRefreshToken(user);
    const rotatedUser = await UserModel.collection.findOneAndUpdate(
      { _id: user._id, isActive: true, refreshTokens: incomingToken },
      [{ $set: { refreshTokens: { $concatArrays: [
        { $filter: { input: "$refreshTokens", as: "token", cond: { $ne: ["$$token", incomingToken] } } },
        [newRefreshToken],
      ] } } }],
      { returnDocument: "after" }
    );
    const rotatedDocument = rotatedUser?.value ?? rotatedUser;
    if (!rotatedDocument?._id) return res.status(401).json({ message: "Refresh token already used or revoked" });
    res.status(200).json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error("Could not refresh token");
    res.status(500).json({ message: "Could not refresh token" });
  }
});

// POST /api/auth/logout
router.post("/logout", verifyToken, validateRequest(logoutSchema), async (req, res) => {
  try {
    const { refreshToken: incomingToken } = req.body;
    const user = await UserModel.findById(req.user._id).select("+refreshTokens");

    if (incomingToken) {
      user.refreshTokens = user.refreshTokens.filter((t) => t !== incomingToken);
      await user.save();
    }

    res.status(200).json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout failed");
    res.status(500).json({ message: "Logout failed" });
  }
});

// GET /api/auth/me — quick example of a protected route using verifyToken
router.get("/me", verifyToken, async (req, res) => {
  res.status(200).json({ user: req.user });
});

// PATCH /api/auth/change-password
router.patch("/change-password", verifyToken, passwordChangeLimiter, validateRequest(changePasswordSchema), async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    const user = await UserModel.findById(req.user._id).select("+password");

    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) {
      return res.status(401).json({ message: "Old password is incorrect" });
    }

    user.password = newPassword; // pre-save hook re-hashes automatically
    await user.save();

    res.status(200).json({ message: "Password changed successfully" });
  } catch (err) {
    console.error("Could not change password");
    res.status(500).json({ message: "Could not change password" });
  }
});

router.patch("/force-change-password", verifyToken, passwordChangeLimiter, validateRequest(forcedPasswordChangeSchema), async (req, res) => {
  try {
    if (!req.user.mustChangePassword) {
      return res.status(400).json({ message: "A forced password change is not required" });
    }
    req.user.password = req.body.newPassword;
    req.user.mustChangePassword = false;
    await req.user.save();
    res.status(200).json({ message: "Password changed successfully", user: req.user });
  } catch (err) {
    console.error("Could not complete required password change");
    res.status(500).json({ message: "Could not change password" });
  }
});

// POST /api/auth/forgot-password
// Email delivery is not configured. A development token is returned only when
// EXPOSE_DEV_RESET_TOKEN=true and NODE_ENV is not production.
router.post("/forgot-password", passwordRecoveryLimiter, validateRequest(forgotPasswordSchema), async (req, res) => {
  try {
    const { email } = req.body;
    const user = await UserModel.findOne({ email });
    // always respond the same way whether or not the email exists —
    // this stops people from using this endpoint to check which emails are registered
    if (!user) {
      return res.status(200).json({
        message: "If this email is registered, a reset link has been sent",
      });
    }

    const devTokenEnabled = process.env.NODE_ENV !== "production" && process.env.EXPOSE_DEV_RESET_TOKEN === "true";
    let resetToken;
    if (devTokenEnabled) {
      resetToken = crypto.randomBytes(32).toString("hex");
      user.passwordResetToken = crypto.createHash("sha256").update(resetToken).digest("hex");
      user.passwordResetExpires = Date.now() + 30 * 60 * 1000;
      await user.save();
    }
    res.status(200).json({
      message: "If this email is registered, a reset link has been sent",
      ...(devTokenEnabled ? { devResetToken: resetToken } : {}),
    });
  } catch (err) {
    console.error("Could not process password recovery request");
    res.status(500).json({ message: "Could not process request" });
  }
});

// POST /api/auth/reset-password
router.post("/reset-password", passwordRecoveryLimiter, validateRequest(resetPasswordSchema), async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await UserModel.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    }).select("+passwordResetToken +passwordResetExpires");

    if (!user) {
      return res.status(400).json({ message: "Reset token is invalid or has expired" });
    }

    user.password = newPassword; // pre-save hook re-hashes
    user.mustChangePassword = false;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.refreshTokens = []; // log out of all sessions after a password reset, for safety
    await user.save();

    res.status(200).json({ message: "Password reset successful, please log in again" });
  } catch (err) {
    console.error("Could not reset password");
    res.status(500).json({ message: "Could not reset password" });
  }
});

// GET /api/auth/verify-email/:token
router.get("/verify-email/:token", emailVerificationLimiter, validateRequest(verifyEmailParamsSchema, "params"), async (req, res) => {
  try {
    const hashedToken = crypto.createHash("sha256").update(req.params.token).digest("hex");

    const user = await UserModel.findOne({
      emailVerificationToken: hashedToken,
    }).select("+emailVerificationToken");

    if (!user) {
      return res.status(400).json({ message: "Verification link is invalid or already used" });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    await user.save();

    res.status(200).json({ message: "Email verified successfully" });
  } catch (err) {
    console.error("Could not verify email");
    res.status(500).json({ message: "Could not verify email" });
  }
});

export default router;
