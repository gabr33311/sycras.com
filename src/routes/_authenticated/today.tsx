import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  BellRing,
  Check,
  ChevronRight,
  Crown,
  Eye,
  EyeOff,
  Loader2,
  Sparkles,
  UserX,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { ErrorState, LoadingRows, PageHeader, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { useMyBusiness } from "@/hooks/use-business";
import { useSubscription } from "@/hooks/use-subscription";
import { HIDDEN_MONEY, useMoneyHidden } from "@/hooks/use-money-hidden";
import { useAppointmentSheet } from "@/lib/appointment-sheet-context";
import { invalidateAppointmentData, setAppointmentStatus } from "@/lib/appointment-status";
import {
  displayCustomerName,
  formatDateLong,
  formatPrice,
  formatTime,
  greetingPt,
} from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import { todayIn, zonedToUtc } from "@/lib/time";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/today")({
  head: () => ({
    meta: [
      { title: "Hoje — SYCRAS" },
      { name: "description", content: "O teu dia: o que vem a seguir e o que precisa de ti." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TodayPage,
});

type Row = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  customer_name: string;
  service_name: string;
  price_cents: number | null;
  status: "pending" | "confirmed" | "completed" | "cancelled" | "no_show" | "expired";
  staff_id: string | null;
};

const LIVE = ["pending", "confirmed"] as const;
const isLive = (s: Row["status"]) => (LIVE as readonly string[]).includes(s);

function TodayPage() {
  const { t, lang } = usePrefs();
  const { business } = useMyBusiness();
  const { openAppointment } = useAppointmentSheet();
  const tz = business?.timezone ?? "Europe/Lisbon";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["today", business?.id],
    enabled: !!business,
    queryFn: async () => {
      const day = todayIn(tz);
      const fields =
        "id, starts_at, ends_at, customer_name, service_name, price_cents, status, staff_id";
      const results = await Promise.all([
        supabase
          .from("appointments")
          .select(fields)
          .eq("business_id", business!.id)
          .gte("starts_at", zonedToUtc(day, 0, tz).toISOString())
          .lt("starts_at", zonedToUtc(day, 24 * 60, tz).toISOString())
          .order("starts_at"),
        // Requests waiting for an answer, from now on.
        supabase
          .from("appointments")
          .select(fields)
          .eq("business_id", business!.id)
          .eq("status", "pending")
          .gte("starts_at", new Date().toISOString())
          .order("starts_at")
          .limit(20),
        // Past appointments nobody closed yet (last 30 days).
        supabase
          .from("appointments")
          .select(fields)
          .eq("business_id", business!.id)
          .in("status", ["pending", "confirmed"])
          .lt("starts_at", new Date().toISOString())
          .gte("starts_at", new Date(Date.now() - 30 * 86400000).toISOString())
          .order("starts_at", { ascending: false })
          .limit(20),
      ]);
      const failed = results.find((r) => r.error);
      if (failed) throw failed.error;
      const [day0, pending, overdue] = results;
      return {
        day: (day0.data ?? []) as Row[],
        pending: (pending.data ?? []) as Row[],
        overdue: (overdue.data ?? []) as Row[],
      };
    },
  });

  const endOf = (r: Row) =>
    r.ends_at ? new Date(r.ends_at).getTime() : new Date(r.starts_at).getTime() + 3600000;
  const day = data?.day ?? [];
  const liveDay = day.filter((r) => r.status !== "cancelled" && r.status !== "expired");
  const current = liveDay.find(
    (r) => isLive(r.status) && new Date(r.starts_at).getTime() <= now && endOf(r) > now,
  );
  const next = liveDay.find((r) => isLive(r.status) && new Date(r.starts_at).getTime() > now);
  const focus = current ?? next;
  // Overdue = time is over and nobody said how it went (not the one happening now).
  const overdue = (data?.overdue ?? []).filter((r) => endOf(r) <= now);
  const needs = [
    ...(data?.pending ?? []).map((r) => ({ kind: "pending" as const, row: r })),
    ...overdue.map((r) => ({ kind: "overdue" as const, row: r })),
  ];
  const doneCount = liveDay.filter((r) => r.status === "completed").length;
  const expected = liveDay
    .filter((r) => r.status !== "no_show")
    .reduce((s, r) => s + (r.price_cents ?? 0), 0);
  const currency = business?.currency ?? "EUR";

  return (
    <AppShell>
      <PageHeader
        title={greetingPt(new Date(now), lang)}
        action={
          business && data ? (
            <DayPill total={liveDay.length} done={doneCount} money={expected} currency={currency} />
          ) : undefined
        }
      />
      <p className="-mt-2 mb-5 text-sm font-medium text-muted-foreground first-letter:uppercase">
        {formatDateLong(new Date(now).toISOString(), tz)}
      </p>

      <TrialEnding />

      {isLoading || !business ? (
        <LoadingRows rows={4} />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
        <div className="animate-stagger mx-auto grid max-w-3xl grid-cols-1 gap-4 lg:max-w-none [&>*]:min-w-0">
          <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5 lg:space-y-0">
            <div className={cn("space-y-4 [&>*]:min-w-0", day.length === 0 && "lg:col-span-2")}>
              <FocusCard
                row={focus}
                current={!!current}
                now={now}
                tz={tz}
                hasDay={liveDay.length > 0}
                onOpen={openAppointment}
              />

              <NeedsYou items={needs} tz={tz} onOpen={openAppointment} />
            </div>

            {day.length > 0 && (
              <section className="surface p-0">
                <div className="flex items-center justify-between px-4 pt-4 pb-1">
                  <h2 className="text-sm font-bold">{t("today.list")}</h2>
                  <Link
                    to="/calendar"
                    className="inline-flex h-9 items-center gap-1 rounded-full px-2 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {t("today.seeCalendar")} <ArrowRight className="size-3.5" />
                  </Link>
                </div>
                <ul className="divide-y divide-border border-t border-border">
                  {day.map((r) => {
                    const past = endOf(r) <= now;
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => openAppointment(r.id)}
                          className={cn(
                            "flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40",
                            past && isLive(r.status) === false && "opacity-60",
                          )}
                        >
                          <span className="w-12 shrink-0 font-display text-sm font-bold tabular-nums">
                            {formatTime(r.starts_at, tz)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold">
                              {displayCustomerName(r.customer_name)}
                            </span>
                            <span className="block truncate text-xs font-normal text-muted-foreground">
                              {r.service_name}
                            </span>
                          </span>
                          <StatusBadge status={r.status} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

/** Shown only in the last 5 days of the free trial; closing it hides it until tomorrow. */
function TrialEnding() {
  const { t } = usePrefs();
  const { access } = useSubscription();
  const today = new Date().toISOString().slice(0, 10);
  const [closedOn, setClosedOn] = useState<string | null>(() => {
    try {
      return localStorage.getItem("sycras-trial-card-closed");
    } catch {
      return null;
    }
  });
  if (!access || access.state !== "trial" || access.trialDaysLeft > 5 || closedOn === today)
    return null;
  const close = () => {
    setClosedOn(today);
    try {
      localStorage.setItem("sycras-trial-card-closed", today);
    } catch {
      // Not remembered in private mode: it shows again next time.
    }
  };
  return (
    <div className="mx-auto mb-4 flex max-w-3xl items-center gap-3 rounded-2xl border border-brand/30 bg-brand/5 p-3.5 pl-4 lg:max-w-none">
      <Crown className="size-5 shrink-0 text-brand-ink" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">
          {access.trialDaysLeft <= 1
            ? t("trial.card.lastDay")
            : t("trial.card.title").replace("{n}", String(access.trialDaysLeft))}
        </p>
        <p className="text-xs text-muted-foreground">{t("trial.card.body")}</p>
      </div>
      <Button asChild size="sm">
        <Link to="/plans">{t("trial.card.cta")}</Link>
      </Button>
      <button
        type="button"
        onClick={close}
        aria-label={t("trial.card.close")}
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

/**
 * The day in one small pill next to the title: money (can be hidden) and how
 * many are done. Tapping it opens the statistics.
 */
function DayPill({
  total,
  done,
  money,
  currency,
}: {
  total: number;
  done: number;
  money: number;
  currency: string;
}) {
  const { t } = usePrefs();
  const [hidden, setHidden] = useMoneyHidden();
  const pct = total ? done / total : 0;
  const r = 6.5;
  const len = 2 * Math.PI * r;
  return (
    <div className="flex h-10 items-center rounded-full border border-border bg-card pl-1 pr-1 shadow-sm">
      <button
        type="button"
        onClick={() => setHidden(!hidden)}
        aria-label={hidden ? t("money.show") : t("money.hide")}
        title={hidden ? t("money.show") : t("money.hide")}
        className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
      <Link
        to="/analytics"
        aria-label={t("pf.s.analytics")}
        className="flex h-8 items-center gap-2 rounded-full pl-1 pr-2.5 transition-colors hover:bg-muted"
      >
        <span className="font-display text-sm font-bold tabular-nums">
          {hidden ? HIDDEN_MONEY : formatPrice(money, currency)}
        </span>
        <span aria-hidden className="h-4 w-px bg-border" />
        <svg viewBox="0 0 16 16" className="size-4 -rotate-90" aria-hidden>
          <circle cx="8" cy="8" r={r} fill="none" strokeWidth="2.5" className="stroke-muted" />
          <circle
            cx="8"
            cy="8"
            r={r}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            stroke="var(--brand)"
            strokeDasharray={len}
            strokeDashoffset={len * (1 - pct)}
            className="transition-[stroke-dashoffset] duration-700"
          />
        </svg>
        <span className="text-xs font-bold tabular-nums text-muted-foreground">
          {done}/{total}
        </span>
      </Link>
    </div>
  );
}

/** The one appointment that matters most right now. */
function FocusCard({
  row,
  current,
  now,
  tz,
  hasDay,
  onOpen,
}: {
  row: Row | undefined;
  current: boolean;
  now: number;
  tz: string;
  hasDay: boolean;
  onOpen: (id: string) => void;
}) {
  const { t } = usePrefs();
  if (!row) {
    return (
      <section className="surface flex items-center gap-4 p-5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand/12 dark:bg-brand/25 text-brand-ink">
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-lg font-bold leading-tight">
            {hasDay ? t("today.finished") : t("today.empty")}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {hasDay ? t("today.finishedBody") : t("today.emptyBody")}
          </p>
        </div>
      </section>
    );
  }
  const mins = Math.max(0, Math.round((new Date(row.starts_at).getTime() - now) / 60000));
  const when = current
    ? t("today.now")
    : mins < 60
      ? t("today.inMin").replace("{n}", String(mins))
      : t("today.inH")
          .replace("{h}", String(Math.floor(mins / 60)))
          .replace("{m}", mins % 60 ? String(mins % 60).padStart(2, "0") : "");
  return (
    <button
      type="button"
      onClick={() => onOpen(row.id)}
      // The day's hero, compact: flat app colour, time / who / what on one line.
      className="block w-full overflow-hidden rounded-[var(--radius-2xl)] bg-brand px-4 py-3.5 text-left text-brand-foreground transition-transform active:scale-[0.99]"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] opacity-80">
          {current ? t("today.now") : t("today.next")}
        </span>
        <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">{when}</span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <span className="font-display text-[28px] font-bold tabular-nums leading-none">
          {formatTime(row.starts_at, tz)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-bold leading-tight">
            {displayCustomerName(row.customer_name)}
          </span>
          <span className="block truncate text-[13px] opacity-85">
            {row.service_name}
            {row.ends_at ? ` · ${formatTime(row.ends_at, tz)}` : ""}
          </span>
        </span>
      </div>
    </button>
  );
}

/** Requests to answer and past appointments to close, each one tap away. */
function NeedsYou({
  items,
  tz,
  onOpen,
}: {
  items: { kind: "pending" | "overdue"; row: Row }[];
  tz: string;
  onOpen: (id: string) => void;
}) {
  const { t } = usePrefs();
  const qc = useQueryClient();
  const { business } = useMyBusiness();
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(id: string, status: Row["status"]) {
    if (!business || busy) return;
    setBusy(id + status);
    const res = await setAppointmentStatus({ id, businessId: business.id, status });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    if (!res.emailed) toast.success(t("acts.toast.updated"));
    void invalidateAppointmentData(qc);
  }

  if (items.length === 0) {
    return (
      <section className="flex items-center gap-3 rounded-[var(--radius-xl)] border border-dashed border-border px-4 py-3.5">
        <Check className="size-4 shrink-0 text-muted-foreground" strokeWidth={3} />
        <p className="min-w-0 text-sm">
          <span className="font-bold">{t("today.allClear")}</span>{" "}
          <span className="text-muted-foreground">{t("today.allClearBody")}</span>
        </p>
      </section>
    );
  }

  return (
    <section className="surface p-0">
      <h2 className="flex items-center gap-2 px-4 pt-4 text-sm font-bold">
        <BellRing className="size-4" /> {t("today.needs")}
        <span className="rounded-full bg-brand px-2 py-px text-[11px] font-bold text-brand-foreground">
          {items.length}
        </span>
      </h2>
      <ul className="mt-2 divide-y divide-border">
        {items.map(({ kind, row }) => (
          <li key={kind + row.id} className="flex items-center gap-3 px-4 py-3">
            <button
              type="button"
              onClick={() => onOpen(row.id)}
              className="min-w-0 flex-1 overflow-hidden text-left"
            >
              <span className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {kind === "pending" ? t("today.pending") : t("today.overdue")}
              </span>
              <span className="block truncate text-sm font-bold">
                {displayCustomerName(row.customer_name)}
              </span>
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {formatDateLong(row.starts_at, tz)} · {formatTime(row.starts_at, tz)} ·{" "}
                {row.service_name}
              </span>
            </button>
            {kind === "pending" ? (
              <Button
                size="sm"
                onClick={() => void decide(row.id, "confirmed")}
                disabled={!!busy}
                className="h-10"
              >
                {busy === row.id + "confirmed" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Check strokeWidth={3} />
                )}
                {t("acts.confirm")}
              </Button>
            ) : (
              <div className="flex shrink-0 gap-1.5">
                <Button
                  size="icon"
                  aria-label={t("sheet.done")}
                  title={t("sheet.done")}
                  onClick={() => void decide(row.id, "completed")}
                  disabled={!!busy}
                  className="size-10"
                >
                  {busy === row.id + "completed" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Check strokeWidth={3} />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label={t("sheet.noShow")}
                  title={t("sheet.noShow")}
                  onClick={() => void decide(row.id, "no_show")}
                  disabled={!!busy}
                  className="size-10"
                >
                  <UserX />
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
