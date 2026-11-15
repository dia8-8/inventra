// The invoice is built from a list of blocks the admin can reorder, hide and resize,
// plus a configurable set of item-table columns. This file is the single description of
// what exists and what the defaults are; the invoice page and the designer both use it.

export const BLOCKS = {
  header: { label: "Company header", hint: "Name, address, phone and logo" },
  invoiceInfo: { label: "Invoice details", hint: "Title, invoice number and date" },
  billTo: { label: "Bill to", hint: "Customer name, business, address, phone" },
  status: { label: "Order & payment status", hint: "Current status and whether it is paid" },
  items: { label: "Items table", hint: "The products on the order" },
  totals: { label: "Totals", hint: "Subtotal, discount, delivery, total, balance" },
  notes: { label: "Order notes", hint: "Shown only when the order has notes" },
  footer: { label: "Footer message", hint: "Your own text, e.g. payment terms or a thank-you" },
};

export const COLUMNS = {
  item: "Item",
  category: "Category",
  unit: "Unit",
  qty: "Qty",
  unitPrice: "Unit price",
  total: "Total",
};

export const ACCENTS = ["#b91c1c", "#c2410c", "#a16207", "#15803d", "#0f766e", "#0369a1", "#4338ca", "#7e22ce", "#be185d", "#374151"];

export const FONTS = {
  sans: { label: "Modern", className: "font-sans" },
  serif: { label: "Classic", className: "font-serif" },
  mono: { label: "Typewriter", className: "font-mono" },
};

// Matches how the invoice looked before it became customizable.
export const DEFAULT_LAYOUT = {
  version: 1,
  accent: "#b91c1c",
  font: "sans",
  logo: null,
  blocks: [
    { id: "header", enabled: true, width: "half", align: "left", showLogo: true, showAddress: true, showPhone: true },
    { id: "invoiceInfo", enabled: true, width: "half", align: "right", title: "Invoice" },
    { id: "billTo", enabled: true, width: "half", align: "left" },
    { id: "status", enabled: true, width: "half", align: "right" },
    { id: "items", enabled: true, width: "full", align: "left" },
    { id: "totals", enabled: true, width: "full", align: "right", showPaid: true },
    { id: "notes", enabled: true, width: "full", align: "left" },
    { id: "footer", enabled: false, width: "full", align: "center", text: "Thank you for your business!" },
  ],
  columns: [
    { key: "item", enabled: true },
    { key: "category", enabled: false },
    { key: "unit", enabled: false },
    { key: "qty", enabled: true },
    { key: "unitPrice", enabled: true },
    { key: "total", enabled: true },
  ],
};

const clone = (x) => JSON.parse(JSON.stringify(x));

// Accepts whatever is stored (possibly null, older, or partial) and returns a complete,
// valid layout: unknown blocks are dropped, missing ones are added back (hidden) at the end.
export function normalizeLayout(raw) {
  const base = clone(DEFAULT_LAYOUT);
  if (!raw || typeof raw !== "object") return base;

  const defaultBlock = (id) => base.blocks.find((b) => b.id === id);
  const blocks = [];
  const seen = new Set();
  for (const stored of Array.isArray(raw.blocks) ? raw.blocks : []) {
    const def = defaultBlock(stored?.id);
    if (!def || seen.has(stored.id)) continue;
    seen.add(stored.id);
    blocks.push({ ...def, ...stored });
  }
  for (const def of base.blocks) if (!seen.has(def.id)) blocks.push({ ...def, enabled: false });

  const columns = [];
  const seenCols = new Set();
  for (const stored of Array.isArray(raw.columns) ? raw.columns : []) {
    if (!COLUMNS[stored?.key] || seenCols.has(stored.key)) continue;
    seenCols.add(stored.key);
    columns.push({ key: stored.key, enabled: Boolean(stored.enabled) });
  }
  for (const def of base.columns) if (!seenCols.has(def.key)) columns.push({ key: def.key, enabled: false });
  if (!columns.some((c) => c.enabled)) columns.find((c) => c.key === "item").enabled = true;

  return {
    version: 1,
    accent: /^#[0-9a-fA-F]{6}$/.test(raw.accent || "") ? raw.accent : base.accent,
    font: FONTS[raw.font] ? raw.font : base.font,
    logo: typeof raw.logo === "string" && raw.logo.startsWith("data:image/") ? raw.logo : null,
    blocks,
    columns,
  };
}

// Sample order used by the designer's live preview.
export const SAMPLE_ORDER = {
  orderNumber: "ORD-0042",
  createdAt: new Date().toISOString(),
  status: "OUT_FOR_DELIVERY",
  paymentStatus: "PARTIAL",
  subtotal: 164,
  discount: 10,
  deliveryFee: 8,
  total: 162,
  amountPaid: 100,
  notes: "Please deliver before 9 AM, back entrance.",
  customer: { name: "Maple Diner", businessName: "Maple Diner Inc.", address: "123 Main Street, Montreal", phone: "514-555-0123" },
  items: [
    { id: "1", quantity: 12, unitPrice: 9.5, lineTotal: 114, product: { name: "Ribeye Steak", category: "beef", unit: "KG" } },
    { id: "2", quantity: 10, unitPrice: 5, lineTotal: 50, product: { name: "Whole Chicken", category: "chicken", unit: "KG" } },
  ],
};
