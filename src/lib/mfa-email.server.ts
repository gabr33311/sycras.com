// Server-only: a way in for owners who lost their authenticator app. After the right
// password (an aal1 session), a 6-digit code goes to the account's email; the right
// code turns two-step off and gives back a fresh session, and a notice is emailed.
// - 3 codes per hour per account, each valid 10 minutes; a new one replaces the old.
// - 5 wrong codes in 15 minutes lock it for 15 minutes.
// Codes live hashed in security_events (kinds "mfa_email_code" / "mfa_email_failed").
import { safeEqual } from "@/lib/safe-equal.server";
import { anonAuth } from "@/lib/login-guard.server";

const CODE_TTL_MS = 10 * 60 * 1000;
const SEND_WINDOW_MS = 60 * 60 * 1000;
const MAX_SENDS = 3;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function sha(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const userKey = async (userId: string) => (await sha(`mfa-user:${userId}`)).slice(0, 40);
const codeHash = (userId: string, code: string) => sha(`mfa-code:${userId}:${code}`);

export type Who = { id: string; email: string };

/** The signed-in user behind a Bearer token, if they have two-step on (else nothing to recover). */
export async function whoNeedsIt(request: Request): Promise<Who | null> {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const db = await admin();
  const { data } = await db.auth.getUser(token);
  const user = data.user;
  if (!user?.email) return null;
  const hasFactor = (user.factors ?? []).some((f) => f.status === "verified");
  return hasFactor ? { id: user.id, email: user.email } : null;
}

export type SendResult = "ok" | "too_many" | "error";

export async function sendCode(who: Who): Promise<SendResult> {
  const db = await admin();
  const key = await userKey(who.id);
  const { count } = await db
    .from("security_events")
    .select("id", { count: "exact", head: true })
    .eq("kind", "mfa_email_code")
    .eq("identifier", key)
    .gte("created_at", new Date(Date.now() - SEND_WINDOW_MS).toISOString());
  if ((count ?? 0) >= MAX_SENDS) return "too_many";

  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  const code = String(bytes[0]! % 1_000_000).padStart(6, "0");
  const { error } = await db.from("security_events").insert({
    kind: "mfa_email_code",
    identifier: key,
    metadata: { h: await codeHash(who.id, code) },
  });
  if (error) return "error";
  try {
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const res = await sendTemplateEmail("mfa-email-code", who.email, { templateData: { code } });
    return res.sent ? "ok" : "error";
  } catch (e) {
    console.error("[mfa email] send failed", e);
    return "error";
  }
}

export type VerifyResult =
  | { result: "ok"; access_token: string; refresh_token: string }
  | { result: "wrong" | "locked" | "error" };

export async function verifyCode(who: Who, code: string): Promise<VerifyResult> {
  const db = await admin();
  const key = await userKey(who.id);
  const { count: fails } = await db
    .from("security_events")
    .select("id", { count: "exact", head: true })
    .eq("kind", "mfa_email_failed")
    .eq("identifier", key)
    .gte("created_at", new Date(Date.now() - FAIL_WINDOW_MS).toISOString());
  if ((fails ?? 0) >= MAX_FAILS) return { result: "locked" };

  // Only the newest code counts, and only while fresh.
  const { data: row } = await db
    .from("security_events")
    .select("id, metadata, created_at")
    .eq("kind", "mfa_email_code")
    .eq("identifier", key)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const stored = (row?.metadata as { h?: string; used?: boolean } | null) ?? null;
  const fresh = row && Date.now() - new Date(row.created_at).getTime() < CODE_TTL_MS;
  const ok =
    !!stored?.h &&
    !stored.used &&
    !!fresh &&
    /^\d{6}$/.test(code) &&
    safeEqual(await codeHash(who.id, code), stored.h);
  if (!ok) {
    await db.from("security_events").insert({ kind: "mfa_email_failed", identifier: key });
    return { result: (fails ?? 0) + 1 >= MAX_FAILS ? "locked" : "wrong" };
  }
  await db
    .from("security_events")
    .update({ metadata: { ...stored, used: true } })
    .eq("id", row!.id);

  // Turn two-step off (this ends the account's sessions), then hand back a fresh one.
  const { data: factors } = await db.auth.admin.mfa.listFactors({ userId: who.id });
  for (const f of factors?.factors ?? []) {
    const { error } = await db.auth.admin.mfa.deleteFactor({ id: f.id, userId: who.id });
    if (error) {
      console.error("[mfa email] delete factor failed", error.message);
      return { result: "error" };
    }
  }
  const { data: link, error: linkError } = await db.auth.admin.generateLink({
    type: "magiclink",
    email: who.email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) return { result: "error" };
  const { data: session, error: otpError } = await anonAuth().verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });
  if (otpError || !session.session) return { result: "error" };

  await db.from("security_events").insert({ kind: "mfa_off_by_email", identifier: key });
  try {
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    await sendTemplateEmail("mfa-off", who.email);
  } catch (e) {
    console.error("[mfa email] notice failed", e);
  }
  return {
    result: "ok",
    access_token: session.session.access_token,
    refresh_token: session.session.refresh_token,
  };
}
