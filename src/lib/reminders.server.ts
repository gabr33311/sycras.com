// Server-only: emails clients a reminder before their appointment. Never import from the browser.
import { brandColors } from "@/lib/brand";
import { mapsUrl } from "@/lib/maps";
import { renderReminderMessage } from "@/lib/reminder-message";
import { businessHasPro } from "@/lib/billing.server";

type DueRow = {
  id: string;
  business_id: string;
  customer_name: string;
  customer_email: string | null;
  service_name: string;
  starts_at: string;
  ends_at: string;
  created_at: string;
  businesses: {
    name: string;
    timezone: string;
    address: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    brand_color: string;
    show_map: boolean;
    email: string | null;
    created_at: string;
    reminders_enabled: boolean;
    reminder_hours: number;
    reminder_message: string | null;
  } | null;
};

/** Public origin for the links in the email. */
function appOrigin(): string | null {
  const url = process.env["PUBLIC_APP_URL"];
  return url ? url.replace(/\/$/, "") : null;
}

/**
 * Sends every reminder that is due now. Safe to run often: each appointment
 * gets one email at most (the row in appointment_reminders is claimed first).
 */
export async function sendDueReminders(): Promise<{ sent: number; skipped: number }> {
  // Without an email provider nothing is claimed, so reminders go out once it is set.
  if (!process.env["RESEND_API_KEY"]) return { sent: 0, skipped: 0 };
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");

  const now = Date.now();
  // The longest possible lead is 72 h; each business's own setting is checked below.
  const { data, error } = await db
    .from("appointments")
    .select(
      "id, business_id, customer_name, customer_email, service_name, starts_at, ends_at, created_at, businesses!inner(name, timezone, address, city, latitude, longitude, brand_color, show_map, email, created_at, reminders_enabled, reminder_hours, reminder_message)",
    )
    .eq("status", "confirmed")
    .not("customer_email", "is", null)
    .gt("starts_at", new Date(now + 30 * 60000).toISOString())
    .lte("starts_at", new Date(now + 72 * 3600000).toISOString())
    .eq("businesses.reminders_enabled", true)
    .limit(500);
  if (error) throw error;

  let sent = 0;
  let skipped = 0;
  const allowed = new Map<string, boolean>();

  for (const appt of (data ?? []) as unknown as DueRow[]) {
    const biz = appt.businesses;
    if (!biz || !appt.customer_email) continue;
    const lead = new Date(appt.starts_at).getTime() - now;
    const window = biz.reminder_hours * 3600000;
    if (lead > window) continue;
    // Booked inside the window: the confirmation is still fresh, no reminder needed.
    if (new Date(appt.created_at).getTime() > new Date(appt.starts_at).getTime() - window) continue;

    // Reminders are a Pro extra: paying businesses only (not the free trial).
    if (!allowed.has(appt.business_id)) {
      allowed.set(appt.business_id, await businessHasPro(appt.business_id, biz.created_at));
    }
    if (!allowed.get(appt.business_id)) {
      skipped++;
      continue;
    }

    // Claim first: a second run can never send the same reminder twice.
    const { error: claimError } = await db
      .from("appointment_reminders")
      .insert({ appointment_id: appt.id, business_id: appt.business_id, kind: "email" });
    if (claimError) {
      skipped++;
      continue;
    }

    const { data: tokenRow } = await db
      .from("booking_tokens")
      .select("token")
      .eq("appointment_id", appt.id)
      .maybeSingle();
    const origin = appOrigin();
    const tz = biz.timezone || "Europe/Lisbon";
    const d = new Date(appt.starts_at);
    const colors = brandColors(biz.brand_color);
    const date = new Intl.DateTimeFormat("pt-PT", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: tz,
    }).format(d);
    const time = new Intl.DateTimeFormat("pt-PT", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz,
    }).format(d);

    try {
      const res = await sendTemplateEmail("appointment-reminder", appt.customer_email, {
        templateData: {
          name: appt.customer_name,
          businessName: biz.name,
          serviceName: appt.service_name,
          date,
          time,
          message: renderReminderMessage(biz.reminder_message, {
            nome: appt.customer_name,
            serviço: appt.service_name,
            data: date,
            hora: time,
            negócio: biz.name,
          }),
          address: [biz.address, biz.city].filter(Boolean).join(", ") || undefined,
          mapUrl:
            biz.show_map === false
              ? undefined
              : (mapsUrl({
                  ...biz,
                  address: [biz.address, biz.city].filter(Boolean).join(", "),
                }) ?? undefined),
          manageUrl: origin && tokenRow ? `${origin}/booking/${tokenRow.token}` : undefined,
          brandColor: colors.brand,
          brandText: colors.foreground,
        },
        ...(biz.email ? { replyTo: biz.email } : {}),
        idempotencyKey: `appointment-reminder-${appt.id}`,
      });
      if (res.sent) sent++;
      else skipped++;
    } catch (e) {
      // Free the claim so the next run tries again.
      await db
        .from("appointment_reminders")
        .delete()
        .eq("appointment_id", appt.id)
        .eq("kind", "email");
      console.error("[reminders] send failed", appt.id, e);
      skipped++;
    }
  }

  const reviews = await sendDueReviews(db, sendTemplateEmail);
  // Not part of the count: help for new owners and the weekly error report.
  await sendOwnerNudges(db, sendTemplateEmail).catch((e) => console.error("[nudge] failed", e));
  await sendTrialEmails(db, sendTemplateEmail).catch((e) => console.error("[trial] failed", e));
  await sendWeeklyErrorSummary(db, sendTemplateEmail).catch((e) =>
    console.error("[errors] summary failed", e),
  );
  return { sent: sent + reviews, skipped };
}

type ReviewRow = {
  id: string;
  business_id: string;
  customer_name: string;
  customer_email: string | null;
  service_name: string;
  businesses: {
    name: string;
    brand_color: string;
    created_at: string;
    review_url: string | null;
    email: string | null;
  } | null;
};

/**
 * "How did it go?" a few hours after a finished visit, with the business's
 * review link (a Pro extra). One email per appointment at most.
 */
async function sendDueReviews(
  db: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  sendTemplateEmail: Awaited<
    typeof import("@/lib/email-templates/send-email")
  >["sendTemplateEmail"],
): Promise<number> {
  const now = Date.now();
  const { data, error } = await db
    .from("appointments")
    .select(
      "id, business_id, customer_name, customer_email, service_name, businesses!inner(name, brand_color, created_at, review_url, email)",
    )
    .eq("status", "completed")
    .not("customer_email", "is", null)
    .not("businesses.review_url", "is", null)
    // Finished 2 to 48 hours ago: soon enough to remember, not straight away.
    .lte("ends_at", new Date(now - 2 * 3600000).toISOString())
    .gte("ends_at", new Date(now - 48 * 3600000).toISOString())
    .limit(300);
  if (error) {
    console.error("[reviews] query failed", error);
    return 0;
  }
  let sent = 0;
  const pro = new Map<string, boolean>();
  for (const appt of (data ?? []) as unknown as ReviewRow[]) {
    const biz = appt.businesses;
    if (!biz?.review_url || !appt.customer_email) continue;
    if (!pro.has(appt.business_id)) {
      pro.set(appt.business_id, await businessHasPro(appt.business_id, biz.created_at));
    }
    if (!pro.get(appt.business_id)) continue;
    const { error: claimError } = await db
      .from("appointment_reminders")
      .insert({ appointment_id: appt.id, business_id: appt.business_id, kind: "review" });
    if (claimError) continue;
    const colors = brandColors(biz.brand_color);
    try {
      const res = await sendTemplateEmail("appointment-review", appt.customer_email, {
        templateData: {
          name: appt.customer_name,
          businessName: biz.name,
          serviceName: appt.service_name,
          reviewUrl: biz.review_url,
          brandColor: colors.brand,
          brandText: colors.foreground,
        },
        ...(biz.email ? { replyTo: biz.email } : {}),
        idempotencyKey: `appointment-review-${appt.id}`,
      });
      if (res.sent) sent++;
    } catch (e) {
      await db
        .from("appointment_reminders")
        .delete()
        .eq("appointment_id", appt.id)
        .eq("kind", "review");
      console.error("[reviews] send failed", appt.id, e);
    }
  }
  return sent;
}

/** The business fields the test reminder email needs. */
export type TestReminderBusiness = {
  name: string;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  brand_color: string | null;
  reminder_message: string | null;
};

export type TestReminderResult =
  { ok: true; to: string } | { ok: false; reason: "failed" | "not_configured"; detail?: string };

/** Sends the reminder email with sample data to `to`, to see how it looks. */
export async function sendTestReminderEmail(
  biz: TestReminderBusiness,
  to: string,
): Promise<TestReminderResult> {
  if (!process.env["RESEND_API_KEY"]) return { ok: false, reason: "not_configured" };
  const address = [biz.address, biz.city].filter(Boolean).join(", ");
  const colors = brandColors(biz.brand_color);
  const date = new Intl.DateTimeFormat("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Lisbon",
  }).format(new Date(Date.now() + 86400000));
  try {
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    await sendTemplateEmail("appointment-reminder", to, {
      templateData: {
        name: "Ana (exemplo)",
        businessName: biz.name,
        serviceName: "Serviço de exemplo",
        date,
        time: "10:30",
        message: renderReminderMessage(biz.reminder_message, {
          nome: "Ana",
          serviço: "Serviço de exemplo",
          data: date,
          hora: "10:30",
          negócio: biz.name,
        }),
        address: address || undefined,
        mapUrl: mapsUrl({ ...biz, address, name: biz.name }) ?? undefined,
        brandColor: colors.brand,
        brandText: colors.foreground,
      },
    });
    return { ok: true, to };
  } catch (e) {
    console.error("[reminders] test failed", e);
    return {
      ok: false,
      reason: "failed",
      detail: (e instanceof Error ? e.message : String(e)).slice(0, 160),
    };
  }
}

type Db = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];
type Send = Awaited<typeof import("@/lib/email-templates/send-email")>["sendTemplateEmail"];

/** The job runs every 10 minutes: each window of that size is handled by one run. */
const WINDOW_MS = 10 * 60 * 1000;

/**
 * Three days after signing up, an owner with no booking yet gets three simple
 * steps to get the first one (once: the time window plus an idempotency key).
 */
async function sendOwnerNudges(db: Db, send: Send): Promise<void> {
  const origin = appOrigin();
  const at = Date.now() - 3 * 86_400_000;
  const { data: fresh } = await db
    .from("businesses")
    .select("id, name, slug, created_by")
    .eq("is_demo", false)
    .is("deleted_at", null)
    .is("suspended_at", null)
    .gte("created_at", new Date(at - WINDOW_MS).toISOString())
    .lt("created_at", new Date(at).toISOString())
    .limit(100);
  for (const biz of fresh ?? []) {
    const { count } = await db
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("business_id", biz.id);
    if ((count ?? 0) > 0) continue;
    const { data: owner } = await db.auth.admin.getUserById(biz.created_by);
    const to = owner.user?.email;
    if (!to) continue;
    await send("owner-nudge", to, {
      templateData: {
        businessName: biz.name,
        pageUrl: origin ? `${origin}/${biz.slug}` : undefined,
      },
      idempotencyKey: `owner-nudge-${biz.id}`,
    });
  }
}

/**
 * The free month, told by email: day 7 (how it is going), day 25 (5 days left) and
 * day 30 (it ended). Never to someone already paying; each one once per business.
 */
async function sendTrialEmails(db: Db, send: Send): Promise<void> {
  const origin = appOrigin();
  const STAGES = [
    { day: 7, template: "trial-week" },
    { day: 25, template: "trial-ending" },
    { day: 30, template: "trial-ended" },
  ] as const;
  for (const stage of STAGES) {
    const at = Date.now() - stage.day * 86_400_000;
    const { data: due } = await db
      .from("businesses")
      .select("id, name, slug, created_by")
      .eq("is_demo", false)
      .is("deleted_at", null)
      .gte("created_at", new Date(at - WINDOW_MS).toISOString())
      .lt("created_at", new Date(at).toISOString())
      .limit(100);
    for (const biz of due ?? []) {
      const { data: sub } = await db
        .from("subscriptions")
        .select("plan, status")
        .eq("business_id", biz.id)
        .maybeSingle();
      const paying =
        (sub?.plan === "pro" || sub?.plan === "business") &&
        ["active", "trialing", "past_due"].includes(sub.status);
      if (paying) continue;
      const { data: owner } = await db.auth.admin.getUserById(biz.created_by);
      const to = owner.user?.email;
      if (!to) continue;
      let bookings: string | undefined;
      if (stage.template === "trial-week") {
        const { count } = await db
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("business_id", biz.id);
        bookings = String(count ?? 0);
      }
      await send(stage.template, to, {
        templateData: {
          businessName: biz.name,
          bookings,
          plansUrl: origin ? `${origin}/plans` : undefined,
          pageUrl: origin ? `${origin}/${biz.slug}` : undefined,
        },
        idempotencyKey: `${stage.template}-${biz.id}`,
      });
    }
  }
}

/** Where the weekly error report goes (every @sycras.com address is forwarded). */
const ERRORS_EMAIL = "erros@sycras.com";

/** Monday 09:00–09:10 in Lisbon: last week's phone app errors, grouped, to the team. */
async function sendWeeklyErrorSummary(db: Db, send: Send): Promise<void> {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  if (get("weekday") !== "Mon" || get("hour") !== "09" || Number(get("minute")) >= 10) return;

  const { data } = await db
    .from("app_errors")
    .select("message, screen")
    .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
    .limit(5000);
  const rows = data ?? [];
  const groups = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.message.slice(0, 140)} (${r.screen ?? "?"})`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  const lines = [...groups.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([k, n]) => `${n}× ${k}`)
    .join("\n");
  await send("error-summary", ERRORS_EMAIL, {
    templateData: { total: String(rows.length), lines: lines || "Nenhum erro. Boa semana!" },
    idempotencyKey: `error-summary-${new Date().toISOString().slice(0, 10)}`,
  });
}
