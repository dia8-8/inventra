import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { ChartTooltip, DonutChart, STATUS_COLORS, useChartTheme } from "../components/charts";
import { EmptyState, PageSkeleton, Skeleton, StatCard } from "../components/ui";
import { AlertIcon, CashIcon, CheckCircleIcon, ClockIcon, PlusIcon, ReceiptIcon, ReportsIcon, TrendUpIcon } from "../components/icons";

const STATUS_LABELS = {
  PENDING: "Pending",
  PREPARING: "Preparing",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

const money = (n) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n || 0);
const moneyCompact = (n) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", notation: "compact", maximumFractionDigits: 1 }).format(n || 0);

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function shortDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

export default function Dashboard() {
  const { user, can } = useAuth();
  const chart = useChartTheme();
  const [data, setData] = useState(null);
  const [trends, setTrends] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/dashboard")
      .then(({ data }) => setData(data))
      .catch(() => setError("Could not load dashboard"));
    api.get("/dashboard/trends").then(({ data }) => setTrends(data));
  }, []);

  const salesTrend = useMemo(() => (trends?.salesTrend || []).map((d) => ({ ...d, label: shortDate(d.date) })), [trends]);
  const salesValues = salesTrend.map((d) => d.sales);
  const periodTotal = salesValues.reduce((a, b) => a + b, 0);
  const bestDay = salesTrend.reduce((best, d) => (d.sales > (best?.sales ?? -1) ? d : best), null);
  const yesterday = salesValues.length >= 2 ? salesValues[salesValues.length - 2] : 0;
  const today = salesValues.length ? salesValues[salesValues.length - 1] : 0;
  const salesDelta = yesterday > 0 ? ((today - yesterday) / yesterday) * 100 : undefined;

  const statusData = (trends?.statusBreakdown || []).map((s) => ({
    name: STATUS_LABELS[s.status] || s.status,
    value: s.count,
    color: STATUS_COLORS[s.status] || "#94a3b8",
  }));
  const topProducts = trends?.topProducts || [];
  const topMax = Math.max(1, ...topProducts.map((p) => p.revenue));

  if (error) return <div className="text-red-600 dark:text-red-400">{error}</div>;
  if (!data) return <PageSkeleton stats={6} rows={0} />;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight dark:text-gray-100">
            {greeting()}, {user?.name?.split(" ")[0]}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })} · here's how the business is doing
          </p>
        </div>
        <div className="flex items-center gap-2">
          {can("reports.view") && (
            <Link to="/reports" className="btn-secondary">
              <ReportsIcon className="h-4 w-4" />
              Reports
            </Link>
          )}
          {can("orders.create") && (
            <Link to="/orders" className="btn-primary">
              <PlusIcon className="h-4 w-4" />
              New order
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-4 stagger">
        <StatCard label="Sales today" value={data.totalSalesToday} format={money} icon={CashIcon} tone="brand" to={can("orders.view") ? "/orders" : undefined} delta={salesDelta} spark={salesValues} />
        <StatCard label="Profit today" value={data.profitToday} format={money} icon={TrendUpIcon} tone={data.profitToday >= 0 ? "good" : "bad"} />
        <StatCard label="Pending orders" value={data.pendingOrders} icon={ClockIcon} tone="info" to={can("orders.view") ? "/orders?status=PENDING" : undefined} />
        <StatCard label="Delivered today" value={data.completedDeliveriesToday} icon={CheckCircleIcon} tone="good" />
        <StatCard
          label="Unpaid invoices"
          display={`${data.unpaidInvoicesCount} · ${moneyCompact(data.unpaidInvoicesTotal)}`}
          icon={ReceiptIcon}
          tone={data.unpaidInvoicesCount > 0 ? "warn" : "neutral"}
          to={can("orders.view") ? "/orders?paymentStatus=UNPAID" : undefined}
        />
        <StatCard label="Low stock items" value={data.lowStockCount} icon={AlertIcon} tone={data.lowStockCount > 0 ? "bad" : "good"} to={can("inventory.view") ? "/inventory" : undefined} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="card p-5 lg:col-span-2">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
            <div>
              <h2 className="text-sm font-semibold dark:text-gray-100">Sales, last 14 days</h2>
              {trends && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {bestDay && bestDay.sales > 0 ? `Best day: ${bestDay.label} (${money(bestDay.sales)})` : "No sales in this period yet"}
                </p>
              )}
            </div>
            {trends && (
              <div className="text-right">
                <div className="text-xl font-semibold tabular-nums dark:text-gray-100">{money(periodTotal)}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">total</div>
              </div>
            )}
          </div>
          {!trends ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={salesTrend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#b91c1c" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="#b91c1c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={chart.grid} />
                <XAxis dataKey="label" tick={chart.tick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
                <YAxis tick={chart.tick} tickLine={false} axisLine={false} width={52} tickFormatter={moneyCompact} />
                <Tooltip content={<ChartTooltip formatter={money} />} cursor={chart.cursor} />
                <Area
                  type="monotone"
                  dataKey="sales"
                  name="Sales"
                  stroke="#b91c1c"
                  strokeWidth={2.5}
                  fill="url(#dashSales)"
                  activeDot={{ r: 5, strokeWidth: 2, stroke: chart.dark ? "#1f2937" : "#fff" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold mb-4 dark:text-gray-100">Orders by status</h2>
          {!trends ? <Skeleton className="h-44 w-full" /> : <DonutChart data={statusData} centerLabel="orders" emptyText="No orders yet." />}
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold mb-4 dark:text-gray-100">Top products by revenue</h2>
          {!trends ? (
            <Skeleton className="h-40 w-full" />
          ) : topProducts.length === 0 ? (
            <EmptyState icon={ReportsIcon} title="No sales yet" text="Your best-selling products will show up here once orders come in." />
          ) : (
            <ul className="space-y-3.5">
              {topProducts.map((p, i) => (
                <li key={p.name}>
                  <div className="flex items-baseline justify-between gap-3 text-sm mb-1.5">
                    <span className="truncate font-medium text-gray-800 dark:text-gray-200">
                      <span className="text-gray-400 dark:text-gray-500 mr-2 tabular-nums">{i + 1}</span>
                      {p.name}
                    </span>
                    <span className="font-semibold tabular-nums dark:text-gray-100">{money(p.revenue)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700/60 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all duration-700"
                      style={{ width: `${Math.max(4, (p.revenue / topMax) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold dark:text-gray-100">Low stock</h2>
            {data.lowStockProducts.length > 0 && can("inventory.view") && (
              <Link to="/inventory" className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
                View all
              </Link>
            )}
          </div>
          {data.lowStockProducts.length === 0 ? (
            <EmptyState icon={CheckCircleIcon} title="Everything is stocked" text="Nothing is running low right now." />
          ) : (
            <ul className="space-y-3">
              {data.lowStockProducts.map((p) => (
                <li key={p.id} className="flex items-center gap-3">
                  <span className="h-8 w-8 shrink-0 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center">
                    <AlertIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate dark:text-gray-100">{p.name}</div>
                    <div className="text-xs text-red-600 dark:text-red-400">
                      {p.stockQty} {p.unit.toLowerCase()} left
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
