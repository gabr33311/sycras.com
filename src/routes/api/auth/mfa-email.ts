import { createFileRoute } from "@tanstack/react-router";

// No authenticator app at hand: after the password (Bearer of the aal1 session),
// POST { action: "send" } emails a code; POST { action: "verify", code } turns
// two-step off and returns a fresh session (see mfa-email.server.ts).
export const Route = createFileRoute("/api/auth/mfa-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const m = await import("@/lib/mfa-email.server");
        const who = await m.whoNeedsIt(request);
        if (!who) return Response.json({ result: "unauthorized" }, { status: 401 });
        let body: { action?: string; code?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ result: "bad_request" }, { status: 400 });
        }
        if (body.action === "send") return Response.json({ result: await m.sendCode(who) });
        if (body.action === "verify") {
          return Response.json(await m.verifyCode(who, String(body.code ?? "").replace(/\D/g, "")));
        }
        return Response.json({ result: "bad_request" }, { status: 400 });
      },
    },
  },
});
