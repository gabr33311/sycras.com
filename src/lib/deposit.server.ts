// Server-only: deposits (sinal) paid on the business's own Stripe account. A time is kept for
// 15 minutes while the client pays; the booking is made once the payment is confirmed, by the
// return page or by the Stripe webhook (whichever comes first; the other reuses it).
import { stripe } from "@/lib/billing.server";
import { finalizeOutcome } from "@/lib/deposit";
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
        cancel_url: `${ctx.origin}/${ctx.slug}`,
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
  const { createAppointment, tokenForPayment } = await import("@/lib/appointment-create.server");

  const existingToken = paid && paymentIntent ? await tokenForPayment(paymentIntent) : null;
  const first = finalizeOutcome({ paid, existingToken, created: null });
  if (first === "not_paid") return { ok: false, code: "not_paid" };
  if (first === "reuse" && existingToken) {
    await keep(hold.id, { ...payload, token: existingToken });
    return { ok: true, token: existingToken };
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
  const raced = created.ok ? null : await tokenForPayment(paymentIntent);
  const outcome = finalizeOutcome({
    paid,
    existingToken: raced,
    created: created.ok ? "ok" : "slot_taken",
  });

  if (outcome === "booked" && created.ok) {
    await keep(hold.id, { ...payload, token: created.token });
    return { ok: true, token: created.token };
  }
  if (outcome === "reuse" && raced) {
    await keep(hold.id, { ...payload, token: raced });
    return { ok: true, token: raced };
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
 * booked if it was paid after all, otherwise its payment page is closed and the time freed.
 * Finished holds (kept as receipts) go after a day.
 */
export async function expireStaleHolds(): Promise<{ finalized: number; expired: number }> {
  const db = await admin();
  const now = new Date();
  let finalized = 0;
  let expired = 0;

  const { data: stale } = await db
    .from("booking_holds")
    .select("id, business_id, checkout_session_id, payload")
    .lt("hold_until", now.toISOString())
    .limit(50);
  for (const hold of stale ?? []) {
    const payload = hold.payload as HoldPayload;
    if (payload.token || payload.refunded) continue; // a receipt, handled below
    try {
      const { data: business } = await db
        .from("businesses")
        .select("stripe_account_id")
        .eq("id", hold.business_id)
        .maybeSingle();
      if (hold.checkout_session_id && business?.stripe_account_id) {
        const stripeAccount = business.stripe_account_id;
        const session = await stripe().checkout.sessions.retrieve(
          hold.checkout_session_id,
          {},
          { stripeAccount },
        );
        if (session.payment_status === "paid") {
          await finalizeDeposit(hold.id, hold.checkout_session_id);
          finalized++;
          continue;
        }
        if (session.status === "open") {
          await stripe()
            .checkout.sessions.expire(hold.checkout_session_id, {}, { stripeAccount })
            .catch(() => null);
        }
      }
      await db.from("booking_holds").delete().eq("id", hold.id);
      expired++;
    } catch (e) {
      console.error("[deposit] expiring hold failed", hold.id, e);
    }
  }

  await db
    .from("booking_holds")
    .delete()
    .lt("hold_until", new Date(now.getTime() - 86400000).toISOString());
  return { finalized, expired };
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
