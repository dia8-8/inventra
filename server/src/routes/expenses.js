const express = require("express");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { requireAuth, requirePermission, requireAnyPermission } = require("../middleware/auth");
const { logActivity } = require("../lib/activityLog");
const { Prisma } = require("@prisma/client");
const { round2 } = require("../lib/tax");

const router = express.Router();
router.use(requireAuth);

router.get("/", requirePermission("expenses.view"), async (req, res) => {
  const { category, from, to } = req.query;
  const where = {};
  if (category) where.category = String(category);
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(String(from));
    if (to) where.date.lte = new Date(String(to));
  }

  const expenses = await prisma.expense.findMany({
    where,
    orderBy: { date: "desc" },
    include: { createdBy: { select: { id: true, name: true } } },
  });

  res.json(expenses);
});

const expenseSchema = z.object({
  date: z.coerce.date(),
  category: z.enum(["FUEL", "RENT", "SALARIES", "UTILITIES", "OTHER"]),
  amount: z.coerce.number().positive(),
  note: z.string().optional().nullable(),
  // the tax contained in the amount, one entry per tax, e.g. [{ name: "GST", amount: 5 }]
  taxes: z
    .array(z.object({ name: z.string().trim().min(1).max(40), amount: z.coerce.number().min(0) }))
    .max(10)
    .nullable()
    .optional(),
});

// Turns the submitted tax list into what is stored; null means "no tax recorded"
function taxFields(taxes, amount) {
  if (taxes === undefined) return {};
  const list = (taxes || []).filter((t) => t.amount > 0).map((t) => ({ name: t.name, amount: round2(t.amount) }));
  if (taxes === null || (taxes.length === 0 && !list.length)) return { taxes: taxes === null ? Prisma.DbNull : [], taxTotal: 0 };
  const taxTotal = round2(list.reduce((s, t) => s + t.amount, 0));
  if (amount !== undefined && taxTotal > amount) return { error: "The tax can't be more than the amount of the expense" };
  return { taxes: list, taxTotal };
}

router.post("/", requirePermission("expenses.create"), async (req, res) => {
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { taxes, ...rest } = parsed.data;
  const tax = taxFields(taxes, rest.amount);
  if (tax.error) return res.status(400).json({ error: tax.error });
  const expense = await prisma.expense.create({
    data: { ...rest, ...tax, createdById: req.user.id },
  });

  await logActivity({ userId: req.user.id, action: "CREATE", entityType: "Expense", entityId: expense.id, details: parsed.data });
  res.status(201).json(expense);
});

router.patch("/:id", requirePermission("expenses.edit"), async (req, res) => {
  const parsed = expenseSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { taxes, ...rest } = parsed.data;
  const existing = await prisma.expense.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Expense not found" });
  const tax = taxFields(taxes, rest.amount ?? Number(existing.amount));
  if (tax.error) return res.status(400).json({ error: tax.error });
  if (taxes === undefined && rest.amount !== undefined && Number(existing.taxTotal) > rest.amount) {
    return res.status(400).json({ error: "The tax can't be more than the amount of the expense" });
  }
  const expense = await prisma.expense.update({
    where: { id: req.params.id },
    data: { ...rest, ...tax },
  });

  await logActivity({ userId: req.user.id, action: "UPDATE", entityType: "Expense", entityId: expense.id, details: parsed.data });
  res.json(expense);
});

router.delete("/:id", requirePermission("expenses.delete"), async (req, res) => {
  await prisma.expense.delete({ where: { id: req.params.id } });
  await logActivity({ userId: req.user.id, action: "DELETE", entityType: "Expense", entityId: req.params.id });
  res.status(204).end();
});

module.exports = router;
