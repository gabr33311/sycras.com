// Server-only: the barber's own Stripe account, where deposits are paid. The account is the
// business's (its dashboard, its fees, its payouts); SYCRAS only creates the payment pages on it.
import type Stripe from "stripe";
import { stripe } from "@/lib/billing.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** The Supabase user behind a Bearer token, when they manage this business (owner or manager). */
export async function managerFromRequest(
  request: Request,
  businessId: string,
): Promise<string | null> {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || !businessId) return null;
  const db = await admin();
  const { data: auth } = await db.auth.getUser(token);
  if (!auth.user) return null;
  const { data: member } = await db
    .from("business_members")
    .select("role")
    .eq("business_id", businessId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!member || (member.role !== "owner" && member.role !== "manager")) return null;
  return auth.user.id;
}

/**
 * The Stripe sign-up page for the business's payments account. The account is created once,
 * with the business paying Stripe's fees and Stripe covering losses (a standard account).
 */
export async function startConnectOnboarding(input: {
  businessId: string;
  from: "web" | "app";
  origin: string;
}): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  if (!process.env["STRIPE_SECRET_KEY"])
    return { ok: false, message: "Os pagamentos ainda não estão configurados." };
  const db = await admin();
  const { data: business } = await db
    .from("businesses")
    .select("id, name, email, stripe_account_id")
    .eq("id", input.businessId)
    .maybeSingle();
  if (!business) return { ok: false, message: "Negócio não encontrado." };

  let accountId = business.stripe_account_id;
  if (!accountId) {
    const account = await stripe().accounts.create({
      country: "PT",
      email: business.email ?? undefined,
      business_profile: { name: business.name },
      controller: {
        stripe_dashboard: { type: "full" },
        fees: { payer: "account" },
        losses: { payments: "stripe" },
        requirement_collection: "stripe",
      },
      metadata: { business_id: business.id },
    } as Stripe.AccountCreateParams);
    accountId = account.id;
    await db.from("businesses").update({ stripe_account_id: accountId }).eq("id", business.id);
  }

  const back =
    input.from === "app" ? `${input.origin}/connect/done` : `${input.origin}/profile?section=rules`;
  const link = await stripe().accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    return_url: back,
    refresh_url: back,
  });
  return { ok: true, url: link.url };
}

/** Asks Stripe whether the business's account can take payments now, and remembers it. */
export async function refreshConnectStatus(
  businessId: string,
): Promise<{ connected: boolean; chargesEnabled: boolean }> {
  const db = await admin();
  const { data: business } = await db
    .from("businesses")
    .select("stripe_account_id")
    .eq("id", businessId)
    .maybeSingle();
  if (!business?.stripe_account_id) return { connected: false, chargesEnabled: false };
  const account = await stripe().accounts.retrieve(business.stripe_account_id);
  const chargesEnabled = account.charges_enabled === true;
  await db
    .from("businesses")
    .update({ stripe_charges_enabled: chargesEnabled })
    .eq("id", businessId);
  return { connected: true, chargesEnabled };
}
