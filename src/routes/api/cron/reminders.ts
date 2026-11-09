import { createFileRoute } from "@tanstack/react-router";

// Called every few minutes by a scheduled job (Supabase pg_cron + pg_net).
// The shared secret proves the call comes from that job.
export const Route = createFileRoute("/api/cron/reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["CRON_SECRET"];
        const auth = request.headers.get("authorization");
        const { safeEqual } = await import("@/lib/safe-equal.server");
        if (!secret || !safeEqual(auth ?? "", `Bearer ${secret}`)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        try {
          const { sendDueReminders } = await import("@/lib/reminders.server");
          const { sendDueWhatsAppReminders } = await import("@/lib/whatsapp.server");
          const email = await sendDueReminders();
          const whatsapp = await sendDueWhatsAppReminders().catch((e) => {
            console.error("[cron reminders] whatsapp failed", e);
            return { sent: 0 };
          });
          // Deposits left half way: book the paid ones, free the others.
          const { expireStaleHolds, sweepDeposits } = await import("@/lib/deposit.server");
          const holds = await expireStaleHolds().catch((e) => {
            console.error("[cron reminders] deposit holds failed", e);
            return { finalized: 0, expired: 0 };
          });
          // Deposits that should go back (cancelled, unanswered requests, failed refunds).
          const refunds = await sweepDeposits().catch((e) => {
            console.error("[cron reminders] deposit sweep failed", e);
            return 0;
          });
          return Response.json({ ...email, whatsapp: whatsapp.sent, holds, refunds });
        } catch (e) {
          console.error("[cron reminders] failed", e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      },
    },
  },
});
