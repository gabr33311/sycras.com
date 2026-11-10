import { createFileRoute } from "@tanstack/react-router";

// Meta calls this with what happened to each WhatsApp message we sent: sent, delivered, read,
// or failed (with the reason). Each report is kept in security_events (kind "whatsapp_status"),
// so a message that never arrives shows why.
// - GET: Meta checks the address once, with the verify token we chose (WHATSAPP_VERIFY_TOKEN).
// - POST: signed by Meta with the app secret (WHATSAPP_APP_SECRET); unsigned calls are refused.

type StatusReport = {
  id?: string;
  status?: string;
  recipient_id?: string;
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
};
type Payload = {
  entry?: { changes?: { value?: { statuses?: StatusReport[] } }[] }[];
};

async function validSignature(body: string, header: string | null, secret: string) {
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const given = header.slice(7);
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/whatsapp/webhook")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const url = new URL(request.url);
        const token = process.env["WHATSAPP_VERIFY_TOKEN"];
        if (
          token &&
          url.searchParams.get("hub.mode") === "subscribe" &&
          url.searchParams.get("hub.verify_token") === token
        ) {
          return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const secret = process.env["WHATSAPP_APP_SECRET"];
        const body = await request.text();
        if (
          !secret ||
          !(await validSignature(body, request.headers.get("x-hub-signature-256"), secret))
        ) {
          return new Response("Forbidden", { status: 403 });
        }

        let payload: Payload;
        try {
          payload = JSON.parse(body) as Payload;
        } catch {
          return new Response("ok");
        }
        const reports = (payload.entry ?? [])
          .flatMap((e) => e.changes ?? [])
          .flatMap((c) => c.value?.statuses ?? [])
          .slice(0, 50);
        if (!reports.length) return new Response("ok");

        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        for (const r of reports) {
          if (!r.id || !r.status) continue;
          const err = r.errors?.[0];
          const detail = err
            ? `${err.code ?? ""} ${err.title ?? ""} ${err.error_data?.details ?? err.message ?? ""}`.trim()
            : "";
          if (r.status === "failed") console.error("[whatsapp] not delivered", r.id, detail);
          // Which business sent it (noted when it was sent).
          const { data: sent } = await db
            .from("security_events")
            .select("business_id")
            .eq("kind", "whatsapp_sent")
            .eq("identifier", r.id)
            .maybeSingle();
          await db.from("security_events").insert({
            kind: "whatsapp_status",
            ip_hash: "meta",
            identifier: `${r.status}${detail ? ` | ${detail}` : ""} | ${r.id}`.slice(0, 500),
            business_id: sent?.business_id ?? null,
          });
        }
        return new Response("ok");
      },
    },
  },
});
