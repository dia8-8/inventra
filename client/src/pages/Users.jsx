import { useEffect, useState } from "react";
import api from "../api/client";
import { ListSkeleton } from "../components/ui";
import { useNotify, errorMessage } from "../context/NotifyContext";
import Modal from "../components/Modal";
import PermissionsModal from "../components/PermissionsModal";
import { ShieldIcon } from "../components/icons";
import { useAuth } from "../context/AuthContext";

const ROLES = ["ADMIN", "STAFF", "DRIVER"];

export default function Users() {
  const { user: me, license, hasFeature } = useAuth();
  const notify = useNotify();
  const canAssignDrivers = hasFeature("deliveries");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "STAFF" });
  const [error, setError] = useState("");
  const [catalog, setCatalog] = useState(null);
  const [editingPerms, setEditingPerms] = useState(null);

  useEffect(() => {
    api
      .get("/users/permissions")
      .then(({ data }) => setCatalog(data))
      .catch(() => {});
  }, []);

  function load() {
    setLoading(true);
    api
      .get("/users")
      .then(({ data }) => setUsers(data))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/users", form);
      notify.success(`${form.name} added`);
      setShowNew(false);
      setForm({ name: "", email: "", password: "", role: "STAFF" });
      load();
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong");
    }
  }

  async function toggleActive(u) {
    try {
      await api.patch(`/users/${u.id}`, { active: !u.active });
      notify.success(`${u.name} ${u.active ? "deactivated" : "activated"}`);
      load();
    } catch (err) {
      notify.error(errorMessage(err));
    }
  }

  async function changeRole(u, role) {
    try {
      await api.patch(`/users/${u.id}`, { role });
      notify.success(`${u.name} is now ${role.toLowerCase()}`);
      load();
    } catch (err) {
      notify.error(errorMessage(err));
    }
  }

  async function handleDelete(u) {
    const ok = await notify.confirm({
      title: "Delete user?",
      message: `${u.name} (${u.email}) will lose access immediately. This cannot be undone.`,
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/users/${u.id}`);
      notify.success(`Deleted ${u.name}`);
      load();
    } catch (err) {
      notify.error(errorMessage(err, "Couldn't delete the user"));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold dark:text-gray-100">Users</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage staff accounts and permissions
            {license && (
              <>
                {" · "}
                {users.filter((u) => u.active).length} of {license.maxUsers} users
              </>
            )}
          </p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary">
          + Add User
        </button>
      </div>

      {loading ? (
        <ListSkeleton />
      ) : (
        <div className="card divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
          {users.map((u) => (
            <div key={u.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="font-medium text-sm flex items-center gap-2 dark:text-gray-100">
                  {u.name}
                  {!u.active && (
                    <span className="text-[10px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">
                      INACTIVE
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.email}</div>
                <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  {u.role === "ADMIN" && "Full access"}
                  {u.role === "DRIVER" && "Deliveries only"}
                  {u.role === "STAFF" &&
                    (u.customPermissions ? (
                      <span className="badge !px-2 !py-0 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200">Custom · {u.permissions.length} permissions</span>
                    ) : (
                      "Standard staff permissions"
                    ))}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {u.role === "STAFF" && (
                  <button onClick={() => setEditingPerms(u)} disabled={!catalog} className="btn-secondary btn-sm">
                    <ShieldIcon className="h-4 w-4" />
                    Permissions
                  </button>
                )}
                <select
                  value={u.role}
                  disabled={u.id === me.id}
                  onChange={(e) => changeRole(u, e.target.value)}
                  className="input text-xs px-2 py-1.5 disabled:opacity-50"
                >
                  {ROLES.filter((r) => r !== "DRIVER" || canAssignDrivers || u.role === "DRIVER").map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => toggleActive(u)}
                  disabled={u.id === me.id}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg border disabled:opacity-50 ${
                    u.active
                      ? "text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20"
                      : "text-green-600 dark:text-green-400 border-green-100 dark:border-green-900/50 bg-green-50 dark:bg-green-900/20"
                  }`}
                >
                  {u.active ? "Deactivate" : "Activate"}
                </button>
                <button
                  onClick={() => handleDelete(u)}
                  disabled={u.id === me.id}
                  className="btn-ghost btn-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingPerms && catalog && (
        <PermissionsModal
          user={editingPerms}
          catalog={catalog}
          onClose={() => setEditingPerms(null)}
          onSaved={() => {
            setEditingPerms(null);
            load();
          }}
        />
      )}

      {showNew && (
        <Modal title="Add User" onClose={() => setShowNew(false)}>
          <form onSubmit={handleCreate} className="space-y-3">
            {error && <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm px-3 py-2 rounded-lg">{error}</div>}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Temporary password</label>
              <input
                type="text"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="input w-full"
              >
                {ROLES.filter((r) => r !== "DRIVER" || canAssignDrivers).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn-primary w-full">
              Create User
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
