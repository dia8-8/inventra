const express = require("express");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { requireAuth, requirePermission, requireAnyPermission, requireFeature } = require("../middleware/auth");
const { logActivity } = require("../lib/activityLog");
const { round2 } = require("../lib/tax");

const router = express.Router();
router.use(requireAuth);

const TAX_ORDER = [{ sortOrder: "asc" }, { createdAt: "asc" }];

// The list of taxes is needed wherever an amount of tax is shown or entered
router.get(
  "/",
  requireAnyPermission("settings.edit", "taxes.view", "orders.create", "orders.edit", "expenses.create", "expenses.edit"),
  async (req, res) => {
    const taxes = await prisma.tax.findMany({ orderBy: TAX_ORDER, select: { id: true, name: true, rate: true, number: true, sortOrder: true } });
    res.json(taxes);
  }
);

const listSchema = z.object({
  taxes: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Every tax needs a name").max(40),
        rate: z.coerce.number().min(0, "A tax rate can't be negative").max(100, "A tax rate can't be more than 100%"),
        number: z
          .string()
          .trim()
          .max(40)
          .optional()
          .nullable()
          .transform((v) => v || null),
      })
    )
    .max(10, "Up to 10 taxes"),
});

// Saves the whole list at once. Orders keep a copy of the tax they charged, so editing the
// list never changes an invoice that was already issued.
router.put("/", requirePermission("settings.edit"), async (req, res) => {
  const parsed = listSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const names = parsed.data.taxes.map((t) => t.name.toLowerCase());
  if (new Set(names).size !== names.length) return res.status(400).json({ error: "Each tax needs a different name" });

  await prisma.$transaction(async (tx) => {
    await tx.tax.deleteMany({});
    if (parsed.data.taxes.length) {
      await tx.tax.createMany({ data: parsed.data.taxes.map((t, i) => ({ name: t.name, rate: t.rate, number: t.number, sortOrder: i })) });
    }
  });

  await logActivity({ userId: req.user.id, action: "UPDATE", entityType: "Tax", details: { taxes: parsed.data.taxes.map((t) => `${t.name} ${t.rate}%`) } });
  res.json(await prisma.tax.findMany({ orderBy: TAX_ORDER, select: { id: true, name: true, rate: true, number: true, sortOrder: true } }));
});

function parseRange(req) {
  const { from, to } = req.query;
  const now = new Date();
  const start = from ? new Date(String(from)) : new Date(now.getFullYear(), now.getMonth(), 1);
  if (!from) start.setHours(0, 0, 0, 0);
  const end = to ? new Date(String(to)) : now;
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

// Tax collected on sales vs tax paid on expenses, for a period.
// Sales count on the invoice date; cancelled orders are left out.
router.get("/report", requirePermission("taxes.view"), requireFeature("reports"), async (req, res) => {
  const { start, end } = parseRange(req);

  const [orders, expenses] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: start, lte: end }, status: { not: "CANCELLED" } },
      select: { createdAt: true, total: true, taxTotal: true, taxes: true },
    }),
    prisma.expense.findMany({
      where: { date: { gte: start, lte: end } },
      select: { date: true, amount: true, taxTotal: true, taxes: true },
    }),
  ]);

  const byTax = new Map(); // name -> { name, rate, taxableSales, collected, paid }
  const byMonth = new Map(); // YYYY-MM -> { month, collected, paid }
  const entry = (name) => {
    if (!byTax.has(name)) byTax.set(name, { name, rate: null, taxableSales: 0, collected: 0, paid: 0 });
    return byTax.get(name);
  };
  const month = (key) => {
    if (!byMonth.has(key)) byMonth.set(key, { month: key, collected: 0, paid: 0 });
    return byMonth.get(key);
  };

  let salesTotal = 0;
  let salesTax = 0;
  let ordersWithoutTax = 0;
  for (const o of orders) {
    salesTotal += Number(o.total);
    salesTax += Number(o.taxTotal);
    if (!Array.isArray(o.taxes)) ordersWithoutTax++;
    for (const t of Array.isArray(o.taxes) ? o.taxes : []) {
      const e = entry(t.name);
      e.rate = t.rate;
      e.taxableSales += Number(t.base);
      e.collected += Number(t.amount);
    }
    month(monthKey(o.createdAt)).collected += Number(o.taxTotal);
  }

  let expensesTotal = 0;
  let expensesTax = 0;
  let expensesWithoutTax = 0;
  for (const x of expenses) {
    expensesTotal += Number(x.amount);
    expensesTax += Number(x.taxTotal);
    if (!Array.isArray(x.taxes)) expensesWithoutTax++;
    for (const t of Array.isArray(x.taxes) ? x.taxes : []) entry(t.name).paid += Number(t.amount);
    month(monthKey(x.date)).paid += Number(x.taxTotal);
  }

  // current rates for display, for taxes that have no sales in the period
  const current = await prisma.tax.findMany({ orderBy: TAX_ORDER, select: { name: true, rate: true } });
  for (const t of current) {
    const e = entry(t.name);
    if (e.rate === null) e.rate = Number(t.rate);
  }

  const taxes = Array.from(byTax.values()).map((t) => ({
    ...t,
    taxableSales: round2(t.taxableSales),
    collected: round2(t.collected),
    paid: round2(t.paid),
    net: round2(t.collected - t.paid),
  }));

  res.json({
    from: start,
    to: end,
    totals: {
      collected: round2(salesTax),
      paid: round2(expensesTax),
      net: round2(salesTax - expensesTax),
      salesBeforeTax: round2(salesTotal - salesTax),
      expensesBeforeTax: round2(expensesTotal - expensesTax),
    },
    taxes,
    months: Array.from(byMonth.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((m) => ({ ...m, collected: round2(m.collected), paid: round2(m.paid), net: round2(m.collected - m.paid) })),
    counts: { orders: orders.length, ordersWithoutTax, expenses: expenses.length, expensesWithoutTax },
  });
});

module.exports = router;
