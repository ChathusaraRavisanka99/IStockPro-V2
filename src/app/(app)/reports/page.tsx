import { ModulePlaceholder } from "@/components/ui/module-placeholder";

export default function ReportsPage() {
  return (
    <ModulePlaceholder
      title="Reports"
      subtitle="P&L and cost analysis"
      todos={[
        "TODO: P&L filters by date/model/lot",
        "TODO: Unit and model-level cost analysis",
        "TODO: CSV/Excel export for report tables",
        "TODO: Role-gate to manager and admin",
      ]}
    />
  );
}
