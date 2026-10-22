import { beforeEach, describe, expect, it } from "vitest";
import { rateLimit, resetRateLimits } from "./rate-limit";

describe("rateLimit", () => {
  beforeEach(resetRateLimits);
  it("allows up to the limit inside the window, then blocks", () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 60_000, t + i).ok).toBe(true);
    const r = rateLimit("k", 3, 60_000, t + 10);
    expect(r.ok).toBe(false);
    expect(r.retryAfterSeconds).toBe(60);
  });
  it("frees capacity as the window slides", () => {
    const t = 1_000_000;
    rateLimit("k", 1, 1000, t);
    expect(rateLimit("k", 1, 1000, t + 500).ok).toBe(false);
    expect(rateLimit("k", 1, 1000, t + 1001).ok).toBe(true);
  });
  it("keys are independent", () => {
    rateLimit("a", 1, 1000, 0);
    expect(rateLimit("b", 1, 1000, 0).ok).toBe(true);
  });
});
