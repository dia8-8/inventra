const express = require("express");
const { z } = require("zod");
const { Prisma } = require("@prisma/client");
const prisma = require("../lib/prisma");
const { requireAuth, requireAnyPermission } = require("../middleware/auth");
const { logActivity } = require("../lib/activityLog");
const { getTenantSettings } = require("../lib/settings");
const { currentTenantId, prismaRaw } = require("../lib/db");

const router = express.Router();
router.use(requireAuth);

const getOrCreateSettings = getTenantSettings;

router.get("/", async (req, res) => {
  const settings = await getOrCreateSettings();
  res.json(settings);
});

const BLOCK_IDS = ["header", "invoiceInfo", "billTo", "status", "items", "totals", "notes", "footer"];
const COLUMN_KEYS = ["item", "category", "unit", "qty", "unitPrice", "total"];

const blockSchema = z.object({
  id: z.enum(BLOCK_IDS),
  enabled: z.boolean(),
  // a percentage of the page width (older layouts stored "full" / "half")
  width: z.union([z.enum(["full", "half"]), z.number().int().min(20).max(100)]),
  align: z.enum(["left", "center", "right"]),
  title: z.string().max(40).optional(),
  text: z.string().max(500).optional(),
  showLogo: z.boolean().optional(),
  showAddress: z.boolean().optional(),
  showPhone: z.boolean().optional(),
  showEmail: z.boolean().optional(),
  showPaid: z.boolean().optional(),
});

const hasUnique = (arr, key) => new Set(arr.map((x) => x[key])).size === arr.length;

const invoiceLayoutSchema = z.object({
  version: z.number().int().optional(),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Accent must be a hex color"),
  font: z.enum(["sans", "serif", "mono"]),
  textSize: z.enum(["sm", "md", "lg"]).optional(),
  spacing: z.enum(["compact", "normal", "roomy"]).optional(),
  logoHeight: z.number().int().min(20).max(140).optional(),
  logo: z
    .string()
    .max(250000, "Logo is too large")
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "Logo must be a PNG, JPEG or WebP image")
    .nullable()
    .optional(),
  blocks: z.array(blockSchema).max(BLOCK_IDS.length).refine((b) => hasUnique(b, "id"), "Each block can appear once"),
  columns: z
    .array(z.object({ key: z.enum(COLUMN_KEYS), enabled: z.boolean() }))
    .max(COLUMN_KEYS.length)
    .refine((c) => hasUnique(c, "key"), "Each column can appear once")
    .refine((c) => c.some((x) => x.enabled), "Show at least one column"),
});

const settingsSchema = z.object({
  invoiceLayout: invoiceLayoutSchema.nullable().optional(),
  companyName: z.string().min(1),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z
    .union([z.string().trim().email("Enter a valid company email"), z.literal("")])
    .optional()
    .nullable()
    .transform((v) => v || null),
  invoicePrefix: z.string().min(1),
  currency: z.string().min(1),
  defaultLowStockThreshold: z.coerce.number().nonnegative(),
  taxRate: z.coerce.number().min(0).max(1),
  variableWeightEnabled: z.boolean().optional(),
  variableWeightPrefix: z.string().optional(),
  variableWeightItemStart: z.coerce.number().int().min(0).optional(),
  variableWeightItemLength: z.coerce.number().int().min(1).optional(),
  variableWeightWeightStart: z.coerce.number().int().min(0).optional(),
  variableWeightWeightLength: z.coerce.number().int().min(1).optional(),
  variableWeightDecimals: z.coerce.number().int().min(0).max(6).optional(),
  variableWeightUnit: z.string().optional(),
});

// Keep the (large) invoice layout out of the activity log
function loggable(data) {
  const { invoiceLayout, ...rest } = data;
  return invoiceLayout === undefined ? rest : { ...rest, invoiceLayout: invoiceLayout === null ? "reset to default" : "updated" };
}

router.patch("/", requireAnyPermission("settings.edit", "invoices.design"), async (req, res) => {
  // The invoice layout and the rest of the company settings are separate permissions
  const keys = Object.keys(req.body || {});
  const touchesLayout = keys.includes("invoiceLayout");
  const touchesOther = keys.some((k) => k !== "invoiceLayout");
  if ((touchesLayout && !req.permissions.has("invoices.design")) || (touchesOther && !req.permissions.has("settings.edit"))) {
    return res.status(403).json({ error: "You don't have permission to do that", code: "FORBIDDEN" });
  }

  const parsed = settingsSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  await getOrCreateSettings();
  const data = { ...parsed.data };
  // null means "back to the built-in layout"; Prisma needs an explicit marker for a JSON null
  if (data.invoiceLayout === null) data.invoiceLayout = Prisma.DbNull;
  const settings = await prisma.setting.update({
    where: { tenantId: currentTenantId() },
    data,
  });

  // The navbar shows the client's account name, so a renamed company renames the account too
  const newName = parsed.data.companyName?.trim();
  if (newName) {
    await prismaRaw.tenant.update({ where: { id: currentTenantId() }, data: { name: newName } });
  }

  await logActivity({ userId: req.user.id, action: "UPDATE", entityType: "Setting", entityId: settings.id, details: loggable(parsed.data) });
  res.json(settings);
});

module.exports = router;
