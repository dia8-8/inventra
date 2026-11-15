const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { prismaRaw } = require("../lib/db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { logActivity } = require("../lib/activityLog");
const { Prisma } = require("@prisma/client");
const { GROUPS, IMPLIES, VALID, STAFF_DEFAULT, DRIVER_DEFAULT, normalize, effectivePermissions } = require("../lib/permissions");

const router = express.Router();

router.use(requireAuth, requireRole("ADMIN"));

const USER_SELECT = { id: true, name: true, email: true, role: true, active: true, createdAt: true, permissions: true };

// What the admin screen needs to know about a user, including what they can actually do
function serialize(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    createdAt: u.createdAt,
    customPermissions: Array.isArray(u.permissions),
    permissions: effectivePermissions(u),
  };
}

// The list of permissions and the defaults, so the screen never has to hard-code them
router.get("/permissions", (req, res) => {
  res.json({ groups: GROUPS, implies: IMPLIES, staffDefault: STAFF_DEFAULT, driverDefault: DRIVER_DEFAULT });
});

// null/undefined = the role's defaults; a list = custom (checked against the catalog)
function parsePermissions(list) {
  if (list === null || list === undefined) return { value: null };
  const unknown = list.filter((k) => !VALID.has(k));
  if (unknown.length) return { error: `Unknown permission: ${unknown[0]}` };
  return { value: normalize(list) };
}

router.get("/", async (req, res) => {
  const users = await prisma.user.findMany({ select: USER_SELECT, orderBy: { createdAt: "asc" } });
  res.json(users.map(serialize));
});

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "STAFF", "DRIVER"]),
  permissions: z.array(z.string()).nullable().optional(),
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { name, email, password, role } = parsed.data;

  const existing = await prismaRaw.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    return res.status(409).json({ error: "A user with that email already exists" });
  }

  if (role === "DRIVER" && !req.license.features.includes("deliveries")) {
    return res.status(403).json({ error: "Driver accounts aren't included in your plan" });
  }
  const activeUsers = await prisma.user.count({ where: { active: true } });
  if (activeUsers >= req.license.maxUsers) {
    return res.status(403).json({ error: `Your plan allows ${req.license.maxUsers} users. Contact us to raise the limit.` });
  }

  const perms = parsePermissions(parsed.data.permissions);
  if (perms.error) return res.status(400).json({ error: perms.error });
  if (perms.value && role !== "STAFF") return res.status(400).json({ error: "Custom permissions apply to staff accounts only" });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email: email.toLowerCase(), passwordHash, role, ...(perms.value ? { permissions: perms.value } : {}) },
    select: USER_SELECT,
  });

  await logActivity({ userId: req.user.id, action: "CREATE", entityType: "User", entityId: user.id, details: { name, email, role, ...(perms.value ? { permissions: perms.value } : {}) } });

  res.status(201).json(serialize(user));
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["ADMIN", "STAFF", "DRIVER"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional(),
  permissions: z.array(z.string()).nullable().optional(),
});

router.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  if (req.params.id === req.user.id && parsed.data.active === false) {
    return res.status(400).json({ error: "You cannot deactivate your own account" });
  }

  if (parsed.data.active === true) {
    const activeUsers = await prisma.user.count({ where: { active: true } });
    if (activeUsers >= req.license.maxUsers) {
      return res.status(403).json({ error: `Your plan allows ${req.license.maxUsers} users. Contact us to raise the limit.` });
    }
  }
  if (parsed.data.role === "DRIVER" && !req.license.features.includes("deliveries")) {
    return res.status(403).json({ error: "Driver accounts aren't included in your plan" });
  }

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "User not found" });

  const data = { ...parsed.data };
  if (data.password) {
    data.passwordHash = await bcrypt.hash(data.password, 10);
    delete data.password;
  }

  // Custom permissions only exist for staff; changing someone's role starts them from that role's defaults
  const newRole = parsed.data.role || target.role;
  let permissionsLogged;
  if (parsed.data.permissions !== undefined) {
    const perms = parsePermissions(parsed.data.permissions);
    if (perms.error) return res.status(400).json({ error: perms.error });
    if (perms.value && newRole !== "STAFF") return res.status(400).json({ error: "Custom permissions apply to staff accounts only" });
    data.permissions = perms.value === null ? Prisma.DbNull : perms.value;
    permissionsLogged = perms.value === null ? "role defaults" : perms.value;
  } else if (parsed.data.role && parsed.data.role !== target.role) {
    data.permissions = Prisma.DbNull;
  }

  const user = await prisma.user.update({ where: { id: req.params.id }, data, select: USER_SELECT });

  const { permissions: _ignored, password: _pw, ...rest } = parsed.data;
  await logActivity({
    userId: req.user.id,
    action: "UPDATE",
    entityType: "User",
    entityId: user.id,
    details: { ...rest, ...(permissionsLogged !== undefined ? { permissions: permissionsLogged } : {}), ...(parsed.data.password ? { passwordChanged: true } : {}) },
  });

  res.json(serialize(user));
});

router.delete("/:id", async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: "You cannot delete your own account" });
  }

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) {
    return res.status(404).json({ error: "User not found" });
  }

  if (target.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return res.status(400).json({ error: "Cannot delete the last remaining admin" });
    }
  }

  await prisma.user.delete({ where: { id: req.params.id } });

  await logActivity({ userId: req.user.id, action: "DELETE", entityType: "User", entityId: req.params.id, details: { name: target.name, email: target.email } });

  res.status(204).end();
});

module.exports = router;
