import { useEffect, useState } from "react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { ListSkeleton } from "../components/ui";
import { useNotify, errorMessage } from "../context/NotifyContext";
import Modal from "../components/Modal";
import AddressAutocomplete from "../components/AddressAutocomplete";

function money(n) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n || 0);
}

const emptyForm = { name: "", phone: "", businessName: "", address: "", notes: "" };

export default function Customers() {
  const notify = useNotify();
  const { can } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null = closed, {} = new, {...} = edit
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);

  function load() {
    setLoading(true);
    api
      .get("/customers", { params: search ? { search } : {} })
      .then(({ data }) => setCustomers(data))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [search]);

  function openNew() {
    setForm(emptyForm);
    setError("");
    setEditing({});
  }

  function openEdit(c) {
    setForm({ name: c.name, phone: c.phone || "", businessName: c.businessName || "", address: c.address || "", notes: c.notes || "" });
    setError("");
    setEditing(c);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (editing?.id) {
        await api.patch(`/customers/${editing.id}`, form);
      } else {
        await api.post("/customers", form);
      }
      notify.success(editing?.id ? "Customer updated" : "Customer added");
      setEditing(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong");
    }
  }

  async function handleDelete(c) {
    const ok = await notify.confirm({
      title: "Delete customer?",
      message: `"${c.name}" will be removed permanently. This cannot be undone.`,
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/customers/${c.id}`);
      notify.success(`Deleted ${c.name}`);
      load();
    } catch (err) {
      notify.error(errorMessage(err, "Couldn't delete the customer"));
    }
  }

  async function openDetail(c) {
    const { data } = await api.get(`/customers/${c.id}`);
    setDetail(data);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold dark:text-gray-100">Customers</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{customers.length} total</p>
        </div>
        {can("customers.create") && (
          <button onClick={openNew} className="btn-primary">
            + Add Customer
          </button>
        )}
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, business, or phone…"
        className="input w-full"
      />

      {loading ? (
        <ListSkeleton />
      ) : (
        <div className="card divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
          {customers.length === 0 && <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">No customers yet.</div>}
          {customers.map((c) => (
            <div key={c.id} className="p-4 flex items-center justify-between gap-3">
              <button className="text-left flex-1 min-w-0" onClick={() => openDetail(c)}>
                <div className="font-medium text-sm truncate dark:text-gray-100">{c.name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {c.businessName ? `${c.businessName} · ` : ""}
                  {c.phone || "No phone"}
                </div>
              </button>
              <div className="text-right shrink-0">
                <div className={`text-sm font-semibold ${c.unpaidBalance > 0 ? "text-red-600 dark:text-red-400" : "text-gray-400 dark:text-gray-500"}`}>
                  {money(c.unpaidBalance)}
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500">{c.orderCount} orders</div>
              </div>
              <div className="flex gap-1 shrink-0">
                {can("customers.edit") && (
                  <button onClick={() => openEdit(c)} className="text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 px-2 py-1">
                    Edit
                  </button>
                )}
                {can("customers.delete") && (
                  <button onClick={() => handleDelete(c)} className="btn-ghost btn-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== null && (
        <Modal title={editing.id ? "Edit Customer" : "Add Customer"} onClose={() => setEditing(null)}>
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm px-3 py-2 rounded-lg">{error}</div>}
            <Field label="Name" required value={form.name} onChange={(v) => setForm((prev) => ({ ...prev, name: v }))} />
            <Field label="Business name" value={form.businessName} onChange={(v) => setForm((prev) => ({ ...prev, businessName: v }))} />
            <Field label="Phone" value={form.phone} onChange={(v) => setForm((prev) => ({ ...prev, phone: v }))} />
            <AddressAutocomplete label="Address" value={form.address} onChange={(v) => setForm((prev) => ({ ...prev, address: v }))} />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                className="input w-full"
                rows={2}
              />
            </div>
            <button type="submit" className="btn-primary w-full">
              Save
            </button>
          </form>
        </Modal>
      )}

      {detail && (
        <Modal title={detail.name} onClose={() => setDetail(null)} maxWidth="max-w-lg">
          <div className="space-y-4">
            <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
              {detail.businessName && <div>{detail.businessName}</div>}
              {detail.phone && <div>📞 {detail.phone}</div>}
              {detail.address && <div>📍 {detail.address}</div>}
              {detail.notes && <div className="italic">{detail.notes}</div>}
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-2 dark:text-gray-100">Order History</h3>
              <div className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-100 dark:border-gray-700 rounded-lg">
                {detail.orders.length === 0 && <div className="p-3 text-sm text-gray-500 dark:text-gray-400">No orders yet.</div>}
                {detail.orders.map((o) => (
                  <div key={o.id} className="p-3 flex justify-between text-sm dark:text-gray-200">
                    <div>
                      <div className="font-medium">{o.orderNumber}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{new Date(o.createdAt).toLocaleDateString()} · {o.status}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{money(o.total)}</div>
                      <div className={`text-xs ${o.paymentStatus === "PAID" ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>{o.paymentStatus}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, value, onChange, required }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <input
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input w-full"
      />
    </div>
  );
}
