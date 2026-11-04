import { createFileRoute } from "@tanstack/react-router";

// Changing the password from the account screen (site and app). The current password is
// checked here, under the same lock as sign-in (5 wrong tries, 15 minutes), so an open
// laptop or phone is not enough to take the account, and guessing it is not possible.
type Body = { current?: string; next?: string; captchaToken?: string };

export const Route = createFileRoute("/api/auth/password")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const guard = await import("@/lib/login-guard.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
        const { data: who } = await supabaseAdmin.auth.getUser(token);
        const user = who.user;
        if (!user?.email) return Response.json({ code: "unauthorized" }, { status: 401 });

        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return Response.json({ code: "bad_request" }, { status: 400 });
        }
        const current = body.current ?? "";
        const next = body.next ?? "";
        if (!current || next.length < 8 || next.length > 200) {
          return Response.json({ code: "bad_request" }, { status: 400 });
        }

        const [emailHash, ipHash] = await Promise.all([
          guard.hashEmail(user.email),
          guard.hashIp(guard.requestIp(request)),
        ]);
        const locked = await guard.lockedFor(emailHash, ipHash);
        if (locked) return Response.json({ code: "locked", minutes: locked }, { status: 429 });

        const { error } = await guard.anonAuth().signInWithPassword({
          email: user.email,
          password: current,
          ...(body.captchaToken ? { options: { captchaToken: body.captchaToken } } : {}),
        });
        if (error) {
          if (/captcha/i.test(error.message)) return Response.json({ code: "captcha" }, { status: 400 });
          if (/Invalid login credentials/i.test(error.message)) {
            const left = await guard.recordFailure(emailHash, ipHash);
            return Response.json({ code: left > 0 ? "invalid" : "locked", left, minutes: 15 }, { status: 401 });
          }
          console.error("[auth password]", error.status, error.message);
          return Response.json({ code: "error" }, { status: 500 });
        }
        await guard.clearFailures(emailHash);

        // A password from a known data breach is the first one attackers try.
        const { passwordBreached } = await import("@/lib/pwned.server");
        if (await passwordBreached(next)) return Response.json({ code: "breached" }, { status: 400 });

        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
          password: next,
        });
        if (updateError) {
          const weak = /weak|password/i.test(updateError.message);
          return Response.json({ code: weak ? "weak" : "error" }, { status: 400 });
        }
        return Response.json({ code: "ok" });
      },
    },
  },
});
