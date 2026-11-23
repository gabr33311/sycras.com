// Server-only: the waitlist. A client asks to be told when a full day gets a free time;
// the cron checks those days and sends one email when a time opens. Never import from the browser.
import type { SupabaseClient } from "@supabase/supabase-js";

import { brandColors } from "@/lib/brand";

type Row = {
  id: string;
  business_id: string;
  service_id: string;
  staff_id: string | null;
  day: string;
  email: string;
};

/** The waitlist table is not in the generated types yet: read it through an untyped client. */
async function db(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

function todayLisbon(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());
}

/**
 * Adds a client to the waitlist of one day. At most 5 sign-ups per visitor (IP) per day, and
 * the same email only once per day and service (asking again simply says "done").
 */
export async function joinWaitlist(input: {
  businessId: string;
  serviceId: string;
  staffId: string | null;
  day: string;
  email: string;
  ipHash: string;
}): Promise<{ ok: true } | { ok: false; reason: "limit" | "past" | "error" }> {
  if (input.day < todayLisbon()) return { ok: false, reason: "past" };
  const c = await db();
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await c
    .from("waitlist")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", input.ipHash)
    .gte("created_at", since);
  if ((count ?? 0) >= 5) return { ok: false, reason: "limit" };
  const { error } = await c.from("waitlist").insert({
    business_id: input.businessId,
    service_id: input.serviceId,
    staff_id: input.staffId,
    day: input.day,
    email: input.email.trim().toLowerCase(),
    ip_hash: input.ipHash,
  });
  // 23505 = already on the list for that day: the same answer as a new sign-up.
  if (error && error.code !== "23505") {
    console.error("[waitlist] join failed", error.message);
    return { ok: false, reason: "error" };
  }
  return { ok: true };
}

/**
 * From the cron: for each day someone is waiting for, checks whether a time opened and, if so,
 * emails everyone waiting for it (once). Days already gone are cleared.
 */
export async function notifyWaitlist(): Promise<{ notified: number }> {
  if (!process.env["RESEND_API_KEY"]) return { notified: 0 };
  const c = await db();
  const today = todayLisbon();
  await c.from("waitlist").delete().lt("day", today);

  const { data, error } = await c
    .from("waitlist")
    .select("id, business_id, service_id, staff_id, day, email")
    .is("notified_at", null)
    .gte("day", today)
    .limit(300);
  if (error || !data?.length) return { notified: 0 };

  const { computeSlots } = await import("@/lib/booking.server");
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  const origin = (process.env["PUBLIC_APP_URL"] ?? "https://sycras.com").replace(/\/$/, "");

  // One availability check per business + service + professional + day.
  const groups = new Map<string, Row[]>();
  for (const r of data as Row[]) {
    const key = `${r.business_id}|${r.service_id}|${r.staff_id ?? ""}|${r.day}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  let notified = 0;
  for (const rows of groups.values()) {
    const first = rows[0]!;
    const slots = await computeSlots({
      businessId: first.business_id,
      serviceId: first.service_id,
      staffId: first.staff_id,
      date: first.day,
    }).catch(() => []);
    if (slots.length === 0) continue;

    const [{ data: biz }, { data: service }] = await Promise.all([
      c
        .from("businesses")
        .select("name, slug, brand_color, email, timezone")
        .eq("id", first.business_id)
        .maybeSingle(),
      c.from("services").select("name").eq("id", first.service_id).maybeSingle(),
    ]);
    if (!biz) continue;
    const colors = brandColors(biz.brand_color as string);
    const day = new Intl.DateTimeFormat("pt-PT", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${first.day}T12:00:00Z`));

    for (const r of rows) {
      // Claimed first, so two cron runs never send the same email twice.
      const { data: claimed } = await c
        .from("waitlist")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", r.id)
        .is("notified_at", null)
        .select("id");
      if (!claimed?.length) continue;
      await sendTemplateEmail("waitlist-open", r.email, {
        templateData: {
          businessName: biz.name,
          serviceName: service?.name,
          day,
          bookUrl: `${origin}/${biz.slug}`,
          brandColor: colors.brand,
          brandText: colors.foreground,
        },
        ...(biz.email ? { replyTo: biz.email as string } : {}),
        idempotencyKey: `waitlist-open-${r.id}`,
      }).catch((e) => console.error("[waitlist] email failed", e));
      notified++;
    }
  }
  return { notified };
}
