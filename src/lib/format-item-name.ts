type PhoneNameParts = {
  imei: string;
  phoneVariant: { variantName: string; phoneModel: { brand: string; modelName: string } };
};
type AccessoryNameParts = { name: string; sku: string };

/** "Brand Model - Variant - IMEI 123..." for a phone unit, "Name (SKU)" for an accessory. */
export function formatSaleItemName(item: { phone?: PhoneNameParts | null; accessory?: AccessoryNameParts | null }): string {
  if (item.phone) {
    const { brand, modelName } = item.phone.phoneVariant.phoneModel;
    const { variantName } = item.phone.phoneVariant;
    const { imei } = item.phone;
    return `${brand} ${modelName} - ${variantName}${imei ? ` - IMEI ${imei}` : ""}`;
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
