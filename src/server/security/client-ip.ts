import { isIP } from "node:net";

/**
 * Which address in a forwarded header belongs to the visitor.
 *
 * Each proxy *appends* the address it received the request from, so the
 * leftmost values can be typed by anyone and only the last `trustedHops`
 * entries were written by our own infrastructure. With one nginx in front
 * (`proxy_add_x_forwarded_for`), the visitor is the last entry.
 *
 *   header       which header to read (default x-forwarded-for). For a header
 *                that the proxy overwrites, such as x-real-ip, use hops = 1.
 *   trustedHops  how many proxies sit in front of the app (default 1).
 *
 * Results that are not an IP address collapse into one shared bucket, so a
 * forged header can never give an attacker a fresh rate-limit key.
 */
export function resolveClientIp(
  h: Pick<Headers, "get">,
  cfg: { header?: string; trustedHops?: string | number } = {},
): string {
  const header = (cfg.header || "x-forwarded-for").toLowerCase();
  const hops = Math.max(1, Math.floor(Number(cfg.trustedHops ?? 1)) || 1);
  const raw = h.get(header);
  // No proxy in front (local development).
  if (!raw) return "local";
  const chain = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Fewer entries than proxies: the request did not come through all of them.
  if (chain.length < hops) return "unknown";
  const ip = stripPort(chain[chain.length - hops]);
  return isIP(ip) ? ip.toLowerCase() : "unknown";
}

/** "203.0.113.5:4321" → "203.0.113.5"; "[2001:db8::1]:443" → "2001:db8::1". */
function stripPort(v: string): string {
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(v);
  if (bracketed) return bracketed[1];
  const v4 = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(v);
  return v4 ? v4[1] : v;
}
