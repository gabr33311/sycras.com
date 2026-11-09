import { usePrefs } from "@/lib/prefs";
import { localeOf } from "@/lib/prefs-types";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  getBookingByToken,
  cancelBookingByToken,
  rescheduleBookingByToken,
  getRescheduleSlots,
} from "@/lib/booking.functions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FormError } from "@/components/ui-bits";
import { AppointmentStatusIndicator } from "@/components/appointment-status-indicator";
import { formatDateLong, formatPrice, formatTime } from "@/lib/format";
import { addDays, todayIn, weekdayOf } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useBrandColor } from "@/lib/brand";
import { mapsUrl } from "@/lib/maps";
import { CalendarClock, Check, Loader2, MapPin, Phone } from "lucide-react";
import { AddToCalendar } from "@/components/add-to-calendar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/booking/$token")({
  loader: async ({ params }) => {
    // Malformed links are simply unknown bookings, not server errors.
    if (params.token.trim().length !== 48) throw notFound();
    const data = await getBookingByToken({ data: { token: params.token } });
    if (!data) throw notFound();
    return data;
  },
  head: () => ({
    meta: [
      { title: "A minha marcação" },
      { name: "description", content: "Consulta, reagenda ou cancela a tua marcação." },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: () => <MessageT titleKey="bk.tk.errorTitle" bodyKey="bk.tk.errorBody" />,
  notFoundComponent: () => <MessageT titleKey="bk.tk.invalidTitle" bodyKey="bk.tk.invalidBody" />,
  component: BookingPage,
});

function Message({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      </div>
    </main>
  );
}

function MessageT({ titleKey, bodyKey }: { titleKey: string; bodyKey: string }) {
  const { t } = usePrefs();
  return <Message title={t(titleKey)} body={t(bodyKey)} />;
}

function BookingPage() {
  const { t, lang } = usePrefs();
  const { token } = Route.useParams();
  const initial = Route.useLoaderData();
  useBrandColor(initial.business?.brand_color);
  const [data, setData] = useState(initial);
  const [rescheduling, setRescheduling] = useState(false);
  const tz0 = initial.business?.timezone ?? "Europe/Lisbon";
  const [date, setDate] = useState(todayIn(tz0));
  const [pickedTime, setPickedTime] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable ref callback: runs once when the reschedule picker mounts.
  const revealOnMount = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, []);

  const appt = data.appointment;
  const tz = data.business?.timezone ?? "Europe/Lisbon";

  const {
    data: slots,
    isFetching,
    isError: slotsError,
    refetch,
  } = useQuery({
    queryKey: ["reschedule-slots", appt.id, appt.starts_at, date],
    enabled: rescheduling && !!appt.service_id,
    retry: 1,
    queryFn: async () => await getRescheduleSlots({ data: { token, date } }),
  });

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const res = await cancelBookingByToken({ data: { token } });
      if (!res.ok) {
        setConfirmCancel(false);
        setError(res.message);
        return;
      }
      setConfirmCancel(false);
      setRescheduling(false);
      setData({ ...data, appointment: { ...appt, status: "cancelled" } });
      toast.success(
        "refundedCents" in res && res.refundedCents
          ? `${t("bk.tk.cancelled")} ${t("bk.tk.refunded")}`
          : t("bk.tk.cancelled"),
      );
    } catch {
      setConfirmCancel(false);
      setError(t("bk.tk.err.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function reschedule() {
    if (!pickedTime) return;
    setBusy(true);
    setError(null);
    try {
      const res = await rescheduleBookingByToken({ data: { token, date, time: pickedTime } });
      if (!res.ok) {
        setError(res.message);
        setPickedTime(null);
        void refetch();
        return;
      }
      const fresh = await getBookingByToken({ data: { token } });
      if (fresh) setData(fresh);
      setRescheduling(false);
      setPickedTime(null);
      toast.success(t("bk.tk.rescheduled"));
    } catch {
      setError(t("bk.tk.err.generic"));
    } finally {
      setBusy(false);
    }
  }

  function toggleRescheduling() {
    setError(null);
    setPickedTime(null);
    if (!rescheduling) {
      // Start on the current booking's day when it is within the visible range.
      const current = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(
        new Date(appt.starts_at),
      );
      const inRange = current >= todayIn(tz) && current <= addDays(todayIn(tz), 13);
      const firstOpen = days.find((d) => !isClosed(d)) ?? todayIn(tz);
      setDate(inRange && !isClosed(current) ? current : firstOpen);
    }
    setRescheduling((v) => !v);
  }

  const cancelled = appt.status === "cancelled";
  // Only upcoming (pending/confirmed) bookings can still be changed by the client.
  const manageable = appt.status === "pending" || appt.status === "confirmed";
  const days = Array.from({ length: 14 }, (_, i) => addDays(todayIn(tz), i));
  const openWeekdays = data.openWeekdays ?? [];
  const isClosed = (d: string) => openWeekdays.length > 0 && !openWeekdays.includes(weekdayOf(d));
  // Past the online-change window: say so up front instead of failing after a tap.
  const cancellationHours = data.business?.cancellation_hours ?? 24;
  const tooLate = new Date(appt.starts_at).getTime() - Date.now() < cancellationHours * 3600000;
  const locale = localeOf(lang);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(t("bk.done.copied"));
    } catch {
      // Clipboard blocked (old browser / insecure context): the URL bar still has the link.
    }
  }

  const slug = data.business?.slug;
  const pending = appt.status === "pending";

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 py-10 sm:py-16">
      {manageable ? (
        // Final state first: the client is done, everything below is optional.
        <header className="animate-enter text-center">
          <span className="animate-icon-pop mx-auto flex size-16 items-center justify-center rounded-full bg-brand text-brand-foreground">
            <Check className="size-8" strokeWidth={3} />
          </span>
          <h1 className="mt-5 text-2xl font-bold tracking-tight">
            {t(pending ? "bk.pending.title" : "bk.confirmed.title")}
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            {t(pending ? "bk.done.pending.body" : "bk.done.confirmed.body")}
          </p>
        </header>
      ) : (
        <header>
          <p className="text-sm text-muted-foreground">{data.business?.name}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("bk.tk.title")}</h1>
        </header>
      )}

      <div data-status={appt.status} className="appointment-state surface mt-8 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {manageable && data.business?.name && (
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {data.business.name}
              </p>
            )}
            <p className="text-base font-bold">{appt.service_name}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDateLong(appt.starts_at, tz)}
              {t("bk.tk.at")}
              {formatTime(appt.starts_at, tz)}
            </p>
            {data.staffName && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {t("bk.tk.with")}
                {data.staffName}
              </p>
            )}
          </div>
          <AppointmentStatusIndicator status={appt.status} />
        </div>
        <p className="mt-4 text-sm font-semibold tabular-nums">{formatPrice(appt.price_cents)}</p>
        {data.business && (data.business.address || data.business.phone) && (
          <div className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm text-muted-foreground">
            {data.business.address && (
              // Opens the exact shop location in Google Maps.
              <a
                href={
                  mapsUrl({
                    ...data.business,
                    address: [data.business.address, data.business.city].filter(Boolean).join(", "),
                  }) ?? undefined
                }
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 underline-offset-4 hover:text-foreground hover:underline"
              >
                <MapPin className="size-4 shrink-0" /> {data.business.address}
                {data.business.city ? `, ${data.business.city}` : ""}
              </a>
            )}
            {data.business.phone && (
              <a href={`tel:${data.business.phone}`} className="flex items-center gap-2">
                <Phone className="size-4 shrink-0" /> {data.business.phone}
              </a>
            )}
          </div>
        )}
      </div>

      {manageable && (
        <div className="mt-3 flex justify-center">
          <AddToCalendar
            subtle
            event={{
              title: `${appt.service_name} · ${data.business?.name ?? ""}`,
              description: appt.service_name,
              location: [data.business?.address, data.business?.city].filter(Boolean).join(", "),
              startIso: appt.starts_at,
              endIso: appt.ends_at ?? appt.starts_at,
            }}
          />
        </div>
      )}

      {slug && (
        <Button asChild size="lg" variant="brand" className="mt-6 w-full">
          <Link to="/$slug" params={{ slug }}>
            {t(manageable ? "bk.done.finish" : cancelled ? "bk.tk.bookAgain" : "bk.done.back")}
          </Link>
        </Button>
      )}

      {!rescheduling && <FormError message={error} className="mt-4" />}

      {manageable && (
        // Optional, later actions: quiet text links so they never read as a next step.
        <section className="mt-auto pt-12 text-center">
          <p className="text-sm font-bold">{t("bk.done.later.title")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("bk.done.later.body")}{" "}
            <button
              type="button"
              onClick={() => void copyLink()}
              className="inline-flex min-h-11 items-center font-bold text-foreground underline underline-offset-2"
            >
              {t("bk.done.copy")}
            </button>
          </p>
          {tooLate ? (
            <div className="mx-auto mt-3 max-w-xs">
              <p className="text-sm text-muted-foreground">
                {t("bk.tk.tooLate").replace("{h}", String(cancellationHours))}
              </p>
              {data.business?.phone && (
                <a
                  href={`tel:${data.business.phone}`}
                  className="mt-3 inline-flex h-11 items-center gap-2 rounded-full border border-border px-5 text-sm font-bold transition-colors hover:bg-accent"
                >
                  <Phone className="size-4" /> {data.business.phone}
                </a>
              )}
            </div>
          ) : (
            <>
              <div className="mt-3 flex items-center justify-center gap-1 text-sm">
                <button
                  type="button"
                  onClick={toggleRescheduling}
                  disabled={busy}
                  className="inline-flex h-11 items-center gap-1.5 rounded-full px-4 font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
                >
                  <CalendarClock className="size-4" />
                  {rescheduling ? t("bk.tk.close") : t("bk.tk.reschedule")}
                </button>
                <span aria-hidden className="text-border">
                  ·
                </span>
                <button
                  type="button"
                  onClick={() => setConfirmCancel(true)}
                  disabled={busy}
                  className="h-11 rounded-full px-4 font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
                >
                  {t("bk.tk.cancel")}
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("bk.tk.policy1")}
                {cancellationHours}
                {t("bk.tk.policy2")}
              </p>
            </>
          )}
        </section>
      )}

      {rescheduling && manageable && (
        <section
          // The picker opens below the fold on phones: bring it into view.
          ref={revealOnMount}
          className="mt-6 animate-enter scroll-mt-6"
        >
          <p className="mb-2 text-sm font-bold">{t("bk.tk.pickNew")}</p>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
            {days.map((d) => (
              <button
                key={d}
                type="button"
                disabled={isClosed(d)}
                aria-pressed={date === d}
                onClick={() => {
                  setDate(d);
                  setPickedTime(null);
                }}
                className={cn(
                  "flex w-16 shrink-0 flex-col items-center rounded-xl border border-border px-2 py-2.5 text-sm transition-colors",
                  date === d ? "border-brand bg-brand text-brand-foreground" : "hover:bg-accent",
                  isClosed(d) &&
                    "cursor-not-allowed text-muted-foreground/50 line-through hover:bg-transparent",
                )}
              >
                <span className="text-xs uppercase">
                  {new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
                    new Date(`${d}T12:00:00Z`),
                  )}
                </span>
                <span className="text-base font-semibold tabular-nums">
                  {new Intl.DateTimeFormat(locale, { day: "2-digit", timeZone: "UTC" }).format(
                    new Date(`${d}T12:00:00Z`),
                  )}
                </span>
              </button>
            ))}
          </div>
          <div className="animate-stagger mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {isFetching
              ? Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-[46px] rounded-xl" />
                ))
              : (slots ?? []).map((s) => (
                  <button
                    key={s.time}
                    type="button"
                    disabled={busy}
                    onClick={() => setPickedTime(s.time)}
                    className={cn(
                      "rounded-[12px] border py-3 text-sm font-bold tabular-nums transition-colors",
                      pickedTime === s.time
                        ? "border-brand bg-brand text-brand-foreground"
                        : "border-border hover:bg-accent",
                    )}
                  >
                    {s.time}
                  </button>
                ))}
          </div>
          {!isFetching && slotsError && (
            <div className="mt-4 flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">{t("bk.err.slots")}</span>
              <button type="button" onClick={() => void refetch()} className="font-bold underline">
                {t("bk.retry")}
              </button>
            </div>
          )}
          {!isFetching && !slotsError && (slots?.length ?? 0) === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">{t("bk.tk.noSlots")}</p>
          )}
          <FormError message={error} className="mt-4" />
          {pickedTime && (
            <Button
              className="mt-4 w-full"
              size="lg"
              variant="brand"
              onClick={() => void reschedule()}
              disabled={busy}
            >
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              {t("bk.tk.confirmMove")
                .replace("{date}", formatDateLong(`${date}T12:00:00Z`, tz))
                .replace("{time}", pickedTime)}
            </Button>
          )}
        </section>
      )}

      <AlertDialog open={confirmCancel} onOpenChange={(o) => !busy && setConfirmCancel(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("bk.tk.cancelTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {appt.service_name} · {formatDateLong(appt.starts_at, tz)} ·{" "}
              {formatTime(appt.starts_at, tz)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("bk.tk.keep")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void cancel();
              }}
            >
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              {t("bk.tk.cancelYes")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
