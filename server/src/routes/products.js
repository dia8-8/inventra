const express = require("express");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { requireAuth, requirePermission, requireAnyPermission, requireFeature } = require("../middleware/auth");
const { logActivity } = require("../lib/activityLog");

const router = express.Router();
router.use(requireAuth);

// A product has one main barcode (Product.barcode) and any number of extra ones
// (retail code, case code, a supplier's code ...) that all mean the same item.
const PRODUCT_INCLUDE = {
  supplier: { select: { id: true, name: true } },
  barcodes: { select: { id: true, code: true, label: true }, orderBy: { createdAt: "asc" } },
};

function buildProductWhere(req) {
  const { search, category } = req.query;
  return {
    AND: [
      { active: true }, // archived products stay out of every list
      search
        ? {
            OR: [
              { name: { contains: String(search), mode: "insensitive" } },
              { category: { contains: String(search), mode: "insensitive" } },
            ],
          }
        : {},
      category ? { category: String(category) } : {},
    ],
  };
}

router.get("/count", requireAnyPermission("products.view", "orders.create", "orders.edit", "inventory.view", "inventory.adjust", "reports.view"), async (req, res) => {
  const total = await prisma.product.count({ where: buildProductWhere(req) });
  res.json({ total });
});

// Matches the main barcode or any of the extra ones
router.get("/by-barcode/:code", requireAnyPermission("products.view", "orders.create", "orders.edit", "inventory.view", "inventory.adjust", "reports.view"), requireFeature("barcode"), async (req, res) => {
  const code = req.params.code;
  const product = await prisma.product.findFirst({
    where: { active: true, OR: [{ barcode: code }, { barcodes: { some: { code } } }] },
    include: PRODUCT_INCLUDE,
  });
  if (!product) return res.status(404).json({ error: "No product with that barcode" });
  res.json(product);
});

router.get("/", requireAnyPermission("products.view", "orders.create", "orders.edit", "inventory.view", "inventory.adjust", "reports.view"), async (req, res) => {
  const { lowStock, limit, offset } = req.query;
  const where = buildProductWhere(req);

  let products = await prisma.product.findMany({
    where,
    orderBy: { name: "asc" },
    include: PRODUCT_INCLUDE,
    ...(limit && lowStock !== "true" ? { take: Math.min(Number(limit), 200), skip: Number(offset) || 0 } : {}),
  });

  if (lowStock === "true") {
    products = products.filter((p) => Number(p.stockQty) <= Number(p.lowStockThreshold));
  }

  res.json(products);
});

const COLORS = ["red", "orange", "amber", "lime", "emerald", "teal", "sky", "indigo", "violet", "pink"];

const productSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  unit: z.enum(["KG", "BOX", "PIECE", "BAG", "CARTON"]),
  costPrice: z.coerce.number().nonnegative(),
  sellingPrice: z.coerce.number().nonnegative(),
  stockQty: z.coerce.number().nonnegative().optional(),
  lowStockThreshold: z.coerce.number().nonnegative().optional(),
  active: z.boolean().optional(),
  color: z
    .string()
    .optional()
    .nullable()
    .transform((v) => v || null)
    .refine((v) => v === null || COLORS.includes(v), { message: "Unknown color" }),
  supplierId: z.string().optional().nullable(),
  barcode: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v.trim() : null))
    .transform((v) => v || null),
  // the extra barcodes for this item; sending the list replaces the product's current extras
  barcodes: z
    .array(z.object({ code: z.string().trim().min(1).max(64), label: z.string().trim().max(60).optional().nullable() }))
    .max(30)
    .optional(),
});

// Tidies the extra barcodes: drops blanks and the main barcode, rejects a code listed twice
function cleanExtras(list, primary) {
  const seen = new Set();
  const out = [];
  for (const item of list || []) {
    const code = item.code.trim();
    if (!code || code === primary) continue;
    if (seen.has(code)) return { error: `The barcode ${code} is listed twice` };
    seen.add(code);
    out.push({ code, label: item.label?.trim() || null });
  }
  return { extras: out };
}

// A code can belong to only one product (as its main barcode or one of its extras)
async function findBarcodeConflict(codes, ownProductId) {
  if (!codes.length) return null;
  const others = ownProductId ? { id: { not: ownProductId } } : {};
  const asMain = await prisma.product.findFirst({ where: { barcode: { in: codes }, ...others }, select: { barcode: true, name: true } });
  if (asMain) return { code: asMain.barcode, name: asMain.name };
  const asExtra = await prisma.productBarcode.findFirst({
    where: { code: { in: codes }, ...(ownProductId ? { productId: { not: ownProductId } } : {}) },
    include: { product: { select: { name: true } } },
  });
  return asExtra ? { code: asExtra.code, name: asExtra.product.name } : null;
}

const conflictMessage = (c) => `The barcode ${c.code} is already used by "${c.name}"`;

router.post("/", requirePermission("products.create"), async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { barcodes, ...data } = parsed.data;
  if (data.supplierId && !(await prisma.supplier.findUnique({ where: { id: data.supplierId } }))) {
    return res.status(400).json({ error: "Supplier not found" });
  }

  const cleaned = cleanExtras(barcodes, data.barcode);
  if (cleaned.error) return res.status(400).json({ error: cleaned.error });
  const conflict = await findBarcodeConflict([data.barcode, ...cleaned.extras.map((e) => e.code)].filter(Boolean), null);
  if (conflict) return res.status(409).json({ error: conflictMessage(conflict) });

  try {
    const created = await prisma.product.create({ data });
    if (cleaned.extras.length) {
      await prisma.productBarcode.createMany({ data: cleaned.extras.map((e) => ({ productId: created.id, code: e.code, label: e.label })) });
    }
    await logActivity({ userId: req.user.id, action: "CREATE", entityType: "Product", entityId: created.id, details: { ...data, ...(cleaned.extras.length ? { barcodes: cleaned.extras.map((e) => e.code) } : {}) } });
    res.status(201).json(await prisma.product.findUnique({ where: { id: created.id }, include: PRODUCT_INCLUDE }));
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "That barcode is already assigned to another product" });
    console.error("Create product error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

router.patch("/:id", requirePermission("products.edit"), async (req, res) => {
  const parsed = productSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { barcodes, ...data } = parsed.data;
  if (data.supplierId && !(await prisma.supplier.findUnique({ where: { id: data.supplierId } }))) {
    return res.status(400).json({ error: "Supplier not found" });
  }

  const existing = await prisma.product.findUnique({ where: { id: req.params.id }, include: { barcodes: true } });
  if (!existing) return res.status(404).json({ error: "Product not found" });

  const primary = data.barcode !== undefined ? data.barcode : existing.barcode;
  let extras = null; // null = leave the current extras alone
  if (barcodes !== undefined) {
    const cleaned = cleanExtras(barcodes, primary);
    if (cleaned.error) return res.status(400).json({ error: cleaned.error });
    extras = cleaned.extras;
  } else if (data.barcode && existing.barcodes.some((b) => b.code === data.barcode)) {
    // an extra barcode was promoted to the main one: it no longer needs to be an extra
    extras = existing.barcodes.filter((b) => b.code !== data.barcode).map((b) => ({ code: b.code, label: b.label }));
  }

  const toCheck = [data.barcode, ...(extras || []).map((e) => e.code)].filter(Boolean);
  const conflict = await findBarcodeConflict(toCheck, existing.id);
  if (conflict) return res.status(409).json({ error: conflictMessage(conflict) });

  try {
    await prisma.product.update({ where: { id: existing.id }, data });
    if (extras !== null) {
      await prisma.productBarcode.deleteMany({ where: { productId: existing.id } });
      if (extras.length) await prisma.productBarcode.createMany({ data: extras.map((e) => ({ productId: existing.id, code: e.code, label: e.label })) });
    }
    await logActivity({ userId: req.user.id, action: "UPDATE", entityType: "Product", entityId: existing.id, details: { ...data, ...(extras !== null ? { barcodes: extras.map((e) => e.code) } : {}) } });
    res.json(await prisma.product.findUnique({ where: { id: existing.id }, include: PRODUCT_INCLUDE }));
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "That barcode is already assigned to another product" });
    console.error("Update product error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// A product that appears in orders or stock history can't be removed without breaking those
// records, so it is archived instead (hidden everywhere, history intact). One that was never
// used is deleted for real.
router.delete("/:id", requirePermission("products.delete"), async (req, res) => {
  const product = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!product || !product.active) return res.status(404).json({ error: "Product not found" });

  const [orderItems, movements] = await Promise.all([
    prisma.orderItem.count({ where: { productId: product.id } }),
    prisma.stockMovement.count({ where: { productId: product.id } }),
  ]);

  if (orderItems === 0 && movements === 0) {
    await prisma.product.delete({ where: { id: product.id } });
    await logActivity({ userId: req.user.id, action: "DELETE", entityType: "Product", entityId: product.id, details: { name: product.name } });
    return res.json({ deleted: true, archived: false });
  }

  // Free every barcode so they can be reused on a new product
  await prisma.productBarcode.deleteMany({ where: { productId: product.id } });
  await prisma.product.update({ where: { id: product.id }, data: { active: false, barcode: null } });
  await logActivity({ userId: req.user.id, action: "DELETE", entityType: "Product", entityId: product.id, details: { name: product.name, archived: true } });
  res.json({ deleted: true, archived: true });
});

module.exports = router;
