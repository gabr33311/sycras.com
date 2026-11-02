import { createFileRoute } from "@tanstack/react-router";

// The phone app confirmed a booking request: email the client. The Supabase
// session token proves it is the business.
export const Route = createFileRoute("/api/appointments/confirmed")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!token) return Response.json({ status: "failed" }, { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: auth } = await supabaseAdmin.auth.getUser(token);
        if (!auth.user) return Response.json({ status: "failed" }, { status: 401 });

        let appointmentId = "";
        try {
          appointmentId = String(
            ((await request.json()) as { appointmentId?: unknown }).appointmentId ?? "",
          );
        } catch {
          // Checked below.
        }
        const { data: appt } = await supabaseAdmin
          .from("appointments")
          .select("id, business_id, status, customer_email")
          .eq("id", appointmentId)
          .maybeSingle();
        if (!appt || appt.status !== "confirmed") return Response.json({ status: "failed" });
        const { data: member } = await supabaseAdmin
          .from("business_members")
          .select("user_id")
          .eq("business_id", appt.business_id)
          .eq("user_id", auth.user.id)
          .maybeSingle();
        if (!member) return Response.json({ status: "failed" }, { status: 403 });
        // The client also gets it on WhatsApp when they asked for it (Pro).
        const { sendWhatsApp } = await import("@/lib/whatsapp.server");
        await sendWhatsApp(appt.id, "confirmed").catch(() => false);
        if (!appt.customer_email) return Response.json({ status: "no_email" });

        const { sendConfirmedEmail } = await import("@/lib/confirmation-email.server");
        const sent = await sendConfirmedEmail(appt.id);
        return Response.json({ status: sent ? "sent" : "failed" });
      },
    },
  },
});
