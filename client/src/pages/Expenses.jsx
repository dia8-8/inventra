import { useEffect, useState } from "react";
import api from "../api/client";
import { ListSkeleton } from "../components/ui";
import { useNotify, errorMessage } from "../context/NotifyContext";
import Modal from "../components/Modal";
import { useAuth } from "../context/AuthContext";

const CATEGORIES = ["FUEL", "RENT", "SALARIES", "UTILITIES", "OTHER"];
const CATEGORY_LABELS = { FUEL: "Fuel", RENT: "Rent", SALARIES: "Salaries", UTILITIES: "Utilities", OTHER: "Other" };

function money(n) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n || 0);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const emptyForm = { date: todayStr(), category: "FUEL", amount: "", note: "" };

export default function Expenses() {
  const notify = useNotify();
  const { user } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    const params = {};
    if (category) params.category = category;
    if (from) params.from = from;
    if (to) params.to = to;
    api
      .get("/expenses", { params })
      .then(({ data }) => setExpenses(data))
      .finally(() => setLoading(false));
  }

  useEffect(load, [category, from, to]);

  function openNew() {
    setForm(emptyForm);
    setError("");
    setEditing({});
  }

  function openEdit(e) {
    setForm({
      date: e.date.slice(0, 10),
      category: e.category,
      amount: e.amount,
      note: e.note || "",
    });
    setError("");
    setEditing(e);
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    try {
      if (editing?.id) {
        await api.patch(`/expenses/${editing.id}`, form);
      } else {
        await api.post("/expenses", form);
      }
      notify.success(editing?.id ? "Expense updated" : "Expense added");
      setEditing(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong");
    }
  }

  async function handleDelete(e) {
    const ok = await notify.confirm({
      title: "Delete expense?",
      message: `The ${CATEGORY_LABELS[e.category]} expense of ${money(e.amount)} will be removed permanently.`,
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/expenses/${e.id}`);
      notify.success("Expense deleted");
      load();
    } catch (err) {
      notify.error(errorMessage(err, "Couldn't delete the expense"));
    }
  }

  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold dark:text-gray-100">Expenses</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{expenses.length} entries · {money(total)} total</p>
        </div>
        <button onClick={openNew} className="btn-primary">
          + Add Expense
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="input"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="input"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="input"
        />
      </div>

      {loading ? (
        <ListSkeleton />
      ) : (
        <div className="card divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
          {expenses.length === 0 && <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">No expenses recorded.</div>}
          {expenses.map((e) => (
            <div key={e.id} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm dark:text-gray-100">
                  {CATEGORY_LABELS[e.category]}
                  {e.note ? ` · ${e.note}` : ""}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {new Date(e.date).toLocaleDateString(undefined, { timeZone: "UTC" })} · {e.createdBy?.name || "System"}
                </div>
              </div>
              <div className="font-semibold text-sm shrink-0 dark:text-gray-100">{money(e.amount)}</div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => openEdit(e)} className="text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 px-2 py-1">
                  Edit
                </button>
                {user?.role === "ADMIN" && (
                  <button onClick={() => handleDelete(e)} className="btn-ghost btn-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== null && (
        <Modal title={editing.id ? "Edit Expense" : "Add Expense"} onClose={() => setEditing(null)}>
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm px-3 py-2 rounded-lg">{error}</div>}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                className="input w-full"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount</label>
              <input
                type="number"
                step="0.01"
                required
                value={form.amount}
                onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Note</label>
              <input
                value={form.note}
                onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
                className="input w-full"
              />
            </div>
            <button type="submit" className="btn-primary w-full">
              Save
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
