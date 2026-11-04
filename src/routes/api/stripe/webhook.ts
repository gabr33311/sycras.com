import { createFileRoute } from "@tanstack/react-router";
import type Stripe from "stripe";

// Stripe calls this after payments, renewals, failures and cancellations.
// The signature check proves the call really comes from Stripe.
export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["STRIPE_WEBHOOK_SECRET"];
        const signature = request.headers.get("stripe-signature");
        if (!secret || !signature) {
          return Response.json({ error: "Not configured" }, { status: 400 });
        }

        const { default: StripeSdk } = await import("stripe");
        const { stripe, syncSubscription } = await import("@/lib/billing.server");
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
          console.error("[stripe webhook] bad signature", e);
          return Response.json({ error: "Invalid signature" }, { status: 400 });
        }

        try {
          switch (event.type) {
            case "checkout.session.completed": {
              const session = event.data.object;
              if (session.subscription) {
                const id =
                  typeof session.subscription === "string"
                    ? session.subscription
                    : session.subscription.id;
                await syncSubscription(await stripe().subscriptions.retrieve(id));
              }
              break;
            }
            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted":
              await syncSubscription(event.data.object);
              break;
            // Invites: the first real payment earns the inviter 10 €; a refund takes it back.
            case "invoice.paid":
            case "charge.refunded": {
              const obj = event.data.object as { customer?: string | { id: string } | null; amount_paid?: number };
              const customer = typeof obj.customer === "string" ? obj.customer : obj.customer?.id;
              if (!customer) break;
              const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
              const { data: row } = await supabaseAdmin
                .from("subscriptions")
                .select("business_id")
                .eq("stripe_customer_id", customer)
                .maybeSingle();
              if (!row) break;
              const ref = await import("@/lib/referral.server");
              if (event.type === "invoice.paid" && (obj.amount_paid ?? 0) > 0) {
                await ref.rewardFirstPayment(row.business_id);
              } else if (event.type === "charge.refunded") {
                await ref.cancelPendingReward(row.business_id);
              }
              break;
            }
            default:
              break;
          }
        } catch (e) {
          // A 500 makes Stripe retry later, so a temporary failure isn't lost.
          console.error("[stripe webhook] sync failed", e);
          return Response.json({ error: "Sync failed" }, { status: 500 });
        }

        return Response.json({ received: true });
      },
    },
  },
});
