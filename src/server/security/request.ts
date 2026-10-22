import "server-only";
import { headers } from "next/headers";
import { blindIndex } from "@/lib/pii";

/** Client IP as seen behind nginx (X-Forwarded-For / X-Real-IP). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "local";
}

/** Keyed hash of the client IP: lets us rate-limit and audit without storing IPs. */
export async function clientIpHash(): Promise<string> {
  return blindIndex("ip", await clientIp());
}
