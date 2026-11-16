import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { computeDeposit } from "@/lib/deposit";
import { Captcha, CAPTCHA_ON } from "@/components/captcha";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { usePrefs } from "@/lib/prefs";
import { localeOf } from "@/lib/prefs-types";
import {
  getPublicBusiness,
  getAvailableSlots,
  createPublicBooking,
  isPagePaused,
} from "@/lib/booking.functions";
import { trackPageView } from "@/lib/analytics.functions";
import { maskPhonePt } from "@/lib/phone";
import { isReservedSlug } from "@/lib/reserved-slugs";
import { LegalLinks } from "@/components/legal-page";

import { Button } from "@/components/ui/button";
import { SycrasLogo } from "@/components/sycras-logo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { FieldError, FormError } from "@/components/ui-bits";
import { currentLocale, formatDuration, formatPrice, formatDateLong, initials } from "@/lib/format";
import { addDays, addMonthsClamped, todayIn, zonedToUtc, weekdayOf } from "@/lib/time";
import { BRAND_ICONS } from "@/lib/brand-icons";
import { cn } from "@/lib/utils";
import { useBrandColor } from "@/lib/brand";
import { mapsUrl } from "@/lib/maps";
import { TILE_SIZE, tileGrid, SATELLITE_TILE_URL } from "@/lib/map-tiles";
import {
  ArrowLeft,
  CalendarDays,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  Clock,
  Globe,
  Link as LinkIcon,
  Loader2,
  Star,
  MapPin,
  Sparkles,
  Navigation,
  Phone,
  Users,
  X,
} from "lucide-react";

export const Route = createFileRoute("/$slug")({
  loader: async ({ params }) => {
    if (isReservedSlug(params.slug)) throw notFound();
    const data = await getPublicBusiness({ data: { slug: params.slug } });
    if (!data) {
      // Paused by the owner: say it is temporary, not that the page does not exist.
      const paused = await isPagePaused({ data: { slug: params.slug } }).catch(() => false);
      throw notFound(paused ? { data: { paused: true } } : undefined);
    }
    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Página não encontrada" }, { name: "robots", content: "noindex" }] };
    }
    const b = loaderData.business;
    const title = `Marcar em ${b.name}${b.city ? ` · ${b.city}` : ""}`;
    const description =
      b.description?.slice(0, 155) ??
      `Escolhe o serviço e o horário e marca online em ${b.name}. Confirmação imediata.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        // The banner (or logo) shows in WhatsApp / Instagram link previews.
        ...(b.logo_url
          ? [
              { property: "og:image", content: b.logo_url },
              { name: "twitter:card", content: "summary" },
            ]
          : [{ name: "twitter:card", content: "summary" }]),
        ...(b.seo_indexable ? [] : [{ name: "robots", content: "noindex" }]),
      ],
    };
  },
  pendingComponent: PageSkeleton,
  pendingMs: 0,
  errorComponent: () => <ErrorMessage />,
  notFoundComponent: ({ data }) => (
    <NotFoundMessage paused={(data as { paused?: boolean } | undefined)?.paused === true} />
  ),
  component: BookPage,
});

/** While the page loads: its shape, in grey (never a blank screen). */
function PageSkeleton() {
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-5 pt-6">
      <div className="flex items-center gap-4">
        <Skeleton className="size-[60px] rounded-2xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-2/3 rounded-lg" />
          <Skeleton className="h-4 w-1/2 rounded-lg" />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="size-12 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-4 h-36 w-full rounded-2xl" />
      <Skeleton className="mt-4 h-20 w-full rounded-2xl" />
      <div className="mt-6 space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-2xl" />
        ))}
      </div>
    </main>
  );
}

function CenteredMessage({ title, body }: { title: string; body: string }) {
  const { t } = usePrefs();
  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-center">
      <div className="animate-enter max-w-sm">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand">
          <SycrasLogo className="size-7" onColor />
        </span>
        <h1 className="mt-6 font-display text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">{body}</p>
        <Button asChild className="mt-6">
          <Link to="/">{t("bk.backHome")}</Link>
        </Button>
      </div>
    </main>
  );
}

function ErrorMessage() {
  const { t } = usePrefs();
  return <CenteredMessage title={t("bk.error.title")} body={t("bk.error.body")} />;
}

function NotFoundMessage({ paused = false }: { paused?: boolean }) {
  const { t } = usePrefs();
  return paused ? (
    <CenteredMessage title={t("bk.paused.title")} body={t("bk.paused.body")} />
  ) : (
    <CenteredMessage title={t("bk.notFound.title")} body={t("bk.notFound.body")} />
  );
}

function makeFormSchema(t: (key: string) => string) {
  const nameError = t("bk.validation.name");
  const phoneError = t("bk.validation.phone");
  const emailError = t("bk.validation.email");
  return z.object({
    name: z.string().trim().min(2, nameError).max(80),
    phone: z
      .string()
      .trim()
      .min(6, phoneError)
      .max(24)
      .regex(/^[0-9+\s()-]+$/, phoneError),
    email: z.string().trim().min(1, emailError).email(emailError).max(160),
    notes: z.string().trim().max(500),
  });
}

function BookPage() {
  const { t, lang } = usePrefs();
  const { business, services, staff, openWeekdays, blocks, bookable } = Route.useLoaderData();
  // The page wears the business's own colour.
  useBrandColor(business.brand_color);
  // A day is closed if it is a weekly day off or fully covered by a business-wide block (vacation).
  const isClosedDay = (d: string) => {
    if (!openWeekdays.includes(weekdayOf(d))) return true;
    const start = zonedToUtc(d, 0, business.timezone).getTime();
    const end = zonedToUtc(d, 24 * 60, business.timezone).getTime();
    return blocks.some(
      (b) => new Date(b.from).getTime() <= start + 60000 && new Date(b.to).getTime() >= end - 60000,
    );
  };
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(staff.length === 1 ? staff[0]!.id : null);
  const today = todayIn(business.timezone);
  const [date, setDate] = useState(today);
  // Nothing is highlighted in the calendar until the client actually picks a day.
  const [dayPicked, setDayPicked] = useState(false);
  const slotsRef = useRef<HTMLDivElement | null>(null);
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [time, setTime] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  // The client's consent to get the confirmation and reminder on WhatsApp.
  const [whatsapp, setWhatsapp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  // Field errors shown under each input, so the client sees exactly what to fix.
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<"name" | "phone" | "email", string | undefined>>
  >({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  // The business asks for a code: true once it was emailed, then the client types it.
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  // One-use captcha token (Turnstile); a new one after each try.
  // The invisible check makes a new one after each try; the button waits for it (a fast
  // second tap used to go without one and failed with "confirma que não és um robô").
  const captchaRef = useRef<string | null>(null);
  const captchaWaiters = useRef<((token: string | null) => void)[]>([]);
  const [captchaKey, setCaptchaKey] = useState(0);
  const onCaptcha = useCallback((token: string | null) => {
    captchaRef.current = token;
    if (token) for (const done of captchaWaiters.current.splice(0)) done(token);
  }, []);
  /** The current token, or the next one (up to 12 s; null if none comes). */
  function freshCaptcha(): Promise<string | null> {
    if (captchaRef.current) return Promise.resolve(captchaRef.current);
    return new Promise((resolve) => {
      const done = (token: string | null) => {
        clearTimeout(timer);
        resolve(token);
      };
      const timer = setTimeout(() => {
        captchaWaiters.current = captchaWaiters.current.filter((d) => d !== done);
        resolve(null);
      }, 12_000);
      captchaWaiters.current.push(done);
    });
  }

  const stepKeys = useMemo<readonly string[]>(
    () =>
      staff.length > 1 ? ["staff", "service", "when", "account"] : ["service", "when", "account"],
    [staff.length],
  );
  const safeIdx = Math.min(stepIdx, stepKeys.length - 1);
  const currentStep = stepKeys[safeIdx]!;
  const stepNumber = safeIdx + 1;
  const goNext = () => setStepIdx((i) => Math.min(i + 1, stepKeys.length - 1));
  const goBack = () => setStepIdx((i) => Math.max(i - 1, 0));
  const goTo = (key: string) => {
    const i = stepKeys.indexOf(key);
    if (i >= 0) setStepIdx(i);
  };

  const service = services.find((s) => s.id === serviceId) ?? null;
  const visibleServices = useMemo(() => {
    const person = staffId ? staff.find((p) => p.id === staffId) : null;
    if (!person) return services;
    // Same rule as the server: a service nobody is linked to can be done by anyone.
    const linked = new Set(staff.flatMap((p) => p.service_ids));
    return services.filter((s) => person.service_ids.includes(s.id) || !linked.has(s.id));
  }, [services, staff, staffId]);

  const monthDays = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const first = new Date(Date.UTC(y!, m! - 1, 1));
    const daysInMonth = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
    const lead = (first.getUTCDay() + 6) % 7; // Monday-first grid
    const cells: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${month}-${String(d).padStart(2, "0")}`);
    }
    return cells;
  }, [month]);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const label = new Intl.DateTimeFormat(localeOf(lang), {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(y!, m! - 1, 1)));
    return label.charAt(0).toUpperCase() + label.slice(1);
  }, [month, lang]);

  // Farthest date a client may book (admin-configurable, in months).
  const maxDate = useMemo(
    () => addMonthsClamped(today, business.booking_horizon_months ?? 2),
    [today, business.booking_horizon_months],
  );

  function shiftMonth(delta: number) {
    const [y, m] = month.split("-").map(Number);
    const next = new Date(Date.UTC(y!, m! - 1 + delta, 1));
    setMonth(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  const {
    data: slots,
    isFetching,
    isError: slotsError,
    refetch: refetchSlots,
  } = useQuery({
    queryKey: ["slots", business.id, serviceId, staffId, date],
    enabled: !!serviceId && dayPicked,
    retry: 1,
    queryFn: async () => {
      try {
        return await getAvailableSlots({
          data: { businessId: business.id, serviceId: serviceId!, staffId, date },
        });
      } catch (e) {
        console.error("[slots] failed to load availability", e);
        throw e;
      }
    },
  });

  // One view per browser session (refreshes don't count again).
  useEffect(() => {
    let sid = sessionStorage.getItem("sycras-sid");
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem("sycras-sid", sid);
    }
    const key = `sycras-view-${business.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    void trackPageView({ data: { businessId: business.id, sessionId: sid } }).catch(() => {});
  }, [business.id]);

  async function submit(opts: { resend?: boolean; retried?: boolean } = {}): Promise<void> {
    const parsed = makeFormSchema(t).safeParse({ name, phone, email, notes });
    if (!parsed.success) {
      const errs: typeof fieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof typeof fieldErrors;
        if (key && !errs[key]) errs[key] = issue.message;
      }
      setFieldErrors(errs);
      setSubmitError(null);
      const first = (["name", "email", "phone"] as const).find((k) => errs[k]);
      const ids = { name: "n", email: "em", phone: "p" } as const;
      if (first) document.getElementById(ids[first])?.focus();
      return;
    }
    if (!serviceId || !time) return;
    const withCode = codeSent && !opts.resend;
    if (withCode && !/^\d{6}$/.test(code)) {
      setSubmitError(t("bk.code.invalid"));
      document.getElementById("code")?.focus();
      return;
    }
    setFieldErrors({});
    setSubmitError(null);
    setBusy(true);
    try {
      const captchaToken = withCode || !CAPTCHA_ON ? null : await freshCaptcha();
      const res = await createPublicBooking({
        data: {
          businessId: business.id,
          serviceId,
          staffId,
          date,
          time,
          name: parsed.data.name,
          phone: parsed.data.phone,
          email: parsed.data.email,
          notes: parsed.data.notes,
          ...(business.whatsapp && whatsapp ? { whatsapp: true } : {}),
          ...(withCode ? { code } : {}),
          ...(captchaToken ? { captchaToken } : {}),
        },
      });
      if (!withCode) {
        // Used: the check makes a new one for the next try.
        captchaRef.current = null;
        setCaptchaKey((k) => k + 1);
      }
      if (!res.ok) {
        if (res.code === "needs_code") {
          if (opts.resend) toast.success(t("bk.code.resent"));
          setCodeSent(true);
          setCode("");
          setTimeout(() => document.getElementById("code")?.focus(), 50);
          return;
        }
        if (res.code === "needs_payment" && "url" in res) {
          // To Stripe's payment page; the booking is made when the client comes back paid.
          window.location.href = res.url;
          return;
        }
        if (res.code === "payment_error") {
          setSubmitError(t("bk.err.payment"));
          return;
        }
        if (res.code === "captcha") {
          // Once more by itself with a fresh check before bothering the client.
          if (!opts.retried) return await submit({ ...opts, retried: true });
          setSubmitError(t("auth.err.captcha"));
          return;
        }
        if (res.code === "slot_taken") {
          // Someone took that time meanwhile: send the client straight back to pick another.
          toast.error(t("bk.err.slotTaken"));
          setTime(null);
          goTo("when");
          void refetchSlots();
          return;
        }
        setSubmitError(res.message);
        return;
      }
      // Straight to the final page: the form keeps its busy state until it loads, so there is no in-between screen.
      await navigate({ to: "/booking/$token", params: { token: res.token }, replace: true });
    } catch (e) {
      console.error("[booking] failed", e);
      const msg = e instanceof Error ? e.message : "";
      setSubmitError(
        msg.includes("SUPABASE_SERVICE_ROLE_KEY") || msg.includes("Missing Supabase")
          ? t("bk.err.server")
          : t("bk.toast.bookingFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  // Plan locked: show who the business is and how to reach them, but no booking flow.
  if (!bookable) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-5 pt-10 pb-10">
        <BusinessHero
          business={business}
          coverClass="-mx-5 -mt-10 sm:mx-0 sm:mt-0 sm:rounded-2xl"
        />
        <section className="surface mt-8 flex flex-col items-center gap-2 p-8 text-center">
          <CalendarX className="size-6 text-muted-foreground" />
          <p className="text-base font-bold">{t("bk.unavailable.title")}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{t("bk.unavailable.body")}</p>
        </section>
      </main>
    );
  }

  return (
    <main
      className={cn(
        // Phones: one column. Desktop: the business stays on the left, the steps on the right.
        "mx-auto min-h-dvh max-w-2xl px-5 pt-6 lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start lg:gap-12 lg:px-8 lg:pt-12 lg:pb-12 xl:max-w-7xl xl:grid-cols-[minmax(0,27rem)_minmax(0,1fr)] xl:gap-16 xl:px-10",
        // Leave room so the fixed confirm bar never hides the last fields.
        currentStep === "account" ? "pb-48" : "pb-6",
      )}
    >
      <aside className="hidden lg:sticky lg:top-12 lg:block">
        <div className="surface overflow-hidden p-6">
          <BusinessHero business={business} onCard coverClass="-mx-6 -mt-6" />
        </div>
        <p className="mt-4 px-1 text-xs text-muted-foreground">
          {t("bk.freeCancellation")}
          {business.cancellation_hours}
          {t("bk.freeCancellationAfter")}
        </p>
        <LegalLinks className="mt-2 block px-1 text-xs text-muted-foreground" />
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* The example page from the homepage: say so, and offer the real thing. */}
        {business.is_demo && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-muted/60 px-3 py-2.5 text-xs font-semibold">
            <Sparkles className="size-3.5 shrink-0 text-brand-ink" />
            <span className="min-w-0 flex-1">{t("bk.demo.banner")}</span>
            <Link
              to="/auth"
              search={{ mode: "register", next: undefined }}
              className="shrink-0 font-bold text-brand-ink hover:underline"
            >
              {t("bk.demo.cta")}
            </Link>
          </div>
        )}
        {safeIdx === 0 ? (
          <div className="lg:hidden">
            <BusinessHero
              business={business}
              coverClass="-mx-5 -mt-6 sm:mx-0 sm:mt-0 sm:rounded-2xl"
            />
          </div>
        ) : (
          <header className="flex items-center gap-3 lg:hidden">
            <BusinessLogo business={business} className="size-10 rounded-xl text-sm" />
            <p className="min-w-0 flex-1 truncate font-display text-base font-bold leading-tight tracking-tight">
              {business.name}
            </p>
            {business.show_contacts && business.phone && (
              <a
                href={`tel:${business.phone}`}
                aria-label={business.phone}
                className="-mr-2 flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Phone className="size-4" />
              </a>
            )}
          </header>
        )}

        {safeIdx === 0 &&
          bookable &&
          (staff.length <= 1 || staffId) &&
          visibleServices.length > 0 && (
            <NextFree
              businessId={business.id}
              serviceId={visibleServices[0]!.id}
              staffId={staffId}
              timezone={business.timezone}
              today={today}
              isClosedDay={isClosedDay}
              onPick={(d, t) => {
                setServiceId(visibleServices[0]!.id);
                setDate(d);
                setMonth(d.slice(0, 7));
                setDayPicked(true);
                setTime(t);
                goTo("account");
              }}
            />
          )}

        {/* Where the client is in the flow, at a glance. */}
        <div
          className="mt-4 flex gap-1.5 lg:mt-2"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={stepKeys.length}
          aria-valuenow={stepNumber}
          aria-label={`${stepNumber}/${stepKeys.length}`}
        >
          {stepKeys.map((k, i) => (
            <span
              key={k}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-300",
                i <= safeIdx ? "bg-brand" : "bg-border",
              )}
            />
          ))}
        </div>

        {safeIdx > 0 && (
          <div className="-mx-5 mt-4 flex items-center gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            <button
              type="button"
              onClick={goBack}
              aria-label={t("bk.back")}
              className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted"
            >
              <ArrowLeft className="size-4" />
            </button>
            {/* What's chosen so far; tapping a choice jumps straight back to change it. */}
            {staffId && staff.length > 1 && safeIdx > stepKeys.indexOf("staff") && (
              <SummaryChip onClick={() => goTo("staff")}>
                {staff.find((p) => p.id === staffId)?.name}
              </SummaryChip>
            )}
            {service && safeIdx > stepKeys.indexOf("service") && (
              <SummaryChip onClick={() => goTo("service")}>{service.name}</SummaryChip>
            )}
            {/* Day and time in one short chip, so the row fits on a phone. */}
            {dayPicked && safeIdx > stepKeys.indexOf("when") && (
              <SummaryChip onClick={() => goTo("when")}>
                {new Intl.DateTimeFormat(currentLocale(), {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  timeZone: "UTC",
                }).format(new Date(`${date}T12:00:00Z`))}
                {time ? ` · ${time}` : ""}
              </SummaryChip>
            )}
          </div>
        )}

        <div key={currentStep} className="animate-enter flex flex-col py-4">
          {currentStep === "staff" && (
            <Section step={stepNumber} total={stepKeys.length} title={t("bk.step.staff")}>
              <div className="surface animate-stagger divide-y divide-border overflow-hidden p-0 lg:grid lg:grid-cols-2 lg:gap-3 lg:divide-y-0 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none">
                {staff.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setStaffId(p.id);
                      setServiceId(null);
                      setTime(null);
                      goNext();
                    }}
                    className={cn(
                      "flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:px-5 lg:shadow-[var(--shadow-soft)] lg:hover:bg-muted/40 lg:min-h-20",
                      staffId === p.id && "bg-muted/70",
                    )}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                      {initials(p.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold">{p.name}</span>
                      {p.specialty && (
                        <span className="block truncate text-xs font-normal text-muted-foreground">
                          {p.specialty}
                        </span>
                      )}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
                <button
                  onClick={() => {
                    setStaffId(null);
                    setServiceId(null);
                    setTime(null);
                    goNext();
                  }}
                  className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:px-5 lg:shadow-[var(--shadow-soft)] lg:hover:bg-muted/40 lg:min-h-20"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
                    <Users className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-bold">{t("bk.step.anyStaff")}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </div>
            </Section>
          )}

          {currentStep === "service" && (
            <Section step={stepNumber} total={stepKeys.length} title={t("bk.step.service")}>
              {visibleServices.length === 0 && (
                <div className="surface flex flex-col items-center gap-2 p-8 text-center">
                  <CalendarX className="size-5 text-muted-foreground" />
                  <p className="text-sm font-bold">{t("bk.noServices.title")}</p>
                  <p className="text-sm text-muted-foreground">{t("bk.noServices.body")}</p>
                  {business.show_contacts && business.phone && (
                    <a
                      href={`tel:${business.phone}`}
                      className="mt-1 inline-flex h-11 items-center gap-2 rounded-full border border-border px-5 text-sm font-bold transition-colors hover:bg-accent"
                    >
                      <Phone className="size-4" /> {business.phone}
                    </a>
                  )}
                </div>
              )}
              {visibleServices.length > 0 && (
                <div className="surface animate-stagger divide-y divide-border overflow-hidden p-0 lg:grid lg:grid-cols-2 lg:gap-3 lg:divide-y-0 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none">
                  {visibleServices.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setServiceId(s.id);
                        setTime(null);
                        goNext();
                      }}
                      className={cn(
                        "flex min-h-[4.5rem] w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-muted/50 lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:px-5 lg:shadow-[var(--shadow-soft)] lg:hover:bg-muted/40 lg:min-h-24 lg:py-4",
                        serviceId === s.id && "bg-muted/70",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-bold leading-snug">{s.name}</span>
                        {s.description && (
                          <span className="mt-0.5 line-clamp-2 block text-sm font-normal leading-snug text-muted-foreground">
                            {s.description}
                          </span>
                        )}
                        <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                          <Clock className="size-3.5" /> {formatDuration(s.duration_minutes)}
                        </span>
                        {business.deposit &&
                        computeDeposit(
                          s.price_cents,
                          business.deposit.mode,
                          business.deposit.value,
                        ) > 0 ? (
                          <span className="mt-1 block text-xs font-semibold text-muted-foreground">
                            {t("bk.deposit.before")}
                            {formatPrice(
                              computeDeposit(
                                s.price_cents,
                                business.deposit.mode,
                                business.deposit.value,
                              ),
                              business.currency,
                            )}
                            {t("bk.deposit.after")}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-[15px] font-bold tabular-nums">
                        {formatPrice(s.price_cents, business.currency)}
                      </span>
                      <ChevronRight className="-ml-2 size-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </Section>
          )}

          {currentStep === "when" && (
            <Section step={stepNumber} total={stepKeys.length} title={t("bk.step.dateTime")}>
              <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
                <div className="rounded-[12px] border border-border bg-card p-3 lg:sticky lg:top-6 lg:p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("bk.prevMonth")}
                      disabled={month <= today.slice(0, 7)}
                      onClick={() => shiftMonth(-1)}
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <span className="text-sm font-bold">{monthLabel}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("bk.nextMonth")}
                      disabled={month >= maxDate.slice(0, 7)}
                      onClick={() => shiftMonth(1)}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-muted-foreground">
                    {[
                      t("bk.weekday.mon"),
                      t("bk.weekday.tue"),
                      t("bk.weekday.wed"),
                      t("bk.weekday.thu"),
                      t("bk.weekday.fri"),
                      t("bk.weekday.sat"),
                      t("bk.weekday.sun"),
                    ].map((d) => (
                      <span key={d}>{d}</span>
                    ))}
                  </div>
                  <div className="mt-1 grid grid-cols-7 gap-1">
                    {monthDays.map((d, i) => {
                      if (!d) return <span key={`e${i}`} />;
                      const past = d < today || d > maxDate || isClosedDay(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          disabled={past}
                          aria-pressed={dayPicked && date === d}
                          aria-current={d === today ? "date" : undefined}
                          onClick={() => {
                            setDate(d);
                            setDayPicked(true);
                            setTime(null);
                            // Bring the free times for that day into view (on desktop they are already beside it).
                            if (window.matchMedia("(min-width: 1024px)").matches) return;
                            window.requestAnimationFrame(() =>
                              slotsRef.current?.scrollIntoView({
                                behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                                  .matches
                                  ? "auto"
                                  : "smooth",
                                block: "start",
                              }),
                            );
                          }}
                          className={cn(
                            "mx-auto flex aspect-square w-full max-w-11 items-center justify-center rounded-full text-sm font-bold tabular-nums transition-colors",
                            past && "cursor-not-allowed font-medium text-muted-foreground/40",
                            // Closed or gone days are struck through; today is never, it gets a dot.
                            past && d !== today && "line-through",
                            d === today &&
                              "relative after:absolute after:bottom-1 after:size-1 after:rounded-full after:bg-current",
                            !past && !(dayPicked && date === d) && "hover:bg-accent",
                            !past &&
                              d === today &&
                              !(dayPicked && date === d) &&
                              "ring-2 ring-inset ring-brand/60",
                            dayPicked && date === d && "bg-brand text-brand-foreground shadow-lift",
                          )}
                        >
                          {Number(d.slice(-2))}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {!dayPicked && (
                  <div className="hidden min-h-64 flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-border p-8 text-center text-sm text-muted-foreground lg:flex">
                    <CalendarDays className="size-5" />
                    {t("bk.pickDayHint")}
                  </div>
                )}
                {dayPicked && (
                  <div ref={slotsRef} className="mt-6 scroll-mt-4 lg:mt-0">
                    <h3 className="mb-3 text-base font-bold first-letter:uppercase">
                      {formatDateLong(`${date}T12:00:00Z`, business.timezone)}
                    </h3>
                    {isFetching ? (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-4">
                        {Array.from({ length: 8 }).map((_, i) => (
                          <Skeleton key={i} className="h-[46px] rounded-xl" />
                        ))}
                      </div>
                    ) : slotsError ? (
                      <div className="surface flex flex-col items-center gap-3 p-8 text-center">
                        <p className="text-sm font-bold">{t("bk.err.slots")}</p>
                        <button
                          type="button"
                          onClick={() => void refetchSlots()}
                          className="rounded-full border border-border px-4 py-2 text-sm font-bold hover:bg-accent"
                        >
                          {t("bk.retry")}
                        </button>
                      </div>
                    ) : (slots?.length ?? 0) === 0 ? (
                      <div className="surface flex flex-col items-center gap-2 p-8 text-center">
                        <CalendarDays className="size-5 text-muted-foreground" />
                        <p className="text-sm font-bold">{t("bk.noSlots.title")}</p>
                        <p className="text-sm text-muted-foreground">{t("bk.noSlots.body")}</p>
                        <button
                          type="button"
                          onClick={() => {
                            setDayPicked(false);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className="mt-1 rounded-full border border-border px-4 py-2 text-sm font-bold hover:bg-accent"
                        >
                          {t("bk.pickOtherDay")}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {(
                          [
                            [
                              t("bk.period.morning"),
                              slots!.filter((s) => Number(s.time.slice(0, 2)) < 13),
                            ],
                            [
                              t("bk.period.afternoon"),
                              slots!.filter((s) => Number(s.time.slice(0, 2)) >= 13),
                            ],
                          ] as const
                        ).map(([label, group]) =>
                          group.length === 0 ? null : (
                            <SlotGroup
                              key={label}
                              label={label}
                              times={group.map((s) => s.time)}
                              selected={time}
                              onSelect={(v) => {
                                setTime(v);
                                goNext();
                              }}
                            />
                          ),
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Section>
          )}

          {currentStep === "account" && (
            <Section step={stepNumber} total={stepKeys.length} title={t("bk.step.yourData")}>
              {
                <form
                  id="booking-form"
                  noValidate
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                  }}
                  className="space-y-2.5 lg:grid lg:grid-cols-2 lg:gap-x-4 lg:gap-y-3 lg:space-y-0"
                >
                  <div className="space-y-1">
                    <Label htmlFor="n" className="text-xs font-bold">
                      {t("bk.field.name")}
                    </Label>
                    <Input
                      id="n"
                      className="h-11"
                      autoComplete="name"
                      aria-invalid={!!fieldErrors.name}
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        setFieldErrors((f) => ({ ...f, name: undefined }));
                      }}
                      maxLength={80}
                    />
                    <FieldError message={fieldErrors.name} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="em" className="text-xs font-bold">
                      Email
                    </Label>
                    <Input
                      id="em"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      className="h-11"
                      aria-invalid={!!fieldErrors.email}
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setFieldErrors((f) => ({ ...f, email: undefined }));
                        // A new email needs a new code.
                        setCodeSent(false);
                      }}
                      maxLength={160}
                      placeholder="nome@email.com"
                    />
                    {fieldErrors.email ? (
                      <FieldError message={fieldErrors.email} />
                    ) : (
                      <p className="text-xs text-muted-foreground">{t("bk.field.emailHint")}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="p" className="text-xs font-bold">
                      {t("bk.field.phone")}
                    </Label>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-base text-muted-foreground md:text-sm">
                        +351
                      </span>
                      <Input
                        id="p"
                        className="h-11 pl-14"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        aria-invalid={!!fieldErrors.phone}
                        value={phone}
                        onChange={(e) => {
                          setPhone(maskPhonePt(e.target.value));
                          setFieldErrors((f) => ({ ...f, phone: undefined }));
                        }}
                        placeholder="912 345 678"
                      />
                    </div>
                    <FieldError message={fieldErrors.phone} />
                    {business.whatsapp && (
                      <label className="mt-1.5 flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-muted/40 p-3 text-sm">
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]"
                          checked={whatsapp}
                          onChange={(e) => setWhatsapp(e.target.checked)}
                        />
                        <span>
                          <span className="block font-semibold">{t("bk.wa.label")}</span>
                          <span className="block text-xs text-muted-foreground">
                            {t("bk.wa.hint")}
                          </span>
                        </span>
                      </label>
                    )}
                  </div>
                  <div className="space-y-1 lg:col-span-2">
                    <Label htmlFor="obs" className="text-xs font-bold">
                      {t("bk.field.notesOptional")}
                    </Label>
                    <Textarea
                      id="obs"
                      className="min-h-16"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      maxLength={500}
                    />
                  </div>
                  {codeSent && (
                    <div className="animate-enter space-y-1 rounded-xl border border-border bg-muted/40 p-3 lg:col-span-2">
                      <Label htmlFor="code" className="text-xs font-bold">
                        {t("bk.code.label")}
                      </Label>
                      <p className="text-xs text-muted-foreground">{t("bk.code.hint")}</p>
                      <Input
                        id="code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        className="h-12 text-center font-display text-xl tracking-[0.4em]"
                        value={code}
                        onChange={(e) => {
                          setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                          setSubmitError(null);
                        }}
                        maxLength={6}
                        placeholder="••••••"
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void submit({ resend: true })}
                        className="text-xs font-bold text-brand-ink hover:underline disabled:opacity-50"
                      >
                        {t("bk.code.resend")}
                      </button>
                    </div>
                  )}
                </form>
              }
            </Section>
          )}
        </div>

        {currentStep === "account" && service && time && (
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-5 pt-3 pb-[calc(0.75rem+var(--sab))] backdrop-blur lg:static lg:mt-2 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            <div className="mx-auto flex max-w-2xl flex-col gap-2.5 lg:mx-0 lg:max-w-none lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-4 lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:p-4">
              <div className="min-w-0 text-sm">
                <p className="truncate font-bold">
                  {service.name} · {time}
                </p>
                <p className="truncate text-muted-foreground">
                  {formatDateLong(`${date}T12:00:00Z`, business.timezone)}
                </p>
              </div>
              {!codeSent && (
                <div className="w-full lg:order-first">
                  <Captcha onToken={onCaptcha} resetKey={captchaKey} lang={lang} />
                </div>
              )}
              <FormError message={submitError} />
              <Button
                type="submit"
                form="booking-form"
                variant="brand"
                disabled={busy}
                size="lg"
                className="w-full lg:order-last lg:w-auto lg:min-w-64"
              >
                {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                {busy ? t("bk.booking") : codeSent ? t("bk.code.confirm") : t("bk.confirmBooking")}
              </Button>
            </div>
          </div>
        )}

        <p className="mt-4 text-center text-xs text-muted-foreground lg:hidden">
          {hoursSummary(business.hours, lang) ? `${hoursSummary(business.hours, lang)} · ` : ""}
          {t("bk.freeCancellation")}
          {business.cancellation_hours}
          {t("bk.freeCancellationAfter")}
        </p>
        <div className="mt-2 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            {t("bk.createMyPage")}
          </Link>
        </div>
      </div>
    </main>
  );
}

function Section({
  step,
  total,
  title,
  subtitle,
  children,
}: {
  step: number;
  total?: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      key={step}
      aria-label={total ? `${step}/${total}` : undefined}
      className="animate-enter mb-8"
    >
      <h2 className="font-display text-2xl font-bold tracking-tight lg:text-3xl">{title}</h2>
      {subtitle && <p className="mt-1 text-sm font-medium text-muted-foreground">{subtitle}</p>}
      <div className="mb-4" />
      {children}
    </section>
  );
}

type PublicBusiness = ReturnType<typeof Route.useLoaderData>["business"];

function BusinessLogo({ business, className }: { business: PublicBusiness; className?: string }) {
  const { t } = usePrefs();
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand font-bold text-brand-foreground",
        className,
      )}
    >
      {business.logo_url ? (
        <img
          src={business.logo_url}
          alt={t("bk.logoAlt") + business.name}
          className="size-full object-cover"
        />
      ) : (
        initials(business.name)
      )}
    </div>
  );
}

/** First impression of the business: who they are, where, and how to reach them. */
const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
type OpenHours = { weekday: number; start: string; end: string }[];

/** Now in the business's time zone: weekday (0 = Sunday) and "HH:MM". */
function nowIn(tz: string): { weekday: number; hm: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (k: string) => parts.find((x) => x.type === k)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { weekday, hm: `${get("hour").replace("24", "00")}:${get("minute")}` };
}

/** "Aberto · até 19:00", "Fechado · abre às 14:00" or "Fechado hoje · abre seg às 09:00". */
function openLine(hours: OpenHours, tz: string): { open: boolean; text: string } | null {
  if (!hours.length) return null;
  const { weekday, hm } = nowIn(tz);
  const today = hours
    .filter((h) => h.weekday === weekday)
    .sort((a, b) => a.start.localeCompare(b.start));
  const now = today.find((h) => h.start <= hm && hm < h.end);
  if (now) return { open: true, text: `até ${now.end}` };
  const later = today.find((h) => h.start > hm);
  if (later) return { open: false, text: `abre às ${later.start}` };
  for (let i = 1; i <= 7; i++) {
    const d = (weekday + i) % 7;
    const first = hours
      .filter((h) => h.weekday === d)
      .sort((a, b) => a.start.localeCompare(b.start))[0];
    if (first)
      return {
        open: false,
        text: `abre ${i === 1 ? "amanhã" : WEEKDAY_SHORT[d]} às ${first.start}`,
      };
  }
  return null;
}

/** The week in one line: "Seg–Sex 09:00–19:00" (or the open days, when they differ). */
function hoursSummary(hours: OpenHours, _lang?: string): string {
  if (!hours.length) return "";
  const days = [...new Set(hours.map((h) => h.weekday))].sort(
    (a, b) => ((a + 6) % 7) - ((b + 6) % 7),
  );
  const start = hours.map((h) => h.start).sort()[0]!;
  const end = hours
    .map((h) => h.end)
    .sort()
    .at(-1)!;
  const cap = (d: number) => WEEKDAY_SHORT[d]!.charAt(0).toUpperCase() + WEEKDAY_SHORT[d]!.slice(1);
  const order = days.map((d) => (d + 6) % 7);
  const consecutive = order.every((v, i) => i === 0 || v === order[i - 1]! + 1);
  const label =
    days.length === 7
      ? "Todos os dias"
      : consecutive && days.length > 2
        ? `${cap(days[0]!)}–${cap(days.at(-1)!)}`
        : days.map(cap).join(", ");
  return `${label} ${start}–${end}`;
}

/** A network's official mark on its colour tile. */
function SocialTile({ network, url, label }: { network: string; url: string; label: string }) {
  const n = SOCIAL[network];
  const brand = n ? BRAND_ICONS[n.icon] : undefined;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className="flex size-12 items-center justify-center rounded-xl transition-transform active:scale-95"
      style={{ backgroundColor: n?.bg ?? "#3a3a40" }}
    >
      {brand ? (
        <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
          <path d={brand.path} fill={network === "snapchat" ? "#000" : "#fff"} />
        </svg>
      ) : network === "reviews" ? (
        <Star className="size-6 text-white" />
      ) : network === "site" ? (
        <Globe className="size-6 text-white" />
      ) : (
        <LinkIcon className="size-6 text-white" />
      )}
    </a>
  );
}

const SOCIAL: Record<string, { bg: string; icon: string; label: string }> = {
  instagram: { bg: "#E1306C", icon: "instagram", label: "Instagram" },
  tiktok: { bg: "#000000", icon: "tiktok", label: "TikTok" },
  facebook: { bg: "#1877F2", icon: "facebook", label: "Facebook" },
  whatsapp: { bg: "#25D366", icon: "whatsapp", label: "WhatsApp" },
  youtube: { bg: "#FF0000", icon: "youtube", label: "YouTube" },
  x: { bg: "#000000", icon: "x", label: "X" },
  threads: { bg: "#000000", icon: "threads", label: "Threads" },
  pinterest: { bg: "#E60023", icon: "pinterest", label: "Pinterest" },
  snapchat: { bg: "#FFFC00", icon: "snapchat", label: "Snapchat" },
  reviews: { bg: "#34A853", icon: "", label: "Avaliações" },
  site: { bg: "#3a3a40", icon: "", label: "Site" },
  link: { bg: "#3a3a40", icon: "", label: "Link" },
};

/** The top of the page, compact (image 15): logo, name, open now, contacts, then map and photos. */
function BusinessHero({
  business,
}: {
  business: PublicBusiness;
  /** Kept for the callers; there is no banner any more. */
  coverClass?: string;
  onCard?: boolean;
}) {
  const { t, theme } = usePrefs();
  const place = [business.address, business.city].filter(Boolean).join(", ");
  const insta = business.instagram?.replace(/^@/, "").trim();
  const contacts = business.show_contacts;
  const map = business.map;
  const status = openLine(business.hours, business.timezone);
  const digits = (business.phone ?? "").replace(/\D/g, "");
  const wa = digits.length === 9 ? `351${digits}` : digits;
  const links: { network: string; handle: string; url: string }[] = business.social_links.length
    ? (business.social_links as { network: string; handle: string; url: string }[])
    : insta
      ? [
          {
            network: "instagram",
            handle: insta,
            url: `https://instagram.com/${encodeURIComponent(insta)}`,
          },
        ]
      : [];
  const hasWhatsappLink = links.some((l) => l.network === "whatsapp");
  const mapHref =
    business.show_map === false || map
      ? null
      : place
        ? mapsUrl({ ...business, address: place })
        : null;
  return (
    <header className="animate-enter">
      <div className="flex items-center gap-4">
        <BusinessLogo business={business} className="size-[60px] text-lg" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[24px] font-bold leading-tight tracking-tight">
            {business.name}
          </h1>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {status && (
              <>
                <span
                  className={cn(
                    "font-bold",
                    status.open ? "text-emerald-600 dark:text-emerald-400" : "text-foreground",
                  )}
                >
                  {status.open ? "Aberto" : "Fechado"}
                </span>
                {" · "}
                {status.text}
              </>
            )}
            {business.city ? `${status ? " · " : ""}${business.city}` : ""}
          </p>
        </div>
      </div>
      {business.description && (
        <p className="mt-2 line-clamp-2 text-[15px] leading-snug text-muted-foreground">
          {business.description}
        </p>
      )}

      {/* Call, WhatsApp and the social networks, as their own icons. */}
      {contacts && (business.phone || links.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {business.phone && (
            <a
              href={`tel:${business.phone}`}
              aria-label={t("bk.hero.call")}
              className="flex size-12 items-center justify-center rounded-xl bg-muted text-foreground transition-transform active:scale-95"
            >
              <Phone className="size-5" />
            </a>
          )}
          {business.phone && !hasWhatsappLink && wa.length >= 9 && (
            <SocialTile network="whatsapp" url={`https://wa.me/${wa}`} label="WhatsApp" />
          )}
          {links.map((l, i) => (
            <SocialTile
              key={`${l.network}-${i}`}
              network={l.network}
              url={l.url}
              label={SOCIAL[l.network]?.label ?? l.url}
            />
          ))}
        </div>
      )}

      {/* The map first and largest, then the photos: one strip that slides sideways. */}
      {(map || business.gallery.length > 0 || mapHref) && (
        <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] lg:mx-0 lg:px-0">
          {map ? (
            <a
              href={map.directions}
              target="_blank"
              rel="noreferrer"
              aria-label={`${t("bk.map.go")}: ${map.label}`}
              className="relative block h-40 w-[68%] shrink-0 overflow-hidden rounded-2xl bg-muted transition-transform active:scale-[0.99] lg:w-[60%]"
            >
              <ShopMapTiles lat={map.lat} lng={map.lng} dark={theme === "dark"} />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-2.5 pt-6 text-white">
                <span className="block truncate text-[13px] font-bold">
                  {business.address || map.label}
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-sky-300">
                  {t("bk.map.go")} ›
                </span>
              </span>
            </a>
          ) : mapHref ? (
            <a
              href={mapHref}
              target="_blank"
              rel="noreferrer"
              className="flex h-40 w-[68%] shrink-0 flex-col justify-end rounded-2xl bg-muted p-3 lg:w-[60%]"
            >
              <MapPin className="size-5 text-brand-ink" />
              <span className="mt-1 block truncate text-[13px] font-bold">{place}</span>
              <span className="text-xs font-bold text-brand-ink">{t("bk.map.go")} ›</span>
            </a>
          ) : null}
          {business.gallery.length > 0 && (
            <ShopPhotos photos={business.gallery} name={business.name} />
          )}
        </div>
      )}
    </header>
  );
}

/**
 * "Próximo horário livre: Hoje às 15:30 · Marcar" — the first free time for the first service,
 * looked up day by day (up to two weeks). Tapping jumps straight to the details step.
 */
function NextFree({
  businessId,
  serviceId,
  staffId,
  timezone,
  today,
  isClosedDay,
  onPick,
}: {
  businessId: string;
  serviceId: string;
  staffId: string | null;
  timezone: string;
  today: string;
  isClosedDay: (d: string) => boolean;
  onPick: (date: string, time: string) => void;
}) {
  const { data } = useQuery({
    queryKey: ["next-free", businessId, serviceId, staffId, today],
    staleTime: 60_000,
    queryFn: async () => {
      for (let i = 0; i < 14; i++) {
        const d = addDays(today, i);
        if (isClosedDay(d)) continue;
        const slots = await getAvailableSlots({
          data: { businessId, serviceId, staffId, date: d },
        }).catch(() => []);
        if (slots.length) return { date: d, time: slots[0]!.time };
      }
      return null;
    },
  });
  if (!data) return null;
  const label =
    data.date === today
      ? "Hoje"
      : data.date === addDays(today, 1)
        ? "Amanhã"
        : new Intl.DateTimeFormat("pt-PT", {
            weekday: "long",
            day: "numeric",
            month: "short",
            timeZone: "UTC",
          })
            .format(new Date(`${data.date}T12:00:00Z`))
            .replace(/-feira/, "")
            .replace(/\./g, "")
            .replace(/^./, (ch) => ch.toUpperCase());
  return (
    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-brand/40 bg-brand/10 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-ink">
          Próximo horário livre
        </p>
        <p className="mt-0.5 truncate font-display text-xl font-bold">
          {label} às {data.time}
        </p>
      </div>
      <Button
        variant="brand"
        className="h-11 rounded-xl px-6 font-bold"
        onClick={() => onPick(data.date, data.time)}
      >
        Marcar
      </Button>
    </div>
  );
}

/**
 * The shop on a small fixed map: a few tiles around the pin, no map library.
 * Satellite photos (the street and the door at a glance); if they fail (key expired,
 * free tier used up), the OpenStreetMap map instead, inverted to a night look in dark theme.
 */
function ShopMapTiles({ lat, lng, dark }: { lat: number; lng: number; dark: boolean }) {
  const [satellite, setSatellite] = useState(true);
  const grid = useMemo(
    () => (satellite ? tileGrid(lat, lng, 17, 5, 3, SATELLITE_TILE_URL) : tileGrid(lat, lng, 16)),
    [lat, lng, satellite],
  );
  return (
    <>
      <div
        aria-hidden
        className={cn("absolute left-1/2 top-1/2", !satellite && dark && "map-dark-tiles")}
        style={{
          width: grid.width,
          height: grid.height,
          transform: `translate(${-grid.pin.x}px, ${-grid.pin.y}px)`,
        }}
      >
        {grid.tiles.map((tile) => (
          <img
            key={tile.key}
            src={tile.src}
            alt=""
            loading="lazy"
            draggable={false}
            onError={() => setSatellite(false)}
            className="absolute max-w-none select-none"
            style={{ left: tile.left, top: tile.top, width: TILE_SIZE, height: TILE_SIZE }}
          />
        ))}
      </div>
      {/* The pin, in the business colour, with its tip on the shop. */}
      <svg
        aria-hidden
        viewBox="0 0 24 32"
        className="absolute left-1/2 top-1/2 h-9 w-7 -translate-x-1/2 -translate-y-full drop-shadow-md"
      >
        <path
          d="M12 0C5.4 0 0 5.2 0 11.7 0 20.4 12 32 12 32s12-11.6 12-20.3C24 5.2 18.6 0 12 0Z"
          fill="var(--brand)"
        />
        <circle cx="12" cy="11.5" r="4.5" fill="#fff" />
      </svg>
      {/* Required by the map licences. */}
      <span className="absolute right-1.5 top-1.5 rounded bg-black/45 px-1.5 py-0.5 text-[9px] font-medium text-white/85">
        {satellite ? "Esri, Maxar, Earthstar Geographics" : "© OpenStreetMap"}
      </span>
    </>
  );
}

/** Photos of the shop: a strip of thumbnails, each one opens full screen (arrows, swipe-free). */
function ShopPhotos({ photos, name }: { photos: string[]; name: string }) {
  const { t } = usePrefs();
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % photos.length));
      if (e.key === "ArrowLeft")
        setOpen((i) => (i === null ? i : (i - 1 + photos.length) % photos.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, photos.length]);
  return (
    <>
      <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] lg:grid lg:grid-cols-4 lg:overflow-visible">
        {photos.map((src, i) => (
          <button
            key={src}
            type="button"
            onClick={() => setOpen(i)}
            aria-label={`${t("bk.photos.open")} ${i + 1}`}
            className="aspect-square w-24 shrink-0 overflow-hidden rounded-xl border border-border bg-muted transition-transform active:scale-[0.97] sm:w-28 lg:w-auto"
          >
            <img src={src} alt="" loading="lazy" className="size-full object-cover" />
          </button>
        ))}
      </div>
      {open !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={name}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setOpen(null)}
        >
          <img
            src={photos[open]}
            alt=""
            className="max-h-full max-w-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setOpen(null)}
            aria-label={t("bk.photos.close")}
            className="absolute right-4 top-[calc(1rem+var(--sat,0px))] flex size-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
          >
            <X className="size-5" />
          </button>
          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen((open - 1 + photos.length) % photos.length);
                }}
                aria-label={t("bk.photos.prev")}
                className="absolute left-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen((open + 1) % photos.length);
                }}
                aria-label={t("bk.photos.next")}
                className="absolute right-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
              >
                <ChevronRight className="size-5" />
              </button>
              <p className="absolute bottom-[calc(1rem+var(--sab,0px))] left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white tabular-nums">
                {open + 1} / {photos.length}
              </p>
            </>
          )}
        </div>
      )}
    </>
  );
}

const HERO_CHIP =
  "inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-bold transition-colors hover:bg-muted [&_svg]:text-brand-ink";

function SummaryChip({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-11 max-w-[14rem] shrink-0 truncate rounded-full border border-border bg-card px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted"
    >
      {children}
    </button>
  );
}

function SlotGroup({
  label,
  times,
  selected,
  onSelect,
}: {
  label: string;
  times: string[];
  selected: string | null;
  onSelect: (t: string) => void;
}) {
  // Always open: collapsing the periods only added a tap before reaching a time.
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="animate-stagger mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-4">
        {times.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onSelect(t)}
            className={cn(
              "rounded-[12px] border py-3 text-sm font-bold tabular-nums transition-colors",
              selected === t
                ? "border-brand bg-brand text-brand-foreground"
                : "border-border hover:border-brand/50 hover:bg-brand/5",
            )}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
