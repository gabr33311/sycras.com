import { describe, expect, it } from "vitest";
import { computeDeposit, depositFor, finalizeOutcome, ownerCancelRefund } from "@/lib/deposit";

describe("computeDeposit", () => {
  it("fixed value", () => expect(computeDeposit(1500, "fixed", 500)).toBe(500));
  it("percent of the price", () => expect(computeDeposit(1500, "percent", 30)).toBe(450));
  it("percent rounds to the cent", () => expect(computeDeposit(1999, "percent", 33)).toBe(660));
  it("never under 1 €", () => expect(computeDeposit(1500, "percent", 5)).toBe(100));
  it("never above the price", () => expect(computeDeposit(300, "fixed", 500)).toBe(300));
  it("no deposit for services under 1 €", () => expect(computeDeposit(80, "fixed", 500)).toBe(0));
  it("no deposit for free services", () => expect(computeDeposit(0, "percent", 30)).toBe(0));
});

describe("depositFor", () => {
  const on = { pro: true, enabled: true, chargesEnabled: true, mode: "fixed" as const, value: 500 };
  it("asks the deposit when everything is on", () => expect(depositFor(on, 1500)).toBe(500));
  it("0 when not pro", () => expect(depositFor({ ...on, pro: false }, 1500)).toBe(0));
  it("0 when the Stripe account cannot take payments", () =>
    expect(depositFor({ ...on, chargesEnabled: false }, 1500)).toBe(0));
  it("0 when switched off", () => expect(depositFor({ ...on, enabled: false }, 1500)).toBe(0));
});

describe("ownerCancelRefund", () => {
  it("refunds without asking when cancelled in time", () =>
    expect(ownerCancelRefund("2026-11-10T10:00:00Z", new Date("2026-11-09T09:00:00Z"), 24)).toBe(
      "always",
    ));
  it("asks when cancelled late", () =>
    expect(ownerCancelRefund("2026-11-10T10:00:00Z", new Date("2026-11-09T11:00:00Z"), 24)).toBe(
      "ask",
    ));
});

describe("finalizeOutcome", () => {
  it("not paid yet", () =>
    expect(finalizeOutcome({ paid: false, existingToken: null, created: null })).toBe("not_paid"));
  it("already booked → reuse", () =>
    expect(finalizeOutcome({ paid: true, existingToken: "t1", created: null })).toBe("reuse"));
  it("booked now", () =>
    expect(finalizeOutcome({ paid: true, existingToken: null, created: "ok" })).toBe("booked"));
  it("slot lost → refund", () =>
    expect(finalizeOutcome({ paid: true, existingToken: null, created: "slot_taken" })).toBe(
      "refund",
    ));
});
