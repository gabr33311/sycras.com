// Server-only: Stripe client and subscription sync. Never import from the browser.
import Stripe from "stripe";
import { computeAccess, type SubscriptionRow } from "@/lib/subscription";

const NOT_CONFIGURED = "Os pagamentos ainda não estão configurados neste servidor.";

type LinkResult = { ok: true; url: string } | { ok: false; message: string };

/** Which server settings are missing for payments (empty when ready). */
function missingBillingConfig(): string[] {
  return [
    "STRIPE_SECRET_KEY",
    "STRIPE_PRICE_MONTHLY",
    "STRIPE_PRICE_YEARLY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ].filter((k) => !process.env[k]);
}

/** Only the owner or a manager of the business may manage billing. */
async function billableBusiness(userId: string, businessId: string) {
  const db = await admin();
  const { data: member } = await db
    .from("business_members")
    .select("role")
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member || (member.role !== "owner" && member.role !== "manager")) return null;
  const [{ data: business }, { data: sub }] = await Promise.all([
    db.from("businesses").select("id, name, email, created_at").eq("id", businessId).maybeSingle(),
    db.from("subscriptions").select("*").eq("business_id", businessId).maybeSingle(),
  ]);
  if (!business) return null;
  return { business, sub, db };
}

/**
 * Creates a Stripe Checkout page for SYCRAS Pro (used by the site and by the
 * phone app, each with its own return links).
 */
export async function createCheckout(input: {
  userId: string;
  businessId: string;
  interval: "month" | "year";
  successUrl: string;
  cancelUrl: string;
}): Promise<LinkResult> {
  const missing = missingBillingConfig();
  if (missing.length) {
    console.error("[billing] missing config:", missing.join(", "));
    return { ok: false, message: NOT_CONFIGURED };
  }
  const found = await billableBusiness(input.userId, input.businessId);
  if (!found) return { ok: false, message: "Sem permissão para gerir a subscrição." };
  const { business, sub, db } = found;
  // Already paying through the phone store: a second charge would be a mistake.
  if (sub && sub.store !== "stripe" && sub.store_subscription_id && sub.status !== "canceled") {
    return { ok: false, message: "Já tens o SYCRAS Pro ativo pela loja do telemóvel." };
  }

  try {
    // One Stripe customer per business, created the first time. A saved id from
    // another Stripe account (e.g. switching test/live) is replaced.
    let customerId = sub?.stripe_customer_id ?? null;
    if (customerId) {
      try {
        const existing = await stripe().customers.retrieve(customerId);
        if ((existing as { deleted?: boolean }).deleted) customerId = null;
      } catch {
        customerId = null;
      }
    }
    if (!customerId) {
      const customer = await stripe().customers.create({
        name: business.name,
        // Only a well-formed email; a typo there must not block the payment.
        ...(business.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(business.email)
          ? { email: business.email }
          : {}),
        metadata: { business_id: business.id },
      });
      customerId = customer.id;
      await db
        .from("subscriptions")
        .upsert(
          { business_id: business.id, stripe_customer_id: customerId },
          { onConflict: "business_id" },
        );
    }

    // Subscribing during the free trial keeps the days left: the first charge
    // happens when the trial would have ended (Stripe needs 48h or more ahead).
    const access = computeAccess(
      business.created_at,
      (sub ?? null) as SubscriptionRow,
      new Date(),
      await trialBonus(business.id),
    );
    const trialEnd = Math.floor(access.trialEndsAt.getTime() / 1000);
    const keepTrial = access.state === "trial" && trialEnd - Date.now() / 1000 > 48 * 3600;

    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: business.id,
      line_items: [{ price: priceId(input.interval), quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { business_id: business.id },
        ...(keepTrial ? { trial_end: trialEnd } : {}),
      },
      metadata: { business_id: business.id },
      locale: "pt",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });
    if (!session.url) return { ok: false, message: "O Stripe não devolveu um link." };
    return { ok: true, url: session.url };
  } catch (e) {
    console.error("[billing] checkout failed", e);
    // The message from Stripe tells the owner (and us) what to fix.
    const detail = e instanceof Error ? e.message.slice(0, 160) : "";
    return {
      ok: false,
      message: `Não foi possível abrir o pagamento. Tenta novamente.${detail ? ` (${detail})` : ""}`,
    };
  }
}

/** Opens the Stripe billing portal (card, invoices, cancel). */
export async function createPortal(input: {
  userId: string;
  businessId: string;
  returnUrl: string;
}): Promise<LinkResult> {
  if (missingBillingConfig().length) return { ok: false, message: NOT_CONFIGURED };
  const found = await billableBusiness(input.userId, input.businessId);
  if (!found) return { ok: false, message: "Sem permissão para gerir a subscrição." };
  const customerId = found.sub?.stripe_customer_id;
  if (!customerId) return { ok: false, message: "Ainda não há subscrição para gerir." };
  try {
    const session = await stripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: input.returnUrl,
      locale: "pt",
    });
    return { ok: true, url: session.url };
  } catch (e) {
    console.error("[billing] portal failed", e);
    return { ok: false, message: "Não foi possível abrir a gestão da subscrição." };
  }
}

let stripeClient: Stripe | null = null;

/** Stripe client using fetch, so it also runs on edge/worker hosts. */
export function stripe(): Stripe {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  stripeClient ??= new Stripe(key, {
    httpClient: Stripe.createFetchHttpClient(),
    // Managed Payments (Stripe handles VAT) needs 2025-03-31.basil or later.
    // The period dates moved onto subscription items in that version; periodOf() reads both.
    apiVersion: "2025-03-31.basil" as Stripe.LatestApiVersion,
  });
  return stripeClient;
}

export function priceId(interval: "month" | "year"): string {
  const id =
    interval === "year" ? process.env["STRIPE_PRICE_YEARLY"] : process.env["STRIPE_PRICE_MONTHLY"];
  if (!id) throw new Error(`Missing STRIPE_PRICE_${interval === "year" ? "YEARLY" : "MONTHLY"}`);
  return id;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** The end of the paid period (newer Stripe API versions keep it on the item). */
function periodOf(sub: Stripe.Subscription): { start: number | null; end: number | null } {
  const raw = sub as unknown as {
    current_period_start?: number;
    current_period_end?: number;
    items?: { data?: { current_period_start?: number; current_period_end?: number }[] };
  };
  const item = raw.items?.data?.[0];
  return {
    start: raw.current_period_start ?? item?.current_period_start ?? null,
    end: raw.current_period_end ?? item?.current_period_end ?? null,
  };
}

/** Writes a Stripe subscription onto the business's row (called from the webhook). */
export async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const businessId = sub.metadata?.["business_id"];
  if (!businessId) {
    console.warn("[billing] subscription without business_id metadata", sub.id);
    return;
  }
  const { start, end } = periodOf(sub);
  const live = ["active", "trialing", "past_due"].includes(sub.status);
  const db = await admin();
  // An old Stripe subscription ending must not cancel Pro bought in the phone app.
  if (!live) {
    const { data: row } = await db
      .from("subscriptions")
      .select("*")
      .eq("business_id", businessId)
      .maybeSingle();
    if (row && (row.store ?? "stripe") !== "stripe" && row.status !== "canceled") return;
  }
  const { error } = await db.from("subscriptions").upsert(
    {
      business_id: businessId,
      plan: live ? "pro" : "free",
      status: sub.status,
      store: "stripe",
      store_subscription_id: null,
      stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      stripe_subscription_id: sub.status === "canceled" ? null : sub.id,
      current_period_start: start ? new Date(start * 1000).toISOString() : null,
      current_period_end: end ? new Date(end * 1000).toISOString() : null,
    },
    { onConflict: "business_id" },
  );
  if (error) throw error;
}

/**
 * Can this business take online bookings right now? Uses the service key; on
 * hosts without it the check is skipped rather than blocking every business.
 */
export async function businessAllowed(businessId: string, createdAt: string): Promise<boolean> {
  if (!process.env["SUPABASE_SERVICE_ROLE_KEY"]) return true;
  const db = await admin();
  const { data } = await db
    .from("subscriptions")
    .select("plan, status, current_period_end, stripe_subscription_id")
    .eq("business_id", businessId)
    .maybeSingle();
  return computeAccess(createdAt, (data ?? null) as SubscriptionRow, new Date(), await trialBonus(businessId))
    .allowed;
}

/** Extra free days this business got (15 when it came with an invite). */
async function trialBonus(businessId: string): Promise<number> {
  const db = await admin();
  const { data } = await db
    .from("businesses")
    .select("trial_bonus_days")
    .eq("id", businessId)
    .maybeSingle();
  return data?.trial_bonus_days ?? 0;
}

/** Is this business paying? The Pro-only extras (reminders, blocking) need it; the trial does not count. */
export async function businessHasPro(businessId: string, createdAt: string): Promise<boolean> {
  const db = await admin();
  const { data } = await db
    .from("subscriptions")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();
  return computeAccess(createdAt, (data ?? null) as SubscriptionRow).pro;
}

/** The parts of a RevenueCat webhook event that matter here. */
export type StoreEvent = {
  type: string;
  app_user_id?: string;
  original_app_user_id?: string;
  store?: string;
  environment?: string;
  period_type?: string;
  purchased_at_ms?: number | null;
  expiration_at_ms?: number | null;
  original_transaction_id?: string | null;
  transaction_id?: string | null;
  /** On CANCELLATION: "CUSTOMER_SUPPORT" means refunded. */
  cancel_reason?: string | null;
  price?: number | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Writes a Google Play / App Store purchase (sent by RevenueCat) onto the
 * business's row. The phone app logs in to RevenueCat with the business id.
 */
export async function syncStoreSubscription(event: StoreEvent): Promise<void> {
  const businessId = [event.app_user_id, event.original_app_user_id].find(
    (id): id is string => !!id && UUID.test(id),
  );
  const store =
    event.store === "PLAY_STORE" ? "play_store" : event.store === "APP_STORE" ? "app_store" : null;
  if (!businessId || !store) {
    console.warn("[billing] store event ignored", event.type, event.app_user_id, event.store);
    return;
  }

  const ACTIVE = [
    "INITIAL_PURCHASE",
    "RENEWAL",
    "UNCANCELLATION",
    "PRODUCT_CHANGE",
    "SUBSCRIPTION_EXTENDED",
    // Cancelled but paid until the end of the period: still Pro until EXPIRATION.
    "CANCELLATION",
  ];
  const status =
    event.type === "EXPIRATION"
      ? "canceled"
      : event.type === "BILLING_ISSUE"
        ? "past_due"
        : ACTIVE.includes(event.type)
          ? event.period_type === "TRIAL"
            ? "trialing"
            : "active"
          : null;
  if (!status) return;

  // Invites: a real (not test, not trial) payment earns the inviter 10 €; a refund takes it back.
  if (event.environment !== "SANDBOX") {
    const ref = await import("@/lib/referral.server");
    if ((event.type === "INITIAL_PURCHASE" || event.type === "RENEWAL") && event.period_type !== "TRIAL") {
      await ref.rewardFirstPayment(businessId);
    } else if (event.type === "CANCELLATION" && event.cancel_reason === "CUSTOMER_SUPPORT") {
      await ref.cancelPendingReward(businessId);
    }
  }

  const db = await admin();
  const { data: row } = await db
    .from("subscriptions")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();
  // A live subscription on the site wins; the store one must not overwrite it.
  if (
    row?.stripe_subscription_id &&
    (row.store ?? "stripe") === "stripe" &&
    ["active", "trialing", "past_due"].includes(row.status)
  ) {
    console.warn("[billing] store event while Stripe is live", businessId, event.type);
    return;
  }

  const ms = (v?: number | null) => (v ? new Date(v).toISOString() : null);
  const { error } = await db.from("subscriptions").upsert(
    {
      business_id: businessId,
      plan: status === "canceled" ? "free" : "pro",
      status,
      store,
      store_subscription_id:
        status === "canceled"
          ? null
          : (event.original_transaction_id ??
            event.transaction_id ??
            row?.store_subscription_id ??
            "store"),
      current_period_start: ms(event.purchased_at_ms) ?? row?.current_period_start ?? null,
      current_period_end: ms(event.expiration_at_ms) ?? row?.current_period_end ?? null,
    },
    { onConflict: "business_id" },
  );
  if (error) throw error;
}
