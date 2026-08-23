import { ModulePlaceholder } from "@/components/ui/module-placeholder";

export default function LotsPage() {
  return (
    <ModulePlaceholder
      title="Lots"
      subtitle="Purchase batches, landed costs, and IMEI traceability"
      todos={[
        "TODO: Supplier and Lot CRUD",
        "TODO: Landed cost split across lot units",
        "TODO: IMEI search returning originating lot",
      ]}
    />
  );
}
