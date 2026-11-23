import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  Globe,
  HandCoins,
  Repeat,
  RotateCcw,
  Star,
  Sun,
  Users,
  Wallet,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { usePrefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";

/** A real screenshot of the app inside a phone frame. */
export function Phone({
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
        "overflow-hidden rounded-[1.5rem] border-[5px] border-neutral-900 bg-neutral-900 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)] dark:border-neutral-700",
        className,
      )}
    >
      <img
        src={src}
        alt={alt}
        width={640}
        height={1327}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        decoding="async"
        className="block h-auto w-full rounded-[1.15rem]"
      />
    </div>
  );
}

/** The client's side: the booking page in a browser window. */
function BrowserShot() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_30px_80px_-30px_rgba(0,0,0,0.35)]">
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/60 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-neutral-300 dark:bg-neutral-600" />
        <span className="size-2.5 rounded-full bg-neutral-300 dark:bg-neutral-600" />
        <span className="size-2.5 rounded-full bg-neutral-300 dark:bg-neutral-600" />
        <span className="ml-3 truncate rounded-md bg-background px-3 py-1 text-[11px] font-semibold text-muted-foreground">
          sycras.com/barbearia-central
        </span>
      </div>
      <img
        src="/landing/v2/pagina-web.webp"
        alt=""
        width={1180}
        height={470}
        loading="lazy"
        decoding="async"
        className="block h-60 w-full object-cover object-left-top sm:h-auto"
      />
    </div>
  );
}

/** The deposit, as the client and the owner see it. */
function DepositVisual() {
  const { t } = usePrefs();
  return (
    <div className="mx-auto w-full max-w-sm space-y-4 rounded-[2rem] bg-neutral-950 p-6 text-white">
      <div className="rounded-3xl bg-white p-5 text-neutral-900">
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-bold">{t("lp.deposit.card.service")}</span>
          <span className="text-xs font-semibold text-neutral-500">30 min</span>
        </div>
        <p className="mt-1 text-sm font-semibold text-neutral-500">{t("lp.deposit.card.line")}</p>
        <div className="mt-4 rounded-2xl bg-[#1f6fe5] py-3 text-center text-sm font-bold text-white">
          4,50 €
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
        <span className="flex size-9 items-center justify-center rounded-full bg-white text-neutral-950">
          <Wallet className="size-4" strokeWidth={2.4} />
        </span>
        <span className="text-sm font-semibold">{t("lp.deposit.card.paid")}</span>
      </div>
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
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
      tone: "bg-foreground text-background",
    },
  ] as const;
  return (
    <ul className="mx-auto w-full max-w-sm space-y-3">
      {items.map((n) => (
        <li
          key={n.title}
          className="flex items-start gap-3 rounded-3xl bg-card p-4 shadow-[var(--shadow-soft)]"
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

export type Tab = {
  /** The screenshot, when the visual is a phone (the phone pages size it themselves). */
  shot?: string;
  id: string;
  icon: typeof Sun;
  /** Prefix of the texts: `${key}.kicker`, `.title`, `.body`, `.1`…`.3`. */
  key: string;
  points: number;
  visual: () => ReactNode;
  extra?: ReactNode;
};

const phone = (src: string) => () => (
  <Phone src={src} alt="" className="mx-auto w-[58%] max-w-[260px] md:w-[72%] md:max-w-[280px]" />
);

/**
 * All the features in one block: a row of tabs and, for each, a short text and the real screen.
 * Replaces the long list of sections (one screen of scroll instead of ten).
 */
export function useFeatures(demoSlug: string): Tab[] {
  const { t } = usePrefs();
  return [
    {
      id: "pagina",
      icon: Globe,
      key: "lp.share",
      points: 3,
      visual: () => <BrowserShot />,
      // Phones show the page as clients see it on their phone.
      shot: "/landing/v2/pagina.webp",
      extra: (
        <Link
          to="/$slug"
          params={{ slug: demoSlug }}
          data-track="demo_click"
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-brand-ink underline-offset-4 hover:underline"
        >
          {t("home.demo")} <ArrowRight className="size-4" />
        </Link>
      ),
    },
    {
      id: "agenda",
      icon: CalendarDays,
      key: "lp.agenda",
      points: 3,
      visual: phone("/landing/v2/agenda.webp"),
      shot: "/landing/v2/agenda.webp",
    },
    {
      id: "clientes",
      icon: Users,
      key: "lp.clients",
      points: 3,
      visual: phone("/landing/v2/cliente.webp"),
      shot: "/landing/v2/cliente.webp",
    },
    {
      id: "lembretes",
      icon: Bell,
      key: "lp.reminders",
      points: 3,
      visual: () => <RemindersVisual />,
    },
    { id: "sinal", icon: HandCoins, key: "lp.deposit", points: 4, visual: () => <DepositVisual /> },
    {
      id: "numeros",
      icon: BarChart3,
      key: "lp.stats",
      points: 2,
      visual: phone("/landing/v2/estatisticas.webp"),
      shot: "/landing/v2/estatisticas.webp",
    },
  ];
}

export function FeatureTabs({ demoSlug }: { demoSlug: string }) {
  const { t } = usePrefs();
  const tabs = useFeatures(demoSlug);
  const [active, setActive] = useState(tabs[0]!.id);
  const tab = tabs.find((x) => x.id === active) ?? tabs[0]!;

  return (
    <div>
      <div
        role="tablist"
        aria-label={t("lp.show.title")}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0"
      >
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            id={`tab-${x.id}`}
            aria-selected={x.id === active}
            aria-controls="painel-funcionalidade"
            onClick={() => setActive(x.id)}
            className={cn(
              "inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold transition-colors",
              x.id === active
                ? "bg-foreground text-background"
                : "border border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <x.icon className="size-4" />
            {t(`${x.key}.kicker`).split("·").pop()?.trim()}
          </button>
        ))}
      </div>

      <div
        id="painel-funcionalidade"
        role="tabpanel"
        aria-labelledby={`tab-${tab.id}`}
        key={tab.id}
        className="animate-enter mt-6 grid items-center gap-6 md:mt-8 md:grid-cols-2 md:gap-14"
      >
        <div>{tab.visual()}</div>
        <div className="text-center md:text-left">
          <h3 className="font-classic text-[2rem] font-semibold leading-[1.1] tracking-[-0.01em] sm:text-[2.6rem]">
            {t(`${tab.key}.title`)}
          </h3>
          <p className="mx-auto mt-4 max-w-md text-base font-medium leading-relaxed text-muted-foreground md:mx-0">
            {t(`${tab.key}.body`)}
          </p>
          <ul className="mx-auto mt-6 max-w-md space-y-3 text-left md:mx-0">
            {Array.from({ length: tab.points }, (_, i) => `${tab.key}.${i + 1}`).map((k) => (
              <li key={k} className="flex items-start gap-3 text-[15px] font-semibold leading-snug">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                  <svg
                    viewBox="0 0 24 24"
                    className="size-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3.5}
                    aria-hidden
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                {t(k)}
              </li>
            ))}
          </ul>
          {tab.extra}
        </div>
      </div>
    </div>
  );
}

/**
 * Phones: the same features as cards that slide sideways with a finger (like stories),
 * each with the real screen on top and two short lines. The dots say where you are.
 */
export function FeatureCarousel({ demoSlug }: { demoSlug: string }) {
  const { t } = usePrefs();
  const items = useFeatures(demoSlug);
  const [index, setIndex] = useState(0);
  return (
    <div>
      <div
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]"
        onScroll={(e) => {
          const el = e.currentTarget;
          const card = el.firstElementChild as HTMLElement | null;
          if (!card) return;
          setIndex(Math.round(el.scrollLeft / (card.offsetWidth + 12)));
        }}
      >
        {items.map((x) => (
          <article
            key={x.id}
            className="w-[84%] shrink-0 snap-center overflow-hidden rounded-3xl border border-border bg-card"
          >
            <div className="relative flex h-[300px] items-start justify-center overflow-hidden bg-muted/60 px-4 pt-5">
              <div className="w-full">{x.visual()}</div>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent"
              />
            </div>
            <div className="p-5 pt-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-ink">
                <x.icon className="size-3.5" />
                {t(`${x.key}.kicker`).split("·").pop()?.trim()}
              </p>
              <h3 className="mt-2 text-xl font-bold leading-snug">{t(`${x.key}.title`)}</h3>
              <ul className="mt-3 space-y-2">
                {[1, 2].map((n) => (
                  <li
                    key={n}
                    className="flex items-start gap-2 text-sm font-medium leading-snug text-muted-foreground"
                  >
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                    {t(`${x.key}.${n}`)}
                  </li>
                ))}
              </ul>
              {x.extra}
            </div>
          </article>
        ))}
      </div>
      <div className="mt-4 flex justify-center gap-1.5" aria-hidden>
        {items.map((x, i) => (
          <span
            key={x.id}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              i === index ? "w-5 bg-foreground" : "w-1.5 bg-border",
            )}
          />
        ))}
      </div>
    </div>
  );
}
