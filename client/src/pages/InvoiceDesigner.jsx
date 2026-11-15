import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { PageSkeleton } from "../components/ui";
import InvoiceDocument from "../components/InvoiceDocument";
import A4Sheet from "../components/A4Sheet";
import { useNotify, errorMessage } from "../context/NotifyContext";
import {
  ACCENTS,
  BLOCKS,
  COLUMNS,
  FONTS,
  SAMPLE_ORDER,
  SPACINGS,
  TEXT_SIZES,
  normalizeLayout,
  toRows,
} from "../lib/invoiceLayout";

const MAX_LOGO_CHARS = 240000;
const WIDTH_CHIPS = [25, 40, 50, 60, 75, 100];

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
function DragList({ items, getId, onMove, renderItem, itemClassName = () => "" }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li
          key={getId(item)}
          id={`card-${getId(item)}`}
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
            overIndex === index && dragIndex !== index ? "border-brand-500 ring-2 ring-brand-500/40" : itemClassName(item) || "border-gray-200 dark:border-gray-700"
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
    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
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
    <label className={`inline-flex items-center ${disabled ? "opacity-50" : "cursor-pointer"}`} onClick={(e) => e.stopPropagation()}>
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
          className={`px-2.5 py-1.5 ${value === o.value ? "bg-brand-500 text-white" : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"}`}
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

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</div>
      {children}
    </div>
  );
}

const ALIGN_PATHS = {
  left: "M4 6h16M4 10h10M4 14h16M4 18h10",
  center: "M4 6h16M7 10h10M4 14h16M7 18h10",
  right: "M4 6h16M10 10h10M4 14h16M10 18h10",
};

// Three icon buttons: they look like the alignment buttons in any text editor
function AlignButtons({ value, onChange }) {
  return (
    <div role="group" aria-label="Alignment" className="inline-flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
      {["left", "center", "right"].map((a) => (
        <button
          key={a}
          type="button"
          title={`Align ${a}`}
          aria-label={`Align ${a}`}
          aria-pressed={value === a}
          onClick={() => onChange(a)}
          className={`px-3 py-1.5 ${value === a ? "bg-brand-500 text-white" : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"}`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d={ALIGN_PATHS[a]} />
          </svg>
        </button>
      ))}
    </div>
  );
}

const textInput = "input w-full !py-1.5";

export default function InvoiceDesigner() {
  const notify = useNotify();
  const [settings, setSettings] = useState(null);
  const [layout, setLayout] = useState(null);
  const [savedJson, setSavedJson] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState("header");

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

  // Clicking a section on the invoice brings its settings into view
  useEffect(() => {
    document.getElementById(`card-${selectedId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  const dirty = useMemo(() => layout && JSON.stringify(layout) !== savedJson, [layout, savedJson]);

  if (!layout || !settings) return <PageSkeleton rows={4} />;

  const setBlock = (id, patch) => setLayout((l) => ({ ...l, blocks: l.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
  const setStyle = (patch) => setLayout((l) => ({ ...l, ...patch }));
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

  // If the section above leaves room on its row but this one is too wide to fit there, say how wide it may be
  function fitHint(blockId) {
    const rows = toRows(layout.blocks.filter((b) => b.enabled));
    const index = rows.findIndex((r) => r.some((b) => b.id === blockId));
    if (index < 1 || rows[index][0].id !== blockId) return null;
    const previous = rows[index - 1];
    const free = Math.floor((100 - previous.reduce((sum, b) => sum + b.width, 0)) / 5) * 5;
    const block = rows[index][0];
    if (free < 20 || block.width <= free) return null;
    return { free, label: BLOCKS[previous[previous.length - 1].id].label };
  }

  // Which other sections sit on the same row as this one right now
  function neighbours(blockId) {
    const rows = toRows(layout.blocks.filter((b) => b.enabled));
    const row = rows.find((r) => r.some((b) => b.id === blockId)) || [];
    return row.filter((b) => b.id !== blockId).map((b) => BLOCKS[b.id].label);
  }

  function sizePanel(block) {
    const others = neighbours(block.id);
    const hint = fitHint(block.id);
    const placement = { left: "flex-start", center: "center", right: "flex-end" }[block.align];
    return (
      <div className="space-y-4 rounded-lg bg-gray-50 dark:bg-gray-900/40 p-3">
        <Field label={`Width · ${block.width}% of the page`}>
          <input
            type="range"
            min={20}
            max={100}
            step={5}
            value={block.width}
            onChange={(e) => setBlock(block.id, { width: Number(e.target.value) })}
            aria-label="Width in percent"
            className="w-full accent-brand-500"
          />
          <div className="flex flex-wrap gap-1.5">
            {WIDTH_CHIPS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setBlock(block.id, { width: w })}
                aria-pressed={block.width === w}
                className={`rounded-md px-2 py-1 text-[11px] font-medium border ${
                  block.width === w
                    ? "bg-brand-500 border-brand-500 text-white"
                    : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-brand-400"
                }`}
              >
                {w === 100 ? "Full" : `${w}%`}
              </button>
            ))}
          </div>
          <div className="mt-1.5 h-3 rounded bg-gray-200 dark:bg-gray-700 flex" style={{ justifyContent: others.length ? "flex-start" : placement }} aria-hidden="true">
            <div className="h-3 rounded bg-brand-500" style={{ width: `${block.width}%` }} />
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            {others.length ? `Shares a row with ${others.join(" and ")}.` : block.width < 100 ? "On its own row, positioned by the alignment below." : "Takes the whole row."}
          </p>
          {hint && (
            <button
              type="button"
              onClick={() => setBlock(block.id, { width: hint.free })}
              className="text-left text-[11px] rounded-md bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 px-2 py-1.5 hover:bg-amber-100 dark:hover:bg-amber-900/30"
            >
              Only {hint.free}% is free next to {hint.label}. <span className="font-semibold underline">Set to {hint.free}%</span> to place it beside it.
            </button>
          )}
        </Field>

        <Field label={block.id === "items" ? "Table alignment" : "Align"}>
          <AlignButtons value={block.align} onChange={(a) => setBlock(block.id, { align: a })} />
          <p className="text-[11px] text-gray-500 dark:text-gray-400">Lines up the text, and when a section is alone on its row it also decides left, middle or right on the page.</p>
        </Field>
      </div>
    );
  }

  function blockOptions(block) {
    switch (block.id) {
      case "header":
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              <Check checked={block.showLogo !== false} onChange={(v) => setBlock("header", { showLogo: v })}>Logo</Check>
              <Check checked={block.showAddress !== false} onChange={(v) => setBlock("header", { showAddress: v })}>Address</Check>
              <Check checked={block.showPhone !== false} onChange={(v) => setBlock("header", { showPhone: v })}>Phone</Check>
              <Check checked={block.showEmail !== false} onChange={(v) => setBlock("header", { showEmail: v })}>Email</Check>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Name, address, phone and email come from <Link to="/settings" className="underline hover:text-brand-600">Settings</Link>.
            </p>
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
            {layout.logo && (
              <Field label={`Logo size · ${layout.logoHeight}px tall`}>
                <input type="range" min={24} max={120} step={4} value={layout.logoHeight} onChange={(e) => setStyle({ logoHeight: Number(e.target.value) })} aria-label="Logo height" className="w-full accent-brand-500" />
              </Field>
            )}
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
              getId={(c) => `col-${c.key}`}
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
          <p className="text-sm text-gray-500 dark:text-gray-400">Click any part of the invoice to change it. Drag sections to reorder them.</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>}
          <button type="button" onClick={resetToDefault} disabled={saving} className="btn-secondary">
            Reset
          </button>
          <button type="button" onClick={save} disabled={saving || !dirty} className="btn-primary">
            {saving ? "Saving…" : "Save layout"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] items-start">
        <div className="space-y-4 min-w-0">
          <section className="card p-4 space-y-4">
            <h2 className="text-sm font-semibold dark:text-gray-100">Page style</h2>
            <Field label="Accent color">
              <div className="flex flex-wrap items-center gap-2">
                {ACCENTS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Accent ${c}`}
                    aria-pressed={layout.accent.toLowerCase() === c}
                    onClick={() => setStyle({ accent: c })}
                    style={{ backgroundColor: c }}
                    className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-white dark:ring-offset-gray-800 transition ${layout.accent.toLowerCase() === c ? "ring-2 ring-gray-900 dark:ring-white" : "hover:scale-110"}`}
                  />
                ))}
                <label className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
                  <input type="color" value={layout.accent} onChange={(e) => setStyle({ accent: e.target.value })} className="h-7 w-7 rounded cursor-pointer bg-transparent" aria-label="Custom accent color" />
                  Custom
                </label>
              </div>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Font">
                <Segmented label="Font" value={layout.font} onChange={(v) => setStyle({ font: v })} options={Object.entries(FONTS).map(([value, f]) => ({ value, label: f.label }))} />
              </Field>
              <Field label="Text size">
                <Segmented label="Text size" value={layout.textSize} onChange={(v) => setStyle({ textSize: v })} options={Object.entries(TEXT_SIZES).map(([value, t]) => ({ value, label: t.label }))} />
              </Field>
              <Field label="Space between sections">
                <Segmented label="Spacing" value={layout.spacing} onChange={(v) => setStyle({ spacing: v })} options={Object.entries(SPACINGS).map(([value, s]) => ({ value, label: s.label }))} />
              </Field>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold dark:text-gray-100">Sections</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Turn sections on or off, drag to reorder, and select one to set its width and alignment.</p>
            <DragList
              items={layout.blocks}
              getId={(b) => b.id}
              itemClassName={(b) => (selectedId === b.id ? "border-brand-500 ring-1 ring-brand-500/50" : "")}
              onMove={(from, to) => setLayout((l) => ({ ...l, blocks: arrayMove(l.blocks, from, to) }))}
              renderItem={(block, ctx) => {
                const selected = selectedId === block.id;
                return (
                  <div className="p-3">
                    <div
                      className="flex items-center gap-2 cursor-pointer"
                      role="button"
                      tabIndex={0}
                      aria-expanded={selected}
                      onClick={() => setSelectedId(block.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId(block.id);
                        }
                      }}
                    >
                      <Handle {...ctx} label={BLOCKS[block.id].label} />
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-medium ${block.enabled ? "dark:text-gray-100" : "text-gray-400 dark:text-gray-500"}`}>{BLOCKS[block.id].label}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{BLOCKS[block.id].hint}</div>
                      </div>
                      {block.enabled && <span className="text-[11px] tabular-nums text-gray-400 dark:text-gray-500 shrink-0">{block.width}%</span>}
                      <Switch checked={block.enabled} onChange={(v) => setBlock(block.id, { enabled: v })} label={`Show ${BLOCKS[block.id].label}`} />
                    </div>
                    {selected && block.enabled && (
                      <div className="mt-3 space-y-4">
                        {sizePanel(block)}
                        {blockOptions(block)}
                      </div>
                    )}
                    {selected && !block.enabled && <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">This section is switched off. Turn it on to include it on the invoice.</p>}
                  </div>
                );
              }}
            />
          </section>
        </div>

        <div className="lg:sticky lg:top-20 min-w-0">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Live preview on an A4 page with a sample order. Click a section to edit it.</div>
          <A4Sheet>
            <InvoiceDocument layout={layout} settings={settings} order={SAMPLE_ORDER} selectedId={selectedId} onSelect={setSelectedId} />
          </A4Sheet>
        </div>
      </div>
    </div>
  );
}
