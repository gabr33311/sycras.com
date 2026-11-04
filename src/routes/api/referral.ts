import { createFileRoute } from "@tanstack/react-router";

// Invites, for the site and the phone app (Bearer token of the signed-in owner).
// GET: the owner's code, counts and balance. POST { action }:
//   "code"   { code }            change the code (once)
//   "apply"  { code }            a new business joins with an invite (+15 free days)
//   "payout" { holder, iban }    ask for a bank transfer of the balance (from 20 €)
async function ownerBusiness(request: Request): Promise<{ userId: string; businessId: string } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: auth } = await supabaseAdmin.auth.getUser(token);
  if (!auth.user) return null;
  const { data: member } = await supabaseAdmin
    .from("business_members")
    .select("business_id")
    .eq("user_id", auth.user.id)
    .eq("role", "owner")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return member ? { userId: auth.user.id, businessId: member.business_id } : null;
}

export const Route = createFileRoute("/api/referral")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const who = await ownerBusiness(request);
        if (!who) return Response.json({ error: "unauthorized" }, { status: 401 });
        const { summary } = await import("@/lib/referral.server");
        return Response.json(await summary(who.businessId));
      },
      POST: async ({ request }) => {
        const who = await ownerBusiness(request);
        if (!who) return Response.json({ error: "unauthorized" }, { status: 401 });
        let body: { action?: string; code?: string; holder?: string; iban?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "bad_request" }, { status: 400 });
        }
        const r = await import("@/lib/referral.server");
        if (body.action === "code") {
          return Response.json({ result: await r.changeCode(who.businessId, String(body.code ?? "")) });
        }
        if (body.action === "apply") {
          return Response.json({ result: await r.applyCode(who.businessId, who.userId, String(body.code ?? "")) });
        }
        if (body.action === "payout") {
          return Response.json({
            result: await r.requestPayout(who.businessId, String(body.holder ?? ""), String(body.iban ?? "")),
          });
        }
        return Response.json({ error: "bad_request" }, { status: 400 });
      },
    },
  },
});
