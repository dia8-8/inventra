// Reads GS1-128 labels: the long barcodes on supplier cartons that pack several facts into one
// code, e.g.  01 90076338246802  3201 000552  11 261110  21 0102006281
//   (01) product code (GTIN-14)   (320n) net weight in pounds   (11) production date   (21) serial
// Each fact starts with a 2-4 digit "application identifier" (AI).

const LB_TO_KG = 0.45359237;

// AIs with a fixed number of digits after them
const FIXED = { "00": 18, "01": 14, "02": 14, "11": 6, "12": 6, "13": 6, "15": 6, "16": 6, "17": 6, "20": 2 };
// AIs whose value runs up to a separator (or the end of the code)
const VARIABLE = { "10": 20, "21": 20, "30": 8, "37": 8, "240": 30, "241": 30, "400": 30 };
const GS = "\x1d"; // the separator that follows a variable-length value

function readAi(s, i) {
  // 31xx-36xx: weights, lengths, volumes: always 6 digits, the last AI digit is the decimal places
  if (/^3[1-6]\d\d/.test(s.slice(i, i + 4))) return { ai: s.slice(i, i + 4), fixed: 6 };
  const three = s.slice(i, i + 3);
  if (VARIABLE[three]) return { ai: three, max: VARIABLE[three] };
  const two = s.slice(i, i + 2);
  if (FIXED[two]) return { ai: two, fixed: FIXED[two] };
  if (VARIABLE[two]) return { ai: two, max: VARIABLE[two] };
  return null;
}

export function gtinCheckDigitOk(gtin) {
  if (!/^\d{8}$|^\d{12,14}$/.test(gtin)) return false;
  const digits = gtin.split("").map(Number);
  const check = digits.pop();
  let sum = 0;
  digits.reverse().forEach((d, i) => (sum += d * (i % 2 === 0 ? 3 : 1)));
  return (10 - (sum % 10)) % 10 === check;
}

function parseFields(raw) {
  // scanners sometimes prefix a symbology identifier such as "]C1"
  const s = String(raw || "").trim().replace(/^\][A-Za-z]\d/, "");
  if (!s) return null;

  // human-readable form: (01)90076338246802(3201)000552 ...
  if (s.includes("(")) {
    const fields = {};
    for (const m of s.matchAll(/\((\d{2,4})\)([^(]*)/g)) fields[m[1]] = m[2].replace(new RegExp(GS, "g"), "").replace(/\s+/g, ""); // printed text has spaces, the barcode does not
    return Object.keys(fields).length ? fields : null;
  }

  const fields = {};
  let i = 0;
  while (i < s.length) {
    if (s[i] === GS) {
      i++;
      continue;
    }
    const def = readAi(s, i);
    if (!def) return null; // not something we can read with confidence
    i += def.ai.length;
    if (def.fixed) {
      const value = s.slice(i, i + def.fixed);
      if (value.length < def.fixed || !/^\d+$/.test(value)) return null;
      fields[def.ai] = value;
      i += def.fixed;
    } else {
      let end = s.indexOf(GS, i);
      if (end < 0) end = s.length;
      const value = s.slice(i, end);
      if (!value || value.length > def.max) return null;
      fields[def.ai] = value;
      i = end;
    }
  }
  return fields;
}

function toDate(yymmdd) {
  if (!/^\d{6}$/.test(yymmdd || "")) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const year = yy <= 50 ? 2000 + yy : 1900 + yy;
  const day = yymmdd.slice(4);
  return `${year}-${yymmdd.slice(2, 4)}${day === "00" ? "" : `-${day}`}`;
}

function measure(fields, prefix) {
  for (let decimals = 0; decimals <= 5; decimals++) {
    const v = fields[`${prefix}${decimals}`];
    if (v) return Number(v) / Math.pow(10, decimals);
  }
  return null;
}

// Returns null unless this really is a GS1 label with a valid product code in it.
export function parseGs1(raw) {
  const fields = parseFields(raw);
  const gtin = fields?.["01"] || fields?.["02"];
  if (!gtin || gtin.length !== 14 || !gtinCheckDigitOk(gtin)) return null;

  const netKg = measure(fields, "310");
  const netLb = measure(fields, "320");
  return {
    gtin,
    netWeightKg: netKg ?? (netLb != null ? netLb * LB_TO_KG : null),
    netWeightLb: netLb ?? (netKg != null ? netKg / LB_TO_KG : null),
    weightFromLb: netKg == null && netLb != null,
    lot: fields["10"] || null,
    serial: fields["21"] || null,
    count: fields["37"] ? Number(fields["37"]) : null,
    productionDate: toDate(fields["11"]),
    packDate: toDate(fields["13"]),
    bestBefore: toDate(fields["15"]),
    expiry: toDate(fields["17"]),
  };
}

// The same product can be saved with its barcode written a few different ways
export function gtinVariants(gtin) {
  const variants = [gtin, gtin.replace(/^0+/, "")];
  if (gtin.startsWith("0")) variants.push(gtin.slice(1));
  return [...new Set(variants.filter(Boolean))];
}

const round2 = (n) => Math.round(n * 100) / 100;

// How much stock one label adds. Products counted in KG take the label's net weight;
// otherwise the label's piece count, if it has one. null = use the "Qty per scan" box.
export function gs1Quantity(product, info) {
  if (product?.unit === "KG" && info.netWeightKg != null) return { quantity: round2(info.netWeightKg), unit: "kg" };
  if (info.count != null && info.count > 0) return { quantity: info.count, unit: product?.unit ? product.unit.toLowerCase() : "" };
  return { quantity: null, unit: "" };
}

export function describeGs1(info) {
  const bits = [`case label ${info.gtin}`];
  if (info.netWeightLb != null && info.weightFromLb) bits.push(`net ${round2(info.netWeightLb)} lb (${round2(info.netWeightKg)} kg)`);
  else if (info.netWeightKg != null) bits.push(`net ${round2(info.netWeightKg)} kg`);
  if (info.count != null) bits.push(`${info.count} pcs`);
  if (info.lot) bits.push(`lot ${info.lot}`);
  if (info.productionDate) bits.push(`produced ${info.productionDate}`);
  if (info.expiry) bits.push(`expires ${info.expiry}`);
  if (info.serial) bits.push(`serial ${info.serial}`);
  return bits.join(" · ");
}
