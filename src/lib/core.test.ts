// The rules that must never break: plan access, phone matching, times and reminder text.
import { describe, expect, it } from "vitest";
import { computeAccess, TRIAL_DAYS } from "./subscription";
import { canonicalPhone, normalizePhonePt } from "./phone";
import {
  addDays,
  addMonthsClamped,
  minutesToTime,
  timeToMinutes,
  weekdayOf,
  zonedToUtc,
} from "./time";
import { renderReminderMessage } from "./reminder-message";
import { isReservedSlug } from "./reserved-slugs";

const now = new Date("2026-10-17T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

describe("plan access", () => {
  it("a new business is in the free trial, allowed, but without the paid extras", () => {
    const a = computeAccess(daysAgo(1), null, now);
    expect(a.state).toBe("trial");
    expect(a.allowed).toBe(true);
    expect(a.pro).toBe(false);
    expect(a.trialDaysLeft).toBe(TRIAL_DAYS - 1);
  });

  it("the free trial is 14 days; with an invite, 21", () => {
    expect(TRIAL_DAYS).toBe(14);
    expect(computeAccess(daysAgo(15), null, now).state).toBe("blocked");
    const invited = computeAccess(daysAgo(15), null, now, 7);
    expect(invited.state).toBe("trial");
    expect(invited.trialTotalDays).toBe(21);
    expect(computeAccess(daysAgo(22), null, now, 7).state).toBe("blocked");
  });

  it("after the trial with no subscription, the business is blocked", () => {
    const a = computeAccess(daysAgo(TRIAL_DAYS + 1), null, now);
    expect(a.state).toBe("blocked");
    expect(a.allowed).toBe(false);
  });

  it("paying unlocks the paid extras", () => {
    const sub = {
      plan: "pro" as const,
      status: "active",
      current_period_end: null,
      stripe_subscription_id: "sub_1",
    };
    const a = computeAccess(daysAgo(60), sub, now);
    expect(a.state).toBe("active");
    expect(a.pro).toBe(true);
    expect(a.subscribed).toBe(true);
  });

  it("a Google Play subscription counts too, managed in the store", () => {
    const sub = {
      plan: "pro" as const,
      status: "active",
      current_period_end: null,
      stripe_subscription_id: null,
      store: "play_store" as const,
      store_subscription_id: "GPA.1",
    };
    const a = computeAccess(daysAgo(60), sub, now);
    expect(a.pro).toBe(true);
    expect(a.store).toBe("play_store");
  });

  it("a failed payment still works while it is retried", () => {
    const sub = {
      plan: "pro" as const,
      status: "past_due",
      current_period_end: null,
      stripe_subscription_id: "sub_1",
    };
    const a = computeAccess(daysAgo(60), sub, now);
    expect(a.state).toBe("past_due");
    expect(a.allowed).toBe(true);
  });
});

describe("phones", () => {
  it("finds the same client however the number was typed", () => {
    expect(canonicalPhone("912345678")).toBe("912 345 678");
    expect(canonicalPhone("+351 912 345 678")).toBe("912 345 678");
    expect(canonicalPhone("00351912345678")).not.toBe("");
  });

  it("stores PT mobiles in international form", () => {
    expect(normalizePhonePt("912 345 678")).toBe("+351912345678");
  });
});

describe("times", () => {
  it("converts Lisbon wall-clock time to UTC in summer and winter", () => {
    expect(zonedToUtc("2026-07-01", 10 * 60, "Europe/Lisbon").toISOString()).toBe(
      "2026-07-01T09:00:00.000Z",
    );
    expect(zonedToUtc("2026-12-01", 10 * 60, "Europe/Lisbon").toISOString()).toBe(
      "2026-12-01T10:00:00.000Z",
    );
  });

  it("handles the day the clocks change", () => {
    // 25 October 2026: clocks go back at 02:00 in Lisbon.
    expect(zonedToUtc("2026-10-25", 12 * 60, "Europe/Lisbon").toISOString()).toBe(
      "2026-10-25T12:00:00.000Z",
    );
  });

  it("does date and minute arithmetic", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(minutesToTime(9 * 60 + 5)).toBe("09:05");
    expect(timeToMinutes("14:30")).toBe(870);
    expect(weekdayOf("2026-10-17")).toBe(6);
  });
});

describe("reminder text", () => {
  it("fills the variables, with or without accents", () => {
    const out = renderReminderMessage("Olá {nome}, {servico} às {hora} em {negócio}", {
      nome: "Ana",
      serviço: "Corte",
      hora: "10:30",
      negócio: "Barbearia",
    });
    expect(out).toBe("Olá Ana, Corte às 10:30 em Barbearia");
  });

  it("uses the suggested text when the business wrote none", () => {
    expect(renderReminderMessage("", { nome: "Rui" })).toContain("Rui");
  });
});

describe("page links", () => {
  it("app pages cannot be taken as a business link", () => {
    expect(isReservedSlug("eliminar-conta")).toBe(true);
    expect(isReservedSlug("privacidade")).toBe(true);
    expect(isReservedSlug("barbearia-lisboa")).toBe(false);
  });
});

describe("map tiles (OpenStreetMap card)", () => {
  it("puts the point at the right place on the world map", async () => {
    const { worldPixel, tileGrid, directionsUrl } = await import("./map-tiles");
    expect(worldPixel(0, 0, 0)).toEqual({ x: 128, y: 128 });
    const grid = tileGrid(38.7223, -9.1393, 16);
    expect(grid.tiles).toHaveLength(15);
    // The pin falls inside the middle tile of the grid.
    expect(grid.pin.x).toBeGreaterThanOrEqual(2 * 256);
    expect(grid.pin.x).toBeLessThan(3 * 256);
    expect(grid.pin.y).toBeGreaterThanOrEqual(256);
    expect(grid.pin.y).toBeLessThan(2 * 256);
    expect(directionsUrl(38.7, -9.1)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=38.7,-9.1",
    );
  });
});
