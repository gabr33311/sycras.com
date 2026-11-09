import { createFileRoute } from "@tanstack/react-router";

// The phone app cancelled a booking (or did not accept a request): email the
// client. The Supabase session token proves it is the business.
export const Route = createFileRoute("/api/appointments/cancelled")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!token) return Response.json({ status: "failed" }, { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: auth } = await supabaseAdmin.auth.getUser(token);
        if (!auth.user) return Response.json({ status: "failed" }, { status: 401 });

        let body: { appointmentId?: unknown; declined?: unknown; refund?: unknown } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          // Checked below.
        }
        const appointmentId = String(body.appointmentId ?? "");
        const { data: appt } = await supabaseAdmin
          .from("appointments")
          .select("id, business_id, status, customer_email")
          .eq("id", appointmentId)
          .maybeSingle();
        if (!appt || appt.status !== "cancelled") return Response.json({ status: "failed" });
        const { data: member } = await supabaseAdmin
          .from("business_members")
          .select("user_id")
          .eq("business_id", appt.business_id)
          .eq("user_id", auth.user.id)
          .maybeSingle();
        if (!member) return Response.json({ status: "failed" }, { status: 403 });

        // A paid deposit goes back, unless the owner chose to keep it (late cancel). Even
        // when the client left no email.
        const { refundDeposit } = await import("@/lib/deposit.server");
        const refund =
          body.refund === false
            ? { refunded: false, cents: 0 }
            : await refundDeposit(appt.id).catch((e: unknown) => {
                console.error("[deposit] refund on cancel failed", e);
                return { refunded: false, cents: 0 };
              });
        if (!appt.customer_email)
          return Response.json({ status: "no_email", refunded: refund.refunded });

        const { sendCancelledEmail } = await import("@/lib/confirmation-email.server");
        const sent = await sendCancelledEmail(appt.id, {
          declined: body.declined === true,
          refundedCents: refund.refunded ? refund.cents : 0,
        });
        return Response.json({ status: sent ? "sent" : "failed", refunded: refund.refunded });
      },
    },
  },
});
