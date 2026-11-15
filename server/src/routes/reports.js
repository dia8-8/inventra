const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole, requireFeature } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireFeature("reports"), requireRole("ADMIN", "STAFF"));

function parseRange(req) {
  const { from, to } = req.query;
  const start = from ? new Date(String(from)) : new Date(new Date().setDate(new Date().getDate() - 29));
  if (!from) start.setHours(0, 0, 0, 0);
  const end = to ? new Date(String(to)) : new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// Optional ?customerId= / ?productId= narrow every report to one customer and/or one product.
function parseFilters(req) {
  const customerId = req.query.customerId ? String(req.query.customerId) : null;
  const productId = req.query.productId ? String(req.query.productId) : null;
  return { customerId, productId, filtered: Boolean(customerId || productId) };
}

// Orders in range (cancelled excluded), narrowed by the filters. With a product filter each
// order keeps only that product's lines, so sales and cost count just that product.
async function fetchOrders(req, start, end, { withCustomer = false } = {}) {
  const { customerId, productId } = parseFilters(req);
  const orders = await prisma.order.findMany({
    where: {
      createdAt: { gte: start, lte: end },
      status: { not: "CANCELLED" },
      ...(customerId ? { customerId } : {}),
      ...(productId ? { items: { some: { productId } } } : {}),
    },
    include: {
      items: { include: { product: true } },
      ...(withCustomer ? { customer: { select: { id: true, name: true } } } : {}),
    },
  });
  if (!productId) return orders;
  return orders.map((o) => ({ ...o, items: o.items.filter((i) => i.productId === productId) }));
}

// An order's total includes discount and delivery fee, which can't be split per product,
// so a product-filtered report uses the product's own line revenue instead.
function orderSales(o, productId) {
  if (!productId) return Number(o.total);
  return o.items.reduce((s, i) => s + Number(i.unitPrice) * Number(i.quantity), 0);
}

function orderCost(o) {
  return o.items.reduce((s, i) => s + Number(i.product.costPrice) * Number(i.quantity), 0);
}

router.get("/summary", async (req, res) => {
  const { start, end } = parseRange(req);
  const { productId, filtered } = parseFilters(req);

  const orders = await fetchOrders(req, start, end);

  const totalSales = orders.reduce((sum, o) => sum + orderSales(o, productId), 0);
  const totalCost = orders.reduce((sum, o) => sum + orderCost(o), 0);
  const grossProfit = totalSales - totalCost;

  // Expenses belong to the business, not to a customer or product
  let totalExpenses = 0;
  if (!filtered) {
    const expenseAgg = await prisma.expense.aggregate({
      where: { date: { gte: start, lte: end } },
      _sum: { amount: true },
    });
    totalExpenses = Number(expenseAgg._sum.amount || 0);
  }
  const netProfit = grossProfit - totalExpenses;

  res.json({
    orderCount: orders.length,
    totalSales,
    totalCost,
    grossProfit,
    totalExpenses,
    netProfit,
    filtered,
  });
});

function localDateKey(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

router.get("/trend", async (req, res) => {
  const { start, end } = parseRange(req);
  const { productId, filtered } = parseFilters(req);

  const [orders, expenses] = await Promise.all([
    fetchOrders(req, start, end),
    filtered ? Promise.resolve([]) : prisma.expense.findMany({ where: { date: { gte: start, lte: end } } }),
  ]);

  const dailyMap = new Map();
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);
  while (cursor <= endDay) {
    const key = localDateKey(cursor);
    dailyMap.set(key, { date: key, sales: 0, expenses: 0, profit: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const o of orders) {
    const key = localDateKey(o.createdAt);
    const bucket = dailyMap.get(key);
    if (!bucket) continue;
    const sales = orderSales(o, productId);
    bucket.sales += sales;
    bucket.profit += sales - orderCost(o);
  }
  for (const e of expenses) {
    const key = localDateKey(e.date);
    const bucket = dailyMap.get(key);
    if (!bucket) continue;
    bucket.expenses += Number(e.amount);
    bucket.profit -= Number(e.amount);
  }

  res.json({ trend: Array.from(dailyMap.values()), filtered });
});

router.get("/top-products", async (req, res) => {
  const { start, end } = parseRange(req);
  const limit = Math.min(Number(req.query.limit) || 10, 50);

  const orders = await fetchOrders(req, start, end);

  const map = new Map();
  for (const o of orders) {
    for (const item of o.items) {
      const key = item.productId;
      const entry = map.get(key) || { name: item.product.name, quantity: 0, revenue: 0 };
      entry.quantity += Number(item.quantity);
      entry.revenue += Number(item.unitPrice) * Number(item.quantity);
      map.set(key, entry);
    }
  }

  const topProducts = Array.from(map.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);

  res.json(topProducts);
});

router.get("/top-customers", async (req, res) => {
  const { start, end } = parseRange(req);
  const { productId } = parseFilters(req);
  const limit = Math.min(Number(req.query.limit) || 10, 50);

  const orders = await fetchOrders(req, start, end, { withCustomer: true });

  const map = new Map();
  for (const o of orders) {
    const key = o.customerId;
    const entry = map.get(key) || { name: o.customer.name, orderCount: 0, total: 0 };
    entry.orderCount += 1;
    entry.total += orderSales(o, productId);
    map.set(key, entry);
  }

  const topCustomers = Array.from(map.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);

  res.json(topCustomers);
});

module.exports = router;
