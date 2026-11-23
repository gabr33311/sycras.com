import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PrefsToggles } from "@/components/prefs-toggles";
import { PlayMark } from "@/components/play-mark";
import { SycrasLogo } from "@/components/sycras-logo";
import { TrialIncludes } from "@/components/trial-includes";
import { usePrefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import {
  BillingToggle,
  CalculatorCard,
  FounderNote,
  LANDING_NAV,
  MobileMenu,
  SiteFooter,
  Testimonials,
  WhoChips,
} from "@/components/landing-sections";
import { FeatureTabs, Phone } from "@/components/landing-tabs";
import { MobileLanding } from "@/components/landing-mobile";
import { APP_ON_PLAY, inNativeShell, PLAY_STORE_URL } from "@/lib/app-store";
import { DICT } from "@/lib/prefs-dict";
import { LANDING_FAQ, landingJsonLd, seo } from "@/lib/seo";
import { captureUtm, trackEvent } from "@/lib/analytics";

export const Route = createFileRoute("/")({
  head: () => ({
    ...seo({
      title: "SYCRAS — Marcações online para o teu negócio",
      description:
        "Cria a tua página de marcações em minutos. Agenda, clientes e lembretes num só sítio, feito para negócios em Portugal.",
      path: "/",
    }),
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(landingJsonLd((k) => DICT.pt[k] ?? k)),
      },
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

const SIGN_IN = { mode: undefined, next: undefined } as const;

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
  const [yearly, setYearly] = useState(false);
  // Counts clicks on anything tagged data-track (anonymous, no cookies), plus where the visit came from.
  useEffect(() => {
    captureUtm();
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-track]");
      if (el?.dataset["track"])
        trackEvent(el.dataset["track"], { href: el.getAttribute("href") ?? "" });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <div className="min-h-screen overflow-x-clip">
      {/* Keyboard users jump straight past the menu. */}
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-foreground focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-background"
      >
        Saltar para o conteúdo
      </a>
      <header className="sticky top-[var(--sat)] z-30 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <span className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand">
              <SycrasLogo className="size-5" onColor />
            </span>
            <span className="hidden text-[15px] font-bold tracking-[0.14em] min-[400px]:inline">
              SYCRAS
            </span>
          </span>
          <nav className="hidden items-center gap-7 text-sm font-semibold text-muted-foreground md:flex">
            {LANDING_NAV.map((l) => (
              <a key={l.href} href={l.href} className="transition-colors hover:text-foreground">
                {t(l.key)}
              </a>
            ))}
          </nav>
          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            <PrefsToggles className="hidden sm:flex" />
            <Link
              to="/auth"
              search={SIGN_IN}
              className="flex h-11 items-center whitespace-nowrap rounded-full px-3 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("home.signin")}
            </Link>
            <Button asChild size="sm" className="hidden shrink-0 rounded-full sm:inline-flex">
              <Link to="/auth" search={REGISTER} data-track="cta_header">
                {t("home.cta.start")}
              </Link>
            </Button>
            <MobileMenu />
          </div>
        </div>
      </header>

      <main id="conteudo">
        {/* Phones: full-screen pages, one swipe each. Wider screens: the layout below. */}
        <MobileLanding
          demoSlug={DEMO_SLUG}
          inApp={inApp}
          showPlay={APP_ON_PLAY}
          playUrl={PLAY_STORE_URL}
          planFeatures={PLAN_FEATURES}
          footer={<SiteFooter anchor="#m-" />}
        />
        <div className="hidden md:block">
          {/* Hero: the promise, the buttons and the app as it is today. */}
          <section className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[760px] bg-[radial-gradient(60%_60%_at_75%_25%,color-mix(in_oklab,var(--brand)_20%,transparent),transparent)]"
            />
            <div className="mx-auto grid max-w-6xl items-center gap-8 px-5 pb-10 pt-7 sm:gap-12 sm:px-6 sm:pb-14 sm:pt-16 lg:grid-cols-[1.1fr_1fr] lg:gap-10 lg:pb-20">
              <div className="animate-enter text-left sm:text-center lg:text-left">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  {t("lp.eyebrow")}
                </p>
                <h1 className="mt-4 font-classic text-[2.6rem] font-semibold sm:mt-5 leading-[1.04] tracking-[-0.02em] sm:text-6xl lg:text-[4.2rem]">
                  {t("lp.title.a")}
                  <br />
                  <span className="text-brand-ink">{t("lp.title.b")}</span>
                </h1>
                <p className="mt-4 max-w-xl text-[15px] font-medium leading-relaxed text-muted-foreground sm:mx-auto sm:mt-6 sm:text-lg lg:mx-0">
                  {t("lp.subtitle")}
                </p>
                <HeroActions inApp={inApp} />
                <ul className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] font-semibold text-muted-foreground sm:mt-6 sm:justify-center sm:gap-x-5 lg:justify-start">
                  {(["lp.trust.1", "lp.trust.2", "lp.trust.3"] as const).map((k) => (
                    <li key={k} className="flex items-center gap-1.5">
                      <Check className="size-4 text-brand-ink" strokeWidth={2.6} />
                      {t(k)}
                    </li>
                  ))}
                </ul>
              </div>

              {/* The real Diário. On wide screens two moments of the day sit beside the phone
                (never over the screen); on phones they sit under it, side by side. */}
              <div className="mx-auto w-full max-w-[290px] sm:max-w-[300px] lg:max-w-[330px]">
                <div className="relative max-h-[430px] overflow-hidden sm:max-h-none sm:overflow-visible">
                  <Phone src="/landing/v2/diario.webp" alt={t("lp.diario.title")} eager />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background to-transparent sm:hidden"
                  />
                  <HeroNote
                    className="absolute right-[calc(100%+16px)] top-[16%] hidden w-52 2xl:block"
                    tone="text-brand-ink"
                    title={t("lp.hero.n1.title")}
                    body={t("lp.hero.n1.body")}
                  />
                  <HeroNote
                    className="absolute left-[calc(100%+16px)] bottom-[24%] hidden w-52 2xl:block"
                    tone="text-emerald-600 dark:text-emerald-400"
                    title={t("lp.hero.n2.title")}
                    body={t("lp.hero.n2.body")}
                  />
                </div>
                <div className="mt-4 hidden grid-cols-2 gap-2 sm:grid 2xl:hidden">
                  <HeroNote
                    tone="text-brand-ink"
                    title={t("lp.hero.n1.title")}
                    body={t("lp.hero.n1.body")}
                  />
                  <HeroNote
                    tone="text-emerald-600 dark:text-emerald-400"
                    title={t("lp.hero.n2.title")}
                    body={t("lp.hero.n2.body")}
                  />
                </div>
              </div>
            </div>
            <div className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
              <p className="mb-3 text-left text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground sm:text-center lg:text-left">
                {t("lp.who.sub")}
              </p>
              <WhoChips />
            </div>
          </section>

          {/* Everything the app does, one tab at a time. */}
          <section id="funcionalidades" className="scroll-mt-20">
            <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
              <SectionTitle sub={t("lp.show.sub")}>{t("lp.show.title")}</SectionTitle>
              <div className="mt-8 hidden md:mt-10 md:block">
                <FeatureTabs demoSlug={DEMO_SLUG} />
              </div>
            </div>
          </section>

          {/* Price, next to what no-shows cost. */}
          <section id="precos" className="scroll-mt-20 border-y border-border bg-muted/40">
            <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
              <SectionTitle sub={t("home.pricing.body")}>{t("home.pricing.title")}</SectionTitle>
              <div className="mt-8">
                <BillingToggle yearly={yearly} onChange={setYearly} />
              </div>
              <div className="mt-8 grid gap-6 md:grid-cols-2">
                <PlanCard
                  pro
                  name="SYCRAS Pro"
                  desc={t("home.pricing.desc")}
                  price={yearly ? "15 €" : "19 €"}
                  suffix={t("lp.price.month")}
                  after={t(yearly ? "lp.price.note.y" : "lp.price.note.m")}
                  badge={t("home.pricing.free")}
                  features={PLAN_FEATURES.map(t)}
                />
                <div className="hidden md:block">
                  <CalculatorCard />
                </div>
              </div>
              {/* Phones: the calculator opens on a tap, so the price stays close to the top. */}
              <details className="group mt-4 rounded-3xl border border-border bg-card md:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between p-5 text-base font-bold [&::-webkit-details-marker]:hidden">
                  {t("lp.calc.title")}
                  <span className="text-brand-ink transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <CalculatorCard bare />
              </details>
              {/* The trial, said plainly: what is in it and what is only in the paid Pro. */}
              <details className="group mx-auto mt-6 max-w-3xl rounded-3xl border border-border bg-card p-5">
                <summary className="cursor-pointer list-none text-center text-sm font-bold [&::-webkit-details-marker]:hidden">
                  {t("lp.included")} <span className="text-brand-ink group-open:hidden">+</span>
                </summary>
                <TrialIncludes className="mt-4" />
              </details>
            </div>
          </section>

          <Testimonials />

          {/* Questions */}
          <section
            id="perguntas"
            className="scroll-mt-20 mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24"
          >
            <SectionTitle>{t("lp.faq.title")}</SectionTitle>
            <Accordion type="single" collapsible className="mt-8">
              {LANDING_FAQ.map(([q, a]) => (
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

          <FounderNote />

          {/* Final call */}
          <section className="px-4 pb-16 sm:px-6 sm:pb-24">
            <div className="mx-auto grid max-w-5xl items-center gap-8 overflow-hidden rounded-[2rem] bg-neutral-950 px-6 py-12 text-white sm:px-12 md:grid-cols-[1.4fr_1fr] dark:bg-neutral-900">
              <div className="text-center md:text-left">
                <h2 className="font-classic text-4xl font-semibold leading-tight sm:text-5xl">
                  {t("lp.final.title")}
                </h2>
                <p className="mt-4 text-base font-medium text-white/80">{t("lp.final.body")}</p>
                {/* How to start, in three short steps. */}
                <ol className="mx-auto mt-6 max-w-md space-y-2.5 text-left md:mx-0">
                  {[1, 2, 3].map((n) => (
                    <li key={n} className="flex items-start gap-3 text-sm">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold">
                        {n}
                      </span>
                      <span>
                        <span className="font-bold">{t(`lp.steps.${n}.title`)}</span>
                        <span className="text-white/70"> · {t(`lp.steps.${n}.body`)}</span>
                      </span>
                    </li>
                  ))}
                </ol>
                <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row md:justify-start">
                  <Link
                    to="/auth"
                    search={REGISTER}
                    data-track="cta_final"
                    className="inline-flex h-12 items-center justify-center rounded-full bg-brand px-7 text-base font-bold text-white shadow-sm transition-transform active:scale-[0.98]"
                  >
                    {t("home.cta.create")}
                  </Link>
                  {APP_ON_PLAY && !inApp ? (
                    <a
                      href={PLAY_STORE_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/30 px-6 text-base font-bold text-white"
                    >
                      <PlayMark className="size-5" /> Google Play
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="mx-auto hidden w-48 md:block">
                <Phone src="/landing/v2/agenda.webp" alt="" />
              </div>
            </div>
          </section>
        </div>
      </main>

      <div className="hidden md:block">
        <SiteFooter />
      </div>
    </div>
  );
}

/** The two hero buttons: the app on Google Play first, or "create / sign in" until it is there. */
function HeroActions({ inApp }: { inApp: boolean }) {
  const { t } = usePrefs();
  if (inApp || !APP_ON_PLAY) {
    return (
      <>
        <div className="mt-7 flex flex-col gap-2 sm:mx-auto sm:mt-8 sm:max-w-none sm:flex-row sm:justify-center sm:gap-3 lg:justify-start">
          <Button asChild size="lg" variant="brand" className="h-13 rounded-full text-base sm:h-12">
            <Link to="/auth" search={REGISTER} data-track="cta_hero">
              {t("home.cta.create")}
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="hidden rounded-full sm:inline-flex"
          >
            <Link to="/auth" search={SIGN_IN}>
              {t("home.cta.have")}
            </Link>
          </Button>
        </div>
        {!inApp && (
          <Link
            to="/beta"
            data-track="beta_click"
            className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-brand-ink underline-offset-4 hover:underline"
          >
            <PlayMark className="size-4" />
            {t("lp.beta.link")}
          </Link>
        )}
      </>
    );
  }
  return (
    <>
      <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center lg:justify-start">
        <a
          href={PLAY_STORE_URL}
          target="_blank"
          rel="noreferrer"
          data-track="play_click"
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

/** A small card next to (or under) the hero phone: one moment of the owner's day. */
function HeroNote({
  title,
  body,
  tone,
  className,
}: {
  title: string;
  body: string;
  tone: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "animate-enter rounded-2xl bg-card p-3 text-left shadow-[0_20px_50px_-20px_rgba(0,0,0,0.35)]",
        className,
      )}
    >
      <p className={cn("text-[10px] font-bold uppercase tracking-wider", tone)}>{title}</p>
      <p className="mt-0.5 text-[13px] font-bold leading-snug">{body}</p>
    </div>
  );
}

function SectionTitle({ children, sub }: { children: ReactNode; sub?: string | undefined }) {
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
        <Link to="/auth" search={REGISTER} data-track="cta_pricing">
          {t(pro ? "home.cta.start" : "home.cta.create")}
        </Link>
      </Button>
    </article>
  );
}
