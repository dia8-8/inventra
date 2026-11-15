import { useEffect, useMemo, useState } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import api from "../api/client";
import { ChartTooltip, DonutChart, PALETTE, useChartTheme } from "../components/charts";
import { EmptyState, PageHeader, PageSkeleton, Skeleton, StatCard } from "../components/ui";
import { CashIcon, ExpensesIcon, OrdersIcon, ReportsIcon, TrendUpIcon } from "../components/icons";

const money = (n) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n || 0);
const moneyCompact = (n) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", notation: "compact", maximumFractionDigits: 1 }).format(n || 0);

function dateStr(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
const todayStr = () => dateStr(new Date());
function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dateStr(d);
}

const PRESETS = [
  { label: "7 days", from: () => daysAgoStr(6), to: () => todayStr() },
  { label: "30 days", from: () => daysAgoStr(29), to: () => todayStr() },
  { label: "This month", from: () => todayStr().slice(0, 8) + "01", to: () => todayStr() },
  { label: "90 days", from: () => daysAgoStr(89), to: () => todayStr() },
];

// A ranked list with a proportional bar behind each row
function RankedList({ rows, valueKey, subKey, subLabel, empty }) {
  const max = Math.max(1, ...rows.map((r) => r[valueKey]));
  if (rows.length === 0) return <EmptyState icon={ReportsIcon} title={empty} />;
  return (
    <ul className="space-y-3.5">
      {rows.map((r, i) => (
        <li key={r.name}>
          <div className="flex items-baseline justify-between gap-3 text-sm mb-1.5">
            <span className="truncate font-medium text-gray-800 dark:text-gray-200">
              <span className="text-gray-400 dark:text-gray-500 mr-2 tabular-nums">{i + 1}</span>
              {r.name}
              <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">
                {r[subKey]} {subLabel}
              </span>
            </span>
            <span className="font-semibold tabular-nums dark:text-gray-100">{money(r[valueKey])}</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700/60 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all duration-700" style={{ width: `${Math.max(4, (r[valueKey] / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function LegendDot({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

export default function Reports() {
  const chart = useChartTheme();
  const [from, setFrom] = useState(daysAgoStr(29));
  const [to, setTo] = useState(todayStr());
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState(null);
  const [topProducts, setTopProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [topCustomers, setTopCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [productId, setProductId] = useState("");
  const filtered = Boolean(customerId || productId);

  function load() {
    setLoading(true);
    const params = { from, to };
    if (customerId) params.customerId = customerId;
    if (productId) params.productId = productId;
    Promise.all([
      api.get("/reports/summary", { params }),
      api.get("/reports/trend", { params }),
      api.get("/reports/top-products", { params: { ...params, limit: 50 } }),
      api.get("/reports/top-customers", { params: { ...params, limit: 5 } }),
    ])
      .then(([s, t, p, c]) => {
        setSummary(s.data);
        setTrend(t.data.trend);
        setAllProducts(p.data);
        setTopProducts(p.data.slice(0, 5));
        setTopCustomers(c.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [from, to, customerId, productId]);

  useEffect(() => {
    Promise.all([api.get("/customers"), api.get("/products")])
      .then(([c, p]) => {
        setCustomers(c.data);
        setProducts(p.data);
      })
      .catch(() => {});
  }, []);

  const trendData = useMemo(
    () =>
      (trend || []).map((d) => {
        const [y, m, day] = d.date.split("-").map(Number);
        return { ...d, label: new Date(y, m - 1, day).toLocaleDateString("en-CA", { month: "short", day: "numeric" }) };
      }),
    [trend]
  );

  const categoryData = useMemo(() => {
    const byCategory = new Map();
    for (const p of allProducts) byCategory.set(p.category || "Other", (byCategory.get(p.category || "Other") || 0) + p.revenue);
    return Array.from(byCategory.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value], i) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value, color: PALETTE[i % PALETTE.length] }));
  }, [allProducts]);

  const activePreset = PRESETS.find((p) => p.from() === from && p.to() === to)?.label;
  const margin = summary && summary.totalSales > 0 ? (summary.grossProfit / summary.totalSales) * 100 : null;
  const sparkSales = trendData.map((d) => d.sales);
  const sparkProfit = trendData.map((d) => d.profit);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Sales, profit and expenses at a glance"
        actions={
          <div className="flex gap-2 flex-wrap items-center">
            <div role="group" aria-label="Date range" className="inline-flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1 text-xs font-medium">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setFrom(p.from());
                    setTo(p.to());
                  }}
                  aria-pressed={activePreset === p.label}
                  className={`rounded-lg px-3 py-1.5 transition ${
                    activePreset === p.label
                      ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className="input" />
            <span className="text-gray-400 dark:text-gray-500 text-sm">to</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" className="input" />
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label="Filter by customer" className="input max-w-full">
          <option value="">All customers</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={productId} onChange={(e) => setProductId(e.target.value)} aria-label="Filter by product" className="input max-w-full">
          <option value="">All products</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {filtered && (
          <button
            onClick={() => {
              setCustomerId("");
              setProductId("");
            }}
            className="btn-ghost btn-sm text-brand-600 dark:text-brand-400"
          >
            Clear filters
          </button>
        )}
      </div>

      {filtered && (
        <p className="text-xs text-gray-500 dark:text-gray-400 -mt-3">
          Showing sales
          {customerId && " for " + (customers.find((c) => c.id === customerId)?.name || "this customer")}
          {productId && " of " + (products.find((p) => p.id === productId)?.name || "this product")}. Expenses belong to the whole business, so they and net profit are hidden while a filter is on.
          {productId && " Product sales count only that product's lines (discounts and delivery fees aren't split per product)."}
        </p>
      )}

      {loading || !summary ? (
        <PageSkeleton stats={5} rows={0} />
      ) : (
        <>
          <div className={`grid grid-cols-2 gap-4 stagger ${summary.filtered ? "lg:grid-cols-3" : "lg:grid-cols-3 2xl:grid-cols-5"}`}>
            <StatCard label="Orders" value={summary.orderCount} icon={OrdersIcon} tone="info" />
            <StatCard label="Total sales" value={summary.totalSales} format={money} icon={CashIcon} tone="brand" spark={sparkSales} />
            {!summary.filtered && <StatCard label="Expenses" value={summary.totalExpenses} format={money} icon={ExpensesIcon} tone="warn" />}
            <StatCard
              label="Gross profit"
              value={summary.grossProfit}
              format={money}
              icon={TrendUpIcon}
              tone={summary.grossProfit >= 0 ? "good" : "bad"}
              hint={margin !== null ? `${margin.toFixed(1)}% margin` : undefined}
              spark={sparkProfit}
            />
            {!summary.filtered && <StatCard label="Net profit" value={summary.netProfit} format={money} icon={TrendUpIcon} tone={summary.netProfit >= 0 ? "good" : "bad"} />}
          </div>

          <section className="card p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
              <h2 className="text-sm font-semibold dark:text-gray-100">{summary.filtered ? "Sales & profit" : "Sales, expenses & profit"}</h2>
              <div className="flex items-center gap-4">
                <LegendDot color="#b91c1c" label="Sales" />
                <LegendDot color="#10b981" label="Profit" />
                {!summary.filtered && <LegendDot color="#f59e0b" label="Expenses" />}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={trendData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="repSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#b91c1c" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#b91c1c" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="repProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={chart.grid} />
                <XAxis dataKey="label" tick={chart.tick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
                <YAxis tick={chart.tick} tickLine={false} axisLine={false} width={52} tickFormatter={moneyCompact} />
                <Tooltip content={<ChartTooltip formatter={money} />} cursor={chart.barCursor} />
                {!summary.filtered && <Bar dataKey="expenses" name="Expenses" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={14} opacity={0.85} />}
                <Area type="monotone" dataKey="sales" name="Sales" stroke="#b91c1c" strokeWidth={2.5} fill="url(#repSales)" activeDot={{ r: 5, strokeWidth: 2, stroke: chart.dark ? "#1f2937" : "#fff" }} />
                <Area type="monotone" dataKey="profit" name="Profit" stroke="#10b981" strokeWidth={2.5} fill="url(#repProfit)" activeDot={{ r: 5, strokeWidth: 2, stroke: chart.dark ? "#1f2937" : "#fff" }} />
              </ComposedChart>
            </ResponsiveContainer>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <section className="card p-5">
              <h2 className="text-sm font-semibold mb-4 dark:text-gray-100">Sales by category</h2>
              <DonutChart data={categoryData} centerLabel="sales" valueFormatter={moneyCompact} emptyText="No sales in this period." />
            </section>
            <section className="card p-5">
              <h2 className="text-sm font-semibold mb-4 dark:text-gray-100">Top products</h2>
              <RankedList rows={topProducts} valueKey="revenue" subKey="quantity" subLabel="units" empty="No sales in this period" />
            </section>
            <section className="card p-5">
              <h2 className="text-sm font-semibold mb-4 dark:text-gray-100">Top customers</h2>
              <RankedList rows={topCustomers} valueKey="total" subKey="orderCount" subLabel="orders" empty="No sales in this period" />
            </section>
          </div>
        </>
      )}
    </div>
  );
}
