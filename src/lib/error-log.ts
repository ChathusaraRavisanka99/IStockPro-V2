import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Crash log. Every failure we catch (server actions, page errors, browser errors) is stored as
 * an AuditLog row with action "AppError", carrying enough context to reproduce it later: where
 * it happened, the user, the route, a sanitized summary of the submitted data, timing and the
 * stack. Viewed (and marked resolved / exported) on the Error Log page.
 */
export const APP_ERROR_ACTION = "AppError";

export type ErrorSource = "server-action" | "page" | "browser" | "api";

export type AppErrorDetails = {
  where: string;
  message: string;
  name?: string;
  stack?: string;
  digest?: string;
  route?: string;
  userAgent?: string;
  durationMs?: number;
  input?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  appVersion?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
};

const SECRET_KEYS = /pass(word)?|secret|token|confirm(username|password)/i;
const MAX_STRING = 500;

function clip(value: string) {
  return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}… (${value.length} chars)` : value;
}

/**
 * A safe, compact copy of submitted form data: secrets removed, long strings clipped, files
 * described instead of stored, and JSON payloads (e.g. a cart) parsed so their size and a few
 * sample entries are visible.
 */
export function summarizeFormData(formData: FormData | null | undefined): Record<string, unknown> | undefined {
  if (!formData) return undefined;
  const out: Record<string, unknown> = {};
  formData.forEach((value, key) => {
    if (SECRET_KEYS.test(key)) {
      out[key] = "[redacted]";
      return;
    }
    if (typeof value !== "string") {
      out[key] = { file: value.name, type: value.type, bytes: value.size };
      return;
    }
    const trimmed = value.trim();
    if ((trimmed.startsWith("[") || trimmed.startsWith("{")) && trimmed.length > 2) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          out[key] = { items: parsed.length, sample: parsed.slice(0, 25), bytes: trimmed.length };
          return;
        }
        out[key] = parsed;
        return;
      } catch {
        // fall through to plain string
      }
    }
    out[key] = clip(value);
  });
  return out;
}

const describe = (error: unknown) => {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return { name: error.name, message: error.message + (code ? ` [${String(code)}]` : ""), stack: error.stack?.split("\n").slice(0, 25).join("\n") };
  }
  return { name: "NonError", message: typeof error === "string" ? error : JSON.stringify(error)?.slice(0, 2000) ?? "Unknown error", stack: undefined };
};

/** Never throws — logging must not turn one failure into two. Returns a short reference. */
export async function logAppError(source: ErrorSource, details: Omit<AppErrorDetails, "message" | "name" | "stack"> & { error?: unknown; message?: string }, userId?: string | null): Promise<string | null> {
  try {
    let actorId = userId ?? null;
    if (actorId === undefined || actorId === null) {
      try {
        const session = await getServerSession(authOptions);
        actorId = session?.user?.id ?? null;
      } catch {
        actorId = null;
      }
    }
    const described = details.error !== undefined ? describe(details.error) : { name: "Error", message: details.message ?? "Unknown error", stack: undefined };
    const { error: _error, ...rest } = details;
    void _error;
    const payload: AppErrorDetails = {
      ...rest,
      message: details.message && details.error !== undefined ? `${details.message}: ${described.message}` : described.message,
      name: described.name,
      stack: described.stack,
      appVersion: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || process.env.npm_package_version,
    };
    const row = await prisma.auditLog.create({ data: { action: APP_ERROR_ACTION, entityType: source, entityId: details.where.slice(0, 120), userId: actorId, details: payload as object } });
    console.error(`[app-error ${row.id}] ${details.where}: ${payload.message}`);
    return row.id.slice(-8).toUpperCase();
  } catch (loggingError) {
    console.error("[app-error] failed to record error", loggingError, details.error);
    return null;
  }
}

/**
 * Runs a server action body and records any failure with its input, timing and stack, then
 * re-throws a message that carries the reference so it can be matched in the Error Log.
 */
export async function withErrorLog<T>(where: string, formData: FormData | null, run: () => Promise<T>, extra?: Record<string, unknown>): Promise<T> {
  const started = Date.now();
  try {
    return await run();
  } catch (error) {
    // Next.js uses thrown errors for redirect()/notFound() — those aren't crashes.
    const digest = (error as { digest?: unknown })?.digest;
    if (typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")) throw error;
    const ref = await logAppError("server-action", { where, error, input: summarizeFormData(formData), durationMs: Date.now() - started, extra });
    const message = error instanceof Error ? error.message : "Something went wrong";
    throw new Error(`${message}${ref ? ` (error ref ${ref})` : ""}`);
  }
}
