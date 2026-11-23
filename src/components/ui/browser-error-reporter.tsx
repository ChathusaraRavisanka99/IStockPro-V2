"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/error-report-actions";

/**
 * Records browser-side crashes that never reach an error boundary (event handlers, async
 * code, failed chunk loads) in the Error Log. Mounted once in the app layout.
 */
export function BrowserErrorReporter() {
  useEffect(() => {
    const send = (message: string, stack?: string, extra?: Record<string, unknown>) => {
      // Benign browser noise, not app bugs.
      if (/ResizeObserver loop|Script error\.?$/i.test(message)) return;
      reportClientError({ kind: "browser", message, stack, route: window.location.pathname + window.location.search, userAgent: navigator.userAgent, extra }).catch(() => undefined);
    };
    const onError = (event: ErrorEvent) => send(event.message || "Uncaught error", event.error?.stack, { source: event.filename, line: event.lineno, column: event.colno });
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      send(reason instanceof Error ? reason.message : String(reason ?? "Unhandled promise rejection"), reason instanceof Error ? reason.stack : undefined, { type: "unhandledrejection" });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
