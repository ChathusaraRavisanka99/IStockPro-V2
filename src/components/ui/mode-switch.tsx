"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Smartphone, X } from "lucide-react";

const COOKIE = "istockpro-mode";

function setMode(mode: "full" | "lite") {
  document.cookie = `${COOKIE}=${mode}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/** Switches between the Full app and the Lite (mobile-first) version. */
export function ModeSwitch({ mode, className }: { mode: "full" | "lite"; className?: string }) {
  const router = useRouter();
  const next = mode === "lite" ? "full" : "lite";
  return (
    <button
      type="button"
      onClick={() => {
        setMode(next);
        router.push(next === "lite" ? "/lite" : "/dashboard");
        router.refresh();
      }}
      className={className ?? "btn btn-sm btn-secondary w-full"}
    >
      {next === "lite" ? <Smartphone /> : <LayoutDashboard />}
      {next === "lite" ? "Switch to Lite version" : "Switch to Full version"}
    </button>
  );
}

/** On phones in the Full version, a one-time suggestion to try Lite. */
export function LiteSuggestion() {
  const router = useRouter();
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (window.matchMedia("(max-width: 640px)").matches && !localStorage.getItem("istockpro-lite-tip")) setShow(true);
    } catch {
      // storage unavailable
    }
  }, []);

  if (!show) return null;
  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem("istockpro-lite-tip", "1");
    } catch {
      // ignore
    }
  };
  return (
    <div className="mb-3 flex items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2.5 print:hidden lg:hidden">
      <Smartphone className="size-5 shrink-0 text-sky-700" />
      <p className="min-w-0 flex-1 text-sm text-sky-900">On a phone? The <b>Lite version</b> is simpler and faster to use.</p>
      <button
        type="button"
        onClick={() => {
          dismiss();
          setMode("lite");
          router.push("/lite");
          router.refresh();
        }}
        className="btn btn-xs btn-primary"
      >
        Try Lite
      </button>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="rounded-md p-1 text-sky-700 hover:bg-sky-100">
        <X className="size-4" />
      </button>
    </div>
  );
}
