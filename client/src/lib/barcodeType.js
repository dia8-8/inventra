import { parseGs1 } from "./gs1";

// A plain-language name for the kind of barcode a code looks like. It is only a label to help
// people tell their codes apart; matching a scanned code to a product doesn't depend on it.
export function barcodeType(code) {
  const c = String(code || "").trim();
  if (!c) return "";
  if (parseGs1(c)) return "GS1-128 case label";
  if (/^\d+$/.test(c)) {
    if (c.length === 8) return "EAN-8";
    if (c.length === 12) return "UPC-A";
    if (c.length === 13) return "EAN-13";
    if (c.length === 14) return "GTIN-14 (case)";
    return "Numeric code";
  }
  return "Code 128 / Code 39";
}
