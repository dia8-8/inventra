import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useNotify, errorMessage } from "../context/NotifyContext";
import { EmptyState, PageHeader, PageSkeleton, StatCard } from "../components/ui";
import { CashIcon, ExpensesIcon, ReceiptIcon } from "../components/icons";
import { formatRate } from "../lib/tax";

const money = (n) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n || 0);

const pad = (n) => String(n).padStart(2, "0");
const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthLabel = (m) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("en-CA", { month: "long", year: "numeric" });
};

// Ready-made periods; tax is usually filed monthly, quarterly or yearly.
const PRESETS = [
  { label: "This month", range: (n) => [new Date(n.getFullYear(), n.getMonth(), 1), n] },
  { label: "Last month", range: (n) => [new Date(n.getFullYear(), n.getMonth() - 1, 1), new Date(n.getFullYear(), n.getMonth(), 0)] },
  {
    label: "This quarter",
    range: (n) => {
      const q = Math.floor(n.getMonth() / 3) * 3;
      return [new Date(n.getFullYear(), q, 1), n];
    },
  },
  {
    label: "Last quarter",
    range: (n) => {
      const q = Math.floor(n.getMonth() / 3) * 3;
      return [new Date(n.getFullYear(), q - 3, 1), new Date(n.getFullYear(), q, 0)];
    },
  },
  { label: "This year", range: (n) => [new Date(n.getFullYear(), 0, 1), n] },
  { label: "Last year", range: (n) => [new Date(n.getFullYear() - 1, 0, 1), new Date(n.getFullYear() - 1, 11, 31)] },
];
const presetDates = (p) => p.range(new Date()).map(dateStr);

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export default function Taxes() {
  const { can } = useAuth();
  const notify = useNotify();
  const [from, setFrom] = useState(() => presetDates(PRESETS[0])[0]);
  const [to, setTo] = useState(() => presetDates(PRESETS[0])[1]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get("/taxes/report", { params: { from, to } })
      .then(({ data }) => setReport(data))
      .catch((err) => notify.error(errorMessage(err, "Couldn't load the tax report")))
      .finally(() => setLoading(false));
  }, [from, to]);

  const activePreset = useMemo(
    () =>
      PRESETS.find((p) => {
        const [f, t] = presetDates(p);
        return f === from && t === to;
      })?.label,
    [from, to]
  );

  function downloadCsv() {
    const rows = [
      ["Tax report", `${from} to ${to}`],
      [],
      ["Tax", "Rate %", "Taxable sales", "Tax collected", "Tax paid on expenses", "Net owed"],
      ...report.taxes.map((t) => [t.name, t.rate ?? "", t.taxableSales.toFixed(2), t.collected.toFixed(2), t.paid.toFixed(2), t.net.toFixed(2)]),
      ["Total", "", report.totals.salesBeforeTax.toFixed(2), report.totals.collected.toFixed(2), report.totals.paid.toFixed(2), report.totals.net.toFixed(2)],
      [],
      ["Month", "Tax collected", "Tax paid", "Net owed"],
      ...report.months.map((m) => [m.month, m.collected.toFixed(2), m.paid.toFixed(2), m.net.toFixed(2)]),
    ];
    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tax-report-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const noTaxData = report && report.taxes.length === 0;
  const owing = report ? report.totals.net >= 0 : true;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Taxes"
        subtitle="Tax collected on sales, tax paid on expenses, and what is left to send in"
        actions={
          <div className="flex gap-2 flex-wrap items-center print:hidden">
            <select
              aria-label="Period"
              value={activePreset || ""}
              onChange={(e) => {
                const p = PRESETS.find((x) => x.label === e.target.value);
                if (!p) return;
                const [f, t] = presetDates(p);
                setFrom(f);
                setTo(t);
              }}
              className="input"
            >
              {!activePreset && <option value="">Custom dates</option>}
              {PRESETS.map((p) => (
                <option key={p.label} value={p.label}>
                  {p.label}
                </option>
              ))}
            </select>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className="input" />
            <span className="text-gray-400 dark:text-gray-500 text-sm">to</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" className="input" />
            <button type="button" onClick={downloadCsv} disabled={!report || noTaxData} className="btn-secondary">
              Download CSV
            </button>
            <button type="button" onClick={() => window.print()} className="btn-secondary">
              Print
            </button>
          </div>
        }
      />
      <p className="hidden print:block text-sm text-gray-600">
        Period: {from} to {to}
      </p>

      {loading || !report ? (
        <PageSkeleton stats={3} rows={0} />
      ) : noTaxData ? (
        <div className="card">
          <EmptyState
            icon={ReceiptIcon}
            title="No tax recorded for this period"
            text="Orders get tax once you have set up your taxes, and expenses show tax once you enter the tax paid on them."
            action={
              can("settings.edit") && (
                <Link to="/settings" className="btn-primary">
                  Set up taxes
                </Link>
              )
            }
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger">
            <StatCard label="Tax collected on sales" value={report.totals.collected} format={money} icon={CashIcon} tone="brand" hint={`on ${money(report.totals.salesBeforeTax)} of taxable sales`} />
            <StatCard label="Tax paid on expenses" value={report.totals.paid} format={money} icon={ExpensesIcon} tone="warn" hint="what you can claim back" />
            <StatCard
              label={owing ? "Net tax to send in" : "Net tax refund"}
              value={Math.abs(report.totals.net)}
              format={money}
              icon={ReceiptIcon}
              tone={owing ? "bad" : "good"}
              hint={owing ? "collected minus paid" : "you paid more than you collected"}
            />
          </div>

          <section className="card overflow-hidden">
            <h2 className="px-4 pt-4 text-sm font-semibold dark:text-gray-100">By tax</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm mt-2">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700/60">
                    <th className="text-left font-semibold px-4 py-2">Tax</th>
                    <th className="text-right font-semibold px-4 py-2">Taxable sales</th>
                    <th className="text-right font-semibold px-4 py-2">Collected</th>
                    <th className="text-right font-semibold px-4 py-2">Paid</th>
                    <th className="text-right font-semibold px-4 py-2">Net owed</th>
                  </tr>
                </thead>
                <tbody>
                  {report.taxes.map((t) => (
                    <tr key={t.name} className="border-b border-gray-50 dark:border-gray-700/40">
                      <td className="px-4 py-2.5 font-medium dark:text-gray-100">
                        {t.name}
                        {t.rate != null && <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">{formatRate(t.rate)}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums dark:text-gray-200">{money(t.taxableSales)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums dark:text-gray-200">{money(t.collected)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums dark:text-gray-200">{money(t.paid)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold dark:text-gray-100">{money(t.net)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td className="px-4 py-2.5 dark:text-gray-100">Total</td>
                    <td className="px-4 py-2.5 text-right tabular-nums dark:text-gray-100">{money(report.totals.salesBeforeTax)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums dark:text-gray-100">{money(report.totals.collected)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums dark:text-gray-100">{money(report.totals.paid)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums dark:text-gray-100">{money(report.totals.net)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {report.months.length > 1 && (
            <section className="card overflow-hidden">
              <h2 className="px-4 pt-4 text-sm font-semibold dark:text-gray-100">By month</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm mt-2">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700/60">
                      <th className="text-left font-semibold px-4 py-2">Month</th>
                      <th className="text-right font-semibold px-4 py-2">Collected</th>
                      <th className="text-right font-semibold px-4 py-2">Paid</th>
                      <th className="text-right font-semibold px-4 py-2">Net owed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.months.map((m) => (
                      <tr key={m.month} className="border-b border-gray-50 dark:border-gray-700/40">
                        <td className="px-4 py-2.5 dark:text-gray-100">{monthLabel(m.month)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums dark:text-gray-200">{money(m.collected)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums dark:text-gray-200">{money(m.paid)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold dark:text-gray-100">{money(m.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <div className="space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
            <p>
              Based on {report.counts.orders} order{report.counts.orders === 1 ? "" : "s"} (cancelled orders left out) and {report.counts.expenses} expense{report.counts.expenses === 1 ? "" : "s"}. Orders use the tax they were issued with, so changing a rate never alters past figures.
            </p>
            {report.counts.ordersWithoutTax > 0 && (
              <p>
                {report.counts.ordersWithoutTax} order{report.counts.ordersWithoutTax === 1 ? " has" : "s have"} no tax on {report.counts.ordersWithoutTax === 1 ? "it" : "them"}: tax-free items only, or placed before taxes were set up.
              </p>
            )}
            {report.counts.expensesWithoutTax > 0 && (
              <p>
                {report.counts.expensesWithoutTax} expense{report.counts.expensesWithoutTax === 1 ? " has" : "s have"} no tax recorded, so nothing is claimed on {report.counts.expensesWithoutTax === 1 ? "it" : "them"}. Edit an expense to enter the tax paid.
              </p>
            )}
            <p>This is a summary to help you prepare your return. Check the figures with your accountant before filing.</p>
          </div>
        </>
      )}
    </div>
  );
}
