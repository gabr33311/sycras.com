import { createFileRoute } from "@tanstack/react-router";
import type Stripe from "stripe";

// Stripe calls this for events on the businesses' own accounts (deposits): a deposit paid,
// or an account that can (or no longer can) take payments. Signed with its own secret.
export const Route = createFileRoute("/api/stripe/connect-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["STRIPE_CONNECT_WEBHOOK_SECRET"];
        const signature = request.headers.get("stripe-signature");
        if (!secret || !signature)
          return Response.json({ error: "Not configured" }, { status: 400 });

        const { default: StripeSdk } = await import("stripe");
        const { stripe } = await import("@/lib/billing.server");
        const body = await request.text();

        let event: Stripe.Event;
        try {
          event = await stripe().webhooks.constructEventAsync(
            body,
            signature,
            secret,
            undefined,
            StripeSdk.createSubtleCryptoProvider(),
          );
        } catch (e) {
          console.error("[connect webhook] bad signature", e);
          return Response.json({ error: "Invalid signature" }, { status: 400 });
        }

        try {
          // Paid at once (card) or a little later (methods confirmed in another app).
          if (
            event.type === "checkout.session.completed" ||
            event.type === "checkout.session.async_payment_succeeded"
          ) {
            const session = event.data.object;
            const holdId = session.metadata?.["hold_id"];
            if (holdId) {
              const { finalizeDeposit, refundOrphanPayment } = await import("@/lib/deposit.server");
              const result = await finalizeDeposit(holdId, session.id);
              // Paid, but its hold is gone: never keep money without a booking.
              if (
                !result.ok &&
                result.code === "not_found" &&
                session.payment_status === "paid" &&
                event.account
              ) {
                const pi =
                  typeof session.payment_intent === "string"
                    ? session.payment_intent
                    : (session.payment_intent?.id ?? "");
                await refundOrphanPayment(pi, event.account);
              }
            }
          } else if (event.type === "charge.refunded") {
            // A refund made in the barber's own Stripe dashboard: show it in SYCRAS too.
            const charge = event.data.object;
            const pi =
              typeof charge.payment_intent === "string"
                ? charge.payment_intent
                : (charge.payment_intent?.id ?? "");
            if (pi && charge.refunded) {
              const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
              await supabaseAdmin
                .from("appointments")
                .update({
                  deposit_status: "refunded",
                  deposit_refunded_at: new Date().toISOString(),
                })
                .eq("deposit_payment_intent", pi)
                .in("deposit_status", ["paid", "kept"]);
            }
          } else if (event.type === "account.updated") {
            const account = event.data.object;
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await supabaseAdmin
              .from("businesses")
              .update({ stripe_charges_enabled: account.charges_enabled === true })
              .eq("stripe_account_id", account.id);
          }
        } catch (e) {
          // Stripe retries on a 500, which is what we want if the database hiccuped.
          console.error("[connect webhook] handling failed", event.type, e);
          return Response.json({ error: "Failed" }, { status: 500 });
        }
        return Response.json({ received: true });
      },
    },
  },
});
