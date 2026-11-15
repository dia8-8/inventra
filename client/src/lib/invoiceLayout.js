// The invoice is built from a list of blocks the admin can reorder, hide and resize,
// plus a configurable set of item-table columns. This file is the single description of
// what exists and what the defaults are; the invoice page and the designer both use it.
//
// Each block has:
//   width  how much of the page width it takes, in percent (20-100). Blocks that fit together
//          share a row: 50 + 50, 60 + 40, 33 + 33 + 33 ...
//   align  how the text inside the block lines up (left / center / right)

export const BLOCKS = {
  header: { label: "Company header", hint: "Name, address, phone, email and logo" },
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

// Page-wide size of all the text, and how much air there is between sections
export const TEXT_SIZES = { sm: { label: "Small", zoom: 0.9 }, md: { label: "Medium", zoom: 1 }, lg: { label: "Large", zoom: 1.12 } };
export const SPACINGS = { compact: { label: "Tight", gap: 14 }, normal: { label: "Normal", gap: 24 }, roomy: { label: "Roomy", gap: 36 } };

export const MIN_WIDTH = 20;
export const WIDTH_STEP = 5;

// Matches how the invoice looked before it became customizable.
export const DEFAULT_LAYOUT = {
  version: 2,
  accent: "#b91c1c",
  font: "sans",
  textSize: "md",
  spacing: "normal",
  logoHeight: 64,
  logo: null,
  blocks: [
    { id: "header", enabled: true, width: 50, align: "left", showLogo: true, showAddress: true, showPhone: true, showEmail: true },
    { id: "invoiceInfo", enabled: true, width: 50, align: "right", title: "Invoice" },
    { id: "billTo", enabled: true, width: 50, align: "left" },
    { id: "status", enabled: true, width: 50, align: "right" },
    { id: "items", enabled: true, width: 100, align: "left" },
    { id: "totals", enabled: true, width: 40, align: "right", showPaid: true },
    { id: "notes", enabled: true, width: 100, align: "left" },
    { id: "footer", enabled: false, width: 100, align: "center", text: "Thank you for your business!" },
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

// Older layouts stored "full" / "half"; anything else is snapped to a sensible percentage.
export function normalizeWidth(value, fallback = 100) {
  if (value === "full") return 100;
  if (value === "half") return 50;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(MIN_WIDTH, Math.round(n / WIDTH_STEP) * WIDTH_STEP));
}

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
    const merged = { ...def, ...stored };
    merged.width = normalizeWidth(stored.width, def.width);
    // before version 2 the totals were always a narrow box on the right, whatever the saved width said
    if ((raw.version || 1) < 2 && stored.id === "totals") merged.width = def.width;
    if (!["left", "center", "right"].includes(merged.align)) merged.align = def.align;
    blocks.push(merged);
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

  const logoHeight = Number(raw.logoHeight);
  return {
    version: 2,
    accent: /^#[0-9a-fA-F]{6}$/.test(raw.accent || "") ? raw.accent : base.accent,
    font: FONTS[raw.font] ? raw.font : base.font,
    textSize: TEXT_SIZES[raw.textSize] ? raw.textSize : base.textSize,
    spacing: SPACINGS[raw.spacing] ? raw.spacing : base.spacing,
    logoHeight: Number.isFinite(logoHeight) ? Math.min(140, Math.max(20, Math.round(logoHeight))) : base.logoHeight,
    logo: typeof raw.logo === "string" && raw.logo.startsWith("data:image/") ? raw.logo : null,
    blocks,
    columns,
  };
}

// Sections are laid out in order. They share a row while their widths add up to 100% or less,
// otherwise the next one starts a new row.
export function toRows(blocks) {
  const rows = [];
  let row = [];
  let used = 0;
  for (const block of blocks) {
    if (row.length && used + block.width > 100.01) {
      rows.push(row);
      row = [];
      used = 0;
    }
    row.push(block);
    used += block.width;
  }
  if (row.length) rows.push(row);
  return rows;
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
