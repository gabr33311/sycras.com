// Server-only: tells the business's people about a booking event, on the phone (push)
// and by email. The email is for whoever uses the site or has no app (iPhone).
import { pushToBusiness, type PushKind } from "@/lib/push.server";

type Alert = { title: string; body: string; appointmentId: string; kind: PushKind };

/** Saved in the account (user_metadata.email_alerts); missing counts as on. */
export const EMAIL_ALERTS_KEY = "email_alerts";

function appOrigin(): string | null {
  const url = process.env["PUBLIC_APP_URL"];
  return url ? url.replace(/\/$/, "") : null;
}

/** Emails each member who has not turned the alerts off. Never throws. */
async function emailToBusiness(businessId: string, alert: Alert): Promise<void> {
  try {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const [{ data: members }, { data: appt }, { data: biz }] = await Promise.all([
      db.from("business_members").select("user_id").eq("business_id", businessId),
      db
        .from("appointments")
        .select("customer_name, customer_phone, service_name, starts_at, status")
        .eq("id", alert.appointmentId)
        .maybeSingle(),
      db.from("businesses").select("timezone").eq("id", businessId).maybeSingle(),
    ]);
    if (!appt || !members?.length) return;

    const tz = biz?.timezone || "Europe/Lisbon";
    const d = new Date(appt.starts_at);
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
    const pending = alert.kind === "request" && appt.status === "pending";
    const origin = appOrigin();
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");

    await Promise.all(
      members.map(async (m) => {
        const { data } = await db.auth.admin.getUserById(m.user_id);
        const user = data.user;
        if (!user?.email || user.user_metadata?.[EMAIL_ALERTS_KEY] === false) return;
        await sendTemplateEmail("owner-alert", user.email, {
          templateData: {
            title: alert.title,
            customerName: appt.customer_name,
            serviceName: appt.service_name,
            when: `${date} às ${time}`,
            phone: appt.customer_phone ?? undefined,
            pending: pending ? "1" : undefined,
            appUrl: origin ? `${origin}/today` : undefined,
          },
          idempotencyKey: `owner-alert-${alert.kind}-${alert.appointmentId}-${m.user_id}-${appt.starts_at}`,
        });
      }),
    );
  } catch (e) {
    console.error("[owner-alert] failed", e);
  }
}

/** Push to the phones and email the people of the business. Never throws. */
export async function alertBusiness(businessId: string, alert: Alert): Promise<void> {
  await Promise.all([pushToBusiness(businessId, alert), emailToBusiness(businessId, alert)]);
}
