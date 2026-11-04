import { createFileRoute } from "@tanstack/react-router";

// Before a new password is saved (sign-up, reset), the site and the app ask here whether
// it appeared in a data breach. The password is never stored or logged.
export const Route = createFileRoute("/api/auth/password-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let password = "";
        try {
          password = String(((await request.json()) as { password?: unknown }).password ?? "");
        } catch {
          return Response.json({ breached: false }, { status: 400 });
        }
        if (!password || password.length > 200) return Response.json({ breached: false });
        const { passwordBreached } = await import("@/lib/pwned.server");
        return Response.json({ breached: await passwordBreached(password) });
      },
    },
  },
});
