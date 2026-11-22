import { Link } from "@tanstack/react-router";
import {
  Brush,
  Dumbbell,
  Hand,
  HeartPulse,
  Menu,
  PenTool,
  Scissors,
  Sparkles,
  Waves,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { usePrefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";

const REGISTER = { mode: "register", next: undefined } as const;
const SIGN_IN = { mode: undefined, next: undefined } as const;

/** The homepage sections, in the order of the menu. */
export const LANDING_NAV = [
  { href: "#como-funciona", key: "lp.nav.how" },
  { href: "#funcionalidades", key: "home.nav.features" },
  { href: "#precos", key: "home.nav.pricing" },
  { href: "#perguntas", key: "home.nav.faq" },
] as const;

/** Phones: the menu behind a button, as a panel under the header. Closes on a choice or Esc. */
export function MobileMenu() {
  const { t } = usePrefs();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="menu-telemovel"
        aria-label={t(open ? "lp.nav.close" : "lp.nav.menu")}
        className="flex size-11 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-muted"
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
      {open && (
        <nav
          id="menu-telemovel"
          className="animate-enter absolute inset-x-0 top-full border-b border-border bg-background px-4 pb-5 pt-2 shadow-lg"
        >
          <ul className="flex flex-col">
            {LANDING_NAV.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="flex h-12 items-center border-b border-border/60 text-base font-bold"
                >
                  {t(l.key)}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button asChild variant="outline" size="lg" className="rounded-full">
              <Link to="/auth" search={SIGN_IN}>
                {t("home.signin")}
              </Link>
            </Button>
            <Button asChild variant="brand" size="lg" className="rounded-full">
              <Link to="/auth" search={REGISTER}>
                {t("home.cta.start")}
              </Link>
            </Button>
          </div>
        </nav>
      )}
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

/** Who it is for: the kinds of business, as a simple grid. */
export function WhoFor({ title }: { title: (children: ReactNode, sub?: string) => ReactNode }) {
  const { t } = usePrefs();
  return (
    <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
      {title(t("lp.who.title"), t("lp.who.sub"))}
      <ul className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {WHO.map((w) => (
          <li
            key={w.key}
            className="flex flex-col items-center gap-3 rounded-2xl bg-card px-3 py-5 text-center shadow-[var(--shadow-soft)]"
          >
            <span className="flex size-11 items-center justify-center rounded-xl bg-foreground text-background">
              <w.icon className="size-5" />
            </span>
            <span className="text-sm font-bold">{t(w.key)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-center text-sm font-semibold text-muted-foreground">
        {t("lp.who.more")}
      </p>
    </section>
  );
}

const euro = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })
    .format(n)
    .replace(/\s/g, " ");

/** A number the visitor chooses with a slider (big thumb for fingers) and sees written next to it. */
function Range({
  label,
  value,
  min,
  max,
  step,
  onChange,
  show,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  show: string;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-bold">{label}</span>
        <span className="text-lg font-bold tabular-nums">{show}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 h-11 w-full cursor-pointer accent-[var(--brand)]"
      />
    </label>
  );
}

/**
 * What no-shows cost, with the visitor's own numbers. The starting values are only an example
 * to move; nothing here claims a result.
 */
export function NoShowCalculator({
  title,
}: {
  title: (children: ReactNode, sub?: string) => ReactNode;
}) {
  const { t } = usePrefs();
  const [noShows, setNoShows] = useState(4);
  const [price, setPrice] = useState(15);
  const lost = noShows * price;
  return (
    <section className="border-y border-border bg-muted/40">
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
        {title(t("lp.calc.title"), t("lp.calc.sub"))}
        <div className="mx-auto mt-10 grid max-w-3xl gap-6 rounded-3xl bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8 md:grid-cols-[1fr_auto] md:items-center md:gap-10">
          <div className="space-y-4">
            <Range
              label={t("lp.calc.noshows")}
              value={noShows}
              min={0}
              max={30}
              step={1}
              onChange={setNoShows}
              show={String(noShows)}
            />
            <Range
              label={t("lp.calc.price")}
              value={price}
              min={5}
              max={150}
              step={5}
              onChange={setPrice}
              show={euro(price)}
            />
          </div>
          <div className="rounded-2xl bg-foreground p-6 text-center text-background md:min-w-60">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] opacity-70">
              {t("lp.calc.lost")}
            </p>
            <p
              className="mt-1 text-5xl font-bold tabular-nums tracking-[-0.03em]"
              aria-live="polite"
            >
              {euro(lost)}
            </p>
            <p className="mt-2 text-sm font-semibold opacity-80">
              {t("lp.calc.year").replace("{x}", euro(lost * 12))}
            </p>
          </div>
        </div>
        <p className="mx-auto mt-6 max-w-xl text-center text-sm font-medium leading-relaxed text-muted-foreground">
          {t("lp.calc.pro")}
        </p>
      </div>
    </section>
  );
}

/** Monthly or yearly: which price the plan card shows after the free days. */
export function BillingToggle({
  yearly,
  onChange,
}: {
  yearly: boolean;
  onChange: (yearly: boolean) => void;
}) {
  const { t } = usePrefs();
  const option = (on: boolean, label: ReactNode) => (
    <button
      type="button"
      role="radio"
      aria-checked={yearly === on}
      onClick={() => onChange(on)}
      className={cn(
        "flex h-11 items-center gap-2 rounded-full px-5 text-sm font-bold transition-colors",
        yearly === on
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
  return (
    <div
      role="radiogroup"
      aria-label={`${t("lp.price.monthly")} / ${t("lp.price.yearly")}`}
      className="mx-auto flex w-fit items-center gap-1 rounded-full bg-muted p-1"
    >
      {option(false, t("lp.price.monthly"))}
      {option(
        true,
        <>
          {t("lp.price.yearly")}
          <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] text-white">
            {t("lp.price.save")}
          </span>
        </>,
      )}
    </div>
  );
}

/**
 * Real words from real customers only. Empty until there are some: [[PREENCHER: testemunhos
 * reais, com autorização de quem os escreveu]]. Never invent them.
 */
const TESTIMONIALS: { quote: string; name: string; business: string }[] = [];

export function Testimonials() {
  if (TESTIMONIALS.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      <ul className="grid gap-4 md:grid-cols-3">
        {TESTIMONIALS.map((q) => (
          <li key={q.name} className="rounded-3xl bg-card p-6 shadow-[var(--shadow-soft)]">
            <blockquote className="text-base font-medium leading-relaxed">“{q.quote}”</blockquote>
            <p className="mt-4 text-sm font-bold">{q.name}</p>
            <p className="text-sm font-medium text-muted-foreground">{q.business}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A short note from whoever makes SYCRAS. Hidden until written:
 * [[PREENCHER: texto curto do fundador, nome e (opcional) foto]].
 */
const FOUNDER_NOTE: { text: string; name: string } | null = null;

export function FounderNote() {
  if (!FOUNDER_NOTE) return null;
  return (
    <section className="mx-auto max-w-2xl px-4 pb-16 text-center sm:px-6 sm:pb-24">
      <p className="font-classic text-2xl font-semibold leading-snug">“{FOUNDER_NOTE.text}”</p>
      <p className="mt-4 text-sm font-bold text-muted-foreground">{FOUNDER_NOTE.name}</p>
    </section>
  );
}

/** The footer: three short columns and the year. No owner details here (only in the legal pages). */
export function SiteFooter() {
  const { t } = usePrefs();
  const head = "text-[11px] font-bold uppercase tracking-[0.16em] text-foreground";
  const link = "underline-offset-4 hover:text-foreground hover:underline";
  return (
    <footer className="border-t border-border pb-28 md:pb-0">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 text-sm font-medium text-muted-foreground sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <span className="font-bold tracking-[0.14em] text-foreground">SYCRAS</span>
          <p className="mt-2 max-w-xs">{t("home.footer")}</p>
        </div>
        <div>
          <p className={head}>{t("lp.foot.product")}</p>
          <ul className="mt-3 space-y-2.5">
            <li>
              <a href="#funcionalidades" className={link}>
                {t("home.nav.features")}
              </a>
            </li>
            <li>
              <a href="#precos" className={link}>
                {t("home.nav.pricing")}
              </a>
            </li>
            <li>
              <Link to="/$slug" params={{ slug: "exemplo" }} className={link}>
                {t("lp.foot.demo")}
              </Link>
            </li>
            <li>
              <Link to="/beta" className={link}>
                {t("lp.foot.android")}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className={head}>{t("lp.foot.help")}</p>
          <ul className="mt-3 space-y-2.5">
            <li>
              <a href="#perguntas" className={link}>
                {t("home.nav.faq")}
              </a>
            </li>
            <li>
              <a href="mailto:suporte@sycras.com" className={link}>
                suporte@sycras.com
              </a>
            </li>
          </ul>
        </div>
        <div>
          <p className={head}>{t("lp.foot.legal")}</p>
          <ul className="mt-3 space-y-2.5">
            <li>
              <Link to="/termos" className={link}>
                Termos
              </Link>
            </li>
            <li>
              <Link to="/privacidade" className={link}>
                Privacidade
              </Link>
            </li>
            <li>
              <Link to="/eliminar-conta" className={link}>
                Eliminar conta
              </Link>
            </li>
            <li>
              <a
                href="https://www.livroreclamacoes.pt"
                target="_blank"
                rel="noreferrer"
                className={link}
              >
                Livro de Reclamações
              </a>
            </li>
            <li>
              <a
                href="https://www.consumidor.gov.pt/parceiros/sistema-de-defesa-do-consumidor/entidades-de-resolucao-alternativa-de-litigios-de-consumo.aspx"
                target="_blank"
                rel="noreferrer"
                className={link}
              >
                Resolução de litígios
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs font-medium text-muted-foreground sm:px-6">
          © {new Date().getFullYear()} SYCRAS
        </p>
      </div>
    </footer>
  );
}
