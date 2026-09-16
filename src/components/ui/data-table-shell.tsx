import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { InfoHelp } from "@/components/ui/info-help";

type DataTableShellProps = {
  title: string;
  toolbar?: ReactNode;
  help?: ReactNode;
  children: ReactNode;
};

export function DataTableShell({ title, toolbar, help, children }: DataTableShellProps) {
  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-1.5 text-lg font-semibold text-slate-950">
          {title}
          {help ? <InfoHelp size="sm" title={title}>{help}</InfoHelp> : null}
        </h2>
        {toolbar ? <div className="flex items-center gap-2">{toolbar}</div> : null}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </Card>
  );
}
