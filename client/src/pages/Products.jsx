import { useEffect, useState } from "react";
import api from "../api/client";
import { ListSkeleton } from "../components/ui";
import { useNotify, errorMessage } from "../context/NotifyContext";
import { useAuth } from "../context/AuthContext";
import { COLOR_OPTIONS, COLOR_KEYS, productColor } from "../lib/categoryColor";
import { barcodeType } from "../lib/barcodeType";
import Modal from "../components/Modal";

const UNITS = ["KG", "BOX", "PIECE", "BAG", "CARTON"];

function money(n) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n || 0);
}

const emptyForm = { name: "", category: "", unit: "KG", costPrice: "", sellingPrice: "", stockQty: "", lowStockThreshold: "10", supplierId: "", barcode: "", barcodes: [], color: "", taxable: true };
const PAGE_SIZE = 12;

export default function Products() {
  const notify = useNotify();
  const { can } = useAuth();
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
    if (!can("products.create") && !can("products.edit")) return;
    api
      .get("/suppliers")
      .then(({ data }) => setSuppliers(data))
      .catch(() => {});
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
      barcodes: (p.barcodes || []).map((b) => ({ code: b.code, label: b.label || "" })),
      color: p.color || "",
      taxable: p.taxable !== false,
    });
    setError("");
    setEditing(p);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        supplierId: form.supplierId || null,
        color: form.color || null,
        // the full list of extra barcodes (blank rows are ignored)
        barcodes: form.barcodes.filter((b) => b.code.trim()).map((b) => ({ code: b.code.trim(), label: b.label.trim() || null })),
      };
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
        {can("products.create") && (
          <button onClick={openNew} className="btn-primary">
            + Add Product
          </button>
        )}
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
                    {p.taxable === false && <span className="text-[10px] font-semibold bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 px-2 py-0.5 rounded-full shrink-0">TAX-FREE</span>}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    <span className="capitalize">{p.category}</span>
                    {[p.supplier?.name, p.barcode ? `#${p.barcode}` : null, p.barcodes?.length ? `+${p.barcodes.length} more barcode${p.barcodes.length === 1 ? "" : "s"}` : null]
                      .filter(Boolean)
                      .map((part) => ` · ${part}`)
                      .join("")}
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
                  {can("products.edit") && (
                    <button onClick={() => openEdit(p)} className="btn-secondary btn-sm">
                      Edit
                    </button>
                  )}
                  {can("products.delete") && (
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
            <label className="flex items-start gap-2.5 rounded-lg bg-gray-50 dark:bg-gray-900/40 px-3 py-2.5 cursor-pointer">
              <input type="checkbox" checked={form.taxable} onChange={(e) => setForm({ ...form, taxable: e.target.checked })} className="mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-500" />
              <span>
                <span className="block text-sm font-medium text-gray-800 dark:text-gray-200">Charge tax on this product</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">Switch off for tax-free items, such as raw meat in many places. Taxes are set up in Settings.</span>
              </span>
            </label>
            <div className="space-y-2">
              <Field label="Barcode" value={form.barcode} onChange={(v) => setForm({ ...form, barcode: v })} placeholder="Scan or type a barcode…" />
              {form.barcode.trim() && <p className="text-[11px] text-gray-400 dark:text-gray-500">Looks like: {barcodeType(form.barcode)}</p>}
              {form.barcodes.length > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="text-xs font-medium text-gray-600 dark:text-gray-400">Other barcodes for the same item</div>
                  {form.barcodes.map((b, i) => (
                    <div key={i}>
                      <div className="flex items-center gap-2">
                        <input
                          value={b.code}
                          onChange={(e) => setForm({ ...form, barcodes: form.barcodes.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)) })}
                          placeholder="Scan or type another barcode…"
                          aria-label={`Extra barcode ${i + 1}`}
                          className="input flex-1 min-w-0"
                        />
                        <input
                          value={b.label}
                          maxLength={60}
                          onChange={(e) => setForm({ ...form, barcodes: form.barcodes.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                          placeholder="Note (e.g. Case)"
                          aria-label={`Note for extra barcode ${i + 1}`}
                          className="input w-28 sm:w-36 shrink-0"
                        />
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, barcodes: form.barcodes.filter((_, j) => j !== i) })}
                          aria-label={`Remove extra barcode ${i + 1}`}
                          className="btn-ghost !p-2 text-gray-400 hover:text-red-500 shrink-0"
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M6 6l12 12M18 6L6 18" />
                          </svg>
                        </button>
                      </div>
                      {b.code.trim() && <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">Looks like: {barcodeType(b.code)}</p>}
                    </div>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => setForm({ ...form, barcodes: [...form.barcodes, { code: "", label: "" }] })} className="btn-ghost btn-sm text-brand-600 dark:text-brand-400">
                + Add another barcode for this item
              </button>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">Use this when the same item comes with different codes: the retail pack, the case label, or another supplier's code. Scanning any of them finds this product.</p>
            </div>
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
