import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

type DataTableShellProps = {
  title: string;
  toolbar?: ReactNode;
  children: ReactNode;
};

export function DataTableShell({ title, toolbar, children }: DataTableShellProps) {
  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        {toolbar ? <div className="flex items-center gap-2">{toolbar}</div> : null}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </Card>
  );
}
