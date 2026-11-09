import { createFileRoute } from "@tanstack/react-router";

// Whether the business's payments account can take deposits yet (asked after the Stripe sign-up).
export const Route = createFileRoute("/api/payments/status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { businessId?: unknown } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          // Checked below.
        }
        const businessId = String(body.businessId ?? "");
        const { managerFromRequest, refreshConnectStatus } = await import("@/lib/connect.server");
        if (!(await managerFromRequest(request, businessId)))
          return Response.json({ connected: false, chargesEnabled: false }, { status: 403 });
        const status = await refreshConnectStatus(businessId).catch((e: unknown) => {
          console.error("[connect] status failed", e);
          return { connected: false, chargesEnabled: false };
        });
        return Response.json(status);
      },
    },
  },
});
