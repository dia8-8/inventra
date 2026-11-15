import { useId } from "react";

export const APP_NAME = "Inventra";

// The Inventra logo: a stock box with its lid lifted, on a brand-red tile.
// Same artwork as public/brand/inventra-mark.svg.
export default function BrandMark({ className = "w-9 h-9", title = "Inventra" }) {
  const id = useId().replace(/:/g, "");
  const grad = `inv-${id}`;
  return (
    <svg viewBox="0 0 64 64" className={`shrink-0 drop-shadow-sm ${className}`} role="img" aria-label={title}>
      <defs>
        <linearGradient id={grad} x1="8" y1="2" x2="56" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ef4444" />
          <stop offset="0.55" stopColor="#b91c1c" />
          <stop offset="1" stopColor="#7f1d1d" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${grad})`} />
      <g transform="translate(0 2)" stroke={`url(#${grad})`} strokeWidth="1.8" strokeLinejoin="round">
        <path d="M32 9 48.5 18.5 32 28 15.5 18.5Z" fill="#fff" />
        <path d="M15.5 22.5 32 32V51L15.5 41.5Z" fill="#fff" fillOpacity="0.8" />
        <path d="M48.5 22.5 32 32V51L48.5 41.5Z" fill="#fff" fillOpacity="0.55" />
      </g>
    </svg>
  );
}
