// Tax maths for orders. Money is rounded to cents at each tax.

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// How an order is taxed:
//  - only taxable products count toward the taxable amount
//  - the discount is shared across the order in proportion, so it lowers the taxable amount too
//  - the delivery fee follows the goods: taxed in proportion to the taxable share of the order
//  - every tax is worked out on that same amount (they do not stack on each other)
//
//  lines: [{ lineTotal, taxable }]   taxes: [{ name, rate }]  (rate is a percentage, 9.975 = 9.975%)
function computeOrderTaxes({ lines, discount = 0, deliveryFee = 0, taxes }) {
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
  return { taxes: result, taxTotal: round2(result.reduce((sum, t) => sum + t.amount, 0)), taxableBase: round2(base) };
}

module.exports = { computeOrderTaxes, round2 };
