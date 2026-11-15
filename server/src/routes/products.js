const express = require("express");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { requireAuth, requirePermission, requireAnyPermission, requireFeature } = require("../middleware/auth");
const { logActivity } = require("../lib/activityLog");

const router = express.Router();
router.use(requireAuth);

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

router.get("/by-barcode/:code", requireAnyPermission("products.view", "orders.create", "orders.edit", "inventory.view", "inventory.adjust", "reports.view"), requireFeature("barcode"), async (req, res) => {
  const product = await prisma.product.findFirst({
    where: { barcode: req.params.code, active: true },
    include: { supplier: { select: { id: true, name: true } } },
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
    include: { supplier: { select: { id: true, name: true } } },
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
});

router.post("/", requirePermission("products.create"), async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (parsed.data.supplierId && !(await prisma.supplier.findUnique({ where: { id: parsed.data.supplierId } }))) {
    return res.status(400).json({ error: "Supplier not found" });
  }

  try {
    const product = await prisma.product.create({ data: parsed.data });
    await logActivity({ userId: req.user.id, action: "CREATE", entityType: "Product", entityId: product.id, details: parsed.data });
    res.status(201).json(product);
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "That barcode is already assigned to another product" });
    console.error("Create product error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

router.patch("/:id", requirePermission("products.edit"), async (req, res) => {
  const parsed = productSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (parsed.data.supplierId && !(await prisma.supplier.findUnique({ where: { id: parsed.data.supplierId } }))) {
    return res.status(400).json({ error: "Supplier not found" });
  }

  try {
    const product = await prisma.product.update({ where: { id: req.params.id }, data: parsed.data });
    await logActivity({ userId: req.user.id, action: "UPDATE", entityType: "Product", entityId: product.id, details: parsed.data });
    res.json(product);
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

  // Free the barcode so it can be reused on a new product
  await prisma.product.update({ where: { id: product.id }, data: { active: false, barcode: null } });
  await logActivity({ userId: req.user.id, action: "DELETE", entityType: "Product", entityId: product.id, details: { name: product.name, archived: true } });
  res.json({ deleted: true, archived: true });
});

module.exports = router;
