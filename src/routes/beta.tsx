import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { seo } from "@/lib/seo";

import { PlayMark } from "@/components/play-mark";
import { SycrasLogo } from "@/components/sycras-logo";
import { PLAY_STORE_URL } from "@/lib/app-store";
import { usePrefs } from "@/lib/prefs";

export const Route = createFileRoute("/beta")({
  head: () =>
    seo({
      title: "App Android (beta) — SYCRAS",
      description: "Instala a app SYCRAS no Android em 3 passos, antes de chegar à Play Store.",
      path: "/beta",
    }),
  component: BetaPage,
});

/** The Android closed beta: three numbered steps, each with its own button. */
const STEPS = [
  { n: 1, key: "s1", href: "https://groups.google.com/g/sycras" },
  { n: 2, key: "s2", href: "https://play.google.com/apps/testing/com.sycras.app" },
  { n: 3, key: "s3", href: PLAY_STORE_URL },
] as const;

/** Its own page (opened from "Tens Android? Experimenta a app"), so the homepage stays about the product. */
function BetaPage() {
  const { t } = usePrefs();
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-4">
          <Link to="/" className="flex items-center gap-2.5" aria-label="SYCRAS">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand">
              <SycrasLogo className="size-5" onColor />
            </span>
            <span className="text-sm font-extrabold tracking-[0.14em]">SYCRAS</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Voltar
        </Link>
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          <PlayMark className="size-4" />
          {t("lp.beta.eyebrow")}
        </div>
        <h1 className="mt-3 font-classic text-3xl font-semibold tracking-tight sm:text-4xl">
          {t("lp.beta.title")}
        </h1>
        <p className="mt-3 max-w-2xl text-base font-medium leading-relaxed text-muted-foreground">
          {t("lp.beta.body")}
        </p>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="flex flex-col rounded-2xl bg-card p-5 shadow-sm">
              <span className="flex size-9 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background">
                {s.n}
              </span>
              <p className="mt-4 text-lg font-bold">{t(`lp.beta.${s.key}.title`)}</p>
              <p className="mt-1 flex-1 text-sm font-medium leading-relaxed text-muted-foreground">
                {t(`lp.beta.${s.key}.body`)}
              </p>
              <a
                href={s.href}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm font-bold text-background transition-transform active:scale-[0.98]"
              >
                {t(`lp.beta.${s.key}.cta`)}
              </a>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-[13px] font-medium text-muted-foreground">{t("lp.beta.note")}</p>
      </main>
    </div>
  );
}
