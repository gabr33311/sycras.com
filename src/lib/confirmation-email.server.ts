// Server-only: the "booking confirmed" email to the client. Never import from the browser.
import { brandColors } from "@/lib/brand";
import { mapsUrl } from "@/lib/maps";

/** "5 €", "12,50 €" (no decimals when whole), as on the booking page. */
function euros(cents: number): string {
  const v = cents / 100;
  return `${Number.isInteger(v) ? v : v.toFixed(2).replace(".", ",")} €`;
}

type Row = {
  id: string;
  customer_name: string;
  customer_email: string | null;
  service_name: string;
  starts_at: string;
  price_cents?: number;
  deposit_cents?: number | null;
  deposit_status?: string | null;
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
  } | null;
};

/**
 * Tells the client the business cancelled the appointment, or did not accept
 * the request, with a button to pick another time. False when not sent.
 */
export async function sendCancelledEmail(
  appointmentId: string,
  opts: { declined?: boolean } = {},
): Promise<boolean> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data } = await db
    .from("appointments")
    .select(
      "id, customer_name, customer_email, service_name, starts_at, businesses(name, slug, timezone, brand_color, suspended_at, email)",
    )
    .eq("id", appointmentId)
    .maybeSingle();
  const appt = data as unknown as {
    id: string;
    customer_name: string;
    customer_email: string | null;
    service_name: string;
    starts_at: string;
    businesses: {
      name: string;
      slug: string;
      timezone: string;
      brand_color: string;
      suspended_at: string | null;
      email: string | null;
    } | null;
  } | null;
  if (!appt?.customer_email) return false;
  const biz = appt.businesses;
  const tz = biz?.timezone || "Europe/Lisbon";
  const d = new Date(appt.starts_at);
  const colors = brandColors(biz?.brand_color);
  const origin = appOrigin();
  try {
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const res = await sendTemplateEmail("appointment-cancelled", appt.customer_email, {
      templateData: {
        name: appt.customer_name,
        businessName: biz?.name,
        serviceName: appt.service_name,
        date: new Intl.DateTimeFormat("pt-PT", {
          weekday: "long",
          day: "numeric",
          month: "long",
          timeZone: tz,
        }).format(d),
        time: new Intl.DateTimeFormat("pt-PT", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: tz,
        }).format(d),
        declined: opts.declined ? "1" : undefined,
        // A paused page cannot take another booking: no button then.
        bookUrl: origin && biz?.slug && !biz.suspended_at ? `${origin}/${biz.slug}` : undefined,
        brandColor: colors.brand,
        brandText: colors.foreground,
      },
      ...(biz?.email ? { replyTo: biz.email } : {}),
      idempotencyKey: `appointment-cancelled-${appt.id}`,
    });
    return res.sent;
  } catch (e) {
    console.error("[cancel-email] send failed", e);
    return false;
  }
}

/** Public origin for the links in the email. */
function appOrigin(): string | null {
  const url = process.env["PUBLIC_APP_URL"];
  return url ? url.replace(/\/$/, "") : null;
}

/**
 * Sends the confirmation email for one appointment: date, place (with a map
 * link) and a button to view or cancel. Returns false when it was not sent.
 */
export async function sendConfirmedEmail(
  appointmentId: string,
  opts: { changed?: boolean } = {},
): Promise<boolean> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const [{ data }, { data: tokenRow }] = await Promise.all([
    db
      .from("appointments")
      .select(
        "id, customer_name, customer_email, service_name, starts_at, price_cents, deposit_cents, deposit_status, businesses(name, timezone, address, city, latitude, longitude, brand_color, show_map, email)",
      )
      .eq("id", appointmentId)
      .maybeSingle(),
    db.from("booking_tokens").select("token").eq("appointment_id", appointmentId).maybeSingle(),
  ]);
  const appt = data as unknown as Row | null;
  if (!appt?.customer_email) return false;

  const biz = appt.businesses;
  const tz = biz?.timezone || "Europe/Lisbon";
  const d = new Date(appt.starts_at);
  const address = [biz?.address, biz?.city].filter(Boolean).join(", ");
  const colors = brandColors(biz?.brand_color);
  const origin = appOrigin();

  try {
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const res = await sendTemplateEmail("appointment-confirmed", appt.customer_email, {
      templateData: {
        name: appt.customer_name,
        businessName: biz?.name,
        serviceName: appt.service_name,
        date: new Intl.DateTimeFormat("pt-PT", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: tz,
        }).format(d),
        time: new Intl.DateTimeFormat("pt-PT", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: tz,
        }).format(d),
        address: address || undefined,
        // The owner can hide the map.
        mapUrl:
          biz?.show_map === false
            ? undefined
            : (mapsUrl({ ...biz, address, name: biz?.name ?? null }) ?? undefined),
        manageUrl: origin && tokenRow ? `${origin}/booking/${tokenRow.token}` : undefined,
        brandColor: colors.brand,
        brandText: colors.foreground,
        changed: opts.changed ? "1" : undefined,
        // "Sinal pago: 5 € · falta pagar 10 €", when a deposit was paid when booking.
        deposit:
          appt.deposit_status === "paid" && appt.deposit_cents
            ? `${euros(appt.deposit_cents)} · falta pagar ${euros(Math.max(0, (appt.price_cents ?? 0) - appt.deposit_cents))}`
            : undefined,
      },
      ...(biz?.email ? { replyTo: biz.email } : {}),
      // A move sends one email per new time; a confirmation only once.
      idempotencyKey: opts.changed
        ? `appointment-changed-${appt.id}-${appt.starts_at}`
        : `appointment-confirmed-${appt.id}`,
    });
    return res.sent;
  } catch (e) {
    console.error("[confirmation-email] send failed", e);
    return false;
  }
}
