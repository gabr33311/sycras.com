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
 * What to do when a deposit payment comes back (return page, webhook or the cron, possibly at
 * once): nothing until it is paid; when an appointment for this payment exists, reuse it (never
 * refund it); otherwise book it, or give the money back when the time was taken meanwhile.
 */
export function finalizeOutcome(s: {
  paid: boolean;
  existing: boolean;
  created: "ok" | "slot_taken" | null;
}): "not_paid" | "reuse" | "booked" | "refund" {
  if (!s.paid) return "not_paid";
  if (s.existing) return "reuse";
  return s.created === "ok" ? "booked" : "refund";
}

/** Database errors that mean the time is really taken (overlap) or the payment already booked. */
export function isSlotConflict(code: string | undefined): boolean {
  return code === "23P01" || code === "23505";
}

/**
 * A hold whose 15 minutes ran out: book it if paid, keep it while a delayed payment may still
 * arrive or while its payment page could not be closed, free the time once the page is closed.
 * `after` is what the payment page says after we tried to close it (null when not tried).
 */
export function staleHoldAction(
  session: { payment_status: string; status: string | null },
  after: "paid" | "expired" | "open" | "complete" | null,
): "finalize" | "keep" | "delete" {
  if (session.payment_status === "paid" || after === "paid") return "finalize";
  if (session.status === "expired" || after === "expired") return "delete";
  return "keep";
}

/**
 * The cron sweep of paid deposits: a cancelled booking still holding the money after the owner
 * had time to choose (10 minutes) is refunded; so is a request nobody answered before its time.
 */
export function depositSweep(
  a: { status: string; depositStatus: string | null; startsAt: string; updatedAt: string },
  now: Date,
): "refund" | "none" {
  if (a.depositStatus !== "paid") return "none";
  if (a.status === "cancelled")
    return now.getTime() - new Date(a.updatedAt).getTime() > 10 * 60000 ? "refund" : "none";
  if (a.status === "pending" && new Date(a.startsAt).getTime() < now.getTime()) return "refund";
  return "none";
}
