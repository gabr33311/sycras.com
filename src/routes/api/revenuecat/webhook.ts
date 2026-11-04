import { createFileRoute } from "@tanstack/react-router";

// RevenueCat calls this after purchases, renewals and cancellations made in the
// phone app (Google Play / App Store). The secret header proves it is RevenueCat.
export const Route = createFileRoute("/api/revenuecat/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["REVENUECAT_WEBHOOK_SECRET"];
        const auth = request.headers.get("authorization") ?? "";
        if (!secret) return Response.json({ error: "Not configured" }, { status: 400 });
        const { safeEqual } = await import("@/lib/safe-equal.server");
        if (!safeEqual(auth, secret) && !safeEqual(auth, `Bearer ${secret}`)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { syncStoreSubscription } = await import("@/lib/billing.server");
        let body: { event?: import("@/lib/billing.server").StoreEvent };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "Bad JSON" }, { status: 400 });
        }
        if (!body.event || body.event.type === "TEST") return Response.json({ received: true });

        try {
          await syncStoreSubscription(body.event);
        } catch (e) {
          // A 500 makes RevenueCat retry later, so a temporary failure isn't lost.
          console.error("[revenuecat webhook] sync failed", e);
          return Response.json({ error: "Sync failed" }, { status: 500 });
        }
        return Response.json({ received: true });
      },
    },
  },
});
