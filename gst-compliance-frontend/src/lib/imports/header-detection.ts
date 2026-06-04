import * as XLSX from "xlsx";

const mappingFieldAliases = {
  document_number: ["invoice_no", "invoice_number", "document_number", "inv_no", "doc_no", "document_no"],
  document_date: ["invoice_date", "document_date", "date", "inv_date", "doc_date"],
  counterparty_gstin: ["gstin", "supplier_gstin", "recipient_gstin", "counterparty_gstin", "party_gstin"],
  counterparty_name: ["counterparty_name", "supplier_name", "recipient_name", "party_name", "customer_name", "vendor_name"],
  taxable_value: ["taxable_value", "taxable_amt", "taxable_amount", "assessable_value"],
  cgst_amount: ["cgst", "cgst_amount"],
  sgst_amount: ["sgst", "sgst_amount"],
  igst_amount: ["igst", "igst_amount"],
  cess_amount: ["cess", "cess_amount"],
  total_amount: ["total", "total_amount", "invoice_value", "document_value", "gross_amount"],
  place_of_supply: ["place_of_supply", "pos", "state", "place_supply"],
  reverse_charge: ["reverse_charge", "rcm", "is_reverse_charge"],
  document_type: ["document_type", "doc_type", "invoice_type"],
  hsn_code: ["hsn", "hsn_code", "hsn_sac", "hsn_sac_code", "sac", "sac_code"],
  description: ["description", "item_description", "goods_description", "service_description"],
  uqc: ["uqc", "uom", "unit", "unit_code"],
  quantity: ["quantity", "qty", "total_qty"],
  is_service: ["is_service", "service", "is_service_item"],
  supply_category: ["supply_category", "taxability", "supply_type", "gst_supply_type"],
  ecommerce_gstin: ["ecommerce_gstin", "e_commerce_gstin", "eco_gstin", "operator_gstin"],
} as const;

export type TemplateMappingField = keyof typeof mappingFieldAliases;

export function normalizeHeaderKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function readCsvHeaders(file: File): Promise<string[]> {
  const content = await file.text();
  const firstLine = content.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
  return firstLine
    .split(",")
    .map((value) => value.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

async function readXlsxHeaders(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return [];
  }
  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean | null>>(worksheet, {
    header: 1,
    raw: false,
    blankrows: false,
  });
  const firstRow = rows.find((row) => Array.isArray(row) && row.some((cell) => String(cell ?? "").trim().length > 0)) ?? [];
  return firstRow.map((cell) => String(cell ?? "").trim()).filter(Boolean);
}

export async function parseHeadersFromFile(file: File): Promise<string[]> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".csv")) {
    return readCsvHeaders(file);
  }
  if (lowerName.endsWith(".xlsx")) {
    return readXlsxHeaders(file);
  }
  return [];
}

export function buildHeaderSuggestions(headers: string[]): Partial<Record<TemplateMappingField, string>> {
  const normalizedLookup = new Map(headers.map((header) => [normalizeHeaderKey(header), header]));
  const suggestions: Partial<Record<TemplateMappingField, string>> = {};

  for (const [field, aliases] of Object.entries(mappingFieldAliases) as Array<[TemplateMappingField, readonly string[]]>) {
    const candidates = [field, ...aliases];
    for (const candidate of candidates) {
      const match = normalizedLookup.get(normalizeHeaderKey(candidate));
      if (match) {
        suggestions[field] = match;
        break;
      }
    }
  }

  return suggestions;
}
