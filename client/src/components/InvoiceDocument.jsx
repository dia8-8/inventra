import { formatRate } from "../lib/tax";
import { BLOCKS, COLUMNS, FONTS, SPACINGS, TEXT_SIZES, normalizeLayout, toRows } from "../lib/invoiceLayout";

const STATUS_LABELS = {
  PENDING: "Pending",
  PREPARING: "Preparing",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

const TEXT_ALIGN = { left: "text-left", center: "text-center", right: "text-right" };
const IMG_ALIGN = { left: "", center: "mx-auto", right: "ml-auto" };
const PLACE = { left: "flex-start", center: "center", right: "flex-end" };
const NUMERIC = new Set(["qty", "unitPrice", "total"]);
const GUTTER = 12; // px of space on each side of a section; neighbours are therefore 24px apart

function makeMoney(currency) {
  let formatter;
  try {
    formatter = new Intl.NumberFormat("en-CA", { style: "currency", currency: currency || "CAD" });
  } catch {
    formatter = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
  }
  return (n) => formatter.format(Number(n) || 0);
}

// In the designer, \`selectedId\` highlights a section and \`onSelect\` makes the sections clickable.
export default function InvoiceDocument({ layout: rawLayout, settings, order, selectedId, onSelect }) {
  const layout = normalizeLayout(rawLayout);
  const money = makeMoney(settings?.currency);
  const accent = layout.accent;
  const columns = layout.columns.filter((c) => c.enabled);

  const visible = layout.blocks.filter((b) => {
    if (!b.enabled) return false;
    if (b.id === "logo") return Boolean(layout.logo);
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

  function renderBlock(block) {
    const text = TEXT_ALIGN[block.align];
    switch (block.id) {
      case "logo":
        return <img src={layout.logo} alt="" style={{ maxHeight: layout.logoHeight, maxWidth: "100%" }} className={`block object-contain ${IMG_ALIGN[block.align]}`} />;

      case "header":
        return (
          <div className={text}>
            <div className="text-xl font-bold" style={{ color: accent }}>
              {settings.companyName}
            </div>
            {block.showAddress !== false && settings.address && <div className="text-sm text-gray-500">{settings.address}</div>}
            {block.showPhone !== false && settings.phone && <div className="text-sm text-gray-500">{settings.phone}</div>}
            {block.showEmail !== false && settings.email && <div className="text-sm text-gray-500 break-all">{settings.email}</div>}
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
        // the tax charged on this order as it was issued; registration numbers belong on a taxed invoice
        const taxLines = (Array.isArray(order.taxes) ? order.taxes : []).filter((t) => Number(t.amount) > 0);
        const taxNumbers = taxLines.filter((t) => t.number).map((t) => `${t.name} no. ${t.number}`);
        return (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Subtotal</span>
              <span>{money(order.subtotal)}</span>
            </div>
            {Number(order.discount) > 0 && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Discount</span>
                <span>-{money(order.discount)}</span>
              </div>
            )}
            {Number(order.deliveryFee) > 0 && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Delivery fee</span>
                <span>{money(order.deliveryFee)}</span>
              </div>
            )}
            {taxLines.map((t) => (
              <div key={t.name} className="flex justify-between gap-4">
                <span className="text-gray-500">
                  {t.name} ({formatRate(t.rate)})
                </span>
                <span>{money(t.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between gap-4 font-semibold text-base pt-1" style={{ borderTop: `2px solid ${accent}` }}>
              <span>Total</span>
              <span>{money(order.total)}</span>
            </div>
            {block.showPaid !== false && (
              <>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500">Paid</span>
                  <span>{money(order.amountPaid)}</span>
                </div>
                <div className="flex justify-between gap-4 font-semibold" style={{ color: accent }}>
                  <span>Balance Due</span>
                  <span>{money(balanceDue)}</span>
                </div>
              </>
            )}
            {taxNumbers.length > 0 && <div className="pt-2 text-[11px] text-gray-400">{taxNumbers.join(" · ")}</div>}
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

  const selectable = typeof onSelect === "function";

  return (
    <div
      className={`flex flex-col ${FONTS[layout.font].className}`}
      style={{ gap: SPACINGS[layout.spacing].gap, zoom: TEXT_SIZES[layout.textSize].zoom }}
    >
      {toRows(visible).map((row, i) => (
        <div
          key={i}
          className="flex items-start"
          style={{
            margin: `0 -${GUTTER}px`,
            // several sections: spread to both edges; a lone narrow section goes where its text alignment says
            justifyContent: row.length > 1 ? "space-between" : PLACE[row[0].align],
          }}
        >
          {row.map((b) => {
            const selected = selectable && selectedId === b.id;
            return (
              <div
                key={b.id}
                data-block={b.id}
                style={{ width: `${b.width}%`, padding: `0 ${GUTTER}px`, minWidth: 0 }}
                {...(selectable
                  ? {
                      role: "button",
                      tabIndex: 0,
                      "aria-label": `Edit ${BLOCKS[b.id].label}`,
                      "aria-pressed": selected,
                      onClick: () => onSelect(b.id),
                      onKeyDown: (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelect(b.id);
                        }
                      },
                    }
                  : {})}
              >
                <div
                  className={
                    selectable
                      ? `relative rounded-md cursor-pointer transition ${
                          selected ? "outline outline-2 outline-offset-4 outline-brand-500" : "hover:outline hover:outline-1 hover:outline-dashed hover:outline-offset-4 hover:outline-gray-400"
                        }`
                      : ""
                  }
                >
                  {selected && (
                    <span className="absolute -top-5 left-0 z-10 rounded bg-brand-500 px-1.5 py-0.5 text-[10px] font-semibold text-white print:hidden">{BLOCKS[b.id].label}</span>
                  )}
                  {renderBlock(b)}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
