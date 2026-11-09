import { createFileRoute } from "@tanstack/react-router";

// Opens the Stripe sign-up for the business's payments account (deposits). Site and phone app.
export const Route = createFileRoute("/api/payments/connect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { businessId?: unknown; from?: unknown } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          // Checked below.
        }
        const businessId = String(body.businessId ?? "");
        const { managerFromRequest, startConnectOnboarding } = await import("@/lib/connect.server");
        if (!(await managerFromRequest(request, businessId)))
          return Response.json({ ok: false, message: "Sem permissão." }, { status: 403 });
        const origin = new URL(request.url).origin;
        const result = await startConnectOnboarding({
          businessId,
          from: body.from === "app" ? "app" : "web",
          origin,
        }).catch((e: unknown) => {
          console.error("[connect] onboarding failed", e);
          return { ok: false as const, message: "Não foi possível abrir a Stripe. Tenta novamente." };
        });
        return Response.json(result, { status: result.ok ? 200 : 400 });
      },
    },
  },
});
