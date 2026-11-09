// Deposit against no-shows (sinal): how much, when it is asked, and when the owner is asked
// about a refund. Pure rules, shared by the site and (as a copy) by the phone app.

export type DepositMode = "fixed" | "percent";

/**
 * The deposit for a service price, in cents: a fixed value or a percentage of the price.
 * At least 1 € and never more than the price; services under 1 € have no deposit.
 */
export function computeDeposit(priceCents: number, mode: DepositMode, value: number): number {
  if (priceCents < 100) return 0;
  const raw = mode === "percent" ? Math.round((priceCents * value) / 100) : value;
  return Math.min(priceCents, Math.max(100, raw));
}

/** The deposit to ask for (0 = book without one): paying Pro, switched on, account able to take payments. */
export function depositFor(
  b: { pro: boolean; enabled: boolean; chargesEnabled: boolean; mode: DepositMode; value: number },
  priceCents: number,
): number {
  if (!b.pro || !b.enabled || !b.chargesEnabled) return 0;
  return computeDeposit(priceCents, b.mode, b.value);
}

/**
 * The business cancels a booking with a paid deposit: in time it is always returned; late
 * (inside the cancellation window) the owner chooses whether to return it.
 */
export function ownerCancelRefund(
  startsAt: string,
  now: Date,
  cancellationHours: number,
): "always" | "ask" {
  const left = new Date(startsAt).getTime() - now.getTime();
  return left < cancellationHours * 3600000 ? "ask" : "always";
}

/**
 * What to do when a deposit payment comes back (return page or webhook, possibly both):
 * nothing until it is paid; reuse the booking that already exists; or, when the time was
 * taken meanwhile, give the money back.
 */
export function finalizeOutcome(s: {
  paid: boolean;
  existingToken: string | null;
  created: "ok" | "slot_taken" | null;
}): "not_paid" | "reuse" | "booked" | "refund" {
  if (!s.paid) return "not_paid";
  if (s.existingToken) return "reuse";
  return s.created === "ok" ? "booked" : "refund";
}
