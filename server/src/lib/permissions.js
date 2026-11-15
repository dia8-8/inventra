// Fine-grained permissions. An admin picks which of these each STAFF member has.
//   ADMIN / SUPER_ADMIN  -> everything, always (cannot be restricted)
//   DRIVER               -> a fixed set for working their own deliveries
//   STAFF                -> User.permissions if the admin customised it, otherwise STAFF_DEFAULT

const GROUPS = [
  {
    key: "dashboard",
    label: "Dashboard",
    permissions: [{ key: "dashboard.view", label: "View the dashboard", description: "Sales, profit, charts and alerts on the home screen" }],
  },
  {
    key: "orders",
    label: "Orders & invoices",
    permissions: [
      { key: "orders.view", label: "View orders and print invoices" },
      { key: "orders.create", label: "Create orders" },
      { key: "orders.edit", label: "Edit invoices", description: "Change the items, prices, discount and notes of a pending order" },
      { key: "orders.status", label: "Change order status", description: "Mark orders as preparing, out for delivery, delivered or cancelled" },
      { key: "orders.payments", label: "Record payments" },
      { key: "orders.delete", label: "Delete orders" },
    ],
  },
  {
    key: "customers",
    label: "Customers",
    permissions: [
      { key: "customers.view", label: "View customers" },
      { key: "customers.create", label: "Add customers" },
      { key: "customers.edit", label: "Edit customers and their special prices" },
      { key: "customers.delete", label: "Delete customers" },
    ],
  },
  {
    key: "products",
    label: "Products",
    permissions: [
      { key: "products.view", label: "View products" },
      { key: "products.create", label: "Add products" },
      { key: "products.edit", label: "Edit products and prices" },
      { key: "products.delete", label: "Delete products" },
    ],
  },
  {
    key: "inventory",
    label: "Inventory",
    permissions: [
      { key: "inventory.view", label: "View stock levels and movements" },
      { key: "inventory.adjust", label: "Add, remove and adjust stock", description: "Includes scanning barcodes to stock in" },
    ],
  },
  {
    key: "suppliers",
    label: "Suppliers",
    permissions: [
      { key: "suppliers.view", label: "View suppliers" },
      { key: "suppliers.create", label: "Add suppliers" },
      { key: "suppliers.edit", label: "Edit suppliers" },
      { key: "suppliers.delete", label: "Delete suppliers" },
    ],
  },
  {
    key: "expenses",
    label: "Expenses",
    permissions: [
      { key: "expenses.view", label: "View expenses" },
      { key: "expenses.create", label: "Add expenses" },
      { key: "expenses.edit", label: "Edit expenses" },
      { key: "expenses.delete", label: "Delete expenses" },
    ],
  },
  {
    key: "deliveries",
    label: "Deliveries",
    permissions: [
      { key: "deliveries.view", label: "View the deliveries board" },
      { key: "deliveries.assign", label: "Assign drivers to orders" },
    ],
  },
  {
    key: "reports",
    label: "Reports",
    permissions: [{ key: "reports.view", label: "View reports", description: "Sales, expenses and profit figures" }],
  },
  {
    key: "company",
    label: "Company",
    permissions: [
      { key: "settings.edit", label: "Change company settings" },
      { key: "invoices.design", label: "Design the invoice layout" },
      { key: "activity.view", label: "View the activity log" },
      { key: "activity.delete", label: "Delete activity log entries" },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.permissions.map((p) => p.key));
const VALID = new Set(ALL);

// Having one of these only makes sense together with another, so the second comes along automatically
const IMPLIES = {
  "orders.create": ["orders.view"],
  "orders.edit": ["orders.view"],
  "orders.status": ["orders.view"],
  "orders.payments": ["orders.view"],
  "orders.delete": ["orders.view"],
  "customers.create": ["customers.view"],
  "customers.edit": ["customers.view"],
  "customers.delete": ["customers.view"],
  "products.create": ["products.view"],
  "products.edit": ["products.view"],
  "products.delete": ["products.view"],
  "inventory.adjust": ["inventory.view"],
  "suppliers.create": ["suppliers.view"],
  "suppliers.edit": ["suppliers.view"],
  "suppliers.delete": ["suppliers.view"],
  "expenses.create": ["expenses.view"],
  "expenses.edit": ["expenses.view"],
  "expenses.delete": ["expenses.view"],
  "deliveries.assign": ["deliveries.view", "orders.view"],
  "activity.delete": ["activity.view"],
};

// What a new staff member can do until the admin changes it: everything operational,
// but nothing destructive and none of the company-level controls.
const NOT_BY_DEFAULT = new Set([
  "orders.delete",
  "customers.delete",
  "products.delete",
  "suppliers.delete",
  "expenses.delete",
  "settings.edit",
  "invoices.design",
  "activity.view",
  "activity.delete",
]);
const STAFF_DEFAULT = ALL.filter((k) => !NOT_BY_DEFAULT.has(k));
const DRIVER_DEFAULT = ["orders.view", "orders.status", "deliveries.view"];

// Drops unknown keys and adds the permissions each one depends on
function normalize(list) {
  const out = new Set();
  for (const key of Array.isArray(list) ? list : []) {
    if (!VALID.has(key)) continue;
    out.add(key);
    for (const dep of IMPLIES[key] || []) out.add(dep);
  }
  return ALL.filter((k) => out.has(k));
}

function effectivePermissions(user) {
  if (!user) return [];
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return ALL.slice();
  if (user.role === "DRIVER") return DRIVER_DEFAULT.slice();
  return Array.isArray(user.permissions) ? normalize(user.permissions) : STAFF_DEFAULT.slice();
}

module.exports = { GROUPS, ALL, IMPLIES, VALID, STAFF_DEFAULT, DRIVER_DEFAULT, normalize, effectivePermissions };
