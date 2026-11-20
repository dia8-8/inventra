// Tax maths shared by the order form (a live preview). The server does the same sum when it
// saves the order and its answer is the one that counts, so keep the two in step.

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// lines: [{ lineTotal, taxable }]   taxes: [{ name, rate, number? }]  (rate is a percentage)
// Only taxable products count; the discount and the delivery fee are shared in proportion.
export function computeOrderTaxes({ lines, discount = 0, deliveryFee = 0, taxes }) {
  const subtotal = lines.reduce((sum, l) => sum + Number(l.lineTotal), 0);
  const taxableSubtotal = lines.reduce((sum, l) => sum + (l.taxable ? Number(l.lineTotal) : 0), 0);
  const share = subtotal > 0 ? taxableSubtotal / subtotal : 0;
  const base = Math.max(0, taxableSubtotal - discount * share) + deliveryFee * share;
  const result = taxes.map((t) => ({
    name: t.name,
    rate: Number(t.rate),
    number: t.number || null,
    base: round2(base),
    amount: round2((base * Number(t.rate)) / 100),
  }));
  return { taxes: result, taxTotal: round2(result.reduce((sum, t) => sum + t.amount, 0)) };
}

// For an expense: given the total paid (tax included), how much of it was each tax?
// Handy when a supplier receipt only shows the total.
export function splitTaxIncluded(total, taxes) {
  const totalRate = taxes.reduce((sum, t) => sum + Number(t.rate), 0);
  const base = Number(total) / (1 + totalRate / 100);
  return taxes.map((t) => ({ name: t.name, amount: round2((base * Number(t.rate)) / 100) }));
}

export function formatRate(rate) {
  return `${Number(Number(rate).toFixed(4))}%`;
}
