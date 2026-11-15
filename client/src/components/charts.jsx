import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useTheme } from "../context/ThemeContext";

export const STATUS_COLORS = {
  PENDING: "#94a3b8",
  PREPARING: "#f59e0b",
  OUT_FOR_DELIVERY: "#3b82f6",
  DELIVERED: "#10b981",
  CANCELLED: "#ef4444",
};

export const PALETTE = ["#b91c1c", "#f59e0b", "#0ea5e9", "#10b981", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

// Colors for axes and grid lines that read well in both themes.
export function useChartTheme() {
  const { theme } = useTheme();
  const dark = theme === "dark";
  return {
    dark,
    grid: dark ? "#2b3646" : "#eef0f3",
    tick: { fontSize: 11, fill: dark ? "#94a3b8" : "#6b7280" },
    cursor: { stroke: dark ? "#475569" : "#cbd5e1", strokeWidth: 1, strokeDasharray: "4 4" },
    barCursor: { fill: dark ? "rgba(148,163,184,0.08)" : "rgba(15,23,42,0.04)" },
  };
}

// Replaces recharts' default tooltip with one that matches the rest of the UI.
export function ChartTooltip({ active, payload, label, formatter = (v) => v, labelFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-white/95 dark:bg-gray-800/95 backdrop-blur px-3 py-2 shadow-pop text-xs min-w-[8rem]">
      {label !== undefined && label !== "" && (
        <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{labelFormatter ? labelFormatter(label) : label}</div>
      )}
      <div className="space-y-0.5">
        {payload.map((p) => (
          <div key={p.dataKey || p.name} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color || p.payload?.fill || p.stroke }} />
              {p.name}
            </span>
            <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{formatter(p.value, p)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// A ring chart with the total in the middle and a legend alongside.
export function DonutChart({ data, centerLabel = "Total", valueFormatter = (v) => v, emptyText = "Nothing to show yet." }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <div className="h-44 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">{emptyText}</div>;

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={58}
              outerRadius={82}
              paddingAngle={data.length > 1 ? 3 : 0}
              cornerRadius={6}
              stroke="none"
              startAngle={90}
              endAngle={-270}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip formatter={(v) => valueFormatter(v)} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{valueFormatter(total)}</div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400">{centerLabel}</div>
        </div>
      </div>

      <ul className="w-full space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
            <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{d.name}</span>
            <span className="font-medium tabular-nums dark:text-gray-100">{valueFormatter(d.value)}</span>
            <span className="w-10 text-right text-xs tabular-nums text-gray-400 dark:text-gray-500">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
