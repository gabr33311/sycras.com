import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  Ban,
  BarChart3,
  BellRing,
  CreditCard,
  Crown,
  Loader2,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { FormError, PageHeader } from "@/components/ui-bits";
import { useMyBusiness } from "@/hooks/use-business";
import { useSubscription } from "@/hooks/use-subscription";
import { openBillingPortal, startCheckout } from "@/lib/billing.functions";
import { formatDateLong } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TRIAL_DAYS } from "@/lib/subscription";
import { usePrefs } from "@/lib/prefs";

export const Route = createFileRoute("/_authenticated/plans")({
  validateSearch: z.object({ checkout: z.enum(["success", "cancelled"]).optional() }),
  head: () => ({
    meta: [
      { title: "Subscrição — SYCRAS" },
      { name: "description", content: "O plano SYCRAS Pro: experiência grátis e subscrição." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PlansPage,
});

const STORE_MANAGE = {
  play_store: {
    name: "Google Play",
    url: "https://play.google.com/store/account/subscriptions?package=com.sycras.app",
  },
  app_store: { name: "App Store", url: "https://apps.apple.com/account/subscriptions" },
} as const;

/** Only when paying: the free trial does not have these. */
const PRO_ONLY = [
  { key: "sub.only.reminders", icon: BellRing },
  { key: "sub.only.block", icon: Ban },
  { key: "sub.only.stats", icon: BarChart3 },
] as const;

function PlansPage() {
  const { t } = usePrefs();
  const qc = useQueryClient();
  const { checkout } = Route.useSearch();
  const { business } = useMyBusiness();
  const { access } = useSubscription();
  const [annual, setAnnual] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tz = business?.timezone ?? "Europe/Lisbon";

  // Back from Stripe: the webhook may take a few seconds to confirm, so refresh a couple of times.
  useEffect(() => {
    if (checkout !== "success") return;
    toast.success(t("sub.checkout.success"));
    const timers = [2000, 6000, 15000].map((ms) =>
      window.setTimeout(() => void qc.invalidateQueries({ queryKey: ["subscription"] }), ms),
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [checkout, qc, t]);

  async function subscribe() {
    if (!business) return;
    setBusy(true);
    setError(null);
    try {
      const res = await startCheckout({
        data: { businessId: business.id, interval: annual ? "year" : "month" },
      });
      if (!res.ok) {
        setError(res.message);
        setBusy(false);
        return;
      }
      window.location.assign(res.url);
    } catch {
      setError(t("sub.err.generic"));
      setBusy(false);
    }
  }

  async function manage() {
    if (!business) return;
    // Bought in the phone app: only Google / Apple can cancel or change it.
    if (access && access.store !== "stripe") {
      window.location.assign(STORE_MANAGE[access.store].url);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await openBillingPortal({ data: { businessId: business.id } });
      if (!res.ok) {
        setError(res.message);
        setBusy(false);
        return;
      }
      window.location.assign(res.url);
    } catch {
      setError(t("sub.err.generic"));
      setBusy(false);
    }
  }

  const subscribed = access?.subscribed ?? false;
  // Pro already on (paid, or turned on by hand): nothing to sell, only the state.
  const isPro = access?.state === "active" || access?.state === "past_due";

  return (
    <AppShell>
      <PageHeader title={t("sub.title")} />

      <div className="mx-auto max-w-xl space-y-4">
        {access && isPro && (
          <>
            <StatusCard access={access} tz={tz} />
            <FormError message={error} />
            {subscribed && (
              <Button size="lg" className="w-full" onClick={() => void manage()} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <CreditCard />}
                {access.store !== "stripe"
                  ? t("sub.manageStore").replace("{store}", STORE_MANAGE[access.store].name)
                  : t("sub.manage")}
              </Button>
            )}
            {subscribed && access.store !== "stripe" && (
              <p className="text-center text-xs text-muted-foreground">
                {t("sub.storeNote").replace("{store}", STORE_MANAGE[access.store].name)}
              </p>
            )}
          </>
        )}

        {/* Not paying yet: one card with the time left, the price, the three extras and the button. */}
        {access && !isPro && (
          <section className="surface overflow-hidden p-0">
            <TrialTop access={access} tz={tz} />

            <div className="space-y-5 p-5">
              <div className="flex items-end justify-between gap-3">
                <p className="flex items-end gap-1.5">
                  <span className="font-display text-4xl font-bold leading-none tabular-nums">
                    {annual ? t("sub.pro.priceAnnual") : t("sub.pro.price")}
                  </span>
                  <span className="pb-0.5 text-sm font-semibold text-muted-foreground">
                    {t("sub.price.suffix")}
                  </span>
                </p>
                <div
                  role="group"
                  aria-label={t("sub.billing.label")}
                  className="flex shrink-0 gap-1 rounded-full bg-muted p-1"
                >
                  {[
                    [false, t("sub.billing.monthly")],
                    [true, t("sub.billing.annual")],
                  ].map(([value, label]) => (
                    <button
                      key={String(value)}
                      type="button"
                      aria-pressed={annual === value}
                      onClick={() => setAnnual(value as boolean)}
                      className={cn(
                        "h-8 rounded-full px-3 text-xs font-bold transition-all",
                        annual === value
                          ? "bg-card text-foreground shadow-soft"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {label as string}
                      {value === true && (
                        <span className="ml-1 text-[10px] text-st-confirmed-fg">-20%</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <p className="-mt-3 text-xs text-muted-foreground">
                {annual ? t("sub.billedYearly") : t("sub.billedMonthly")}
              </p>

              {/* What the free trial leaves out: the reason to pay. Gold only here. */}
              <div>
                <p className="flex items-center gap-2 text-sm font-bold">
                  <Crown className="size-4 text-subscription-accent" /> {t("sub.only.title")}
                </p>
                <ul className="mt-3 space-y-2.5">
                  {PRO_ONLY.map(({ key, icon: Icon }) => (
                    <li key={key} className="flex items-start gap-2.5 text-sm">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-subscription-accent/15 text-subscription-accent">
                        <Icon className="size-3" strokeWidth={3} />
                      </span>
                      {t(key)}
                    </li>
                  ))}
                </ul>
              </div>

              <FormError message={error} />

              <Button
                size="lg"
                variant="brand"
                className="w-full"
                onClick={() => void subscribe()}
                disabled={busy || !business}
              >
                {busy && <Loader2 className="animate-spin" />}
                {access.state === "trial" ? t("sub.subscribeKeepTrial") : t("sub.subscribe")}
              </Button>
              <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5" /> {t("sub.secure")}
              </p>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}

/** Top of the offer: the days left in the free month, or that it has ended. */
function TrialTop({
  access,
  tz,
}: {
  access: NonNullable<ReturnType<typeof useSubscription>["access"]>;
  tz: string;
}) {
  const { t } = usePrefs();
  const end = formatDateLong(access.trialEndsAt.toISOString(), tz);
  if (access.state !== "trial")
    return (
      <div className="flex items-center gap-3 border-b border-border bg-st-noshow/10 px-5 py-4">
        <Lock className="size-5 shrink-0 text-st-noshow-fg" />
        <div className="min-w-0">
          <p className="text-sm font-bold">{t("sub.status.blocked")}</p>
          <p className="text-sm text-muted-foreground">{t("sub.status.blockedBody")}</p>
        </div>
      </div>
    );
  const used = Math.min(1, Math.max(0.04, 1 - access.trialDaysLeft / TRIAL_DAYS));
  return (
    <div className="border-b border-border bg-subscription-accent/8 px-5 py-4">
      <div className="flex items-end justify-between gap-3">
        <p className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="font-display text-4xl font-bold leading-none tabular-nums">
            {access.trialDaysLeft}
          </span>
          <span className="text-base font-semibold text-muted-foreground">
            {t(access.trialDaysLeft === 1 ? "pf.pro.dayLeft" : "pf.pro.daysLeft")}
          </span>
        </p>
        <p className="text-right text-xs font-semibold text-muted-foreground">
          {t("sub.status.trialEndsShort").replace("{date}", end)}
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div className="gold-bar h-full rounded-full" style={{ width: `${used * 100}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t("sub.trialHero.payLater")}</p>
    </div>
  );
}

/** Pro is on: where it stands, in one line. */
function StatusCard({
  access,
  tz,
}: {
  access: NonNullable<ReturnType<typeof useSubscription>["access"]>;
  tz: string;
}) {
  const { t } = usePrefs();
  const bad = access.state === "past_due";
  const title = bad ? t("sub.status.pastDue") : t("sub.status.active");
  const body = bad
    ? t("sub.status.pastDueBody")
    : access.periodEnd
      ? t("sub.status.renews").replace("{date}", formatDateLong(access.periodEnd.toISOString(), tz))
      : t("pf.pro.all");
  return (
    <section className="surface flex items-center gap-3.5 p-4">
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-xl",
          bad
            ? "bg-st-noshow/15 text-st-noshow-fg"
            : "bg-subscription-accent/15 text-subscription-accent",
        )}
      >
        {bad ? <CreditCard className="size-5" /> : <Crown className="size-5" />}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
      </div>
    </section>
  );
}
