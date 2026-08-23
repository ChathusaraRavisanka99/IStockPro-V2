import { ModulePlaceholder } from "@/components/ui/module-placeholder";

export default function SettingsPage() {
  return (
    <ModulePlaceholder
      title="Settings"
      subtitle="Users, audit logs, and backups"
      todos={[
        "TODO: Admin-only user CRUD and role changes",
        "TODO: Audit log filter and explorer",
        "TODO: Run backup script and list recent backups",
      ]}
    />
  );
}
