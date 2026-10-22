import { z } from "zod";

export const uuid = z.string().uuid();

/** Empty strings from forms become null. */
export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const requiredText = (label: string, max = 200) =>
  z.string().trim().min(1, `Completá ${label}.`).max(max, `${label} es demasiado largo.`);

export const boolFromForm = z
  .union([z.boolean(), z.literal("on"), z.literal("true"), z.literal("false"), z.literal("")])
  .optional()
  .transform((v) => v === true || v === "on" || v === "true");

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** "$ 35.000,50" / "35000.5" / "35000" → cents, or null when empty. */
export function parseMoneyToCents(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  let s = String(input).trim().replace(/[$\s]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) throw new Error("invalid money");
  return Math.round(n * 100);
}

export function formatMoney(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(cents / 100);
}

export const PAGE_SIZE = 25;
export function pageParams(page: unknown) {
  const p = Math.max(1, Number(page) || 1);
  return { page: p, limit: PAGE_SIZE, offset: (p - 1) * PAGE_SIZE };
}

/** Escape LIKE wildcards in user search input. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
