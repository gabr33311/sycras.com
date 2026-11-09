import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  CalendarOff,
  Check,
  Gift,
  Globe,
  HandCoins,
  ImageIcon,
  Lock,
  Mail,
  MessageCircle,
  Moon,
  Move,
  Repeat,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Star,
  UserSearch,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PrefsToggles } from "@/components/prefs-toggles";
import { SycrasLogo } from "@/components/sycras-logo";
import { usePrefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { LegalLinks } from "@/components/legal-page";
import { APP_ON_PLAY, inNativeShell, PLAY_STORE_URL } from "@/lib/app-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SYCRAS — Marcações online para o teu negócio" },
      {
        name: "description",
        content:
          "Cria a tua página de marcações em minutos. Agenda, clientes e lembretes num só sítio, feito para negócios em Portugal.",
      },
      { property: "og:title", content: "SYCRAS — Marcações online para o teu negócio" },
      {
        property: "og:description",
        content:
          "Página de marcações, agenda e clientes num só sítio. Simples, rápido e feito para Portugal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const REGISTER = { mode: "register", next: undefined } as const;
/** The demo business (see supabase/migrations/20261017140000_demo_page.sql). */
const DEMO_SLUG = "exemplo";
/** Inside the old Android shell, "install the app" makes no sense (checked after load: SSR-safe). */
function useInNativeShell(): boolean {
  const [native, setNative] = useState(false);
  useEffect(() => setNative(inNativeShell()), []);
  return native;
}

/** The Google Play mark (the coloured triangle), drawn inline. */
function PlayMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 26" className={className} aria-hidden>
      <path d="M1.2.6 13.6 13 1.2 25.4A2 2 0 0 1 .5 23.9V2.1A2 2 0 0 1 1.2.6Z" fill="#00d7fe" />
      <path d="m17.8 8.8-4.2 4.2 4.2 4.2 4.8-2.7c1.3-.8 1.3-2.2 0-3Z" fill="#ffce00" />
      <path d="M13.6 13 1.2 25.4c.5.5 1.3.5 2.1.1l14.5-8.3Z" fill="#ff3a44" />
      <path d="M13.6 13 17.8 8.8 3.3.5C2.5 0 1.7.1 1.2.6Z" fill="#00f076" />
    </svg>
  );
}
const SIGN_IN = { mode: undefined, next: undefined } as const;

const ALL_FEATURES = [
  { icon: ImageIcon, key: "lp.all.1" },
  { icon: Globe, key: "lp.all.2" },
  { icon: CalendarDays, key: "lp.all.3" },
  { icon: Move, key: "lp.all.4" },
  { icon: Lock, key: "lp.all.5" },
  { icon: CalendarOff, key: "lp.all.6" },
  { icon: Users, key: "lp.all.7" },
  { icon: UserSearch, key: "lp.all.8" },
  { icon: RotateCcw, key: "lp.all.9" },
  { icon: Gift, key: "lp.all.10" },
  { icon: Mail, key: "lp.all.11" },
  { icon: MessageCircle, key: "lp.all.12" },
  { icon: Repeat, key: "lp.all.13" },
  { icon: Star, key: "lp.all.14" },
  { icon: HandCoins, key: "lp.all.15" },
  { icon: ShieldCheck, key: "lp.all.16" },
  { icon: BarChart3, key: "lp.all.17" },
  { icon: Bell, key: "lp.all.18" },
  { icon: Moon, key: "lp.all.19" },
  { icon: Sparkles, key: "lp.all.20" },
] as const;

const CHIPS = [
  "lp.chip.page",
  "lp.chip.agenda",
  "lp.chip.clients",
  "lp.chip.reminders",
  "lp.chip.deposit",
  "lp.chip.stats",
  "lp.chip.team",
  "lp.chip.loyalty",
] as const;

const PLAN_FEATURES = [
  "sub.feature.bookingPage",
  "sub.feature.calendar",
  "sub.feature.clients",
  "sub.feature.team",
  "sub.feature.analytics",
  "sub.feature.reminders",
  "lp.all.15",
] as const;

function Landing() {
  const { t } = usePrefs();
  const inApp = useInNativeShell();

  return (
    <div className="min-h-screen overflow-x-clip">
      <header className="sticky top-[var(--sat)] z-30 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <span className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand">
              <SycrasLogo className="size-5" onColor />
            </span>
            <span className="hidden text-[15px] font-bold tracking-[0.14em] min-[400px]:inline">
              SYCRAS
            </span>
          </span>
          <nav className="hidden items-center gap-7 text-sm font-semibold text-muted-foreground md:flex">
            <a href="#funcionalidades" className="transition-colors hover:text-foreground">
              {t("home.nav.features")}
            </a>
            <a href="#precos" className="transition-colors hover:text-foreground">
              {t("home.nav.pricing")}
            </a>
            <a href="#perguntas" className="transition-colors hover:text-foreground">
              {t("home.nav.faq")}
            </a>
          </nav>
          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            <PrefsToggles />
            <Link
              to="/auth"
              search={SIGN_IN}
              className="hidden h-11 items-center whitespace-nowrap rounded-full px-3 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground sm:flex"
            >
              {t("home.signin")}
            </Link>
            <Button asChild size="sm" className="shrink-0 rounded-full">
              <Link to="/auth" search={REGISTER}>
                {t("home.cta.start")}
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero: the promise on the left, the app itself on the right. */}
        <section className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[720px] bg-[radial-gradient(60%_60%_at_70%_20%,color-mix(in_oklab,var(--brand)_18%,transparent),transparent)]"
          />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:pb-24">
            <div className="animate-enter text-center lg:text-left">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                {t("lp.eyebrow")}
              </p>
              <h1 className="mt-5 font-classic text-[2.75rem] font-semibold leading-[1.04] tracking-[-0.02em] sm:text-6xl lg:text-[4.1rem]">
                {t("lp.title.a")}
                <br />
                <span className="text-brand-ink">{t("lp.title.b")}</span>
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-base font-medium leading-relaxed text-muted-foreground sm:text-lg lg:mx-0">
                {t("lp.subtitle")}
              </p>
              <HeroActions inApp={inApp} />
              <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] font-semibold text-muted-foreground lg:justify-start">
                {(["lp.trust.1", "lp.trust.2", "lp.trust.3"] as const).map((k) => (
                  <li key={k} className="flex items-center gap-1.5">
                    <Check className="size-4 text-brand-ink" strokeWidth={2.6} />
                    {t(k)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative mx-auto flex w-full max-w-md justify-center lg:max-w-none">
              <Phone
                src="/landing/app/agenda.webp"
                alt=""
                className="absolute left-[2%] top-10 hidden w-[44%] -rotate-6 opacity-90 sm:block lg:left-[4%]"
              />
              <Phone
                src="/landing/app/diario.webp"
                alt={t("lp.diario.title")}
                eager
                className="relative z-10 w-[62%] sm:w-[52%] lg:w-[56%]"
              />
              <Phone
                src="/landing/app/partilhar.webp"
                alt=""
                className="absolute right-[2%] top-16 hidden w-[44%] rotate-6 opacity-90 sm:block lg:right-[4%]"
              />
            </div>
          </div>
        </section>

        {/* Everything in one app */}
        <section className="border-y border-border bg-muted/40">
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
            <p className="text-center text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {t("lp.chips.title")}
            </p>
            <ul className="mt-4 flex flex-wrap justify-center gap-2">
              {CHIPS.map((k) => (
                <li
                  key={k}
                  className="rounded-full bg-card px-4 py-2 text-sm font-semibold shadow-[var(--shadow-soft)]"
                >
                  {t(k)}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div id="funcionalidades" className="scroll-mt-20">
          <Feature
            kicker={t("lp.diario.kicker")}
            title={t("lp.diario.title")}
            body={t("lp.diario.body")}
            points={[t("lp.diario.1"), t("lp.diario.2"), t("lp.diario.3")]}
            visual={
              <Phone
                src="/landing/app/diario.webp"
                alt={t("lp.diario.title")}
                className="mx-auto w-[78%]"
              />
            }
          />
          <Feature
            reverse
            tinted
            kicker={t("lp.agenda.kicker")}
            title={t("lp.agenda.title")}
            body={t("lp.agenda.body")}
            points={[t("lp.agenda.1"), t("lp.agenda.2"), t("lp.agenda.3")]}
            visual={
              <PhonePair
                front="/landing/app/agenda.webp"
                back="/landing/app/calendario.webp"
                alt={t("lp.agenda.title")}
              />
            }
          />
          <Feature
            kicker={t("lp.share.kicker")}
            title={t("lp.share.title")}
            body={t("lp.share.body")}
            points={[t("lp.share.1"), t("lp.share.2"), t("lp.share.3")]}
            visual={
              <Phone
                src="/landing/app/partilhar.webp"
                alt={t("lp.share.title")}
                className="mx-auto w-[78%]"
              />
            }
            extra={
              <Link
                to="/$slug"
                params={{ slug: DEMO_SLUG }}
                className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-brand-ink underline-offset-4 hover:underline"
              >
                {t("home.demo")} <ArrowRight className="size-4" />
              </Link>
            }
          />
          <Feature
            reverse
            dark
            kicker={t("lp.deposit.kicker")}
            title={t("lp.deposit.title")}
            body={t("lp.deposit.body")}
            points={[t("lp.deposit.1"), t("lp.deposit.2"), t("lp.deposit.3"), t("lp.deposit.4")]}
            visual={<DepositVisual />}
          />
          <Feature
            kicker={t("lp.clients.kicker")}
            title={t("lp.clients.title")}
            body={t("lp.clients.body")}
            points={[t("lp.clients.1"), t("lp.clients.2"), t("lp.clients.3")]}
            visual={
              <PhonePair
                front="/landing/app/cliente.webp"
                back="/landing/app/clientes.webp"
                alt={t("lp.clients.title")}
              />
            }
          />
          <Feature
            reverse
            tinted
            kicker={t("lp.reminders.kicker")}
            title={t("lp.reminders.title")}
            body={t("lp.reminders.body")}
            points={[t("lp.reminders.1"), t("lp.reminders.2"), t("lp.reminders.3")]}
            visual={<RemindersVisual />}
          />
          <Feature
            kicker={t("lp.stats.kicker")}
            title={t("lp.stats.title")}
            body={t("lp.stats.body")}
            points={[t("lp.stats.1"), t("lp.stats.2")]}
            visual={
              <Phone
                src="/landing/app/estatisticas.webp"
                alt={t("lp.stats.title")}
                className="mx-auto w-[78%]"
              />
            }
          />

          {/* Two smaller ones side by side: booking by hand and managing the business. */}
          <section className="border-y border-border bg-muted/40">
            <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:px-6 sm:py-20 md:grid-cols-2">
              <MiniFeature
                kicker={t("lp.new.kicker")}
                title={t("lp.new.title")}
                body={t("lp.new.body")}
                src="/landing/app/nova.webp"
              />
              <MiniFeature
                kicker={t("lp.manage.kicker")}
                title={t("lp.manage.title")}
                body={t("lp.manage.body")}
                src="/landing/app/gestao.webp"
              />
            </div>
          </section>
        </div>

        {/* All included */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <SectionTitle>{t("lp.all.title")}</SectionTitle>
          <ul className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {ALL_FEATURES.map((f) => (
              <li
                key={f.key}
                className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-[var(--shadow-soft)]"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand/12 text-brand-ink dark:bg-brand/25">
                  <f.icon className="size-[17px]" strokeWidth={2.2} />
                </span>
                <span className="text-sm font-semibold leading-snug">{t(f.key)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Three steps */}
        <section className="border-y border-border bg-muted/40">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
            <SectionTitle>{t("lp.steps.title")}</SectionTitle>
            <ol className="mt-10 grid gap-4 md:grid-cols-3">
              {[1, 2, 3].map((n) => (
                <li key={n} className="rounded-3xl bg-card p-6 shadow-[var(--shadow-soft)]">
                  <span className="flex size-10 items-center justify-center rounded-full bg-brand font-display text-lg font-bold text-white">
                    {n}
                  </span>
                  <h3 className="mt-4 text-lg font-bold">{t(`lp.steps.${n}.title`)}</h3>
                  <p className="mt-1.5 text-sm font-medium leading-relaxed text-muted-foreground">
                    {t(`lp.steps.${n}.body`)}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Pricing */}
        <section id="precos" className="scroll-mt-20">
          <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
            <SectionTitle sub={t("home.pricing.body")}>{t("home.pricing.title")}</SectionTitle>
            <div className="mx-auto mt-10 max-w-md">
              <PlanCard
                pro
                name="SYCRAS Pro"
                desc={t("home.pricing.desc")}
                price={t("home.pricing.free")}
                after={t("home.pricing.after")}
                note={t("home.pricing.value")}
                badge={t("home.pricing.noCard")}
                features={PLAN_FEATURES.map(t)}
              />
            </div>
          </div>
        </section>

        {/* Questions */}
        <section
          id="perguntas"
          className="scroll-mt-20 mx-auto max-w-2xl px-4 pb-16 sm:px-6 sm:pb-24"
        >
          <SectionTitle>{t("lp.faq.title")}</SectionTitle>
          <Accordion type="single" collapsible className="mt-8">
            {(
              [
                ["home.faq.1.q", "home.faq.1.a"],
                ["home.faq.2.q", "home.faq.2.a"],
                ["lp.faq.5.q", "lp.faq.5.a"],
                ["lp.faq.6.q", "lp.faq.6.a"],
                ["home.faq.3.q", "home.faq.3.a"],
              ] as const
            ).map(([q, a]) => (
              <AccordionItem key={q} value={q}>
                <AccordionTrigger className="text-[15px] font-bold hover:no-underline">
                  {t(q)}
                </AccordionTrigger>
                <AccordionContent className="font-medium leading-relaxed text-muted-foreground">
                  {t(a)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* Final call */}
        <section className="px-4 pb-16 sm:px-6 sm:pb-24">
          <div className="mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-brand px-6 py-14 text-center text-white sm:px-12 sm:py-20">
            <h2 className="mx-auto max-w-2xl font-classic text-4xl font-semibold leading-tight sm:text-5xl">
              {t("lp.final.title")}
            </h2>
            <p className="mt-4 text-base font-medium text-white/80">{t("lp.final.body")}</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/auth"
                search={REGISTER}
                className="inline-flex h-12 items-center justify-center rounded-full bg-white px-7 text-base font-bold text-brand-ink shadow-sm transition-transform active:scale-[0.98]"
              >
                {t("home.cta.create")}
              </Link>
              {APP_ON_PLAY && !inApp ? (
                <a
                  href={PLAY_STORE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/40 px-6 text-base font-bold text-white"
                >
                  <PlayMark className="size-5" /> Google Play
                </a>
              ) : null}
            </div>
          </div>
        </section>
      </main>

      <StickyStart />

      <footer className="border-t border-border pb-24 md:pb-0">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-8 text-sm font-medium text-muted-foreground sm:flex-row sm:px-6">
          <span className="font-bold tracking-[0.14em] text-foreground">SYCRAS</span>
          <span>{t("home.footer")}</span>
          <a href="mailto:suporte@sycras.com" className="transition-colors hover:text-foreground">
            suporte@sycras.com
          </a>
          <span className="flex items-center gap-3">
            <LegalLinks />
            <span>© {new Date().getFullYear()} SYCRAS</span>
          </span>
        </div>
      </footer>
    </div>
  );
}

/** The two hero buttons: the app on Google Play first, or "create / sign in" until it is there. */
function HeroActions({ inApp }: { inApp: boolean }) {
  const { t } = usePrefs();
  if (inApp || !APP_ON_PLAY) {
    return (
      <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center lg:justify-start">
        <Button asChild size="lg" variant="brand" className="rounded-full">
          <Link to="/auth" search={REGISTER}>
            {t("home.cta.create")}
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="rounded-full">
          <Link to="/auth" search={SIGN_IN}>
            {t("home.cta.have")}
          </Link>
        </Button>
      </div>
    );
  }
  return (
    <>
      <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center lg:justify-start">
        <a
          href={PLAY_STORE_URL}
          target="_blank"
          rel="noreferrer"
          aria-label={t("home.cta.play")}
          className="inline-flex h-12 items-center justify-center gap-3 rounded-full bg-foreground px-6 text-background shadow-sm transition-transform active:scale-[0.98] sm:min-w-56"
        >
          <PlayMark className="size-6" />
          <span className="text-left leading-tight">
            <span className="block text-[10px] font-semibold uppercase tracking-wider opacity-80">
              {t("home.cta.playSmall")}
            </span>
            <span className="block text-base font-bold">Google Play</span>
          </span>
        </a>
        <Button asChild size="lg" variant="outline" className="h-12 rounded-full sm:min-w-56">
          <Link to="/auth" search={SIGN_IN}>
            {t("home.cta.online")}
          </Link>
        </Button>
      </div>
      <p className="mt-3 text-[13px] font-medium text-muted-foreground">{t("home.cta.appHint")}</p>
    </>
  );
}

/** A real screenshot of the app inside a phone frame. */
function Phone({
  src,
  alt,
  className,
  eager,
}: {
  src: string;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[2.2rem] border-[7px] border-neutral-900 bg-neutral-900 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)] dark:border-neutral-700",
        className,
      )}
    >
      <img
        src={src}
        alt={alt}
        width={640}
        height={1327}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className="block h-auto w-full rounded-[1.7rem]"
      />
    </div>
  );
}

/** Two screens of the same feature: one in front, one tilted behind. */
function PhonePair({ front, back, alt }: { front: string; back: string; alt: string }) {
  return (
    <div className="relative mx-auto w-full max-w-sm">
      <Phone src={back} alt="" className="absolute -left-2 top-8 w-[58%] -rotate-6 opacity-90" />
      <Phone src={front} alt={alt} className="relative z-10 ml-auto w-[64%]" />
    </div>
  );
}

/** One feature: text and points on one side, the app on the other. */
function Feature({
  kicker,
  title,
  body,
  points,
  visual,
  reverse,
  tinted,
  dark,
  extra,
}: {
  kicker: string;
  title: string;
  body: string;
  points: string[];
  visual: ReactNode;
  reverse?: boolean;
  tinted?: boolean;
  dark?: boolean;
  extra?: ReactNode;
}) {
  return (
    <section
      className={cn(
        tinted && "border-y border-border bg-muted/40",
        dark && "bg-neutral-950 text-white dark:bg-neutral-900",
      )}
    >
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 md:grid-cols-2 md:gap-16">
        <div className={cn("text-center md:text-left", reverse && "md:order-2")}>
          <p
            className={cn(
              "text-[12px] font-bold uppercase tracking-[0.16em]",
              dark ? "text-[#f0cf63]" : "text-brand-ink",
            )}
          >
            {kicker}
          </p>
          <h2 className="mt-3 font-classic text-[2.1rem] font-semibold leading-[1.08] tracking-[-0.01em] sm:text-5xl">
            {title}
          </h2>
          <p
            className={cn(
              "mx-auto mt-4 max-w-md text-base font-medium leading-relaxed md:mx-0",
              dark ? "text-white/70" : "text-muted-foreground",
            )}
          >
            {body}
          </p>
          <ul className="mx-auto mt-6 max-w-md space-y-3 text-left md:mx-0">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3 text-[15px] font-semibold leading-snug">
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                    dark ? "bg-[#f0cf63] text-neutral-950" : "bg-brand text-white",
                  )}
                >
                  <Check className="size-3" strokeWidth={3.5} />
                </span>
                {p}
              </li>
            ))}
          </ul>
          {extra}
        </div>
        <div className={cn("mx-auto w-full max-w-sm", reverse && "md:order-1")}>{visual}</div>
      </div>
    </section>
  );
}

/** A smaller feature card with its screen. */
function MiniFeature({
  kicker,
  title,
  body,
  src,
}: {
  kicker: string;
  title: string;
  body: string;
  src: string;
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-[2rem] bg-card shadow-[var(--shadow-soft)]">
      <div className="p-7 sm:p-9">
        <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-brand-ink">{kicker}</p>
        <h3 className="mt-2 font-classic text-3xl font-semibold leading-tight">{title}</h3>
        <p className="mt-3 text-[15px] font-medium leading-relaxed text-muted-foreground">{body}</p>
      </div>
      <div className="mt-auto flex justify-center px-7">
        <div className="w-[62%] max-w-[260px] translate-y-6">
          <Phone src={src} alt={title} />
        </div>
      </div>
    </article>
  );
}

/** The deposit, shown as the client and the owner see it. */
function DepositVisual() {
  const { t } = usePrefs();
  return (
    <div className="relative mx-auto w-full max-w-sm space-y-4">
      <div className="rounded-3xl bg-white p-5 text-neutral-900 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-bold">{t("lp.deposit.card.service")}</span>
          <span className="text-xs font-semibold text-neutral-500">30 min</span>
        </div>
        <p className="mt-1 text-sm font-semibold text-neutral-500">{t("lp.deposit.card.line")}</p>
        <div className="mt-4 rounded-2xl bg-[#1f6fe5] py-3 text-center text-sm font-bold text-white">
          4,50 €
        </div>
      </div>
      <div className="ml-8 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
        <span className="flex size-9 items-center justify-center rounded-full bg-[#f0cf63] text-neutral-950">
          <Wallet className="size-4" strokeWidth={2.4} />
        </span>
        <span className="text-sm font-semibold">{t("lp.deposit.card.paid")}</span>
      </div>
      <div className="mr-8 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
        <span className="flex size-9 items-center justify-center rounded-full bg-emerald-400 text-neutral-950">
          <RotateCcw className="size-4" strokeWidth={2.4} />
        </span>
        <span className="text-sm font-semibold">{t("lp.deposit.card.refund")}</span>
      </div>
    </div>
  );
}

/** Reminders as they land on the client's phone. */
function RemindersVisual() {
  const { t } = usePrefs();
  const items = [
    {
      icon: Bell,
      title: "lp.reminders.n1.title",
      body: "lp.reminders.n1.body",
      tone: "bg-brand text-white",
    },
    {
      icon: Repeat,
      title: "lp.reminders.n2.title",
      body: "lp.reminders.n2.body",
      tone: "bg-emerald-500 text-white",
    },
    {
      icon: Star,
      title: "lp.reminders.n3.title",
      body: "lp.reminders.n3.body",
      tone: "bg-[#f0cf63] text-neutral-950",
    },
  ] as const;
  return (
    <ul className="mx-auto w-full max-w-sm space-y-3">
      {items.map((n, i) => (
        <li
          key={n.title}
          className={cn(
            "flex items-start gap-3 rounded-3xl bg-card p-4 shadow-[var(--shadow-soft)]",
            i === 1 && "ml-6",
            i === 2 && "ml-12",
          )}
        >
          <span
            className={cn("flex size-10 shrink-0 items-center justify-center rounded-2xl", n.tone)}
          >
            <n.icon className="size-[18px]" strokeWidth={2.4} />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              SYCRAS
            </span>
            <span className="block text-sm font-bold">{t(n.title)}</span>
            <span className="block text-sm font-medium text-muted-foreground">{t(n.body)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Phones: a "Start free" bar at the bottom once the hero is out of view. */
function StickyStart() {
  const { t } = usePrefs();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(window.scrollY > 700);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 px-4 pt-3 backdrop-blur-md transition-transform duration-300 md:hidden",
        "pb-[calc(0.75rem+var(--sab,0px))]",
        show ? "translate-y-0" : "translate-y-full",
      )}
    >
      <Button asChild size="lg" variant="brand" className="w-full">
        <Link to="/auth" search={REGISTER}>
          {t("home.cta.create")}
        </Link>
      </Button>
      <p className="mt-1.5 text-center text-[11px] font-semibold text-muted-foreground">
        {t("home.reassure")}
      </p>
    </div>
  );
}

function SectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="text-center">
      <h2 className="text-balance-tight font-classic text-4xl font-semibold tracking-[-0.01em] sm:text-5xl">
        {children}
      </h2>
      {sub && (
        <p className="mx-auto mt-3 max-w-md text-base font-medium text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}

function PlanCard({
  name,
  desc,
  price,
  suffix,
  badge,
  features,
  pro,
  after,
  note,
}: {
  name: string;
  desc: string;
  price: string;
  suffix?: string;
  /** Under the big line, smaller (e.g. what it costs after the free month). */
  after?: string;
  /** A short line after the features (the value, in the owner's words). */
  note?: string;
  badge?: string;
  features: string[];
  pro?: boolean;
}) {
  const { t } = usePrefs();
  return (
    <article
      className={cn(
        "surface relative flex flex-col p-6 sm:p-8",
        pro && "border-subscription-accent/40",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-bold">{name}</h3>
        {badge && (
          <span className="rounded-full border border-subscription-accent px-2.5 py-0.5 text-[11px] font-bold text-foreground">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm font-medium text-muted-foreground">{desc}</p>
      <p className="mt-5 text-4xl font-bold tracking-[-0.03em]">
        {price}
        {suffix && (
          <span className="ml-1 text-base font-semibold text-muted-foreground">{suffix}</span>
        )}
      </p>
      {after && <p className="mt-1.5 text-sm font-medium text-muted-foreground">{after}</p>}
      <ul className="mt-6 flex-1 space-y-2.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm font-medium">
            <Check className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} />
            {f}
          </li>
        ))}
      </ul>
      {note && (
        <p className="mt-6 rounded-xl bg-muted px-4 py-3 text-center text-sm font-semibold">
          {note}
        </p>
      )}
      <Button asChild size="lg" variant={pro ? "default" : "outline"} className="mt-7">
        <Link to="/auth" search={REGISTER}>
          {t(pro ? "home.cta.start" : "home.cta.create")}
        </Link>
      </Button>
    </article>
  );
}
