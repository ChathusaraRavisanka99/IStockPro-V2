import type { ReactNode } from "react";
import { InfoHelp } from "@/components/ui/info-help";
import { PageTutorial } from "@/components/ui/page-tutorial";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Page-level help content shown in a popup via the info icon next to the title. */
  help?: ReactNode;
};

export function PageHeader({ title, subtitle, actions, help }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="break-words text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">{title}</h1>
          {help ? <InfoHelp title={title}>{help}</InfoHelp> : null}
        </div>
        {subtitle ? <p className="mt-1 text-sm font-medium text-slate-700">{subtitle}</p> : null}
        <div className="mt-2">
          {/* Step-by-step guide for whichever page this header is on (matched by URL). */}
          <PageTutorial />
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
