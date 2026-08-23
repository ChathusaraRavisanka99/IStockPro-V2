import { ModulePlaceholder } from "@/components/ui/module-placeholder";

export default function PhonesPage() {
  return (
    <ModulePlaceholder
      title="Items - Phones"
      subtitle="Serialized stock by IMEI"
      todos={[
        "TODO: CRUD for PhoneModel and PhoneVariant",
        "TODO: Add serialized Phone units with IMEI uniqueness",
        "TODO: Live in-stock counts per model and variant",
        "TODO: Hide cost fields at data layer for staff role",
      ]}
    />
  );
}
