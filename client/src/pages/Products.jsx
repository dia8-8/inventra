import { useEffect, useState } from "react";
import api from "../api/client";
import { ListSkeleton } from "../components/ui";
import { useNotify, errorMessage } from "../context/NotifyContext";
import { useAuth } from "../context/AuthContext";
import { COLOR_OPTIONS, COLOR_KEYS, productColor } from "../lib/categoryColor";
import Modal from "../components/Modal";

const UNITS = ["KG", "BOX", "PIECE", "BAG", "CARTON"];

function money(n) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n || 0);
}

const emptyForm = { name: "", category: "", unit: "KG", costPrice: "", sellingPrice: "", stockQty: "", lowStockThreshold: "10", supplierId: "", barcode: "", color: "" };
const PAGE_SIZE = 12;

export default function Products() {
  const notify = useNotify();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
    if (search) params.search = search;
    Promise.all([api.get("/products", { params }), api.get("/products/count", { params: search ? { search } : {} })])
      .then(([p, c]) => {
        setProducts(p.data);
        setTotal(c.data.total);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setPage(0);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [search, page]);

  useEffect(() => {
    api.get("/suppliers").then(({ data }) => setSuppliers(data));
  }, []);

  function openNew() {
    setForm(emptyForm);
    setError("");
    setEditing({});
  }

  function openEdit(p) {
    setForm({
      name: p.name,
      category: p.category,
      unit: p.unit,
      costPrice: p.costPrice,
      sellingPrice: p.sellingPrice,
      stockQty: p.stockQty,
      lowStockThreshold: p.lowStockThreshold,
      supplierId: p.supplierId || "",
      barcode: p.barcode || "",
      color: p.color || "",
    });
    setError("");
    setEditing(p);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const payload = { ...form, supplierId: form.supplierId || null, color: form.color || null };
      if (editing?.id) {
        await api.patch(`/products/${editing.id}`, payload);
      } else {
        await api.post("/products", payload);
      }
      notify.success(editing?.id ? "Product updated" : "Product added");
      setEditing(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong");
    }
  }

  async function handleDelete(p) {
    const ok = await notify.confirm({
      title: "Delete product?",
      message: `"${p.name}" will be removed from your product list. If it already appears in orders or stock history it is archived instead, so those records stay intact.`,
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      const { data } = await api.delete(`/products/${p.id}`);
      notify.success(data?.archived ? `${p.name} archived (it has order or stock history)` : `Deleted ${p.name}`);
      load();
    } catch (err) {
      notify.error(errorMessage(err, "Couldn't delete the product"));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold dark:text-gray-100">Products</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{total} total</p>
        </div>
        <button onClick={openNew} className="btn-primary">
          + Add Product
        </button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or category…"
        className="input w-full"
      />

      {loading ? (
        <ListSkeleton />
      ) : (
        <div className="card divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
          {products.length === 0 && <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">No products yet.</div>}
          {products.map((p) => {
            const low = Number(p.stockQty) <= Number(p.lowStockThreshold);
            return (
              <div key={p.id} className="relative p-4 pl-5 flex items-center gap-4 flex-wrap">
                <span aria-hidden="true" className={`absolute left-0 inset-y-0 w-1.5 ${productColor(p).dot}`} />
                <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium text-sm break-words dark:text-gray-100">{p.name}</div>
                    {low && <span className="text-[10px] font-semibold bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full shrink-0">LOW STOCK</span>}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 capitalize truncate">
                    {[p.category, p.supplier?.name, p.barcode ? `#${p.barcode}` : null].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="hidden sm:block text-right w-20 shrink-0">
                  <div className="text-xs text-gray-400 dark:text-gray-500">Cost</div>
                  <div className="text-sm dark:text-gray-200">{money(p.costPrice)}</div>
                </div>
                <div className="text-right w-16 sm:w-20 shrink-0">
                  <div className="text-xs text-gray-400 dark:text-gray-500">Price</div>
                  <div className="text-sm font-medium dark:text-gray-100">{money(p.sellingPrice)}</div>
                </div>
                <div className="text-right w-20 sm:w-28 shrink-0">
                  <div className="text-xs text-gray-400 dark:text-gray-500">Stock</div>
                  <div className={`text-sm ${low ? "text-red-600 dark:text-red-400 font-medium" : "dark:text-gray-200"}`}>
                    {p.stockQty} {p.unit.toLowerCase()}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => openEdit(p)} className="btn-secondary btn-sm">
                    Edit
                  </button>
                  {isAdmin && (
                    <button onClick={() => handleDelete(p)} className="btn-danger btn-sm">
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-gray-500 dark:text-gray-400">
            Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </span>
          <button
            disabled={page >= Math.ceil(total / PAGE_SIZE) - 1}
            onClick={() => setPage((p) => p + 1)}
            className="text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      {editing !== null && (
        <Modal title={editing.id ? "Edit Product" : "Add Product"} onClose={() => setEditing(null)}>
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm px-3 py-2 rounded-lg">{error}</div>}
            <Field label="Name" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Field label="Category" required value={form.category} onChange={(v) => setForm({ ...form, category: v })} placeholder="chicken, beef, lamb…" />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Unit</label>
              <select
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="input w-full"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cost price" type="number" required value={form.costPrice} onChange={(v) => setForm({ ...form, costPrice: v })} />
              <Field label="Selling price" type="number" required value={form.sellingPrice} onChange={(v) => setForm({ ...form, sellingPrice: v })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label={editing?.id ? "Stock (view only in Inventory)" : "Starting stock"}
                type="number"
                value={form.stockQty}
                onChange={(v) => setForm({ ...form, stockQty: v })}
                disabled={!!editing?.id}
              />
              <Field label="Low stock alert at" type="number" value={form.lowStockThreshold} onChange={(v) => setForm({ ...form, lowStockThreshold: v })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Label color</label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, color: "" })}
                  aria-pressed={!form.color}
                  className={`text-xs rounded-full px-3 py-1.5 border ${
                    !form.color ? "border-brand-500 text-brand-600 dark:text-brand-300 font-medium" : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400"
                  }`}
                >
                  Auto
                </button>
                {COLOR_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    title={key}
                    aria-label={key}
                    aria-pressed={form.color === key}
                    onClick={() => setForm({ ...form, color: key })}
                    className={`h-7 w-7 rounded-full ${COLOR_OPTIONS[key].dot} ring-offset-2 ring-offset-white dark:ring-offset-gray-800 ${
                      form.color === key ? "ring-2 ring-gray-900 dark:ring-white" : "hover:scale-110"
                    } transition`}
                  />
                ))}
              </div>
              {!form.color && <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Auto picks a color from the category.</p>}
            </div>
            <Field label="Barcode" value={form.barcode} onChange={(v) => setForm({ ...form, barcode: v })} placeholder="Scan or type a barcode…" />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Supplier</label>
              <select
                value={form.supplierId}
                onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
                className="input w-full"
              >
                <option value="">— None —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
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

function Field({ label, value, onChange, required, type = "text", placeholder, disabled }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <input
        type={type}
        step={type === "number" ? "0.01" : undefined}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input w-full"
      />
    </div>
  );
}
