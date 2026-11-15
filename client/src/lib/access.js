// The first page someone can open, used when they don't have access to the dashboard.
const CANDIDATES = [
  { to: "/orders", perm: "orders.view" },
  { to: "/customers", perm: "customers.view" },
  { to: "/products", perm: "products.view" },
  { to: "/inventory", perm: "inventory.view" },
  { to: "/deliveries", perm: "deliveries.view", feature: "deliveries" },
  { to: "/suppliers", perm: "suppliers.view" },
  { to: "/expenses", perm: "expenses.view" },
  { to: "/reports", perm: "reports.view", feature: "reports" },
  { to: "/settings", perm: "settings.edit" },
  { to: "/settings/invoice", perm: "invoices.design" },
  { to: "/activity-log", perm: "activity.view", feature: "activity-log" },
];

export function firstAllowedPath(can, hasFeature) {
  const hit = CANDIDATES.find((c) => can(c.perm) && (!c.feature || hasFeature(c.feature)));
  return hit ? hit.to : null;
}
