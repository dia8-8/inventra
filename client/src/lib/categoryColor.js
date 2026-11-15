// Label colors for products. Class names are written out in full so Tailwind can see them.
export const COLOR_OPTIONS = {
  red: { chip: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", dot: "bg-red-500" },
  orange: { chip: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300", dot: "bg-orange-500" },
  amber: { chip: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", dot: "bg-amber-500" },
  lime: { chip: "bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300", dot: "bg-lime-500" },
  emerald: { chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", dot: "bg-emerald-500" },
  teal: { chip: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300", dot: "bg-teal-500" },
  sky: { chip: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300", dot: "bg-sky-500" },
  indigo: { chip: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300", dot: "bg-indigo-500" },
  violet: { chip: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300", dot: "bg-violet-500" },
  pink: { chip: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300", dot: "bg-pink-500" },
};
export const COLOR_KEYS = Object.keys(COLOR_OPTIONS);

const NONE = { chip: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300", dot: "bg-gray-400" };

// Fallback for products with no picked color: common meat categories get a fitting color,
// anything else gets one derived from its name so the same category always matches.
const KNOWN = [
  [/beef|steak|veal/, "red"],
  [/chicken|poultry|turkey|duck/, "amber"],
  [/fish|seafood|shrimp|salmon/, "sky"],
  [/pork|bacon|ham/, "pink"],
  [/lamb|mutton|goat/, "emerald"],
];

export function categoryColor(category) {
  const name = String(category || "").trim().toLowerCase();
  if (!name) return NONE;
  for (const [pattern, key] of KNOWN) {
    if (pattern.test(name)) return COLOR_OPTIONS[key];
  }
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLOR_OPTIONS[COLOR_KEYS[hash % COLOR_KEYS.length]];
}

// The color a product's label uses: the one picked for it, else the automatic one.
export function productColor(product) {
  return COLOR_OPTIONS[product?.color] || categoryColor(product?.category);
}
