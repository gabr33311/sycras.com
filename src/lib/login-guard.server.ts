// Server-only: stops password guessing. After 5 wrong passwords an email is locked for
// 15 minutes; after 30 wrong passwords from one network, that network is locked too.
// The attempts live in security_events (kind "login_failed"), hashed, never in clear.
import { createClient } from "@supabase/supabase-js";
import { hashIp } from "@/lib/booking.server";

export const MAX_TRIES = 5;
const MAX_IP_TRIES = 30;
const WINDOW_MS = 15 * 60 * 1000;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function hashEmail(email: string): Promise<string> {
  const data = new TextEncoder().encode(`login:${email.trim().toLowerCase()}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 40);
}

export function requestIp(request: Request): string {
  const h = request.headers;
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown"
  );
}

/** Minutes left of the lock, or 0 when this email and network may try again. */
export async function lockedFor(emailHash: string, ipHash: string): Promise<number> {
  const db = await admin();
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const [byEmail, byIp] = await Promise.all([
    db
      .from("security_events")
      .select("created_at")
      .eq("kind", "login_failed")
      .eq("identifier", emailHash)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(MAX_TRIES),
    db
      .from("security_events")
      .select("id", { count: "exact", head: true })
      .eq("kind", "login_failed")
      .eq("ip_hash", ipHash)
      .gte("created_at", since),
  ]);
  const minutesFrom = (iso: string) =>
    Math.max(1, Math.ceil((new Date(iso).getTime() + WINDOW_MS - Date.now()) / 60000));
  const rows = byEmail.data ?? [];
  if (rows.length >= MAX_TRIES) return minutesFrom(rows[MAX_TRIES - 1]!.created_at);
  if ((byIp.count ?? 0) >= MAX_IP_TRIES) return 15;
  return 0;
}

/** Wrong passwords left before the lock (counting the one just recorded). */
export async function recordFailure(emailHash: string, ipHash: string): Promise<number> {
  const db = await admin();
  await db
    .from("security_events")
    .insert({ kind: "login_failed", ip_hash: ipHash, identifier: emailHash, business_id: null });
  const { count } = await db
    .from("security_events")
    .select("id", { count: "exact", head: true })
    .eq("kind", "login_failed")
    .eq("identifier", emailHash)
    .gte("created_at", new Date(Date.now() - WINDOW_MS).toISOString());
  return Math.max(0, MAX_TRIES - (count ?? 0));
}

/** A right password wipes the wrong ones, so an old typo never adds up to a lock. */
export async function clearFailures(emailHash: string) {
  const db = await admin();
  await db.from("security_events").delete().eq("kind", "login_failed").eq("identifier", emailHash);
}

/** Supabase sign-in from the server (no session kept here): the caller gets the tokens. */
export function anonAuth() {
  const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_ANON_KEY"] ||
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["VITE_SUPABASE_ANON_KEY"] ||
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Missing Supabase URL or anon key");
  return createClient(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  }).auth;
}

export { hashIp };
