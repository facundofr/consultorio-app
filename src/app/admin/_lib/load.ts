import "server-only";
import { notFound } from "next/navigation";
import { isDomainError } from "@/server/errors";

/** Load an entity; NOT_FOUND and FORBIDDEN both render the 404 page (no info leak). */
export async function loadOr404<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isDomainError(e) && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }
}
