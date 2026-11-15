import { useEffect } from "react";

export default function Modal({ title, onClose, children, maxWidth = "max-w-md" }) {
  // Escape closes the dialog; the page behind it doesn't scroll while it is open
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-gray-900/50 backdrop-blur-sm p-0 md:p-4 animate-fade-up"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`bg-white dark:bg-gray-800 w-full ${maxWidth} rounded-t-3xl md:rounded-2xl max-h-[90vh] overflow-y-auto shadow-pop ring-1 ring-black/5 dark:ring-white/10 animate-scale-in`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700/70 sticky top-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur z-10">
          <h2 className="font-semibold text-base tracking-tight dark:text-gray-100">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="btn-ghost !p-1.5 !rounded-lg text-gray-400">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
