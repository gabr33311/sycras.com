// Server-only: WhatsApp messages to clients through Meta's official API (WhatsApp Cloud API).
// Sent only when: the business pays for Pro and turned "WhatsApp" on, the client ticked the
// WhatsApp box when booking, and the API keys are set (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID).
// Meta only delivers approved templates; their names are below (or set in the env).
import { businessHasPro } from "@/lib/billing.server";

const GRAPH = "https://graph.facebook.com/v23.0";

export type WhatsAppKind = "confirmed" | "reminder";

const TEMPLATES: Record<WhatsAppKind, string> = {
  confirmed: process.env["WHATSAPP_TEMPLATE_CONFIRMED"] || "sycras_confirmacao",
  reminder: process.env["WHATSAPP_TEMPLATE_REMINDER"] || "sycras_lembrete",
};

export function whatsappReady(): boolean {
  return !!process.env["WHATSAPP_TOKEN"] && !!process.env["WHATSAPP_PHONE_NUMBER_ID"];
}

/** The number in international digits ("912 345 678" -> "351912345678"); null when unusable. */
export function waNumber(phone: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/[^0-9+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  // Portuguese numbers written without the country code.
  else if (d.length === 9 && /^[29]/.test(d)) d = `351${d}`;
  return /^[0-9]{8,15}$/.test(d) ? d : null;
}

async function sendTemplate(to: string, template: string, params: string[]): Promise<boolean> {
  const res = await fetch(`${GRAPH}/${process.env["WHATSAPP_PHONE_NUMBER_ID"]}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env["WHATSAPP_TOKEN"]}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: template,
        language: { code: process.env["WHATSAPP_LANG"] || "pt_PT" },
        components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
      },
    }),
  });
  if (!res.ok) {
    console.error("[whatsapp] send failed", res.status, (await res.text()).slice(0, 300));
    return false;
  }
  return true;
}

function origin(): string {
  return (process.env["PUBLIC_APP_URL"] || "https://sycras.com").replace(/\/$/, "");
}

/**
 * Sends the confirmation or the reminder for one appointment, once (the row in
 * appointment_reminders is claimed first). False when not sent, for whatever reason.
 */
export async function sendWhatsApp(appointmentId: string, kind: WhatsAppKind): Promise<boolean> {
  if (!whatsappReady()) return false;
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data } = await db
    .from("appointments")
    .select(
      "id, business_id, customer_name, customer_phone, whatsapp_ok, service_name, starts_at, status, businesses!inner(name, timezone, created_at, whatsapp_reminders, suspended_at)",
    )
    .eq("id", appointmentId)
    .maybeSingle();
  const appt = data as unknown as {
    id: string;
    business_id: string;
    customer_name: string;
    customer_phone: string | null;
    whatsapp_ok: boolean;
    service_name: string;
    starts_at: string;
    status: string;
    businesses: {
      name: string;
      timezone: string;
      created_at: string;
      whatsapp_reminders: boolean;
      suspended_at: string | null;
    };
  } | null;
  const to = waNumber(appt?.customer_phone ?? null);
  const biz = appt?.businesses;
  if (!appt || !to || !appt.whatsapp_ok || !biz?.whatsapp_reminders || biz.suspended_at) return false;
  if (appt.status !== "confirmed") return false;
  if (!(await businessHasPro(appt.business_id, biz.created_at))) return false;

  // Claim first: a second call can never send the same message twice.
  const claim = `whatsapp_${kind}`;
  const { error: claimError } = await db
    .from("appointment_reminders")
    .insert({ appointment_id: appt.id, business_id: appt.business_id, kind: claim });
  if (claimError) return false;

  const { data: tokenRow } = await db
    .from("booking_tokens")
    .select("token")
    .eq("appointment_id", appt.id)
    .maybeSingle();
  const tz = biz.timezone || "Europe/Lisbon";
  const when = new Intl.DateTimeFormat("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  }).format(new Date(appt.starts_at));
  const firstName = appt.customer_name.trim().split(/\s+/)[0] ?? appt.customer_name;
  const link = tokenRow?.token ? `${origin()}/booking/${tokenRow.token}` : origin();

  let ok = false;
  try {
    ok = await sendTemplate(to, TEMPLATES[kind], [firstName, biz.name, appt.service_name, when, link]);
  } catch (e) {
    console.error("[whatsapp] send error", e);
  }
  // Not delivered: free the claim so the next run can try again.
  if (!ok) {
    await db.from("appointment_reminders").delete().eq("appointment_id", appt.id).eq("kind", claim);
  }
  return ok;
}

/** Every WhatsApp reminder due now (run by the reminders job, next to the emails). */
export async function sendDueWhatsAppReminders(): Promise<{ sent: number }> {
  if (!whatsappReady()) return { sent: 0 };
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const now = Date.now();
  const { data, error } = await db
    .from("appointments")
    .select("id, starts_at, created_at, businesses!inner(reminder_hours, whatsapp_reminders)")
    .eq("status", "confirmed")
    .eq("whatsapp_ok", true)
    .not("customer_phone", "is", null)
    .gt("starts_at", new Date(now + 30 * 60000).toISOString())
    .lte("starts_at", new Date(now + 72 * 3600000).toISOString())
    .eq("businesses.whatsapp_reminders", true)
    .limit(500);
  if (error) throw error;
  let sent = 0;
  for (const row of (data ?? []) as unknown as {
    id: string;
    starts_at: string;
    created_at: string;
    businesses: { reminder_hours: number | null };
  }[]) {
    const window = (row.businesses.reminder_hours ?? 24) * 3600000;
    const start = new Date(row.starts_at).getTime();
    if (start - now > window) continue;
    // Booked inside the window: the confirmation is still fresh, no reminder needed.
    if (new Date(row.created_at).getTime() > start - window) continue;
    if (await sendWhatsApp(row.id, "reminder")) sent++;
  }
  return { sent };
}
