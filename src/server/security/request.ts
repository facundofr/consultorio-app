import "server-only";
import { headers } from "next/headers";
import { blindIndex } from "@/lib/pii";
import { resolveClientIp } from "./client-ip";

/**
 * Client IP as reported by our own reverse proxy (see client-ip.ts).
 * Configure CLIENT_IP_HEADER and TRUSTED_PROXY_HOPS to match the deployment.
 */
export async function clientIp(): Promise<string> {
  return resolveClientIp(await headers(), {
    header: process.env.CLIENT_IP_HEADER,
    trustedHops: process.env.TRUSTED_PROXY_HOPS,
  });
}

/** Keyed hash of the client IP: lets us rate-limit and audit without storing IPs. */
export async function clientIpHash(): Promise<string> {
  return blindIndex("ip", await clientIp());
}
