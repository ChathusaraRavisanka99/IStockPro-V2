"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

export type ThemeChoice = "light" | "dark" | "system";
export const THEME_STORAGE_KEY = "istockpro-theme";

/**
 * Runs before first paint (inlined in the root layout) so the page never flashes the wrong
 * theme. Keep it tiny and dependency-free.
 */
export const themeInitScript = `(function(){try{var c=localStorage.getItem("${THEME_STORAGE_KEY}")||"system";var d=c==="dark"||(c==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

function apply(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#080f20" : "#f5f7fb");
}

/** Light / Dark / System switch. Remembered per browser. */
export function ThemeToggle({ compact }: { compact?: boolean }) {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    let saved: ThemeChoice = "system";
    try {
      saved = (localStorage.getItem(THEME_STORAGE_KEY) as ThemeChoice) || "system";
    } catch {
      // storage unavailable
    }
    setChoice(saved);
  }, []);

  // Follow the device setting live while "System" is selected.
  useEffect(() => {
    if (choice !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [choice]);

  function select(next: ThemeChoice) {
    setChoice(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // storage unavailable — still applies for this visit
    }
    apply(next);
  }

  const options: { id: ThemeChoice; label: string; icon: typeof Sun }[] = [
    { id: "light", label: "Light", icon: Sun },
    { id: "dark", label: "Dark", icon: Moon },
    { id: "system", label: "System", icon: Monitor },
  ];

  return (
    <div role="radiogroup" aria-label="Theme" className="flex rounded-lg border border-slate-300 bg-white p-0.5">
      {options.map((option) => {
        const active = choice === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={`${option.label} theme`}
            onClick={() => select(option.id)}
            className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            <option.icon className="size-3.5" />
            {compact ? null : option.label}
          </button>
        );
      })}
    </div>
  );
}
