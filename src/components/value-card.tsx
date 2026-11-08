import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BellRing, CalendarCheck, Euro } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/hooks/use-business";
import { useSubscription } from "@/hooks/use-subscription";
import { useMoneyHidden } from "@/hooks/use-money-hidden";
import { formatPrice } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";

/**
 * What SYCRAS brought this month (or in the free trial): bookings clients made on their
 * own, the money booked and the reminders sent. Same card as on the phone app.
 */
export function ValueCard() {
  const { t } = usePrefs();
  const { business } = useMyBusiness();
  const { access } = useSubscription();
  const [hidden] = useMoneyHidden();
  const trial = access?.state === "trial";
  const now = new Date();
  const since = business
    ? trial
      ? new Date(business.created_at)
      : new Date(now.getFullYear(), now.getMonth(), 1)
    : null;

  const { data } = useQuery({
    queryKey: ["value", business?.id, since?.toISOString().slice(0, 10)],
    enabled: !!business && !!since,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const from = since!.toISOString();
      const [appts, rem] = await Promise.all([
        supabase
          .from("appointments")
          .select("source, status, price_cents")
          .eq("business_id", business!.id)
          .gte("created_at", from)
          .limit(5000),
        supabase
          .from("appointment_reminders")
          .select("id", { count: "exact", head: true })
          .eq("business_id", business!.id)
          .gte("created_at", from),
      ]);
      const rows = (appts.data ?? []).filter((a) => a.status !== "cancelled" && a.status !== "expired");
      return {
        online: rows.filter((a) => a.source === "public").length,
        money: rows.filter((a) => a.status !== "no_show").reduce((s, a) => s + (a.price_cents ?? 0), 0),
        reminders: rem.count ?? 0,
      };
    },
  });
  if (!business || !data || (data.online === 0 && data.money === 0 && data.reminders === 0)) return null;

  const stats = [
    { icon: CalendarCheck, value: String(data.online), label: t(data.online === 1 ? "value.online1" : "value.online") },
    {
      icon: Euro,
      value: hidden ? "•••" : formatPrice(data.money, business.currency ?? "EUR"),
      label: t("value.money"),
    },
    { icon: BellRing, value: String(data.reminders), label: t(data.reminders === 1 ? "value.reminders1" : "value.reminders") },
  ];
  return (
    <Link
      to={trial ? "/plans" : "/analytics"}
      className="surface block p-5 transition-transform active:scale-[0.99]"
    >
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {t(trial ? "value.title.trial" : "value.title")}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <s.icon className="size-4 text-brand-ink" strokeWidth={2.6} />
            <p className="mt-1 truncate font-display text-[28px] font-extrabold leading-none tracking-tight text-brand-ink tabular-nums">
              {s.value}
            </p>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
      {trial && <p className="mt-3 text-sm font-bold text-brand-ink">{t("value.cta")}</p>}
    </Link>
  );
}
