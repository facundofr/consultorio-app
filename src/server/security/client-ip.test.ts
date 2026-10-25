import { describe, expect, it } from "vitest";
import { resolveClientIp } from "./client-ip";

const h = (values: Record<string, string>) => new Headers(values);

describe("resolveClientIp", () => {
  it("uses the entry written by our proxy, not the one the visitor typed", () => {
    // Visitor sends "X-Forwarded-For: 1.2.3.4"; nginx appends the real address.
    expect(resolveClientIp(h({ "x-forwarded-for": "1.2.3.4, 203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("a forged header cannot change the result", () => {
    const a = resolveClientIp(h({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" }));
    const b = resolveClientIp(h({ "x-forwarded-for": "8.8.8.8, 7.7.7.7, 203.0.113.7" }));
    expect(a).toBe(b);
  });

  it("supports several proxies in front", () => {
    const v = h({ "x-forwarded-for": "6.6.6.6, 203.0.113.7, 10.0.0.2" });
    expect(resolveClientIp(v, { trustedHops: 2 })).toBe("203.0.113.7");
    expect(resolveClientIp(v, { trustedHops: "2" })).toBe("203.0.113.7");
  });

  it("a chain shorter than the proxy count is not trusted", () => {
    expect(resolveClientIp(h({ "x-forwarded-for": "203.0.113.7" }), { trustedHops: 2 })).toBe("unknown");
  });

  it("garbage collapses into one bucket instead of a fresh key", () => {
    expect(resolveClientIp(h({ "x-forwarded-for": "1.2.3.4, not-an-ip" }))).toBe("unknown");
    expect(resolveClientIp(h({ "x-forwarded-for": "random-123" }))).toBe("unknown");
  });

  it("reads another header when configured", () => {
    const v = h({ "x-forwarded-for": "1.1.1.1", "x-real-ip": "203.0.113.9" });
    expect(resolveClientIp(v, { header: "X-Real-IP" })).toBe("203.0.113.9");
  });

  it("handles ports and IPv6", () => {
    expect(resolveClientIp(h({ "x-forwarded-for": "203.0.113.7:5555" }))).toBe("203.0.113.7");
    expect(resolveClientIp(h({ "x-forwarded-for": "[2001:DB8::1]:443" }))).toBe("2001:db8::1");
    expect(resolveClientIp(h({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
  });

  it("without a proxy header (local development) everyone is 'local'", () => {
    expect(resolveClientIp(h({}))).toBe("local");
  });
});
