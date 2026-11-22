type VariantNameParts = { variantName: string; color?: string | null; storage?: string | null; ram?: string | null; phoneModel: { brand: string; modelName: string } };
type PhoneNameParts = {
  imei: string;
  phoneVariant: VariantNameParts;
};
type AccessoryNameParts = { name: string; sku: string };

/** "Brand Model - Variant - IMEI 123..." for a phone unit, "Name (SKU)" for an accessory. */
export function formatSaleItemName(item: { phone?: PhoneNameParts | null; accessory?: AccessoryNameParts | null }): string {
  if (item.phone) {
    const { imei } = item.phone;
    return `${formatPhoneName(item.phone.phoneVariant)}${imei ? ` - IMEI ${imei}` : ""}`;
  }
  if (item.accessory) {
    return `${item.accessory.name} (${item.accessory.sku})`;
  }
  return "Line item";
}

/** "Black · 128GB · 8GB RAM" — the at-a-glance specs for a phone variant, skipping blanks. */
export function formatVariantSpecs(variant: { color?: string | null; storage?: string | null; ram?: string | null }): string {
  const withUnit = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed) return "";
    return /^\d+(\.\d+)?$/.test(trimmed) ? `${trimmed}GB` : trimmed;
  };
  const ram = withUnit(variant.ram);
  return [variant.color?.trim() || "", withUnit(variant.storage), ram ? `${ram} RAM` : ""].filter(Boolean).join(" · ");
}

/**
 * "Apple iPhone 13 - 13 Pro (Graphite · 128GB)": model, variant and its color/storage/RAM.
 * The specs are skipped when the variant name already spells them all out.
 */
export function formatPhoneName(variant: VariantNameParts): string {
  const base = `${variant.phoneModel.brand} ${variant.phoneModel.modelName} - ${variant.variantName}`;
  const specs = formatVariantSpecs(variant);
  if (!specs) return base;
  const name = variant.variantName.toLowerCase();
  const alreadyNamed = specs.split(" · ").every((part) => name.includes(part.replace(/ RAM$/, "").toLowerCase()));
  return alreadyNamed ? base : `${base} (${specs})`;
}

const GENERIC_QUOTE_DESCRIPTIONS = new Set(["phone variant", "phone model", "quotation item"]);

/**
 * Customer-facing label for a quotation line: "Apple iPhone 13 - 128GB · Red (Red · 128GB)" for
 * a variant, "Apple iPhone 13" for a model, else the free-text description. A custom (non-generic)
 * description is returned as `note` so it can be shown under the label.
 */
export function quotationLineLabel(item: {
  description: string | null;
  phoneModel?: { brand: string; modelName: string } | null;
  phoneVariant?: (VariantNameParts & { phoneModel: { brand: string; modelName: string } }) | null;
}): { label: string; note: string | null } {
  const custom = item.description && !GENERIC_QUOTE_DESCRIPTIONS.has(item.description.trim().toLowerCase()) ? item.description.trim() : null;
  if (item.phoneVariant) return { label: formatPhoneName(item.phoneVariant), note: custom };
  if (item.phoneModel) return { label: `${item.phoneModel.brand} ${item.phoneModel.modelName}`, note: custom };
  return { label: custom || item.description || "Quotation item", note: null };
}
