import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  CalendarCheck,
  Check,
  Clock,
  Share2,
  ShieldCheck,
  Sparkles,
  Users,
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
import {
  BeforeAfter,
  LiveHero,
  Story,
  StoryMobile,
  TryIt,
  TryItMobile,
} from "@/components/landing-showcase";

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

const FEATURES = [
  { icon: Share2, key: "f1" },
  { icon: CalendarCheck, key: "f2" },
  { icon: Users, key: "f3" },
  { icon: Clock, key: "f4" },
  { icon: ShieldCheck, key: "f5" },
  { icon: Sparkles, key: "f6" },
] as const;




const PLAN_FEATURES = [
  "sub.feature.bookingPage",
  "sub.feature.calendar",
  "sub.feature.clients",
  "sub.feature.team",
  "sub.feature.analytics",
  "sub.feature.reminders",
] as const;

function Landing() {
  const { t } = usePrefs();
  const inApp = useInNativeShell();

  return (
    <div className="min-h-screen">
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
            {/* Phones: the hero already has "I have an account"; keep the bar to one action. */}
            <Link
              to="/auth"
              search={SIGN_IN}
              className="hidden h-11 items-center whitespace-nowrap rounded-full px-3 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground sm:flex"
            >
              {t("home.signin")}
            </Link>
            <Button asChild size="sm" className="shrink-0">
              <Link to="/auth" search={REGISTER}>
                {t("home.cta.start")}
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="animate-enter mx-auto max-w-4xl px-4 pb-14 pt-14 text-center sm:px-6 sm:pt-24">
          <p className="flex items-center justify-center gap-3 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            <span aria-hidden className="h-px w-6 bg-border" />
            {t("home.eyebrow")}
            <span aria-hidden className="h-px w-6 bg-border" />
          </p>
          <h1 className="text-balance-tight mt-6 text-[2.5rem] font-bold leading-[1.05] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
            {t("home.title.a")} <span className="text-brand-ink">{t("home.title.em")}</span>{" "}
            {t("home.title.b")}
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base font-medium leading-relaxed text-muted-foreground sm:text-lg">
            {t("home.subtitle")}
          </p>
          {/* Until the app is on Google Play, the usual "create / sign in". */}
          {inApp || !APP_ON_PLAY ? (
            <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
              <Button asChild size="lg" variant="brand">
                <Link to="/auth" search={REGISTER}>
                  {t("home.cta.create")}
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/auth" search={SIGN_IN}>
                  {t("home.cta.have")}
                </Link>
              </Button>
            </div>
          ) : (
            // The website points to the phone app first: it is the best experience.
            <>
              <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
                <a
                  href={PLAY_STORE_URL}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t("home.cta.play")}
                  className="inline-flex h-12 items-center justify-center gap-3 rounded-xl bg-foreground px-5 text-background shadow-sm transition-transform active:scale-[0.98] sm:min-w-56"
                >
                  <PlayMark className="size-6" />
                  <span className="text-left leading-tight">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider opacity-80">
                      {t("home.cta.playSmall")}
                    </span>
                    <span className="block text-base font-bold">Google Play</span>
                  </span>
                </a>
                <Button asChild size="lg" variant="outline" className="h-12 sm:min-w-56">
                  <Link to="/auth" search={SIGN_IN}>
                    {t("home.cta.online")}
                  </Link>
                </Button>
              </div>
              <p className="mt-3 text-[13px] font-medium text-muted-foreground">
                {t("home.cta.appHint")}
              </p>
            </>
          )}
          <Link
            to="/$slug"
            params={{ slug: DEMO_SLUG }}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-brand-ink underline-offset-4 hover:underline"
          >
            {t("home.demo")} <ArrowRight className="size-4" />
          </Link>
          <p className="mt-4 text-[13px] font-semibold text-muted-foreground">
            {t("home.reassure")}
          </p>
        </section>

        {/* The app at work: the client's page and the owner's Today, bookings arriving. */}
        <section className="mx-auto max-w-4xl px-4 pb-20 sm:px-6 sm:pb-28">
          <LiveHero />
        </section>

        {/* Before / after */}
        <section className="border-y border-border bg-muted/40">
          <div className="mx-auto grid max-w-5xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-24 md:grid-cols-2">
            <div className="text-center md:text-left">
              <h2 className="text-balance-tight text-3xl font-bold tracking-[-0.035em] sm:text-4xl">
                {t("home.ba.title")}
              </h2>
              <p className="mx-auto mt-3 max-w-md text-base font-medium text-muted-foreground md:mx-0">
                {t("home.ba.body")}
              </p>
            </div>
            <BeforeAfter />
          </div>
        </section>

        {/* Como funciona */}
        <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-24">
          <SectionTitle>{t("home.story.title")}</SectionTitle>
          <div className="mt-8 md:hidden">
            <StoryMobile />
          </div>
          <div className="mt-10 hidden md:block">
            <Story />
          </div>
        </section>

        {/* Funcionalidades */}
        <section
          id="funcionalidades"
          className="scroll-mt-20 mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-24"
        >
          <SectionTitle>{t("home.features.title")}</SectionTitle>
          <ul className="surface mt-8 divide-y divide-border overflow-hidden md:hidden">
            {FEATURES.map((f) => (
              <li key={f.key} className="flex items-start gap-3.5 p-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand/12 text-brand-ink dark:bg-brand/25">
                  <f.icon className="size-[17px]" strokeWidth={2.2} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-bold">{t(`${f.key}.title`)}</span>
                  <span className="mt-0.5 block text-sm font-medium leading-snug text-muted-foreground">
                    {t(`${f.key}.body`)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-10 hidden overflow-hidden rounded-3xl border border-border md:grid md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <article
                key={f.key}
                className="-mb-px -mr-px border-b border-r border-border bg-card p-6 sm:p-8"
              >
                <span className="flex size-10 items-center justify-center rounded-full border border-border">
                  <f.icon className="size-[18px]" strokeWidth={2} />
                </span>
                <h3 className="mt-4 text-base font-bold">{t(`${f.key}.title`)}</h3>
                <p className="mt-1.5 text-sm font-medium leading-relaxed text-muted-foreground">
                  {t(`${f.key}.body`)}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* Experimenta */}
        <section className="border-y border-border bg-muted/40">
          <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-24">
            <SectionTitle sub={t("home.try.body")}>{t("home.try.title")}</SectionTitle>
            <div className="mt-8 md:hidden">
              <TryItMobile />
            </div>
            <div className="mt-10 hidden md:block">
              <TryIt />
            </div>
          </div>
        </section>

        {/* Preços */}
        <section id="precos" className="scroll-mt-20">
          <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-24">
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

        {/* Perguntas */}
        <section
          id="perguntas"
          className="scroll-mt-20 mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-24"
        >
          <SectionTitle>{t("home.faq.title")}</SectionTitle>
          <Accordion type="single" collapsible className="mt-8">
            {[1, 2, 3, 4].map((n) => (
              <AccordionItem key={n} value={`q${n}`}>
                <AccordionTrigger className="text-[15px] font-bold hover:no-underline">
                  {t(`home.faq.${n}.q`)}
                </AccordionTrigger>
                <AccordionContent className="font-medium leading-relaxed text-muted-foreground">
                  {t(`home.faq.${n}.a`)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
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
      <p className="mt-1.5 text-center text-[11px] font-semibold text-muted-foreground">{t("home.reassure")}</p>
    </div>
  );
}

function SectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="text-center">
      <h2 className="text-balance-tight text-3xl font-bold tracking-[-0.035em] sm:text-4xl">
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
