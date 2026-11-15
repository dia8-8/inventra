import { useEffect, useRef, useState } from "react";

// An A4 page (210 x 297 mm). On screen it is shrunk to fit the space it is in, so the
// proportions match the printed page; when printing it is the real size.
const A4_WIDTH_PX = 794; // 210 mm at 96 dpi

export default function A4Sheet({ children }) {
  const holder = useRef(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const fit = () => setZoom(Math.min(1, el.clientWidth / A4_WIDTH_PX));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={holder} className="w-full">
      <div className="a4-sheet bg-white text-gray-900 shadow-md ring-1 ring-black/5" style={{ "--a4-zoom": zoom }}>
        {children}
      </div>
    </div>
  );
}
