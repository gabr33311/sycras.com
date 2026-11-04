// Server-only: invites ("Convida e ganha").
// - Each business has a code made from its name (changeable once).
// - A new business that signs up with a code gets 15 more free days.
// - When it pays its first month, the inviter earns 10 €, withdrawable after the 14-day
//   refund window. From 20 € the inviter asks for a bank transfer, done by SYCRAS.

export const INVITE_BONUS_DAYS = 15;
export const REWARD_CENTS = 1000;
export const MIN_PAYOUT_CENTS = 2000;
const HOLD_DAYS = 14;
const RESERVED = new Set(["SYCRAS", "ADMIN", "SUPORTE", "SUPPORT", "TESTE", "TEST", "GRATIS", "FREE"]);

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** "Barbearia São João" -> "BARBEARIASAOJOAO" (letters and digits, 4 to 16). */
export function normalizeCode(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16);
}

export function validCode(code: string): boolean {
  return /^[A-Z0-9]{4,16}$/.test(code) && !RESERVED.has(code);
}

async function codeTaken(code: string, exceptBusinessId?: string): Promise<boolean> {
  const db = await admin();
  const { data } = await db.from("businesses").select("id").ilike("referral_code", code).limit(1);
  return !!data?.length && data[0]!.id !== exceptBusinessId;
}

/** The business's code, created from its name the first time it is asked for. */
export async function ensureCode(businessId: string): Promise<string> {
  const db = await admin();
  const { data: biz } = await db
    .from("businesses")
    .select("name, referral_code")
    .eq("id", businessId)
    .maybeSingle();
  if (!biz) throw new Error("business not found");
  if (biz.referral_code) return biz.referral_code;
  let base = normalizeCode(biz.name ?? "");
  if (base.length < 4) base = (base + "SYCRAS").slice(0, 8);
  base = base.slice(0, 13);
  let code = validCode(base) ? base : `${base}${Math.floor(10 + Math.random() * 90)}`;
  for (let i = 0; (await codeTaken(code)) && i < 20; i++) {
    code = `${base}${Math.floor(100 + Math.random() * 900)}`;
  }
  await db.from("businesses").update({ referral_code: code }).eq("id", businessId);
  return code;
}

export type ChangeResult = "ok" | "invalid" | "taken" | "already_changed";

/** Changing the code is allowed once. */
export async function changeCode(businessId: string, raw: string): Promise<ChangeResult> {
  const code = normalizeCode(raw);
  if (!validCode(code)) return "invalid";
  const db = await admin();
  const { data: biz } = await db
    .from("businesses")
    .select("referral_code_changed")
    .eq("id", businessId)
    .maybeSingle();
  if (biz?.referral_code_changed) return "already_changed";
  if (await codeTaken(code, businessId)) return "taken";
  const { error } = await db
    .from("businesses")
    .update({ referral_code: code, referral_code_changed: true })
    .eq("id", businessId);
  return error ? "taken" : "ok";
}

export type ApplyResult = "ok" | "invalid" | "own" | "too_late" | "already";

/**
 * A new business joins with an invite: 15 more free days, and the inviter is noted so
 * they can be rewarded when this business pays. Only in its first 7 days, only once.
 */
export async function applyCode(businessId: string, userId: string, raw: string): Promise<ApplyResult> {
  const code = normalizeCode(raw);
  if (!validCode(code)) return "invalid";
  const db = await admin();
  const [{ data: biz }, { data: inviter }] = await Promise.all([
    db.from("businesses").select("id, created_at, referred_by").eq("id", businessId).maybeSingle(),
    db.from("businesses").select("id").ilike("referral_code", code).maybeSingle(),
  ]);
  if (!biz || !inviter) return "invalid";
  if (biz.referred_by) return "already";
  if (inviter.id === biz.id) return "own";
  if (Date.now() - new Date(biz.created_at).getTime() > 7 * 86_400_000) return "too_late";
  // Someone who works at the inviting business cannot invite themselves.
  const { data: same } = await db
    .from("business_members")
    .select("user_id")
    .eq("business_id", inviter.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (same) return "own";
  const { error } = await db
    .from("businesses")
    .update({ referred_by: inviter.id, trial_bonus_days: INVITE_BONUS_DAYS })
    .eq("id", biz.id)
    .is("referred_by", null);
  return error ? "invalid" : "ok";
}

/** First real payment of an invited business: the inviter's 10 € (held 14 days). */
export async function rewardFirstPayment(businessId: string): Promise<void> {
  const db = await admin();
  const { data: biz } = await db
    .from("businesses")
    .select("referred_by")
    .eq("id", businessId)
    .maybeSingle();
  if (!biz?.referred_by) return;
  // The unique key on referred_business_id keeps it to one reward per business.
  const { error } = await db.from("referral_rewards").insert({
    referrer_business_id: biz.referred_by,
    referred_business_id: businessId,
    amount_cents: REWARD_CENTS,
    status: "pending",
    available_at: new Date(Date.now() + HOLD_DAYS * 86_400_000).toISOString(),
  });
  if (error && !/duplicate|unique/i.test(error.message)) console.error("[referral] reward", error.message);
}

/** Refunded inside the 14 days: no reward. */
export async function cancelPendingReward(businessId: string): Promise<void> {
  const db = await admin();
  await db
    .from("referral_rewards")
    .update({ status: "cancelled" })
    .eq("referred_business_id", businessId)
    .eq("status", "pending");
}

export type Summary = {
  code: string;
  canChange: boolean;
  invited: number;
  paying: number;
  pendingCents: number;
  availableCents: number;
  paidCents: number;
  requestedCents: number;
  balanceCents: number;
  payouts: { amountCents: number; status: string; requestedAt: string; iban: string }[];
};

/** What the inviter sees in Settings. */
export async function summary(businessId: string): Promise<Summary> {
  const db = await admin();
  const code = await ensureCode(businessId);
  // Rewards past their 14 days become available.
  await db
    .from("referral_rewards")
    .update({ status: "available" })
    .eq("referrer_business_id", businessId)
    .eq("status", "pending")
    .lte("available_at", new Date().toISOString());
  const [{ data: biz }, { count: invited }, { data: rewards }, { data: payouts }] = await Promise.all([
    db.from("businesses").select("referral_code_changed").eq("id", businessId).maybeSingle(),
    db.from("businesses").select("id", { count: "exact", head: true }).eq("referred_by", businessId),
    db.from("referral_rewards").select("amount_cents, status").eq("referrer_business_id", businessId),
    db
      .from("referral_payouts")
      .select("amount_cents, status, requested_at, iban")
      .eq("business_id", businessId)
      .order("requested_at", { ascending: false }),
  ]);
  const sum = (rows: { amount_cents: number }[] | null | undefined) =>
    (rows ?? []).reduce((s, r) => s + r.amount_cents, 0);
  const pendingCents = sum(rewards?.filter((r) => r.status === "pending"));
  const availableCents = sum(rewards?.filter((r) => r.status === "available"));
  const paidCents = sum(payouts?.filter((p) => p.status === "paid"));
  const requestedCents = sum(payouts?.filter((p) => p.status === "requested"));
  return {
    code,
    canChange: !biz?.referral_code_changed,
    invited: invited ?? 0,
    paying: (rewards ?? []).filter((r) => r.status !== "cancelled").length,
    pendingCents,
    availableCents,
    paidCents,
    requestedCents,
    balanceCents: Math.max(0, availableCents - paidCents - requestedCents),
    payouts: (payouts ?? []).map((p) => ({
      amountCents: p.amount_cents,
      status: p.status,
      requestedAt: p.requested_at,
      iban: `•••• ${p.iban.slice(-4)}`,
    })),
  };
}

/** IBAN check (ISO 13616, mod 97). */
export function validIban(raw: string): string | null {
  const iban = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(iban)) return null;
  const moved = iban.slice(4) + iban.slice(0, 4);
  const digits = moved.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  return rest === 1 ? iban : null;
}

export type PayoutResult = "ok" | "low" | "iban" | "name" | "open";

/** Asks SYCRAS for a transfer of the whole available balance. */
export async function requestPayout(businessId: string, holder: string, rawIban: string): Promise<PayoutResult> {
  const name = holder.trim().replace(/\s+/g, " ");
  if (name.length < 3 || name.length > 120) return "name";
  const iban = validIban(rawIban);
  if (!iban) return "iban";
  const s = await summary(businessId);
  if (s.requestedCents > 0) return "open";
  if (s.balanceCents < MIN_PAYOUT_CENTS) return "low";
  const db = await admin();
  const { error } = await db
    .from("referral_payouts")
    .insert({ business_id: businessId, amount_cents: s.balanceCents, holder_name: name, iban });
  if (error) throw error;
  await notifyOwner(businessId, s.balanceCents, name);
  return "ok";
}

/** Tells SYCRAS there is a transfer to make (the IBAN stays in the database, not in the email). */
async function notifyOwner(businessId: string, cents: number, holder: string) {
  const key = process.env["RESEND_API_KEY"];
  if (!key) return;
  const from = process.env["EMAIL_FROM"] || "SYCRAS <no-reply@sycras.com>";
  const euros = (cents / 100).toFixed(2).replace(".", ",");
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: ["suporte@sycras.com"],
      subject: `Pedido de levantamento de convites: ${euros} €`,
      text: `O negócio ${businessId} pediu a transferência de ${euros} € para ${holder}.\nO IBAN está na tabela referral_payouts (Supabase). Depois de transferir, muda o estado para "paid".`,
    }),
  }).catch((e) => console.error("[referral] notify", e));
}
