import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

// In-app replacement for the browser's alert() / confirm() popups:
//   const notify = useNotify();
//   notify.success("Saved");  notify.error(err);  notify.info("…");
//   if (await notify.confirm({ title, message, confirmText, danger: true })) { … }

const NotifyContext = createContext(null);

const TOAST_MS = { success: 3500, info: 4000, error: 6000 };

// Turns an axios error / Error / string into something fit to show a person.
export function errorMessage(err, fallback = "Something went wrong") {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  if (err.response?.data?.error) return err.response.data.error;
  if (err.response?.data?.message) return err.response.data.message;
  if (err.code === "ERR_NETWORK") return "Can't reach the server. Check your connection and try again.";
  return fallback;
}

const STYLES = {
  success: {
    bar: "bg-green-500",
    icon: "text-green-600 dark:text-green-400",
    path: "M5 13l4 4L19 7",
  },
  error: {
    bar: "bg-red-500",
    icon: "text-red-600 dark:text-red-400",
    path: "M6 6l12 12M18 6L6 18",
  },
  info: {
    bar: "bg-blue-500",
    icon: "text-blue-600 dark:text-blue-400",
    path: "M12 8h.01M11 12h1v5h1",
  },
};

function Toast({ toast, onClose }) {
  const style = STYLES[toast.type];
  const timer = useRef(null);

  const start = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(onClose, TOAST_MS[toast.type]);
  }, [onClose, toast.type]);

  useEffect(() => {
    start();
    return () => clearTimeout(timer.current);
  }, [start]);

  return (
    <div
      role={toast.type === "error" ? "alert" : "status"}
      onMouseEnter={() => clearTimeout(timer.current)}
      onMouseLeave={start}
      className="pointer-events-auto flex items-stretch overflow-hidden rounded-xl bg-white dark:bg-gray-800 shadow-lg ring-1 ring-black/5 dark:ring-white/10 animate-fade-up"
    >
      <div className={`w-1.5 shrink-0 ${style.bar}`} />
      <div className="flex items-start gap-3 px-3.5 py-3 min-w-0 flex-1">
        <svg viewBox="0 0 24 24" className={`h-5 w-5 shrink-0 mt-0.5 ${style.icon}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9.5" strokeWidth="1.8" />
          <path d={style.path} />
        </svg>
        <p className="text-sm text-gray-800 dark:text-gray-100 break-words min-w-0 flex-1">{toast.message}</p>
        <button
          onClick={onClose}
          aria-label="Dismiss"
          className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-lg leading-none shrink-0"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function ConfirmDialog({ options, onResult }) {
  const confirmRef = useRef(null);
  const { title, message, confirmText, cancelText, danger } = options;

  useEffect(() => {
    confirmRef.current?.focus();
    function onKey(e) {
      if (e.key === "Escape") onResult(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onResult]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 animate-fade-up"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onResult(false);
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="bg-white dark:bg-gray-800 w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-xl p-5"
      >
        <div className="flex items-start gap-3">
          <div
            className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center ${
              danger ? "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400" : "bg-brand-50 dark:bg-brand-900/30 text-brand-500 dark:text-brand-300"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {danger ? (
                <>
                  <path d="M12 9v4M12 17h.01" />
                  <path d="M10.3 3.9L2.4 17.5A2 2 0 004.1 20.5h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
                </>
              ) : (
                <>
                  <circle cx="12" cy="12" r="9.5" />
                  <path d="M12 8h.01M11 12h1v5h1" />
                </>
              )}
            </svg>
          </div>
          <div className="min-w-0">
            <h2 id="confirm-title" className="font-semibold text-base dark:text-gray-100">
              {title}
            </h2>
            {message && (
              <p id="confirm-message" className="mt-1 text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line break-words">
                {message}
              </p>
            )}
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            onClick={() => onResult(false)}
            className="text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            onClick={() => onResult(true)}
            className={`text-sm font-medium text-white rounded-lg px-4 py-2.5 ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-brand-500 hover:bg-brand-600"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export function NotifyProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null); // confirm options while a dialog is open
  const resolveRef = useRef(null);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback((type, message) => {
    const text = typeof message === "string" ? message : errorMessage(message);
    setToasts((list) => {
      // Collapse an identical toast that is already showing instead of stacking copies
      if (list.some((t) => t.type === type && t.message === text)) return list;
      return [...list.slice(-3), { id: nextId.current++, type, message: text }];
    });
  }, []);

  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        resolveRef.current?.(false); // a newer dialog supersedes one still open
        resolveRef.current = resolve;
        const opts = typeof options === "string" ? { message: options } : options;
        setDialog({
          title: "Are you sure?",
          confirmText: "Confirm",
          cancelText: "Cancel",
          danger: false,
          ...opts,
        });
      }),
    []
  );

  const closeDialog = useCallback((result) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setDialog(null);
  }, []);

  const value = useMemo(
    () => ({
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      info: (m) => push("info", m),
      confirm,
    }),
    [push, confirm]
  );

  return (
    <NotifyContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed z-[60] inset-x-0 bottom-0 sm:inset-x-auto sm:right-4 sm:top-4 sm:bottom-auto flex flex-col gap-2 p-3 sm:p-0 sm:w-96 print:hidden"
      >
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
      {dialog && <ConfirmDialog options={dialog} onResult={closeDialog} />}
    </NotifyContext.Provider>
  );
}

export function useNotify() {
  const ctx = useContext(NotifyContext);
  if (!ctx) throw new Error("useNotify must be used inside NotifyProvider");
  return ctx;
}
