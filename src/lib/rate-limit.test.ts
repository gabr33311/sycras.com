import { describe, expect, it, vi } from "vitest";

// Without the server key the database counter is unavailable here: the strict limits must
// then let requests through (never take the site down).
vi.mock("@/integrations/supabase/client.server", () => {
  throw new Error("no server key in tests");
});

import { rateLimitResponse } from "./rate-limit.server";

const req = (ip: string, auth?: string) =>
  new Request("https://sycras.com/api/x", {
    method: "POST",
    headers: { "x-forwarded-for": ip, ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
  });

describe("rate limiting", () => {
  it("webhooks and the cron are never limited", async () => {
    for (let i = 0; i < 400; i++) {
      expect(await rateLimitResponse(req("1.1.1.1"), "/api/stripe/webhook")).toBeNull();
    }
  });

  it("one network gets 300 requests a minute, then 429 with Retry-After", async () => {
    for (let i = 0; i < 300; i++) {
      expect(await rateLimitResponse(req("2.2.2.2"), "/api/slug")).toBeNull();
    }
    const blocked = await rateLimitResponse(req("2.2.2.2"), "/api/slug");
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("Retry-After")).toBe("60");
    // Another network is not affected.
    expect(await rateLimitResponse(req("3.3.3.3"), "/api/slug")).toBeNull();
  });

  it("strict routes let requests through when the counter is unavailable", async () => {
    for (let i = 0; i < 50; i++) {
      expect(await rateLimitResponse(req("4.4.4.4"), "/api/auth/login")).toBeNull();
    }
  });

  it("server functions are counted by name", async () => {
    expect(
      await rateLimitResponse(req("5.5.5.5"), "/_serverFn/abc", "getAvailableSlots"),
    ).toBeNull();
  });
});
