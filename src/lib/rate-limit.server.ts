// Server-only: how many requests one person (by network and, when signed in, by account) may
// make to the server. Every API route and server function passes through `rateLimitResponse`
// (see src/start.ts). Over the limit the answer is 429 with Retry-After.
//
// - Sensitive routes (login, emails, payments, account) have strict limits counted in the
//   database, so they hold across all server instances.
// - Everything else has a generous limit per network, counted in memory on each instance
//   (cheap; it stops floods without slowing normal use).
// - Webhooks and the cron are never limited: they are signed, and Stripe/RevenueCat retry.
// If the database counter is unavailable, requests are let through (and logged): a broken
// limiter must never take the site down.

type Rule = { max: number; windowSec: number };

const MIN = 60;

/** Strict limits, by API path or server function name. Counted per network and per account. */
const RULES: Record<string, Rule> = {
  // Sign-in and passwords (the login route also locks an email after 5 wrong passwords).
  "/api/auth/login": { max: 20, windowSec: 5 * MIN },
  "/api/auth/password-check": { max: 30, windowSec: 10 * MIN },
  "/api/auth/password": { max: 10, windowSec: 15 * MIN },
  "/api/auth/mfa-email": { max: 6, windowSec: 10 * MIN },
  fn_emailHasAccount: { max: 20, windowSec: 10 * MIN },
  // Account.
  "/api/account/delete": { max: 5, windowSec: 60 * MIN },
  "/api/account/export": { max: 5, windowSec: 60 * MIN },
  // Emails and messages sent to clients.
  "/api/appointments/confirmed": { max: 60, windowSec: 10 * MIN },
  "/api/appointments/cancelled": { max: 60, windowSec: 10 * MIN },
  "/api/appointments/moved": { max: 60, windowSec: 10 * MIN },
  fn_sendAppointmentConfirmedEmail: { max: 60, windowSec: 10 * MIN },
  fn_sendAppointmentCancelledEmail: { max: 60, windowSec: 10 * MIN },
  "/api/push/test": { max: 10, windowSec: 10 * MIN },
  "/api/reminders/test": { max: 10, windowSec: 10 * MIN },
  fn_sendTestPush: { max: 10, windowSec: 10 * MIN },
  fn_sendTestReminder: { max: 10, windowSec: 10 * MIN },
  // Payments.
  "/api/billing/checkout": { max: 20, windowSec: 10 * MIN },
  "/api/payments/connect": { max: 20, windowSec: 10 * MIN },
  "/api/payments/status": { max: 60, windowSec: 10 * MIN },
  fn_startCheckout: { max: 20, windowSec: 10 * MIN },
  fn_openBillingPortal: { max: 20, windowSec: 10 * MIN },
  fn_finalizeDepositBooking: { max: 30, windowSec: 10 * MIN },
  fn_releaseDepositHold: { max: 30, windowSec: 10 * MIN },
  // Public booking (creating one also has its own per-phone limit).
  fn_createPublicBooking: { max: 20, windowSec: 10 * MIN },
  fn_cancelBookingByToken: { max: 10, windowSec: 10 * MIN },
  fn_rescheduleBookingByToken: { max: 10, windowSec: 10 * MIN },
  // Invites (payout requests and code changes).
  "/api/referral": { max: 60, windowSec: 10 * MIN },
};

/** The generous limit for everything else, per network. */
const DEFAULT_RULE: Rule = { max: 300, windowSec: MIN };

/** Never limited: signed by Stripe/RevenueCat or by the cron secret, and retried by them. */
const EXEMPT = ["/api/stripe/", "/api/revenuecat/", "/api/cron/"];

function clientIp(request: Request): string {
  const h = request.headers;
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown"
  );
}

async function sha(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`rl:${text}`));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

/**
 * The account behind a request, read from its session token (only to choose whose counter
 * to add to; every route still checks the session itself before doing anything).
 */
function accountId(request: Request): string | null {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as {
      sub?: unknown;
      exp?: unknown;
    };
    if (typeof json.sub !== "string" || typeof json.exp !== "number") return null;
    if (json.exp * 1000 < Date.now()) return null;
    return /^[0-9a-f-]{36}$/i.test(json.sub) ? json.sub : null;
  } catch {
    return null;
  }
}

// ---- In memory (the generous default) ----------------------------------------------------
const memory = new Map<string, { start: number; hits: number }>();

function memoryHit(key: string, rule: Rule): boolean {
  const now = Date.now();
  if (memory.size > 20_000) {
    for (const [k, v] of memory) if (now - v.start > rule.windowSec * 1000) memory.delete(k);
    if (memory.size > 20_000) memory.clear();
  }
  const entry = memory.get(key);
  if (!entry || now - entry.start > rule.windowSec * 1000) {
    memory.set(key, { start: now, hits: 1 });
    return true;
  }
  entry.hits += 1;
  return entry.hits <= rule.max;
}

// ---- In the database (the strict limits) -------------------------------------------------
let warned = false;

async function databaseHit(key: string, rule: Rule): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc(
      "rate_limit_hit" as never,
      {
        p_key: key,
        p_max: rule.max,
        p_window_seconds: rule.windowSec,
      } as never,
    );
    if (error) throw error;
    return data !== false;
  } catch (e) {
    if (!warned) {
      warned = true;
      console.error("[rate-limit] counter unavailable, letting requests through", e);
    }
    return true;
  }
}

function tooMany(rule: Rule): Response {
  return Response.json(
    { code: "rate_limit", message: "Demasiados pedidos. Tenta novamente daqui a pouco." },
    { status: 429, headers: { "Retry-After": String(rule.windowSec) } },
  );
}

/**
 * Null when the request may go on; a 429 response when this network or account went over the
 * limit for this route. `name` is the server function's name (for server function calls).
 */
export async function rateLimitResponse(
  request: Request,
  pathname: string,
  serverFnName?: string,
): Promise<Response | null> {
  if (EXEMPT.some((p) => pathname.startsWith(p))) return null;
  const routeKey = serverFnName ? `fn_${serverFnName}` : pathname;
  const strict = RULES[routeKey];
  const ip = await sha(clientIp(request));

  if (!strict) {
    return memoryHit(`ip:${ip}`, DEFAULT_RULE) ? null : tooMany(DEFAULT_RULE);
  }
  const user = accountId(request);
  const checks = [databaseHit(`${routeKey}:ip:${ip}`, strict)];
  if (user) checks.push(databaseHit(`${routeKey}:user:${user}`, strict));
  const ok = (await Promise.all(checks)).every(Boolean);
  return ok ? null : tooMany(strict);
}

/** Old counters go away once a day (called by the reminders cron). */
export async function cleanupRateLimits() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.rpc("rate_limit_cleanup" as never);
}
