"use client";

import { useState, type ReactNode } from "react";

type Tab = { id: string; label: string; description?: ReactNode; content: ReactNode };

/**
 * Accessible tab strip. Panels stay mounted (just hidden) so server-action forms keep their
 * typed values when switching tabs; the strip scrolls sideways on narrow screens.
 */
export function TabPanels({ tabs, initial }: { tabs: Tab[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id);
  return (
    <div>
      <div role="tablist" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActive(tab.id)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition ${selected ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} id={`panel-${tab.id}`} role="tabpanel" aria-labelledby={`tab-${tab.id}`} hidden={tab.id !== active} className="pt-3">
          {tab.description ? <p className="mb-3 text-sm text-slate-600">{tab.description}</p> : null}
          {tab.content}
        </div>
      ))}
    </div>
  );
}
