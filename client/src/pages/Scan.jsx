import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import api from "../api/client";
import { parseVariableWeightCode } from "../lib/variableWeightBarcode";
import { parseGs1, gtinVariants, gs1Quantity, describeGs1 } from "../lib/gs1";

const CAMERA_DIV_ID = "scan-camera-reader";

export default function Scan() {
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [status, setStatus] = useState(null);
  const [recent, setRecent] = useState([]);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [linkProductId, setLinkProductId] = useState("");
  const [processing, setProcessing] = useState(false);
  const [torch, setTorch] = useState({ supported: false, on: false });
  const [zoom, setZoom] = useState(null); // { min, max, step, value } when the phone can zoom
  const audioRef = useRef(null);

  const inputRef = useRef(null);
  const lastScanRef = useRef({ code: "", time: 0 });
  const html5QrRef = useRef(null);

  useEffect(() => {
    api.get("/suppliers").then(({ data }) => setSuppliers(data));
    api.get("/products").then(({ data }) => setProducts(data));
    api.get("/settings").then(({ data }) => setSettings(data));
  }, []);

  useEffect(() => {
    return () => {
      html5QrRef.current?.stop().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!cameraOn && status?.type !== "notfound") {
      inputRef.current?.focus();
    }
  }, [cameraOn, status]);

  // Camera access must be requested directly inside the click handler (not a
  // useEffect fired afterward) — some mobile browsers silently refuse
  // getUserMedia if it isn't triggered synchronously by a user gesture.
  async function toggleCamera() {
    if (cameraOn) {
      try {
        await html5QrRef.current?.stop();
        html5QrRef.current?.clear();
      } catch {
        // ignore
      }
      html5QrRef.current = null;
      setCameraOn(false);
      setTorch({ supported: false, on: false });
      setZoom(null);
      return;
    }

    setCameraError("");
    setCameraStarting(true);
    try {
      audioRef.current = audioRef.current || new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      // no sound on this browser; scanning still works
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser doesn't support camera access (getUserMedia unavailable).");
      }
      const instance = new Html5Qrcode(CAMERA_DIV_ID);
      html5QrRef.current = instance;
      await instance.start(
        { facingMode: "environment" },
        {
          fps: 10,
          // wide and fairly short, to suit long barcodes (the old 280px window made them unreadable)
          qrbox: (viewWidth, viewHeight) => ({
            width: Math.floor(viewWidth * 0.94),
            height: Math.floor(Math.min(viewHeight * 0.6, 220)),
          }),
          // ask the phone for a high-resolution picture and continuous autofocus
          videoConstraints: {
            facingMode: "environment",
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            advanced: [{ focusMode: "continuous" }],
          },
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODABAR,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        },
        (decodedText) => handleScan(decodedText),
        () => {}
      );
      setCameraOn(true);
      // flashlight and zoom, where the phone offers them
      try {
        const caps = instance.getRunningTrackCameraCapabilities();
        setTorch({ supported: Boolean(caps.torchFeature().isSupported()), on: false });
        const z = caps.zoomFeature();
        setZoom(z.isSupported() ? { min: z.min(), max: z.max(), step: z.step() || 0.1, value: z.value() ?? z.min() } : null);
      } catch {
        setTorch({ supported: false, on: false });
        setZoom(null);
      }
      instance.applyVideoConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
    } catch (err) {
      html5QrRef.current = null;
      setCameraError(
        err?.message && typeof err.message === "string" && err.message.length < 200
          ? err.message
          : "Could not access the camera. Make sure you allow camera access when your browser asks, and that no other app is using the camera."
      );
    } finally {
      setCameraStarting(false);
    }
  }

  async function toggleTorch() {
    try {
      await html5QrRef.current.getRunningTrackCameraCapabilities().torchFeature().apply(!torch.on);
      setTorch((t) => ({ ...t, on: !t.on }));
    } catch {
      setCameraError("This browser couldn't switch the flashlight on.");
    }
  }

  async function changeZoom(value) {
    try {
      await html5QrRef.current.getRunningTrackCameraCapabilities().zoomFeature().apply(value);
      setZoom((z) => ({ ...z, value }));
    } catch {
      // ignore: the slider just won't move
    }
  }

  // One-shot autofocus (tap the picture), then back to continuous focus
  async function refocus() {
    if (!html5QrRef.current) return;
    try {
      await html5QrRef.current.applyVideoConstraints({ advanced: [{ focusMode: "single-shot" }] });
      setTimeout(() => html5QrRef.current?.applyVideoConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {}), 1500);
    } catch {
      // this phone doesn't allow focus control from the browser
    }
  }

  // A short beep and vibration so you know a scan went through without looking at the screen
  function confirmScan() {
    try {
      navigator.vibrate?.(80);
    } catch {
      // not supported
    }
    try {
      const ctx = audioRef.current;
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {
      // no sound
    }
  }

  async function lookupFirst(codes) {
    for (const c of codes) {
      const product = await lookupProduct(c);
      if (product) return product;
    }
    return null;
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      const code = barcodeInput.trim();
      setBarcodeInput("");
      if (code) handleScan(code);
    }
  }

  async function lookupProduct(code) {
    try {
      const { data: product } = await api.get(`/products/by-barcode/${encodeURIComponent(code)}`);
      return product;
    } catch (err) {
      if (err.response?.status === 404) return null;
      throw err;
    }
  }

  async function handleScan(rawCode) {
    const code = String(rawCode).trim();
    if (!code || processing) return;
    const now = Date.now();
    if (code === lastScanRef.current.code && now - lastScanRef.current.time < 2500) return;
    lastScanRef.current = { code, time: now };

    setProcessing(true);
    setStatus(null);
    try {
      // Supplier case labels carry the product code and weight inside one long barcode.
      const gs1 = parseGs1(code);
      if (gs1) {
        const product = await lookupFirst(gtinVariants(gs1.gtin));
        if (product) {
          const q = gs1Quantity(product, gs1);
          await addStock(product, gs1.gtin, q.quantity, { unit: q.unit, note: describeGs1(gs1) });
          return;
        }
        setStatus({ type: "notfound", code: gs1.gtin, gs1 });
        return;
      }

      // Try the raw scanned code first (fixed-barcode products).
      const direct = await lookupProduct(code);
      if (direct) {
        await addStock(direct, code, null);
        return;
      }

      // Fall back to variable-weight parsing (scale labels encoding item + weight).
      const parsed = parseVariableWeightCode(code, settings);
      if (parsed) {
        const product = await lookupProduct(parsed.itemCode);
        if (product) {
          await addStock(product, parsed.itemCode, parsed.weight);
          return;
        }
        setStatus({ type: "notfound", code: parsed.itemCode, weight: parsed.weight });
        return;
      }

      setStatus({ type: "notfound", code });
    } catch (err) {
      setStatus({ type: "error", message: err.response?.data?.error || "Lookup failed" });
    } finally {
      setProcessing(false);
    }
  }

  async function addStock(product, code, weightOverride, meta) {
    const usesWeight = weightOverride != null;
    const qty = usesWeight ? weightOverride : Number(quantity) || 1;
    const unit = meta?.unit ?? (usesWeight ? settings?.variableWeightUnit || "" : "");
    try {
      await api.post("/inventory/movements", {
        productId: product.id,
        type: "IN",
        quantity: qty,
        reason: reason || (meta?.note ? `Scanned ${meta.note}` : `Scanned${code ? ` (${code})` : ""}${usesWeight ? ` · ${qty}${unit}` : ""}`),
        supplierId: supplierId || null,
      });
      confirmScan();
      setStatus({ type: "success", product, quantity: qty, unit });
      setRecent((prev) =>
        [{ id: `${Date.now()}-${product.id}`, name: product.name, quantity: qty, unit, time: new Date() }, ...prev].slice(0, 15)
      );
    } catch (err) {
      setStatus({ type: "error", message: err.response?.data?.error || "Could not add stock" });
    }
  }

  async function linkAndAdd() {
    if (!linkProductId || !status?.code) return;
    setProcessing(true);
    try {
      // A product that already has a barcode keeps it: the scanned code is added as another one
      const target = products.find((p) => p.id === linkProductId);
      const body = target?.barcode
        ? { barcodes: [...(target.barcodes || []).map((b) => ({ code: b.code, label: b.label })), { code: status.code, label: status.gs1 ? "Case label" : null }] }
        : { barcode: status.code };
      const { data: product } = await api.patch(`/products/${linkProductId}`, body);
      setProducts((prev) => prev.map((p) => (p.id === product.id ? product : p)));
      if (status.gs1) {
        const q = gs1Quantity(product, status.gs1);
        await addStock(product, status.code, q.quantity, { unit: q.unit, note: describeGs1(status.gs1) });
      } else {
        await addStock(product, status.code, status.weight ?? null);
      }
      setLinkProductId("");
    } catch (err) {
      setStatus({ type: "error", message: err.response?.data?.error || "Could not link barcode" });
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h1 className="text-xl font-semibold dark:text-gray-100">Scan to Stock In</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Scan a barcode with a scanner or your camera to add stock instantly</p>
        {settings && !settings.variableWeightEnabled && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Scale labels that encode item + weight in one barcode? Turn on variable-weight parsing in Settings.
          </p>
        )}
      </div>

      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Qty per scan</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Supplier (optional)</label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
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
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reason / note (optional)</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Weekly supplier delivery"
            className="input w-full"
          />
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Hardware scanner</label>
        <input
          ref={inputRef}
          autoFocus
          value={barcodeInput}
          onChange={(e) => setBarcodeInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Click here, then scan…"
          className="w-full border-2 border-brand-200 dark:border-brand-900/50 focus:border-brand-500 rounded-lg px-3 py-3 text-base dark:bg-gray-900 dark:text-gray-100 focus:outline-none"
        />
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Keep this field focused — most USB/Bluetooth scanners type the code then press Enter automatically.
        </p>

        <button
          type="button"
          onClick={toggleCamera}
          disabled={cameraStarting}
          className="btn-soft"
        >
          {cameraStarting ? "Requesting camera…" : cameraOn ? "Stop Camera" : "Use Camera Instead"}
        </button>
        {cameraError && <p className="text-xs text-red-600 dark:text-red-400">{cameraError}</p>}

        <div onClick={refocus} className="relative mt-2 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 h-[320px] bg-gray-50 dark:bg-gray-900/60">
          <div id={CAMERA_DIV_ID} className="w-full h-full" />
          {!cameraOn && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400 dark:text-gray-500 pointer-events-none px-4 text-center">
              {cameraStarting ? "Requesting camera access…" : "Camera preview will appear here"}
            </div>
          )}
        </div>
        {cameraOn && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button type="button" onClick={refocus} className="btn-secondary btn-sm">
              Refocus
            </button>
            {torch.supported && (
              <button type="button" onClick={toggleTorch} aria-pressed={torch.on} className="btn-secondary btn-sm">
                {torch.on ? "Flashlight off" : "Flashlight"}
              </button>
            )}
            {zoom && (
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                Zoom
                <input
                  type="range"
                  min={zoom.min}
                  max={zoom.max}
                  step={zoom.step}
                  value={zoom.value}
                  onChange={(e) => changeZoom(Number(e.target.value))}
                  aria-label="Camera zoom"
                  className="w-32 accent-brand-500"
                />
              </label>
            )}
          </div>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Long case labels: hold the phone about 20–30 cm away with the bars level, use Zoom to fill the window, and tap the picture to refocus. A sharp image matters more than getting close.
        </p>
      </div>

      {status?.type === "success" && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/40 rounded-2xl p-4 text-sm text-green-700 dark:text-green-300">
          Added {status.quantity}
          {status.unit ? ` ${status.unit}` : ""} to <span className="font-semibold">{status.product.name}</span>.
        </div>
      )}
      {status?.type === "notfound" && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40 rounded-2xl p-4 space-y-2">
          <div className="text-sm text-amber-700 dark:text-amber-300">
            No product matches barcode <span className="font-mono">{status.code}</span>
            {status.weight != null && (
              <>
                {" "}
                · parsed weight <span className="font-semibold">{status.weight} {settings?.variableWeightUnit}</span>
              </>
            )}
            .
          </div>
          {status.gs1 && <div className="text-xs text-amber-700/80 dark:text-amber-300/80">{describeGs1(status.gs1)}</div>}
          {products.find((p) => p.id === linkProductId)?.barcode && (
            <div className="text-xs text-amber-700/80 dark:text-amber-300/80">This product already has a barcode. The scanned code is added as another one for the same item.</div>
          )}
          <div className="flex gap-2">
            <select
              value={linkProductId}
              onChange={(e) => setLinkProductId(e.target.value)}
              className="input flex-1 px-2 min-w-0"
            >
              <option value="">Select a product to link…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.barcode ? ` · ${p.barcode.length > 14 ? p.barcode.slice(0, 14) + "…" : p.barcode}` : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={linkAndAdd}
              disabled={!linkProductId || processing}
              className="btn-primary disabled:opacity-50 shrink-0"
            >
              Link &amp; Add
            </button>
          </div>
        </div>
      )}
      {status?.type === "error" && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-2xl p-4 text-sm text-red-700 dark:text-red-300">
          {status.message}
        </div>
      )}

      {recent.length > 0 && (
        <div className="card divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
          <div className="px-4 py-3 text-sm font-semibold bg-gray-50 dark:bg-gray-900/60 dark:text-gray-100">This Session</div>
          {recent.map((r) => (
            <div key={r.id} className="p-3 flex items-center justify-between text-sm dark:text-gray-200">
              <span>{r.name}</span>
              <span className="flex items-center gap-3">
                <span className="text-green-600 dark:text-green-400 font-semibold">
                  +{r.quantity}
                  {r.unit ? ` ${r.unit}` : ""}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">{r.time.toLocaleTimeString()}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
