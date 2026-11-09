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
              const { finalizeDeposit } = await import("@/lib/deposit.server");
              await finalizeDeposit(holdId, session.id);
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
