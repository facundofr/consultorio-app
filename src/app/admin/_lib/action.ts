import "server-only";
import { ZodError } from "zod";
import { isDomainError } from "@/server/errors";

/** Result of every admin form action. `seq` remounts the form with `values`. */
export type ActionState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string | string[]>;
  seq?: number;
};

export const initialState: ActionState = {};

/** FormData → plain object; repeated keys (checkbox groups) become arrays. */
export function formToObject(fd: FormData): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (typeof v !== "string") continue;
    const prev = out[k];
    if (prev === undefined) out[k] = v;
    else out[k] = Array.isArray(prev) ? [...prev, v] : [prev, v];
  }
  return out;
}

/**
 * Run a mutation and translate failures into form state:
 * zod issues → per-field messages; domain errors → a banner message.
 * Unknown errors are logged without payloads and shown generically.
 */
export async function runAction(values: Record<string, string | string[]>, fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const message = await fn();
    return { ok: true, message: message ?? "Cambios guardados.", seq: Date.now() };
  } catch (e) {
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) {
        const key = String(issue.path[0] ?? "_");
        fieldErrors[key] ??= issue.message;
      }
      return { ok: false, message: "Revisá los campos marcados.", fieldErrors, values, seq: Date.now() };
    }
    if (isDomainError(e)) return { ok: false, message: e.userMessage, values, seq: Date.now() };
    console.error("[admin action] unexpected error:", e instanceof Error ? e.message : "unknown");
    return { ok: false, message: "No pudimos guardar los cambios. Probá de nuevo.", values, seq: Date.now() };
  }
}

/** Run a simple (non-form) mutation returning ok/message. */
export async function runSimple(fn: () => Promise<string | void>): Promise<ActionState> {
  return runAction({}, fn);
}
