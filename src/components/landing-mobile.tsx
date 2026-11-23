import { Link } from "@tanstack/react-router";
import {
  Brush,
  Check,
  ChevronDown,
  Dumbbell,
  Hand,
  HeartPulse,
  PenTool,
  Scissors,
  Sparkles,
  Waves,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { BillingToggle, CalculatorCard } from "@/components/landing-sections";
import { useFeatures } from "@/components/landing-tabs";
import { PlayMark } from "@/components/play-mark";
import { TrialIncludes } from "@/components/trial-includes";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { usePrefs } from "@/lib/prefs";
import { LANDING_FAQ } from "@/lib/seo";
import { cn } from "@/lib/utils";

const REGISTER = { mode: "register", next: undefined } as const;

/**
 * One page of the phone landing: exactly one screen tall (the 64 px header left out), so every
 * page fits and snaps into place with one swipe, like TikTok. Everything is centred.
 */
function Page({
  id,
  label,
  children,
  className,
}: {
  id?: string | undefined;
  /** Name for the side bar (screen readers). */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-label={label}
      data-page
      className={cn(
        "snap-page flex h-[calc(100dvh-4rem)] flex-col items-center overflow-hidden px-6 pb-[clamp(0.75rem,2.5dvh,1.5rem)] pt-[clamp(1rem,3.5dvh,2rem)] text-center",
        className,
      )}
    >
      {children}
    </section>
  );
}

/**
 * A screenshot with a thin phone edge. It takes the height left on the page
 * (parent is a flex column), so it never pushes the page past the screen.
 */
function Shot({ src, alt = "" }: { src: string; alt?: string }) {
  return (
    <div className="flex min-h-0 w-full flex-1 items-center justify-center py-3">
      <div
        className="h-full max-h-[460px] overflow-hidden rounded-[1.1rem] border-[4px] border-neutral-900 bg-neutral-900 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.5)] dark:border-neutral-700"
        style={{ aspectRatio: "640 / 1327" }}
      >
        <img
          src={src}
          alt={alt}
          width={640}
          height={1327}
          loading="lazy"
          decoding="async"
          className="block h-full w-full rounded-[0.8rem] object-cover object-top"
        />
      </div>
    </div>
  );
}

/**
 * The first page's picture: three real screens side by side like cards in a hand —
 * the Diário in front, the Agenda and a client behind it, slightly turned.
 */
function Trio() {
  const { t } = usePrefs();
  const frame =
    "absolute top-1/2 overflow-hidden rounded-[1rem] border-[4px] border-neutral-900 bg-neutral-900 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.5)] dark:border-neutral-700";
  const img = (src: string, alt = "") => (
    <img
      src={src}
      alt={alt}
      width={640}
      height={1327}
      decoding="async"
      className="block h-full w-full rounded-[0.7rem] object-cover object-top"
    />
  );
  return (
    <div className="relative min-h-0 w-full flex-1 py-3">
      <div
        className={cn(frame, "left-[4%] h-[78%] -translate-y-1/2 -rotate-[7deg] opacity-90")}
        style={{ aspectRatio: "640 / 1327" }}
      >
        {img("/landing/v2/agenda.webp")}
      </div>
      <div
        className={cn(frame, "right-[4%] h-[78%] -translate-y-1/2 rotate-[7deg] opacity-90")}
        style={{ aspectRatio: "640 / 1327" }}
      >
        {img("/landing/v2/cliente.webp")}
      </div>
      <div
        className={cn(frame, "left-1/2 z-10 h-[94%] -translate-x-1/2 -translate-y-1/2")}
        style={{ aspectRatio: "640 / 1327" }}
      >
        {img("/landing/v2/diario.webp", t("lp.diario.title"))}
      </div>
    </div>
  );
}

const WHO = [
  { icon: Scissors, key: "lp.who.1" },
  { icon: Brush, key: "lp.who.2" },
  { icon: Sparkles, key: "lp.who.3" },
  { icon: Hand, key: "lp.who.4" },
  { icon: Waves, key: "lp.who.5" },
  { icon: HeartPulse, key: "lp.who.6" },
  { icon: Dumbbell, key: "lp.who.7" },
  { icon: PenTool, key: "lp.who.8" },
] as const;

/**
 * The side bar: one dot per page, the current one long and dark. A tap jumps to that page,
 * so people always know where they are and how much is left.
 */
function SideBar({ root }: { root: React.RefObject<HTMLDivElement | null> }) {
  const [pages, setPages] = useState<{ el: HTMLElement; label: string }[]>([]);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const els = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-page]") ?? []);
    setPages(els.map((el) => ({ el, label: el.getAttribute("aria-label") ?? "" })));
    // Each page plays the menu's entrance (fade up) every time it comes into view, going down or
    // back up: `data-shown` is set when the page fills the screen and cleared once it has left.
    root.current?.setAttribute("data-anim", "");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const el = e.target as HTMLElement;
          if (e.intersectionRatio >= 0.55) {
            setActive(els.indexOf(el));
            el.setAttribute("data-shown", "");
          } else if (e.intersectionRatio === 0) {
            el.removeAttribute("data-shown");
          }
        }
      },
      { threshold: [0, 0.55] },
    );
    els.forEach((el) => io.observe(el));

    // A mouse wheel / trackpad moves exactly one page per flick too (fingers already do, through
    // scroll-snap-stop). Pages that scroll inside (price, questions) keep their own scrolling.
    let locked = false;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 4) return;
      const inner = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-page]");
      if (inner && inner.scrollHeight > inner.clientHeight + 2) {
        const atTop = inner.scrollTop <= 0;
        const atEnd = inner.scrollTop + inner.clientHeight >= inner.scrollHeight - 2;
        if ((e.deltaY > 0 && !atEnd) || (e.deltaY < 0 && !atTop)) return;
      }
      const current = els.findIndex((el) => el.hasAttribute("data-shown"));
      // Past the last page (the footer) or above the first: plain scrolling.
      const next = current < 0 ? undefined : els[current + (e.deltaY > 0 ? 1 : -1)];
      if (!next) return;
      e.preventDefault();
      if (locked) return;
      locked = true;
      next.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => (locked = false), 700);
    };
    const host = root.current;
    host?.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      io.disconnect();
      host?.removeEventListener("wheel", onWheel);
    };
  }, [root]);
  if (pages.length === 0) return null;
  return (
    <nav
      aria-label="Páginas"
      className="fixed right-1 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-1 md:hidden"
    >
      {pages.map((p, i) => (
        <button
          key={i}
          type="button"
          aria-label={p.label}
          aria-current={i === active ? "true" : undefined}
          onClick={() => p.el.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="flex h-4 w-4 items-center justify-center"
        >
          <span
            className={cn(
              "block w-1.5 rounded-full transition-all duration-300",
              i === active ? "h-4 bg-foreground" : "h-1.5 bg-foreground/25",
            )}
          />
        </button>
      ))}
    </nav>
  );
}

/**
 * The whole homepage for phones: full-screen pages (start, who, one per feature, price,
 * questions, last call), with a side bar of dots. Shown below 768 px only.
 */
export function MobileLanding({
  demoSlug,
  inApp,
  showPlay,
  playUrl,
  footer,
}: {
  demoSlug: string;
  inApp: boolean;
  showPlay: boolean;
  playUrl: string;
  planFeatures?: readonly string[];
  footer: ReactNode;
}) {
  const { t } = usePrefs();
  const features = useFeatures(demoSlug);
  const [yearly, setYearly] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  return (
    <div ref={root} className="md:hidden">
      <SideBar root={root} />

      {/* 1. The promise, one button, the app, and the swipe hint — all on one screen. */}
      <Page label={t("lp.title.a")}>
        <h1 className="font-classic text-[clamp(1.75rem,5.2dvh,2.4rem)] font-semibold leading-[1.05] tracking-[-0.02em]">
          {t("lp.title.a")}
          <br />
          <span className="text-brand-ink">{t("lp.title.b")}</span>
        </h1>
        <p className="mt-[clamp(0.4rem,1.5dvh,0.75rem)] line-clamp-3 max-w-sm text-[clamp(13px,1.9dvh,15px)] [@media(max-height:640px)]:line-clamp-2 font-medium leading-relaxed text-muted-foreground">
          {t("lp.subtitle")}
        </p>
        <Button
          asChild
          size="lg"
          variant="brand"
          className="mt-[clamp(0.6rem,2dvh,1rem)] h-[clamp(2.75rem,6.5dvh,3rem)] w-full max-w-sm shrink-0 rounded-full"
        >
          <Link to="/auth" search={REGISTER} data-track="cta_hero">
            {t("home.cta.create")}
          </Link>
        </Button>
        <ul className="mt-2.5 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[12px] font-semibold text-muted-foreground">
          {(["lp.trust.1", "lp.trust.2", "lp.trust.3"] as const).map((k) => (
            <li key={k} className="flex items-center gap-1">
              <Check className="size-3.5 text-brand-ink" strokeWidth={2.6} />
              {t(k)}
            </li>
          ))}
        </ul>
        <Trio />
        <span className="inline-flex shrink-0 flex-col items-center text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          {t("lp.m.swipe")}
          <ChevronDown className="size-4 animate-bounce motion-reduce:animate-none" />
        </span>
      </Page>

      {/* 2. Who it is for: big tiles that fill the screen. */}
      <Page label={t("lp.who.title")} className="justify-center">
        <h2 className="font-classic text-[clamp(1.7rem,4.8dvh,2.35rem)] font-semibold leading-tight">
          {t("lp.who.title")}
        </h2>
        <p className="mt-2 max-w-xs text-[15px] font-medium text-muted-foreground">
          {t("lp.who.sub")}
        </p>
        <ul className="mt-[clamp(0.75rem,3dvh,1.5rem)] grid w-full max-w-sm grid-cols-2 gap-[clamp(0.4rem,1.2dvh,0.65rem)]">
          {WHO.map((w) => (
            <li
              key={w.key}
              className="flex flex-col items-center justify-center gap-[clamp(0.3rem,1dvh,0.5rem)] rounded-2xl bg-card px-2 py-[clamp(0.55rem,2dvh,1.1rem)] shadow-[var(--shadow-soft)]"
            >
              <span className="flex size-[clamp(2rem,5dvh,2.6rem)] items-center justify-center rounded-xl bg-foreground text-background">
                <w.icon className="size-5" />
              </span>
              <span className="text-[14px] font-bold">{t(w.key)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-sm font-semibold text-muted-foreground">{t("lp.who.more")}</p>
      </Page>

      {/* 3–8. One page per feature: title, the real screen, two short lines. */}
      {features.map((f, i) => {
        const label = t(`${f.key}.kicker`).split("·").pop()?.trim() ?? "";
        return (
          <Page key={f.id} id={i === 0 ? "m-funcionalidades" : undefined} label={label}>
            <p className="flex shrink-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-ink">
              <f.icon className="size-3.5" />
              {label}
            </p>
            <h2 className="mt-2 max-w-sm shrink-0 font-classic text-[clamp(1.4rem,4dvh,1.85rem)] font-semibold leading-[1.12]">
              {t(`${f.key}.title`)}
            </h2>
            {f.shot ? (
              <Shot src={f.shot} />
            ) : (
              <div className="flex min-h-0 w-full flex-1 items-center justify-center py-3">
                <div className="w-full max-w-[300px] origin-center scale-[0.9]">{f.visual()}</div>
              </div>
            )}
            <ul className="max-w-sm shrink-0 space-y-1">
              {[1, 2].map((n) => (
                <li key={n} className="text-[14px] font-semibold leading-snug">
                  {t(`${f.key}.${n}`)}
                </li>
              ))}
            </ul>
            {f.extra && <div className="shrink-0">{f.extra}</div>}
          </Page>
        );
      })}

      {/* 9. Price: the card, then two things that open on a tap (scroll inside if opened). */}
      <Page
        id="m-precos"
        label={t("home.nav.pricing")}
        className="justify-center-safe overflow-y-auto"
      >
        <h2 className="font-classic text-[clamp(1.6rem,4.4dvh,2.1rem)] font-semibold leading-tight">
          {t("home.pricing.title")}
        </h2>
        <div className="mt-4">
          <BillingToggle yearly={yearly} onChange={setYearly} />
        </div>
        <div className="mt-4 w-full max-w-sm rounded-3xl bg-card p-6 shadow-[var(--shadow-soft)]">
          <span className="inline-flex rounded-full bg-brand/10 px-3 py-1 text-xs font-bold text-brand-ink">
            {t("lp.price.trial")}
          </span>
          <p className="mt-3 text-sm font-bold">SYCRAS Pro</p>
          <p className="mt-1 flex items-baseline justify-center gap-1">
            <span className="text-6xl font-bold tracking-[-0.04em]">{yearly ? "15" : "19"} €</span>
            <span className="text-lg font-semibold text-muted-foreground">
              {t("lp.price.month")}
            </span>
          </p>
          <p className="mt-2 text-sm font-medium text-muted-foreground">
            {t(yearly ? "lp.price.note.y" : "lp.price.note.m")}
          </p>
          <Button asChild size="lg" variant="brand" className="mt-5 w-full rounded-full">
            <Link to="/auth" search={REGISTER} data-track="cta_pricing">
              {t("home.cta.start")}
            </Link>
          </Button>
        </div>
        <details className="group mt-3 w-full max-w-sm rounded-3xl border border-border bg-card text-left">
          <summary className="flex cursor-pointer list-none items-center justify-between p-4 text-sm font-bold [&::-webkit-details-marker]:hidden">
            {t("lp.included")}
            <span className="text-brand-ink transition-transform group-open:rotate-45">+</span>
          </summary>
          <TrialIncludes compact className="px-4 pb-4" />
        </details>
        <details className="group mt-2 w-full max-w-sm rounded-3xl border border-border bg-card text-left">
          <summary className="flex cursor-pointer list-none items-center justify-between p-4 text-sm font-bold [&::-webkit-details-marker]:hidden">
            {t("lp.calc.title")}
            <span className="text-brand-ink transition-transform group-open:rotate-45">+</span>
          </summary>
          <CalculatorCard bare />
        </details>
      </Page>

      {/* 10. Questions (scroll inside when one is opened). */}
      <Page id="m-perguntas" label={t("lp.faq.title")} className="overflow-y-auto">
        <h2 className="font-classic text-[clamp(1.6rem,4.4dvh,2.1rem)] font-semibold leading-tight">
          {t("lp.faq.title")}
        </h2>
        <Accordion type="single" collapsible className="mt-3 w-full max-w-sm text-left">
          {LANDING_FAQ.map(([q, a]) => (
            <AccordionItem key={q} value={q}>
              <AccordionTrigger className="py-3 text-[14px] font-bold hover:no-underline">
                {t(q)}
              </AccordionTrigger>
              <AccordionContent className="text-[14px] font-medium leading-relaxed text-muted-foreground">
                {t(a)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Page>

      {/* 11. Last call. */}
      <Page label={t("home.cta.create")} className="justify-center">
        <div className="flex w-full max-w-sm flex-col items-center rounded-[2rem] bg-neutral-950 px-6 py-[clamp(1.5rem,5dvh,3rem)] text-white dark:bg-neutral-900">
          <h2 className="font-classic text-[clamp(1.7rem,4.8dvh,2.35rem)] font-semibold leading-tight">
            {t("lp.final.title")}
          </h2>
          <p className="mt-3 text-[15px] font-medium text-white/75">{t("lp.final.body")}</p>
          <ol className="mt-[clamp(1rem,3.5dvh,1.75rem)] space-y-[clamp(0.5rem,1.8dvh,1rem)]">
            {[1, 2, 3].map((n) => (
              <li key={n} className="flex flex-col items-center">
                <span className="flex size-8 items-center justify-center rounded-full bg-white/10 text-sm font-bold">
                  {n}
                </span>
                <span className="mt-1.5 text-[15px] font-bold">{t(`lp.steps.${n}.title`)}</span>
              </li>
            ))}
          </ol>
          <Link
            to="/auth"
            search={REGISTER}
            data-track="cta_final"
            className="mt-[clamp(1rem,4dvh,2rem)] inline-flex h-12 w-full items-center justify-center rounded-full bg-brand text-base font-bold text-white"
          >
            {t("home.cta.create")}
          </Link>
          {showPlay && !inApp && (
            <a
              href={playUrl}
              target="_blank"
              rel="noreferrer"
              data-track="play_click"
              className="mt-3 inline-flex h-12 w-full max-w-sm items-center justify-center gap-2 rounded-full border border-white/30 font-bold"
            >
              <PlayMark className="size-5" /> Google Play
            </a>
          )}
        </div>
      </Page>
      <div className="snap-page">{footer}</div>
    </div>
  );
}
