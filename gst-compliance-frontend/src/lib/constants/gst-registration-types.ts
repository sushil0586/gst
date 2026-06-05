export const GST_REGISTRATION_TYPE_OPTIONS = [
  { value: "regular", label: "Regular" },
  { value: "composition", label: "Composition" },
  { value: "casual_taxable_person", label: "Casual Taxable Person" },
  { value: "input_service_distributor", label: "Input Service Distributor" },
  { value: "non_resident_taxable_person", label: "Non-Resident Taxable Person" },
  { value: "tax_deductor", label: "Tax Deductor" },
  { value: "tax_collector", label: "Tax Collector" },
  { value: "sez_unit", label: "SEZ Unit" },
  { value: "sez_developer", label: "SEZ Developer" },
  { value: "uin_holder", label: "UIN Holder" },
  { value: "oidar", label: "OIDAR" },
] as const;

export function formatRegistrationTypeLabel(value?: string | null) {
  const normalized = normalizeRegistrationType(value);
  return GST_REGISTRATION_TYPE_OPTIONS.find((option) => option.value === normalized)?.label ?? "Regular";
}

export function normalizeRegistrationType(value?: string | null) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!normalized) {
    return "regular";
  }

  const aliasMap: Record<string, string> = {
    regular_taxpayer: "regular",
    regular_person: "regular",
    composite: "composition",
    composition_taxpayer: "composition",
    sez: "sez_unit",
    sezunit: "sez_unit",
    sezdeveloper: "sez_developer",
    isd: "input_service_distributor",
    input_service_distributer: "input_service_distributor",
    nrtp: "non_resident_taxable_person",
    tds: "tax_deductor",
    tcs: "tax_collector",
    uin: "uin_holder",
  };

  const resolved = aliasMap[normalized] ?? normalized;
  return GST_REGISTRATION_TYPE_OPTIONS.some((option) => option.value === resolved) ? resolved : "regular";
}
