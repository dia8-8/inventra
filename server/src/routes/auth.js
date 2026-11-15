const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { z } = require("zod");
const { prismaRaw, runWithTenant } = require("../lib/db");
const { requireAuthAllowBlocked } = require("../middleware/auth");
const { logActivity } = require("../lib/activityLog");
const { licenseFor, trialEndDate, TRIAL_MAX_USERS } = require("../lib/license");
const { sendMail, passwordResetEmail } = require("../lib/mailer");
const { createLimiter } = require("../lib/rateLimit");

const router = express.Router();

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "12h",
  });
}

function publicUser(user, tenant) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    companyName: tenant?.name || null,
  };
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  const { email, password } = parsed.data;

  const user = await prismaRaw.user.findUnique({ where: { email: email.toLowerCase() }, include: { tenant: true } });
  if (!user || !user.active) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is not set");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const token = signToken(user);

  // Blocked licenses can still sign in so the app can explain why access is off.
  if (user.tenantId) {
    await runWithTenant(user.tenantId, () =>
      logActivity({ userId: user.id, action: "LOGIN", entityType: "User", entityId: user.id })
    );
  }

  res.json({
    token,
    user: publicUser(user, user.tenant),
    license: user.tenant ? licenseFor(user.tenant) : null,
  });
});

const registerSchema = z.object({
  companyName: z.string().trim().min(2, "Company name is too short").max(100),
  name: z.string().trim().min(1, "Your name is required").max(100),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

// Self-service sign-up: creates a new client (tenant) on a free trial, with the
// registering person as its first admin. Data is isolated from every other client.
router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { companyName, name, password } = parsed.data;
  const email = parsed.data.email.toLowerCase();

  const existing = await prismaRaw.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "An account with that email already exists" });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const { tenant, user } = await prismaRaw.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { name: companyName, plan: "TRIAL", status: "ACTIVE", expiresAt: trialEndDate(), maxUsers: TRIAL_MAX_USERS },
    });
    await tx.setting.create({ data: { tenantId: tenant.id, companyName } });
    const user = await tx.user.create({ data: { name, email, passwordHash, role: "ADMIN", tenantId: tenant.id } });
    return { tenant, user };
  });

  await runWithTenant(tenant.id, () =>
    logActivity({ userId: user.id, action: "CREATE", entityType: "Tenant", entityId: tenant.id, details: { companyName } })
  );

  res.status(201).json({
    token: signToken(user),
    user: publicUser(user, tenant),
    license: licenseFor(tenant),
  });
});

router.get("/me", requireAuthAllowBlocked, (req, res) => {
  res.json({
    user: publicUser(req.user, req.user.tenant),
    license: req.user.tenant ? req.license : null,
  });
});

// ---------------------------------------------------------------------------
// Password reset: emailed one-time link, valid for an hour.
// ---------------------------------------------------------------------------
const RESET_TTL_MINUTES = 60;
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const appUrl = () => (process.env.APP_URL || (process.env.CLIENT_ORIGIN || "http://localhost:5173").split(",")[0]).trim().replace(/[/]$/, "");

const forgotByIp = createLimiter({ windowMs: 60 * 60_000, max: 20 });
const forgotByEmail = createLimiter({ windowMs: 60 * 60_000, max: 5 });
const resetByIp = createLimiter({ windowMs: 15 * 60_000, max: 30 });

const INVALID_LINK = "This reset link is invalid or has expired. Request a new one.";

router.post("/forgot-password", async (req, res) => {
  const parsed = z.object({ email: z.string().trim().email("Enter a valid email") }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (!forgotByIp(req.ip)) return res.status(429).json({ error: "Too many requests. Please try again later." });

  // Always answer the same way so this can't be used to discover which emails have accounts
  res.json({ message: "If an account exists for that email, we've sent a reset link." });

  try {
    const email = parsed.data.email.toLowerCase();
    if (!forgotByEmail(email)) return;
    const user = await prismaRaw.user.findUnique({ where: { email } });
    if (!user || !user.active) return;

    const token = crypto.randomBytes(32).toString("hex");
    await prismaRaw.$transaction([
      prismaRaw.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
      prismaRaw.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000) },
      }),
    ]);

    const link = `${appUrl()}/reset-password?token=${token}`;
    await sendMail({ to: user.email, ...passwordResetEmail({ name: user.name, link, minutes: RESET_TTL_MINUTES }) });
  } catch (err) {
    console.error("Password reset email failed:", err.message);
  }
});

async function findUsableToken(token) {
  if (!token || typeof token !== "string" || token.length > 200) return null;
  const record = await prismaRaw.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!record || record.usedAt || record.expiresAt <= new Date() || !record.user.active) return null;
  return record;
}

// Lets the reset page tell people straight away if their link is no good
router.get("/reset-password/check", async (req, res) => {
  if (!resetByIp(req.ip)) return res.status(429).json({ error: "Too many attempts. Please try again later." });
  const record = await findUsableToken(String(req.query.token || ""));
  res.json({ valid: Boolean(record) });
});

const resetSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

router.post("/reset-password", async (req, res) => {
  if (!resetByIp(req.ip)) return res.status(429).json({ error: "Too many attempts. Please try again later." });
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const record = await findUsableToken(parsed.data.token);
  if (!record) return res.status(400).json({ error: INVALID_LINK });

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const now = new Date();

  try {
    await prismaRaw.$transaction(async (tx) => {
      // Claim the link first so two people using it at once can't both succeed
      const claimed = await tx.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: now } });
      if (claimed.count !== 1) throw new Error("LINK_USED");
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash, passwordChangedAt: now } });
      await tx.passwordResetToken.updateMany({ where: { userId: record.userId, usedAt: null }, data: { usedAt: now } });
    });
  } catch (err) {
    if (err.message === "LINK_USED") return res.status(400).json({ error: INVALID_LINK });
    throw err;
  }

  if (record.user.tenantId) {
    await runWithTenant(record.user.tenantId, () =>
      logActivity({ userId: record.userId, action: "UPDATE", entityType: "User", entityId: record.userId, details: { passwordReset: true } })
    );
  }

  res.json({ message: "Your password has been updated. You can now sign in." });
});

module.exports = router;
