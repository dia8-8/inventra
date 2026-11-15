import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/client";
import InvoiceDocument from "../components/InvoiceDocument";
import A4Sheet from "../components/A4Sheet";

export default function InvoicePrint() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.get(`/orders/${id}`), api.get("/settings")])
      .then(([o, s]) => {
        setOrder(o.data);
        setSettings(s.data);
      })
      .catch((err) => setError(err.response?.data?.error || "Could not load invoice"));
  }, [id]);

  if (error)
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="p-6 text-red-600 text-sm">{error}</div>
      </div>
    );
  if (!order || !settings)
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="p-6 text-gray-500 text-sm">Loading…</div>
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 print:min-h-0 print:bg-white">
      {/* Invoices are printed on A4 paper with 15 mm margins */}
      <style>{"@page { size: A4; margin: 15mm; }"}</style>
      <div className="max-w-[calc(210mm+3rem)] mx-auto p-4 sm:p-6 print:p-0 print:max-w-none">
        <div className="flex items-center justify-between mb-4 print:hidden">
          <span className="text-xs text-gray-500">A4 · 210 × 297 mm</span>
          <button
            onClick={() => window.print()}
            className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg"
          >
            Print
          </button>
        </div>

        <A4Sheet>
          <InvoiceDocument layout={settings.invoiceLayout} settings={settings} order={order} />
        </A4Sheet>
      </div>
    </div>
  );
}
