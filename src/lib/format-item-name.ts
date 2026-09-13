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
