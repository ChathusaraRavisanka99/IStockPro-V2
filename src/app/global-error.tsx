"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/error-report-actions";

/** Last-resort boundary (errors in the root layout itself). Kept dependency-free. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError({ kind: "page", message: error.message || "App crashed", stack: error.stack, digest: error.digest, route: window.location.pathname, userAgent: navigator.userAgent, extra: { boundary: "global" } }).catch(() => undefined);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f5f7fb", margin: 0 }}>
        <div style={{ maxWidth: 480, margin: "15vh auto", background: "#fff", border: "1px solid #fecaca", borderRadius: 16, padding: 24 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Something went wrong</h2>
          <p style={{ color: "#475569", fontSize: 14 }}>The problem was recorded so it can be fixed. {error.digest ? `Reference: ${error.digest}` : ""}</p>
          <button onClick={reset} style={{ background: "#0f172a", color: "#fff", border: 0, borderRadius: 8, padding: "10px 16px", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
