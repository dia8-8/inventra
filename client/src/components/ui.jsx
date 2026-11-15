import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownIcon, ArrowUpIcon, InboxIcon } from "./icons";

// Small shared building blocks so every page looks and behaves the same way.

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight dark:text-gray-100">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

// Placeholder shown while a list page loads: looks like the page that is about to appear.
export function ListSkeleton({ rows = 5 }) {
  return (
    <div className="card divide-y divide-gray-100 dark:divide-gray-700/70 overflow-hidden" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-4 flex items-center gap-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({ stats = 0, rows = 5 }) {
  return (
    <div className="space-y-5" role="status" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3.5 w-56" />
      </div>
      {stats > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: stats }).map((_, i) => (
            <div key={i} className="card p-4 space-y-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-28" />
            </div>
          ))}
        </div>
      )}
      {rows > 0 && <ListSkeleton rows={rows} />}
    </div>
  );
}

export function EmptyState({ icon: Icon = InboxIcon, title, text, action }) {
  return (
    <div className="px-6 py-12 text-center">
      <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-gray-100 dark:bg-gray-700/60 text-gray-400 dark:text-gray-400 flex items-center justify-center">
        <Icon className="h-6 w-6" />
      </div>
      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</div>
      {text && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Animates a number towards its target (skipped for people who prefer reduced motion).
export function useCountUp(target, duration = 700) {
  const [value, setValue] = useState(target);
  const current = useRef(target);

  useEffect(() => {
    const to = Number(target) || 0;
    const from = current.current;
    if (from === to || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      current.current = to;
      setValue(to);
      return;
    }
    let frame;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (to - from) * eased;
      current.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

// A tiny trend line with a soft fill, drawn as SVG.
export function Sparkline({ values = [], color = "#b91c1c", className = "h-10 w-full" }) {
  const id = useId().replace(/:/g, "");
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => [(i / (values.length - 1)) * 100, 28 - ((v - min) / span) * 24]);

  // Smooth the line with simple midpoint curves
  let line = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const [px, py] = points[i - 1];
    const [x, y] = points[i];
    const mx = (px + x) / 2;
    line += ` C${mx},${py} ${mx},${y} ${x},${y}`;
  }
  const area = `${line} L100,32 L0,32 Z`;

  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const TONES = {
  brand: { bubble: "bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300", value: "text-gray-900 dark:text-gray-100", spark: "#b91c1c" },
  good: { bubble: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300", value: "text-emerald-600 dark:text-emerald-400", spark: "#059669" },
  warn: { bubble: "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300", value: "text-amber-600 dark:text-amber-400", spark: "#d97706" },
  bad: { bubble: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300", value: "text-red-600 dark:text-red-400", spark: "#dc2626" },
  info: { bubble: "bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300", value: "text-gray-900 dark:text-gray-100", spark: "#0284c7" },
  neutral: { bubble: "bg-gray-100 text-gray-600 dark:bg-gray-700/60 dark:text-gray-300", value: "text-gray-900 dark:text-gray-100", spark: "#6b7280" },
};

export function DeltaChip({ value }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const up = value >= 0;
  const Icon = up ? ArrowUpIcon : ArrowDownIcon;
  return (
    <span
      className={`badge !gap-0.5 !px-1.5 ${up ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"}`}
      title="Compared with the previous day"
    >
      <Icon className="h-3 w-3" strokeWidth={2.5} />
      {Math.abs(value).toFixed(value !== 0 && Math.abs(value) < 10 ? 1 : 0)}%
    </span>
  );
}

// A headline number with an icon, optional trend chip and sparkline.
// Pass `value` (number) + `format` to get a count-up animation, or `display` for custom text.
export function StatCard({ label, value, format = (v) => Math.round(v).toLocaleString(), display, icon: Icon, tone = "brand", to, delta, spark, hint }) {
  const t = TONES[tone] || TONES.brand;
  const animated = useCountUp(typeof value === "number" ? value : 0);
  const shown = display ?? format(animated);

  const body = (
    <div className={`card p-4 h-full flex flex-col gap-3 ${to ? "card-hover" : ""}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        {Icon && (
          <span className={`h-8 w-8 shrink-0 rounded-xl flex items-center justify-center ${t.bubble}`}>
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
        <div className="text-xs font-medium leading-tight text-gray-500 dark:text-gray-400">{label}</div>
      </div>
      <div className={`text-xl sm:text-2xl font-semibold tracking-tight tabular-nums whitespace-nowrap ${t.value}`}>{shown}</div>
      {(delta !== undefined || hint) && (
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <DeltaChip value={delta} />
          {hint && <span className="truncate">{hint}</span>}
        </div>
      )}
      {spark && spark.length > 1 && <Sparkline values={spark} color={t.spark} className="h-9 w-full -mb-1" />}
    </div>
  );
  return to ? (
    <Link to={to} className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
      {body}
    </Link>
  ) : (
    body
  );
}
