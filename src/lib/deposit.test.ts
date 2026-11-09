import { describe, expect, it } from "vitest";
import {
  computeDeposit,
  depositFor,
  depositSweep,
  finalizeOutcome,
  isSlotConflict,
  ownerCancelRefund,
  staleHoldAction,
} from "@/lib/deposit";

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
    expect(finalizeOutcome({ paid: false, existing: false, created: null })).toBe("not_paid"));
  it("an appointment for this payment exists → reuse (never refund it)", () =>
    expect(finalizeOutcome({ paid: true, existing: true, created: "slot_taken" })).toBe("reuse"));
  it("booked now", () =>
    expect(finalizeOutcome({ paid: true, existing: false, created: "ok" })).toBe("booked"));
  it("slot lost → refund", () =>
    expect(finalizeOutcome({ paid: true, existing: false, created: "slot_taken" })).toBe("refund"));
});

describe("isSlotConflict", () => {
  it("overlap is a taken time", () => expect(isSlotConflict("23P01")).toBe(true));
  it("same payment twice is a taken time", () => expect(isSlotConflict("23505")).toBe(true));
  it("a connection error is not", () => expect(isSlotConflict("08006")).toBe(false));
  it("no code is not", () => expect(isSlotConflict(undefined)).toBe(false));
});

describe("staleHoldAction", () => {
  it("paid → book it", () =>
    expect(staleHoldAction({ payment_status: "paid", status: "complete" }, null)).toBe("finalize"));
  it("finished but paid later (delayed method) → keep waiting", () =>
    expect(staleHoldAction({ payment_status: "unpaid", status: "complete" }, null)).toBe("keep"));
  it("open and closed by us → free the time", () =>
    expect(staleHoldAction({ payment_status: "unpaid", status: "open" }, "expired")).toBe(
      "delete",
    ));
  it("open and could not be closed → keep", () =>
    expect(staleHoldAction({ payment_status: "unpaid", status: "open" }, "open")).toBe("keep"));
  it("paid while we were closing it → book it", () =>
    expect(staleHoldAction({ payment_status: "unpaid", status: "open" }, "paid")).toBe("finalize"));
  it("already expired → free the time", () =>
    expect(staleHoldAction({ payment_status: "unpaid", status: "expired" }, null)).toBe("delete"));
});

describe("depositSweep", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  it("cancelled with the deposit still paid, a while ago → refund", () =>
    expect(
      depositSweep(
        {
          status: "cancelled",
          depositStatus: "paid",
          startsAt: "2026-11-11T10:00:00Z",
          updatedAt: "2026-11-10T11:40:00Z",
        },
        now,
      ),
    ).toBe("refund"));
  it("cancelled a moment ago → leave it to the owner's choice", () =>
    expect(
      depositSweep(
        {
          status: "cancelled",
          depositStatus: "paid",
          startsAt: "2026-11-11T10:00:00Z",
          updatedAt: "2026-11-10T11:58:00Z",
        },
        now,
      ),
    ).toBe("none"));
  it("cancelled and kept by the owner → nothing", () =>
    expect(
      depositSweep(
        {
          status: "cancelled",
          depositStatus: "kept",
          startsAt: "2026-11-11T10:00:00Z",
          updatedAt: "2026-11-10T11:00:00Z",
        },
        now,
      ),
    ).toBe("none"));
  it("a request never answered and its time passed → refund", () =>
    expect(
      depositSweep(
        {
          status: "pending",
          depositStatus: "paid",
          startsAt: "2026-11-10T11:00:00Z",
          updatedAt: "2026-11-09T10:00:00Z",
        },
        now,
      ),
    ).toBe("refund"));
  it("a confirmed booking → nothing", () =>
    expect(
      depositSweep(
        {
          status: "confirmed",
          depositStatus: "paid",
          startsAt: "2026-11-10T11:00:00Z",
          updatedAt: "2026-11-09T10:00:00Z",
        },
        now,
      ),
    ).toBe("none"));
});
