import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { finalizeDepositBooking } from "@/lib/booking.functions";
import { usePrefs } from "@/lib/prefs";
import { Button } from "@/components/ui/button";

// The client is back from paying the deposit on Stripe: make (or find) the booking and open it.
export const Route = createFileRoute("/booking/pay/$hold")({
  validateSearch: (s) => z.object({ session_id: z.string().optional().default("") }).parse(s),
  head: () => ({ meta: [{ title: "Pagamento do sinal" }, { name: "robots", content: "noindex" }] }),
  component: PayReturn,
});

/** How many times to ask (every 2 s) before saying the confirmation will come by email. */
const TRIES = 10;

function PayReturn() {
  const { hold } = Route.useParams();
  const { session_id } = Route.useSearch();
  const navigate = useNavigate();
  const { t } = usePrefs();
  const [state, setState] = useState<"checking" | "waiting" | "lost" | "missing">("checking");
  const [slug, setSlug] = useState("");

  useEffect(() => {
    let stop = false;
    void (async () => {
      for (let i = 0; i < TRIES && !stop; i++) {
        const res = await finalizeDepositBooking({
          data: { holdId: hold, sessionId: session_id },
        }).catch(() => ({ ok: false as const, code: "not_paid" as const }));
        if (stop) return;
        if (res.ok) {
          await navigate({ to: "/booking/$token", params: { token: res.token }, replace: true });
          return;
        }
        if (res.code === "slot_lost") {
          setSlug(res.slug);
          return setState("lost");
        }
        if (res.code === "not_found") return setState("missing");
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!stop) setState("waiting");
    })();
    return () => {
      stop = true;
    };
  }, [hold, session_id, navigate]);

  const box = (title: string, body?: string, action?: React.ReactNode) => (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-2xl font-semibold">{title}</h1>
      {body ? <p className="text-muted-foreground">{body}</p> : null}
      {action}
    </main>
  );

  if (state === "checking")
    return box(
      t("bk.pay.checking"),
      undefined,
      <Loader2 className="size-6 animate-spin text-muted-foreground" />,
    );
  if (state === "waiting") return box(t("bk.pay.waitTitle"), t("bk.pay.waitBody"));
  if (state === "lost")
    return box(
      t("bk.pay.lostTitle"),
      t("bk.pay.lostBody"),
      <Button asChild className="rounded-full">
        <Link to="/$slug" params={{ slug }}>
          {t("bk.pay.back")}
        </Link>
      </Button>,
    );
  return box(t("bk.tk.invalidTitle"), t("bk.tk.invalidBody"));
}
