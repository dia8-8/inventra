import { useEffect, useState } from "react";
import api from "../api/client";
import { useNotify, errorMessage } from "../context/NotifyContext";

const QUEBEC = [
  { name: "GST", rate: "5", number: "" },
  { name: "QST", rate: "9.975", number: "" },
];

// Where a company sets up the taxes it charges on its sales.
export default function TaxSettings() {
  const notify = useNotify();
  const [rows, setRows] = useState(null);
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get("/taxes")
      .then(({ data }) => {
        const mapped = data.map((t) => ({ name: t.name, rate: String(Number(t.rate)), number: t.number || "" }));
        setRows(mapped);
        setSaved(JSON.stringify(mapped));
      })
      .catch((err) => notify.error(errorMessage(err, "Couldn't load your taxes")));
  }, []);

  if (!rows) return null;

  const update = (i, patch) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const dirty = JSON.stringify(rows) !== saved;

  async function save() {
    setSaving(true);
    try {
      const { data } = await api.put("/taxes", {
        taxes: rows.map((r) => ({ name: r.name, rate: Number(r.rate), number: r.number })),
      });
      const mapped = data.map((t) => ({ name: t.name, rate: String(Number(t.rate)), number: t.number || "" }));
      setRows(mapped);
      setSaved(JSON.stringify(mapped));
      notify.success(mapped.length ? "Taxes saved" : "Taxes cleared: new orders won't have any tax");
    } catch (err) {
      notify.error(errorMessage(err, "Couldn't save the taxes"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold dark:text-gray-100">Taxes</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Taxes charged on top of your prices, on new orders. Products marked tax-free are skipped. Invoices already issued keep the tax they were issued with, so changing a rate never alters them.
        </p>
      </div>

      {rows.length === 0 && (
        <div className="rounded-lg bg-gray-50 dark:bg-gray-900/40 px-3 py-3 text-sm text-gray-600 dark:text-gray-300 flex items-center justify-between gap-3 flex-wrap">
          <span>No taxes yet, so orders have no tax added.</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setRows(QUEBEC)}>
            Use GST 5% + QST 9.975%
          </button>
        </div>
      )}

      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[1fr_5.5rem] sm:grid-cols-[1fr_6rem_1fr_auto] gap-2 items-end">
          <label className="block text-xs text-gray-600 dark:text-gray-400">
            Name
            <input value={row.name} maxLength={40} onChange={(e) => update(i, { name: e.target.value })} placeholder="GST" className="input w-full mt-1" />
          </label>
          <label className="block text-xs text-gray-600 dark:text-gray-400">
            Rate %
            <input type="number" min="0" max="100" step="0.001" value={row.rate} onChange={(e) => update(i, { rate: e.target.value })} className="input w-full mt-1" />
          </label>
          <label className="block text-xs text-gray-600 dark:text-gray-400 col-span-2 sm:col-span-1">
            Registration number (printed on invoices)
            <input value={row.number} maxLength={40} onChange={(e) => update(i, { number: e.target.value })} placeholder="optional" className="input w-full mt-1" />
          </label>
          <button
            type="button"
            onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
            aria-label={`Remove ${row.name || "tax"}`}
            className="btn-ghost !p-2 text-gray-400 hover:text-red-500 justify-self-end col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      ))}

      <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
        <button type="button" className="btn-ghost btn-sm text-brand-600 dark:text-brand-400" disabled={rows.length >= 10} onClick={() => setRows((r) => [...r, { name: "", rate: "", number: "" }])}>
          + Add a tax
        </button>
        <button type="button" onClick={save} disabled={!dirty || saving || rows.some((r) => !r.name.trim() || r.rate === "")} className="btn-primary">
          {saving ? "Saving…" : "Save taxes"}
        </button>
      </div>
    </section>
  );
}
