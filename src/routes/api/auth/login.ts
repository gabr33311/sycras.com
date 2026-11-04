import { createFileRoute } from "@tanstack/react-router";

// Email + password sign-in for the site and the phone app. It counts wrong passwords
// (5 per email, then 15 minutes locked) before asking Supabase, which also checks
// the captcha. On success the caller gets the session tokens and sets them itself.
type Body = { email?: string; password?: string; captchaToken?: string };

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const guard = await import("@/lib/login-guard.server");
        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return Response.json({ code: "bad_request" }, { status: 400 });
        }
        const email = (body.email ?? "").trim().toLowerCase();
        const password = body.password ?? "";
        if (!email || !password || email.length > 255 || password.length > 200) {
          return Response.json({ code: "bad_request" }, { status: 400 });
        }

        const [emailHash, ipHash] = await Promise.all([
          guard.hashEmail(email),
          guard.hashIp(guard.requestIp(request)),
        ]);
        // The lock needs the database; if it cannot be reached (e.g. on a computer without the
        // server key), sign-in still works, it just is not counted.
        const locked = await guard.lockedFor(emailHash, ipHash).catch(() => 0);
        if (locked) return Response.json({ code: "locked", minutes: locked }, { status: 429 });

        const { data, error } = await guard.anonAuth().signInWithPassword({
          email,
          password,
          ...(body.captchaToken ? { options: { captchaToken: body.captchaToken } } : {}),
        });

        if (error) {
          const msg = error.message;
          if (/captcha/i.test(msg)) return Response.json({ code: "captcha" }, { status: 400 });
          if (/Email not confirmed/i.test(msg)) {
            return Response.json({ code: "unconfirmed" }, { status: 403 });
          }
          if (/Invalid login credentials/i.test(msg)) {
            const left = await guard.recordFailure(emailHash, ipHash).catch(() => guard.MAX_TRIES);
            return left > 0
              ? Response.json({ code: "invalid", left }, { status: 401 })
              : Response.json({ code: "locked", minutes: 15 }, { status: 429 });
          }
          if (error.status === 429) return Response.json({ code: "rate_limit" }, { status: 429 });
          console.error("[auth login]", error.status, msg);
          return Response.json({ code: "error" }, { status: 500 });
        }

        await guard.clearFailures(emailHash).catch(() => undefined);
        return Response.json({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      },
    },
  },
});
