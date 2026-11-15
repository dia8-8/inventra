import { useMemo, useState } from "react";
import api from "../api/client";
import Modal from "./Modal";
import { useNotify, errorMessage } from "../context/NotifyContext";

const ROLE_LABEL = { STAFF: "Staff", DRIVER: "Driver", ADMIN: "Administrator" };

// Lets an admin choose exactly what one staff member can do.
export default function PermissionsModal({ user, catalog, onClose, onSaved }) {
  const notify = useNotify();
  const implies = catalog.implies || {};
  const all = useMemo(() => catalog.groups.flatMap((g) => g.permissions.map((p) => p.key)), [catalog]);
  const [selected, setSelected] = useState(() => new Set(user.permissions));
  const [saving, setSaving] = useState(false);

  // Turning something on also turns on what it needs; turning it off also turns off what depends on it.
  function turnOn(set, key) {
    set.add(key);
    for (const dep of implies[key] || []) set.add(dep);
  }
  function turnOff(set, key) {
    set.delete(key);
    for (const [other, needs] of Object.entries(implies)) if (needs.includes(key)) set.delete(other);
  }
  function toggle(key) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) turnOff(next, key);
      else turnOn(next, key);
      return next;
    });
  }
  function setGroup(group, on) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of group.permissions) (on ? turnOn : turnOff)(next, p.key);
      return next;
    });
  }
  const preset = (keys) => setSelected(new Set(keys));

  const sameAs = (a, b) => a.size === b.length && b.every((k) => a.has(k));
  const unchanged = sameAs(selected, user.permissions);

  async function save(permissions) {
    setSaving(true);
    try {
      await api.patch(`/users/${user.id}`, { permissions });
      notify.success(permissions === null ? `${user.name} is back on the standard staff permissions` : `Permissions saved for ${user.name}`);
      onSaved();
    } catch (err) {
      notify.error(errorMessage(err, "Couldn't save the permissions"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Permissions · ${user.name}`} onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Choose what this {ROLE_LABEL[user.role]?.toLowerCase()} can do. Changes apply right away, even if they are signed in. Administrators always have full access.
        </p>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={() => preset(catalog.staffDefault)}>
            Standard staff
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => preset(all.filter((k) => k.endsWith(".view") && !k.startsWith("activity.")))}>
            View only
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => preset(all)}>
            Everything
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => preset([])}>
            Nothing
          </button>
          <span className="ml-auto self-center text-xs text-gray-500 dark:text-gray-400">
            {selected.size} of {all.length} allowed
          </span>
        </div>

        <div className="space-y-3">
          {catalog.groups.map((group) => {
            const on = group.permissions.filter((p) => selected.has(p.key)).length;
            const allOn = on === group.permissions.length;
            return (
              <section key={group.key} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-900/40 px-3.5 py-2">
                  <h3 className="text-sm font-semibold dark:text-gray-100">{group.label}</h3>
                  <button type="button" onClick={() => setGroup(group, !allOn)} className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
                    {allOn ? "Clear" : "Select all"}
                  </button>
                </div>
                <ul className="divide-y divide-gray-100 dark:divide-gray-700/70">
                  {group.permissions.map((p) => (
                    <li key={p.key}>
                      <label className="flex items-start gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <input
                          type="checkbox"
                          checked={selected.has(p.key)}
                          onChange={() => toggle(p.key)}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-500"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm text-gray-800 dark:text-gray-200">{p.label}</span>
                          {p.description && <span className="block text-xs text-gray-500 dark:text-gray-400">{p.description}</span>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 pt-1 sticky bottom-0 bg-white dark:bg-gray-800 py-2">
          {user.customPermissions ? (
            <button type="button" disabled={saving} onClick={() => save(null)} className="btn-ghost btn-sm text-gray-500">
              Reset to standard staff
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 sm:flex-none">
              Cancel
            </button>
            <button type="button" disabled={saving || unchanged} onClick={() => save([...selected])} className="btn-primary flex-1 sm:flex-none">
              {saving ? "Saving…" : "Save permissions"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
