import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Emails the client that their appointment was confirmed. Caller must manage the business (RLS). */
export const sendAppointmentConfirmedEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ appointmentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: appt } = await context.supabase
      .from("appointments")
      .select("id, status, customer_email")
      .eq("id", data.appointmentId)
      .maybeSingle();
    if (!appt || appt.status !== "confirmed") return { status: "failed" as const };
    if (!appt.customer_email) return { status: "no_email" as const };

    const { sendConfirmedEmail } = await import("@/lib/confirmation-email.server");
    const sent = await sendConfirmedEmail(appt.id);
    return { status: sent ? ("sent" as const) : ("failed" as const) };
  });

/** Emails the client that the business cancelled (or did not accept) the appointment. Caller must manage the business (RLS). */
export const sendAppointmentCancelledEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        appointmentId: z.string().uuid(),
        declined: z.boolean().optional(),
        /** False when the owner keeps the deposit (late cancel). */
        refund: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: appt } = await context.supabase
      .from("appointments")
      .select("id, status, customer_email")
      .eq("id", data.appointmentId)
      .maybeSingle();
    if (!appt || appt.status !== "cancelled") return { status: "failed" as const, refunded: false };
    const { refundDeposit } = await import("@/lib/deposit.server");
    const refund =
      data.refund === false
        ? { refunded: false, cents: 0 }
        : await refundDeposit(appt.id).catch((e: unknown) => {
            console.error("[deposit] refund on cancel failed", e);
            return { refunded: false, cents: 0 };
          });
    if (!appt.customer_email) return { status: "no_email" as const, refunded: refund.refunded };
    const { sendCancelledEmail } = await import("@/lib/confirmation-email.server");
    const sent = await sendCancelledEmail(appt.id, {
      declined: data.declined === true,
      refundedCents: refund.refunded ? refund.cents : 0,
    });
    return { status: sent ? ("sent" as const) : ("failed" as const), refunded: refund.refunded };
  });
