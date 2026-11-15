import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import InvoiceDocument from "../components/InvoiceDocument";
import A4Sheet from "../components/A4Sheet";
import { useNotify, errorMessage } from "../context/NotifyContext";
import { ACCENTS, BLOCKS, COLUMNS, FONTS, SAMPLE_ORDER, normalizeLayout } from "../lib/invoiceLayout";

const MAX_LOGO_CHARS = 240000;

function arrayMove(list, from, to) {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// Resizes an uploaded image so it fits comfortably in the saved layout.
function readLogo(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error("Use a PNG, JPEG or WebP image"));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const keepAlpha = file.type !== "image/jpeg";
      for (const maxWidth of [480, 320, 220]) {
        const scale = Math.min(1, maxWidth / img.width, 200 / img.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        const data = keepAlpha ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.85);
        if (data.length <= MAX_LOGO_CHARS) return resolve(data);
      }
      reject(new Error("That image is too detailed to store. Try a simpler or smaller logo."));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that image"));
    };
    img.src = url;
  });
}

// A list whose rows can be dragged by their handle to reorder. Up/down buttons do the same
// for touch screens, where the browser's drag-and-drop doesn't work.
function DragList({ items, getId, onMove, renderItem }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li
          key={getId(item)}
          onDragOver={(e) => {
            if (dragIndex === null) return;
            e.preventDefault();
            setOverIndex(index);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIndex !== null && dragIndex !== index) onMove(dragIndex, index);
            setDragIndex(null);
            setOverIndex(null);
          }}
          className={`rounded-xl border bg-white dark:bg-gray-800 transition ${
            overIndex === index && dragIndex !== index ? "border-brand-500 ring-2 ring-brand-500/40" : "border-gray-200 dark:border-gray-700"
          } ${dragIndex === index ? "opacity-40" : ""}`}
        >
          {renderItem(item, {
            index,
            isFirst: index === 0,
            isLast: index === items.length - 1,
            handleProps: {
              draggable: true,
              onDragStart: (e) => {
                setDragIndex(index);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(index));
                const li = e.currentTarget.closest("li");
                if (li) e.dataTransfer.setDragImage(li, 16, 16);
              },
              onDragEnd: () => {
                setDragIndex(null);
                setOverIndex(null);
              },
            },
            moveUp: () => onMove(index, index - 1),
            moveDown: () => onMove(index, index + 1),
          })}
        </li>
      ))}
    </ul>
  );
}

function Handle({ handleProps, isFirst, isLast, moveUp, moveDown, label }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <span
        {...handleProps}
        title="Drag to reorder"
        aria-label={`Drag ${label} to reorder`}
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 touch-none select-none"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
          <circle cx="9" cy="6" r="1.6" />
          <circle cx="15" cy="6" r="1.6" />
          <circle cx="9" cy="12" r="1.6" />
          <circle cx="15" cy="12" r="1.6" />
          <circle cx="9" cy="18" r="1.6" />
          <circle cx="15" cy="18" r="1.6" />
        </svg>
      </span>
      <div className="flex flex-col">
        <button type="button" disabled={isFirst} onClick={moveUp} aria-label={`Move ${label} up`} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-25 leading-none h-3.5">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 15l6-6 6 6" />
          </svg>
        </button>
        <button type="button" disabled={isLast} onClick={moveDown} aria-label={`Move ${label} down`} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-25 leading-none h-3.5">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function Switch({ checked, onChange, label, disabled }) {
  return (
    <label className={`inline-flex items-center ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <input type="checkbox" className="sr-only peer" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span className="relative h-5 w-9 rounded-full bg-gray-300 dark:bg-gray-600 peer-checked:bg-brand-500 transition after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500" />
    </label>
  );
}

function Segmented({ value, options, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`px-2.5 py-1 ${value === o.value ? "bg-brand-500 text-white" : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Check({ checked, onChange, children }) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-500" />
      {children}
    </label>
  );
}

const textInput =
  "w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

export default function InvoiceDesigner() {
  const notify = useNotify();
  const [settings, setSettings] = useState(null);
  const [layout, setLayout] = useState(null);
  const [savedJson, setSavedJson] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get("/settings")
      .then(({ data }) => {
        const normalized = normalizeLayout(data.invoiceLayout);
        setSettings(data);
        setLayout(normalized);
        setSavedJson(JSON.stringify(normalized));
      })
      .catch((err) => notify.error(errorMessage(err, "Couldn't load the invoice settings")));
  }, []);

  const dirty = useMemo(() => layout && JSON.stringify(layout) !== savedJson, [layout, savedJson]);

  if (!layout || !settings) return <div className="text-gray-500 dark:text-gray-400">Loading…</div>;

  const setBlock = (id, patch) => setLayout((l) => ({ ...l, blocks: l.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
  const enabledColumns = layout.columns.filter((c) => c.enabled).length;

  async function save() {
    setSaving(true);
    try {
      const { data } = await api.patch("/settings", { invoiceLayout: layout });
      const normalized = normalizeLayout(data.invoiceLayout);
      setLayout(normalized);
      setSavedJson(JSON.stringify(normalized));
      setSettings(data);
      notify.success("Invoice layout saved");
    } catch (err) {
      notify.error(errorMessage(err, "Couldn't save the invoice layout"));
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefault() {
    const ok = await notify.confirm({
      title: "Reset invoice layout?",
      message: "Your arrangement, colors, logo and footer text will be replaced by the standard invoice layout.",
      confirmText: "Reset",
      danger: true,
    });
    if (!ok) return;
    setSaving(true);
    try {
      await api.patch("/settings", { invoiceLayout: null });
      const normalized = normalizeLayout(null);
      setLayout(normalized);
      setSavedJson(JSON.stringify(normalized));
      notify.success("Invoice layout reset");
    } catch (err) {
      notify.error(errorMessage(err, "Couldn't reset the invoice layout"));
    } finally {
      setSaving(false);
    }
  }

  async function onLogoPicked(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = await readLogo(file);
      setLayout((l) => ({ ...l, logo: data }));
      notify.info("Logo added. Save to keep it.");
    } catch (err) {
      notify.error(err.message || "Couldn't use that image");
    }
  }

  function blockOptions(block) {
    switch (block.id) {
      case "header":
        return (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <Check checked={block.showLogo !== false} onChange={(v) => setBlock("header", { showLogo: v })}>Logo</Check>
              <Check checked={block.showAddress !== false} onChange={(v) => setBlock("header", { showAddress: v })}>Address</Check>
              <Check checked={block.showPhone !== false} onChange={(v) => setBlock("header", { showPhone: v })}>Phone</Check>
            </div>
            <div className="flex items-center gap-3">
              {layout.logo ? (
                <>
                  <img src={layout.logo} alt="Logo" className="h-10 max-w-[8rem] object-contain rounded bg-white border border-gray-200 p-1" />
                  <button type="button" onClick={() => setLayout((l) => ({ ...l, logo: null }))} className="text-xs text-red-600 dark:text-red-400 hover:underline">
                    Remove logo
                  </button>
                </>
              ) : (
                <span className="text-xs text-gray-500 dark:text-gray-400">No logo yet.</span>
              )}
              <label className="text-xs font-medium text-brand-600 dark:text-brand-400 cursor-pointer hover:underline">
                {layout.logo ? "Replace" : "Upload logo"}
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onLogoPicked} className="sr-only" />
              </label>
            </div>
          </div>
        );
      case "invoiceInfo":
        return (
          <label className="block text-xs text-gray-600 dark:text-gray-400">
            Title
            <input value={block.title ?? ""} maxLength={40} onChange={(e) => setBlock("invoiceInfo", { title: e.target.value })} placeholder="Invoice" className={`${textInput} mt-1`} />
          </label>
        );
      case "totals":
        return <Check checked={block.showPaid !== false} onChange={(v) => setBlock("totals", { showPaid: v })}>Show amount paid and balance due</Check>;
      case "footer":
        return (
          <label className="block text-xs text-gray-600 dark:text-gray-400">
            Message
            <textarea value={block.text ?? ""} maxLength={500} rows={3} onChange={(e) => setBlock("footer", { text: e.target.value })} className={`${textInput} mt-1`} placeholder="Payment terms, bank details, thank-you note…" />
          </label>
        );
      case "items":
        return (
          <div>
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Table columns (drag to reorder)</div>
            <DragList
              items={layout.columns}
              getId={(c) => c.key}
              onMove={(from, to) => setLayout((l) => ({ ...l, columns: arrayMove(l.columns, from, to) }))}
              renderItem={(col, ctx) => (
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <Handle {...ctx} label={COLUMNS[col.key]} />
                  <span className="flex-1 text-sm dark:text-gray-200">{COLUMNS[col.key]}</span>
                  <Switch
                    checked={col.enabled}
                    disabled={col.enabled && enabledColumns === 1}
                    label={`Show ${COLUMNS[col.key]} column`}
                    onChange={(v) => setLayout((l) => ({ ...l, columns: l.columns.map((c) => (c.key === col.key ? { ...c, enabled: v } : c)) }))}
                  />
                </div>
              )}
            />
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link to="/settings" className="text-xs text-gray-500 dark:text-gray-400 hover:underline">
            ← Settings
          </Link>
          <h1 className="text-xl font-semibold dark:text-gray-100">Invoice layout</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Drag the sections into the order you want, switch them on or off, and see the result live.</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>}
          <button type="button" onClick={resetToDefault} disabled={saving} className="text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
            Reset
          </button>
          <button type="button" onClick={save} disabled={saving || !dirty} className="text-sm font-medium bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-4 py-2 disabled:opacity-50">
            {saving ? "Saving…" : "Save layout"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] items-start">
        <div className="space-y-4 min-w-0">
          <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 space-y-3">
            <h2 className="text-sm font-semibold dark:text-gray-100">Style</h2>
            <div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-1.5">Accent color</div>
              <div className="flex flex-wrap items-center gap-2">
                {ACCENTS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Accent ${c}`}
                    aria-pressed={layout.accent.toLowerCase() === c}
                    onClick={() => setLayout((l) => ({ ...l, accent: c }))}
                    style={{ backgroundColor: c }}
                    className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-white dark:ring-offset-gray-800 transition ${layout.accent.toLowerCase() === c ? "ring-2 ring-gray-900 dark:ring-white" : "hover:scale-110"}`}
                  />
                ))}
                <label className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
                  <input type="color" value={layout.accent} onChange={(e) => setLayout((l) => ({ ...l, accent: e.target.value }))} className="h-7 w-7 rounded cursor-pointer bg-transparent" aria-label="Custom accent color" />
                  Custom
                </label>
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-1.5">Font</div>
              <Segmented
                label="Font"
                value={layout.font}
                onChange={(v) => setLayout((l) => ({ ...l, font: v }))}
                options={Object.entries(FONTS).map(([value, f]) => ({ value, label: f.label }))}
              />
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold dark:text-gray-100">Sections</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Two neighbouring sections set to “Half” sit side by side on one row.
            </p>
            <DragList
              items={layout.blocks}
              getId={(b) => b.id}
              onMove={(from, to) => setLayout((l) => ({ ...l, blocks: arrayMove(l.blocks, from, to) }))}
              renderItem={(block, ctx) => (
                <div className="p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <Handle {...ctx} label={BLOCKS[block.id].label} />
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-medium ${block.enabled ? "dark:text-gray-100" : "text-gray-400 dark:text-gray-500"}`}>{BLOCKS[block.id].label}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{BLOCKS[block.id].hint}</div>
                    </div>
                    <Switch checked={block.enabled} onChange={(v) => setBlock(block.id, { enabled: v })} label={`Show ${BLOCKS[block.id].label}`} />
                  </div>
                  {block.enabled && (
                    <div className="space-y-3 pl-1">
                      {block.id !== "items" && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <Segmented
                            label="Width"
                            value={block.width}
                            onChange={(v) => setBlock(block.id, { width: v })}
                            options={[
                              { value: "full", label: "Full" },
                              { value: "half", label: "Half" },
                            ]}
                          />
                          <Segmented
                            label="Align"
                            value={block.align}
                            onChange={(v) => setBlock(block.id, { align: v })}
                            options={[
                              { value: "left", label: "Left" },
                              { value: "center", label: "Center" },
                              { value: "right", label: "Right" },
                            ]}
                          />
                        </div>
                      )}
                      {blockOptions(block)}
                    </div>
                  )}
                </div>
              )}
            />
          </section>
        </div>

        <div className="lg:sticky lg:top-20 min-w-0">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Live preview on an A4 page (210 × 297 mm) with a sample order</div>
          <A4Sheet>
            <InvoiceDocument layout={layout} settings={settings} order={SAMPLE_ORDER} />
          </A4Sheet>
        </div>
      </div>
    </div>
  );
}
