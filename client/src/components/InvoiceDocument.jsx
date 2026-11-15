import { COLUMNS, FONTS, normalizeLayout } from "../lib/invoiceLayout";

const STATUS_LABELS = {
  PENDING: "Pending",
  PREPARING: "Preparing",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

const TEXT_ALIGN = { left: "text-left", center: "text-center", right: "text-right" };
const FLEX_ALIGN = { left: "justify-start", center: "justify-center", right: "justify-end" };
const IMG_ALIGN = { left: "", center: "mx-auto", right: "ml-auto" };
const NUMERIC = new Set(["qty", "unitPrice", "total"]);

function makeMoney(currency) {
  let formatter;
  try {
    formatter = new Intl.NumberFormat("en-CA", { style: "currency", currency: currency || "CAD" });
  } catch {
    formatter = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
  }
  return (n) => formatter.format(Number(n) || 0);
}

// Blocks marked "half" that sit next to each other share a row; a lone half block takes the full width.
function toRows(blocks) {
  const rows = [];
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].width === "half" && blocks[i + 1]?.width === "half") {
      rows.push([blocks[i], blocks[i + 1]]);
      i++;
    } else {
      rows.push([blocks[i]]);
    }
  }
  return rows;
}

export default function InvoiceDocument({ layout: rawLayout, settings, order }) {
  const layout = normalizeLayout(rawLayout);
  const money = makeMoney(settings?.currency);
  const accent = layout.accent;
  const columns = layout.columns.filter((c) => c.enabled);

  const visible = layout.blocks.filter((b) => {
    if (!b.enabled) return false;
    if (b.id === "notes") return Boolean(order.notes);
    if (b.id === "footer") return Boolean(b.text?.trim());
    return true;
  });

  function cell(key, it) {
    switch (key) {
      case "item":
        return it.product?.name || "Product";
      case "category":
        return <span className="capitalize">{it.product?.category || ""}</span>;
      case "unit":
        return <span className="lowercase">{it.product?.unit || ""}</span>;
      case "qty":
        return it.quantity;
      case "unitPrice":
        return money(it.unitPrice);
      case "total":
        return money(it.lineTotal);
      default:
        return "";
    }
  }

  function renderBlock(block, inHalf) {
    const text = TEXT_ALIGN[block.align];
    switch (block.id) {
      case "header":
        return (
          <div className={text}>
            {block.showLogo !== false && layout.logo && (
              <img src={layout.logo} alt="" className={`max-h-16 max-w-[12rem] object-contain mb-2 ${IMG_ALIGN[block.align]}`} />
            )}
            <div className="text-xl font-bold" style={{ color: accent }}>
              {settings.companyName}
            </div>
            {block.showAddress !== false && settings.address && <div className="text-sm text-gray-500">{settings.address}</div>}
            {block.showPhone !== false && settings.phone && <div className="text-sm text-gray-500">{settings.phone}</div>}
          </div>
        );

      case "invoiceInfo":
        return (
          <div className={text}>
            <div className="text-2xl font-semibold">{block.title?.trim() || "Invoice"}</div>
            <div className="text-sm text-gray-500">{order.orderNumber}</div>
            <div className="text-sm text-gray-500">{new Date(order.createdAt).toLocaleDateString()}</div>
          </div>
        );

      case "billTo":
        return (
          <div className={text}>
            <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: accent }}>
              Bill To
            </div>
            <div className="text-sm font-medium">{order.customer.name}</div>
            {order.customer.businessName && <div className="text-sm text-gray-500">{order.customer.businessName}</div>}
            {order.customer.address && <div className="text-sm text-gray-500">{order.customer.address}</div>}
            {order.customer.phone && <div className="text-sm text-gray-500">{order.customer.phone}</div>}
          </div>
        );

      case "status":
        return (
          <div className={text}>
            <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: accent }}>
              Status
            </div>
            <div className="text-sm">{STATUS_LABELS[order.status] || order.status}</div>
            <div className="text-xs font-semibold uppercase tracking-wide mt-2 mb-1" style={{ color: accent }}>
              Payment
            </div>
            <div className="text-sm">{order.paymentStatus}</div>
          </div>
        );

      case "items":
        return (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent, borderBottom: `2px solid ${accent}` }}>
                {columns.map((c) => (
                  <th key={c.key} className={`pb-2 ${NUMERIC.has(c.key) ? "text-right" : "text-left"}`}>
                    {COLUMNS[c.key]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {order.items.map((it) => (
                <tr key={it.id} className="border-b border-gray-100">
                  {columns.map((c) => (
                    <td key={c.key} className={`py-2 ${NUMERIC.has(c.key) ? "text-right" : "text-left"}`}>
                      {cell(c.key, it)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );

      case "totals": {
        const balanceDue = Number(order.total) - Number(order.amountPaid);
        return (
          <div className={`flex ${FLEX_ALIGN[block.align]}`}>
            <div className={`space-y-1 text-sm ${inHalf ? "w-full" : "w-56"}`}>
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span>{money(order.subtotal)}</span>
              </div>
              {Number(order.discount) > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Discount</span>
                  <span>-{money(order.discount)}</span>
                </div>
              )}
              {Number(order.deliveryFee) > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Delivery fee</span>
                  <span>{money(order.deliveryFee)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-base pt-1" style={{ borderTop: `2px solid ${accent}` }}>
                <span>Total</span>
                <span>{money(order.total)}</span>
              </div>
              {block.showPaid !== false && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Paid</span>
                    <span>{money(order.amountPaid)}</span>
                  </div>
                  <div className="flex justify-between font-semibold" style={{ color: accent }}>
                    <span>Balance Due</span>
                    <span>{money(balanceDue)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      }

      case "notes":
        return (
          <div className={text}>
            <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: accent }}>
              Notes
            </div>
            <div className="text-sm text-gray-600 whitespace-pre-line">{order.notes}</div>
          </div>
        );

      case "footer":
        return <div className={`text-sm text-gray-600 whitespace-pre-line ${text}`}>{block.text}</div>;

      default:
        return null;
    }
  }

  return (
    <div className={`space-y-6 ${FONTS[layout.font].className}`}>
      {toRows(visible).map((row, i) =>
        row.length === 2 ? (
          <div key={i} className="grid grid-cols-2 gap-6">
            {row.map((b) => (
              <div key={b.id} className="min-w-0">
                {renderBlock(b, true)}
              </div>
            ))}
          </div>
        ) : (
          <div key={i}>{renderBlock(row[0], false)}</div>
        )
      )}
    </div>
  );
}
