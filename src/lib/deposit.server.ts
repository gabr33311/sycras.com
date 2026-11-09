// Server-only: deposits (sinal) paid on the business's own Stripe account. A time is kept for
// 15 minutes while the client pays; the booking is made once the payment is confirmed, by the
// return page or by the Stripe webhook (whichever comes first; the other reuses it).
import { stripe } from "@/lib/billing.server";
import { depositSweep, finalizeOutcome, staleHoldAction } from "@/lib/deposit";
import type { PublicBookingRequest } from "@/lib/appointment-create.server";

const HOLD_MINUTES = 15;
/** Stripe does not let a payment page expire sooner than 30 minutes. */
const CHECKOUT_MINUTES = 30;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** What a hold keeps to make the booking later (plus, once done, its manage token). */
type HoldPayload = Omit<
  PublicBookingRequest,
  "businessId" | "serviceId" | "staffId" | "startsAt" | "endsAt"
> & {
  token?: string;
  refunded?: boolean;
};

/** Keeps the time and opens Stripe's payment page for the deposit. */
export async function startDepositCheckout(
  req: PublicBookingRequest,
  ctx: {
    slug: string;
    origin: string;
    serviceName: string;
    depositCents: number;
    stripeAccount: string;
  },
): Promise<{ ok: true; url: string } | { ok: false; code: "slot_taken" | "payment_error" }> {
  const db = await admin();
  const now = new Date();

  // Someone else is paying for this same time right now.
  let clash = db
    .from("booking_holds")
    .select("id")
    .eq("business_id", req.businessId)
    .gt("hold_until", now.toISOString())
    .lt("starts_at", req.endsAt)
    .gt("ends_at", req.startsAt);
  clash = req.staffId ? clash.eq("staff_id", req.staffId) : clash.is("staff_id", null);
  const { data: busy } = await clash.limit(1);
  if (busy?.length) return { ok: false, code: "slot_taken" };

  const payload: HoldPayload = {
    name: req.name,
    phone: req.phone,
    email: req.email,
    notes: req.notes,
    whatsapp: req.whatsapp,
    ipHash: req.ipHash,
  };
  const { data: hold, error } = await db
    .from("booking_holds")
    .insert({
      business_id: req.businessId,
      service_id: req.serviceId,
      staff_id: req.staffId,
      starts_at: req.startsAt,
      ends_at: req.endsAt,
      payload,
      deposit_cents: ctx.depositCents,
      hold_until: new Date(now.getTime() + HOLD_MINUTES * 60000).toISOString(),
    })
    .select("id")
    .single();
  if (error || !hold) return { ok: false, code: "payment_error" };

  try {
    const session = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        // Paid on the spot only (cards, Apple Pay, Google Pay): a method paid days later would
        // leave the client waiting for a time that is no longer kept.
        payment_method_types: ["card"],
        ...(req.email ? { customer_email: req.email } : {}),
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "eur",
              unit_amount: ctx.depositCents,
              product_data: { name: `Sinal · ${ctx.serviceName}` },
            },
          },
        ],
        metadata: { hold_id: hold.id },
        payment_intent_data: { metadata: { hold_id: hold.id } },
        expires_at: Math.floor(now.getTime() / 1000) + CHECKOUT_MINUTES * 60,
        success_url: `${ctx.origin}/booking/pay/${hold.id}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${ctx.origin}/booking/pay/${hold.id}?cancel=1`,
        locale: "pt",
      },
      { stripeAccount: ctx.stripeAccount },
    );
    await db.from("booking_holds").update({ checkout_session_id: session.id }).eq("id", hold.id);
    if (!session.url) throw new Error("Checkout session without url");
    return { ok: true, url: session.url };
  } catch (e) {
    console.error("[deposit] checkout failed", e);
    await db.from("booking_holds").delete().eq("id", hold.id);
    return { ok: false, code: "payment_error" };
  }
}

/**
 * The client came back from Stripe (or Stripe told us): book it once paid. Safe to call any
 * number of times; when the time was taken meanwhile, the deposit is returned.
 */
export async function finalizeDeposit(
  holdId: string,
  sessionId: string,
): Promise<
  | { ok: true; token: string }
  | { ok: false; code: "slot_lost"; slug: string }
  | { ok: false; code: "not_paid" | "not_found" }
> {
  const db = await admin();
  const { data: hold } = await db.from("booking_holds").select("*").eq("id", holdId).maybeSingle();
  if (!hold || hold.checkout_session_id !== sessionId) return { ok: false, code: "not_found" };
  const payload = hold.payload as HoldPayload;
  if (payload.token) return { ok: true, token: payload.token };

  const { data: business } = await db
    .from("businesses")
    .select("stripe_account_id, slug")
    .eq("id", hold.business_id)
    .maybeSingle();
  if (!business?.stripe_account_id) return { ok: false, code: "not_found" };
  if (payload.refunded) return { ok: false, code: "slot_lost", slug: business.slug };
  const stripeAccount = business.stripe_account_id;

  const session = await stripe().checkout.sessions.retrieve(sessionId, {}, { stripeAccount });
  const paid = session.payment_status === "paid";
  const paymentIntent =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? "");
  const { createAppointment, appointmentForPayment } =
    await import("@/lib/appointment-create.server");

  const existing = paid ? await appointmentForPayment(paymentIntent) : null;
  const first = finalizeOutcome({ paid, existing: !!existing, created: null });
  if (first === "not_paid") return { ok: false, code: "not_paid" };
  if (first === "reuse" && existing) {
    await keep(hold.id, { ...payload, token: existing.token });
    return { ok: true, token: existing.token };
  }

  const created = await createAppointment(
    {
      businessId: hold.business_id,
      serviceId: hold.service_id,
      staffId: hold.staff_id,
      startsAt: hold.starts_at,
      endsAt: hold.ends_at,
      ...payload,
    },
    { cents: hold.deposit_cents, paymentIntent },
  );
  // The other caller may have booked it a moment ago: that is the same booking, not a lost time.
  const raced = created.ok ? null : await appointmentForPayment(paymentIntent);
  const outcome = finalizeOutcome({
    paid,
    existing: !!raced,
    created: created.ok ? "ok" : "slot_taken",
  });

  if (outcome === "booked" && created.ok) {
    await keep(hold.id, { ...payload, token: created.token });
    return { ok: true, token: created.token };
  }
  if (outcome === "reuse" && raced) {
    await keep(hold.id, { ...payload, token: raced.token });
    return { ok: true, token: raced.token };
  }
  // The time went to someone else while the client was paying: give the money back.
  await stripe().refunds.create({ payment_intent: paymentIntent }, { stripeAccount });
  await keep(hold.id, { ...payload, refunded: true });
  return { ok: false, code: "slot_lost", slug: business.slug };
}

/** A finished hold stays as a receipt (no longer busy) so repeated calls get the same answer. */
async function keep(holdId: string, payload: HoldPayload) {
  const db = await admin();
  await db
    .from("booking_holds")
    .update({ payload, hold_until: new Date().toISOString() })
    .eq("id", holdId);
}

/**
 * Every few minutes: payments that were left half way. A time whose 15 minutes ran out is
 * booked if it was paid after all; otherwise its payment page is closed and, once Stripe says
 * it is closed, the time is freed. Finished holds (receipts) are removed after a day.
 */
export async function expireStaleHolds(): Promise<{ finalized: number; expired: number }> {
  const db = await admin();
  const now = new Date();
  let finalized = 0;
  let expired = 0;

  const { data: stale } = await db
    .from("booking_holds")
    .select("id, business_id, checkout_session_id")
    .lt("hold_until", now.toISOString())
    .is("payload->>token", null)
    .is("payload->>refunded", null)
    .order("hold_until")
    .limit(50);
  for (const hold of stale ?? []) {
    try {
      const { data: business } = await db
        .from("businesses")
        .select("stripe_account_id")
        .eq("id", hold.business_id)
        .maybeSingle();
      if (!hold.checkout_session_id || !business?.stripe_account_id) {
        await db.from("booking_holds").delete().eq("id", hold.id);
        expired++;
        continue;
      }
      const stripeAccount = business.stripe_account_id;
      const session = await stripe().checkout.sessions.retrieve(
        hold.checkout_session_id,
        {},
        { stripeAccount },
      );
      let after: "paid" | "expired" | "open" | "complete" | null = null;
      if (session.status === "open" && session.payment_status !== "paid") {
        await stripe()
          .checkout.sessions.expire(hold.checkout_session_id, {}, { stripeAccount })
          .catch(() => null);
        const again = await stripe().checkout.sessions.retrieve(
          hold.checkout_session_id,
          {},
          { stripeAccount },
        );
        after = again.payment_status === "paid" ? "paid" : again.status;
      }
      const action = staleHoldAction(
        { payment_status: session.payment_status, status: session.status },
        after,
      );
      if (action === "finalize") {
        await finalizeDeposit(hold.id, hold.checkout_session_id);
        finalized++;
      } else if (action === "delete") {
        await db.from("booking_holds").delete().eq("id", hold.id);
        expired++;
      }
    } catch (e) {
      console.error("[deposit] expiring hold failed", hold.id, e);
    }
  }

  // Receipts only: a hold that never finished stays until Stripe says its page is closed.
  await db
    .from("booking_holds")
    .delete()
    .lt("hold_until", new Date(now.getTime() - 86400000).toISOString())
    .or("payload->>token.not.is.null,payload->>refunded.not.is.null");
  return { finalized, expired };
}

/**
 * Every few minutes: deposits still held on bookings that should not keep them (cancelled and
 * not kept by the owner, or a request nobody answered before its time) are refunded. This also
 * retries a refund that failed when the booking was cancelled.
 */
export async function sweepDeposits(): Promise<number> {
  const db = await admin();
  const now = new Date();
  const { data: rows } = await db
    .from("appointments")
    .select("id, status, deposit_status, starts_at, updated_at")
    .eq("deposit_status", "paid")
    .in("status", ["cancelled", "pending"])
    .limit(50);
  let refunded = 0;
  for (const a of rows ?? []) {
    const action = depositSweep(
      {
        status: a.status,
        depositStatus: a.deposit_status,
        startsAt: a.starts_at,
        updatedAt: a.updated_at,
      },
      now,
    );
    if (action !== "refund") continue;
    const res = await refundDeposit(a.id).catch((e: unknown) => {
      console.error("[deposit] sweep refund failed", a.id, e);
      return { refunded: false, cents: 0 };
    });
    if (res.refunded) refunded++;
  }
  return refunded;
}

/** The client backed out of Stripe's page: close it and free their time at once. */
export async function releaseHold(holdId: string): Promise<{ slug: string | null }> {
  const db = await admin();
  const { data: hold } = await db
    .from("booking_holds")
    .select("id, business_id, checkout_session_id, payload")
    .eq("id", holdId)
    .maybeSingle();
  if (!hold) return { slug: null };
  const { data: business } = await db
    .from("businesses")
    .select("slug, stripe_account_id")
    .eq("id", hold.business_id)
    .maybeSingle();
  const payload = hold.payload as HoldPayload;
  if (payload.token || payload.refunded || !business) return { slug: business?.slug ?? null };
  if (hold.checkout_session_id && business.stripe_account_id) {
    const stripeAccount = business.stripe_account_id;
    await stripe()
      .checkout.sessions.expire(hold.checkout_session_id, {}, { stripeAccount })
      .catch(() => null);
    const session = await stripe().checkout.sessions.retrieve(
      hold.checkout_session_id,
      {},
      { stripeAccount },
    );
    // Paid after all (in another tab): book it instead of freeing it.
    if (session.payment_status === "paid") {
      await finalizeDeposit(hold.id, hold.checkout_session_id);
      return { slug: business.slug };
    }
    if (session.status !== "expired") return { slug: business.slug };
  }
  await db.from("booking_holds").delete().eq("id", hold.id);
  return { slug: business.slug };
}

/** A paid deposit with no booking behind it (its hold is gone): give it back. */
export async function refundOrphanPayment(
  paymentIntent: string,
  stripeAccount: string,
): Promise<void> {
  if (!paymentIntent) return;
  const { appointmentForPayment } = await import("@/lib/appointment-create.server");
  if (await appointmentForPayment(paymentIntent)) return;
  await stripe().refunds.create(
    { payment_intent: paymentIntent },
    { stripeAccount, idempotencyKey: `deposit-orphan-${paymentIntent}` },
  );
}

/** The owner keeps the deposit (late cancel): remembered so the automatic sweep leaves it. */
export async function keepDeposit(appointmentId: string): Promise<{ refunded: false; cents: 0 }> {
  const db = await admin();
  await db
    .from("appointments")
    .update({ deposit_status: "kept" })
    .eq("id", appointmentId)
    .eq("deposit_status", "paid");
  return { refunded: false, cents: 0 };
}

/** Gives a paid deposit back (on the business's account). Safe to call twice. */
export async function refundDeposit(
  appointmentId: string,
): Promise<{ refunded: boolean; cents: number }> {
  const db = await admin();
  const { data: appt } = await db
    .from("appointments")
    .select("id, business_id, deposit_status, deposit_cents, deposit_payment_intent")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appt || appt.deposit_status !== "paid" || !appt.deposit_payment_intent)
    return { refunded: false, cents: 0 };
  const { data: business } = await db
    .from("businesses")
    .select("stripe_account_id")
    .eq("id", appt.business_id)
    .maybeSingle();
  if (!business?.stripe_account_id) return { refunded: false, cents: 0 };
  await stripe().refunds.create(
    { payment_intent: appt.deposit_payment_intent },
    { stripeAccount: business.stripe_account_id, idempotencyKey: `deposit-refund-${appt.id}` },
  );
  await db
    .from("appointments")
    .update({ deposit_status: "refunded", deposit_refunded_at: new Date().toISOString() })
    .eq("id", appt.id);
  return { refunded: true, cents: appt.deposit_cents ?? 0 };
}
