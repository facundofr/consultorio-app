/**
 * Domain errors carry a stable machine code plus a user-facing message in
 * Spanish (es-AR). API routes and the assistant map them to responses.
 */
export type DomainErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "SLOT_UNAVAILABLE"
  | "SLOT_TAKEN"
  | "CANCEL_WINDOW_PASSED"
  | "ALREADY_CANCELLED"
  | "NOT_CANCELLABLE"
  | "RATE_LIMITED";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    public readonly userMessage: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(`${code}: ${userMessage}`);
    this.name = "DomainError";
  }
}

export const isDomainError = (e: unknown): e is DomainError => e instanceof DomainError;

/** Extract the SQLSTATE of a Postgres error, even when wrapped by Drizzle. */
export function pgErrorCode(err: unknown): string | undefined {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur && typeof cur === "object"; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

export function pgConstraint(err: unknown): string | undefined {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur && typeof cur === "object"; i++) {
    const c = (cur as { constraint_name?: unknown; constraint?: unknown }).constraint_name ??
      (cur as { constraint?: unknown }).constraint;
    if (typeof c === "string") return c;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

export const PG_EXCLUSION_VIOLATION = "23P01";
export const PG_UNIQUE_VIOLATION = "23505";
export const PG_DEADLOCK = "40P01";
export const PG_SERIALIZATION_FAILURE = "40001";
