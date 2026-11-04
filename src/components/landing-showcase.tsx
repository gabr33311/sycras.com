import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePrefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";

/*
 * Landing page sections built from real screenshots of the app and of a public booking
 * page (the demo shop), so what people see is exactly what they get. Only the moving
 * parts (a notification, the steps, the before/after handle) are drawn on top.
 */

const IMG = {
  hoje: "/landing/app-hoje.webp",
  agenda: "/landing/app-agenda.webp",
  gestao: "/landing/app-gestao.webp",
  pagina: "/landing/web-pagina.webp",
  servico: "/landing/web-servico.webp",
  hora: "/landing/web-hora.webp",
  dados: "/landing/web-dados.webp",
} as const;

function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(m.matches);
    const on = () => setReduce(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduce;
}

/** A phone with a real screenshot inside; `light` for the client's (web) page. */
export function PhoneShot({
  src,
  alt,
  light,
  className,
  children,
  eager,
}: {
  src: string;
  alt: string;
  light?: boolean;
  className?: string;
  children?: ReactNode;
  eager?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative mx-auto aspect-[9/19.5] w-full max-w-[300px] rounded-[2.6rem] bg-[#0d0d0f] p-[9px] shadow-[0_30px_60px_-30px_rgba(16,24,40,.55)] ring-1 ring-black/10 dark:ring-white/10",
        className,
      )}
    >
      <div
        className={cn(
          "relative flex h-full flex-col overflow-hidden rounded-[2.1rem]",
          light ? "bg-[#f5f8fc]" : "bg-black",
        )}
      >
        {/* Status bar (drawn: the real one showed the test phone's battery and icons). */}
        <div
          aria-hidden
          className={cn(
            "flex shrink-0 items-center justify-between px-6 pb-1 pt-2.5 text-[11px] font-bold tabular-nums",
            light ? "text-[#101828]" : "text-white",
          )}
        >
          <span>11:40</span>
          <span className="flex items-center gap-1">
            <span className="flex items-end gap-[2px]">
              {[4, 6, 8, 10].map((h) => (
                <i key={h} className="block w-[3px] rounded-sm bg-current" style={{ height: h }} />
              ))}
            </span>
            <span className="ml-1 inline-block h-[10px] w-[20px] rounded-[3px] border border-current p-[1px]">
              <span className="block h-full w-[80%] rounded-[1px] bg-current" />
            </span>
          </span>
        </div>
        <img
          src={src}
          alt={alt}
          width={600}
          height={1244}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className="block w-full flex-1 object-cover object-top"
          draggable={false}
        />
        {children}
      </div>
    </div>
  );
}

/** The phone's own notification, sliding in from the top. */
function Notification({ show, title, body }: { show: boolean; title: string; body: string }) {
  return (
    <div
      aria-live="polite"
      className={cn(
        "pointer-events-none absolute inset-x-2.5 top-8 z-10 flex items-center gap-2.5 rounded-2xl bg-[#2a2a2e]/95 p-2.5 text-white shadow-[0_14px_30px_-12px_rgba(0,0,0,.8)] transition-all duration-500 [transition-timing-function:cubic-bezier(.2,.9,.3,1.2)]",
        show ? "translate-y-0 opacity-100" : "-translate-y-24 opacity-0",
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand font-display text-base font-extrabold">
        S
      </span>
      <span className="min-w-0 text-left leading-tight">
        <span className="block text-[11px] font-bold">SYCRAS · {title}</span>
        <span className="block truncate text-[12px] text-white/80">{body}</span>
      </span>
    </div>
  );
}

const ARRIVALS = [
  ["Rui Santos", "Corte", "15:00"],
  ["Joana Pires", "Corte + Barba", "16:30"],
  ["Pedro Alves", "Barba", "17:15"],
  ["Sara Matos", "Degradê", "18:00"],
] as const;

/** Hero: the client's booking page and the owner's Today screen, with bookings arriving. */
export function LiveHero() {
  const { t } = usePrefs();
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (reduce) return;
    let hide: number | undefined;
    const tick = () => {
      setShow(true);
      hide = window.setTimeout(() => setShow(false), 2600);
    };
    const first = window.setTimeout(tick, 900);
    const loop = window.setInterval(() => {
      setI((n) => (n + 1) % ARRIVALS.length);
      tick();
    }, 4200);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(loop);
      if (hide) window.clearTimeout(hide);
    };
  }, [reduce]);
  const [who, svc, at] = ARRIVALS[i]!;
  return (
    <div className="relative grid items-end gap-8 sm:grid-cols-2 sm:gap-10">
      <figure className="hidden sm:block">
        <PhoneShot src={IMG.pagina} alt={t("home.live.clientAlt")} light eager className="sm:rotate-[-3deg]" />
        <figcaption className="mt-5 text-center text-sm font-bold">{t("showcase.booking")}</figcaption>
      </figure>
      <figure>
        <PhoneShot src={IMG.hoje} alt={t("home.live.ownerAlt")} eager className="sm:rotate-[2deg]">
          <Notification
            show={show || reduce}
            title={t("home.live.notif")}
            body={`${who} · ${svc} · ${at}`}
          />
        </PhoneShot>
        <figcaption className="mt-5 text-center text-sm font-bold">{t("showcase.agenda")}</figcaption>
      </figure>
    </div>
  );
}

/** Before / after: drag the round handle (finger or mouse) between WhatsApp chaos and the app. */
export function BeforeAfter() {
  const { t } = usePrefs();
  const box = useRef<HTMLDivElement>(null);
  const [cut, setCut] = useState(50);
  const drag = useRef(false);
  const move = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setCut(Math.max(4, Math.min(96, ((clientX - r.left) / r.width) * 100)));
  };
  const msgs = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
    text: t(`home.ba.m${n}`),
    me: n === 2 || n === 5,
    time: ["22:41", "23:02", "23:10", "23:11", "23:30", "08:55", "13:20"][n - 1],
  }));
  return (
    <div className="mx-auto w-full max-w-[300px]">
      <div className="mb-3 flex justify-between px-1 text-xs font-bold uppercase tracking-[0.12em]">
        <span className="text-muted-foreground">{t("home.ba.before")}</span>
        <span className="text-brand-ink">{t("home.ba.after")}</span>
      </div>
      <div
        ref={box}
        className="relative aspect-[9/19.5] w-full select-none overflow-hidden rounded-[2.6rem] bg-[#0d0d0f] p-[9px] shadow-[0_30px_60px_-30px_rgba(16,24,40,.55)]"
      >
        <div className="relative h-full overflow-hidden rounded-[2.1rem]">
          {/* Before: the owner's WhatsApp at night. */}
          <div aria-hidden className="absolute inset-0 flex flex-col bg-[#0b141a] text-[13px] text-[#e9edef]">
            <div className="flex items-center gap-2.5 bg-[#202c33] px-3 pb-2.5 pt-8">
              <span className="size-8 rounded-full bg-[#6b7c85]" />
              <span className="leading-tight">
                <span className="block text-[13px] font-bold">{t("home.ba.chat")}</span>
                <span className="block text-[11px] text-[#8696a0]">{t("home.ba.unread")}</span>
              </span>
            </div>
            <div className="grid content-start gap-1.5 p-2.5">
              {msgs.map((m) => (
                <div
                  key={m.time}
                  className={cn(
                    "max-w-[82%] rounded-xl px-2.5 pb-1 pt-1.5 leading-snug",
                    m.me ? "justify-self-end bg-[#005c4b]" : "bg-[#202c33]",
                  )}
                >
                  {m.text}
                  <span className="block text-right text-[9px] text-[#8696a0]">{m.time}</span>
                </div>
              ))}
            </div>
          </div>
          {/* After: the real Today screen. */}
          <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${cut}%)` }}>
            <img
              src={IMG.hoje}
              alt={t("home.live.ownerAlt")}
              width={600}
              height={1244}
              loading="lazy"
              className="block h-full w-full bg-black object-cover object-top pt-7"
              draggable={false}
            />
          </div>
          <div
            role="slider"
            tabIndex={0}
            aria-label={t("home.ba.slider")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(cut)}
            className="absolute inset-y-0 z-10 w-0 cursor-ew-resize touch-none outline-none"
            style={{ left: `${cut}%` }}
            onPointerDown={(e) => {
              drag.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              move(e.clientX);
            }}
            onPointerMove={(e) => drag.current && move(e.clientX)}
            onPointerUp={() => (drag.current = false)}
            onPointerCancel={() => (drag.current = false)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setCut((c) => Math.max(4, c - 5));
              if (e.key === "ArrowRight") setCut((c) => Math.min(96, c + 5));
            }}
          >
            <span className="absolute inset-y-0 -left-px w-0.5 bg-white shadow-[0_0_10px_rgba(0,0,0,.6)]" />
            <span className="absolute left-0 top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-lg font-extrabold tracking-[3px] text-brand shadow-[0_6px_20px_rgba(0,0,0,.45)] ring-brand/40 focus-visible:ring-4">
              ‹›
            </span>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-sm font-medium text-muted-foreground">{t("home.ba.hint")}</p>
    </div>
  );
}

const STORY = [
  { img: IMG.gestao, light: false },
  { img: IMG.pagina, light: true },
  { img: IMG.hora, light: true },
  { img: IMG.agenda, light: false },
] as const;

/** How it works: four real screens, advancing on their own or with a tap. */
export function Story() {
  const { t } = usePrefs();
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (reduce || paused) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % STORY.length), 3600);
    return () => window.clearInterval(id);
  }, [reduce, paused]);
  return (
    <div className="grid items-center gap-10 md:grid-cols-[1fr_auto] md:gap-16">
      <ol className="grid gap-2">
        {STORY.map((_, n) => (
          <li key={n}>
            <button
              type="button"
              onClick={() => {
                setI(n);
                setPaused(true);
              }}
              aria-current={i === n}
              className={cn(
                "flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition-all duration-300 sm:p-5",
                i === n
                  ? "border-border bg-card shadow-[var(--shadow-lift)]"
                  : "border-transparent opacity-70 hover:opacity-100",
              )}
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors",
                  i === n ? "bg-brand text-brand-foreground" : "bg-muted text-foreground",
                )}
              >
                {n + 1}
              </span>
              <span>
                <span className="block text-base font-bold">{t(`home.story.${n + 1}.title`)}</span>
                <span className="mt-0.5 block text-sm font-medium leading-relaxed text-muted-foreground">
                  {t(`home.story.${n + 1}.body`)}
                </span>
                {/* The bar fills while this step is shown. */}
                {i === n && !reduce && !paused && (
                  <span className="mt-3 block h-1 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full animate-[storybar_3.6s_linear] rounded-full bg-brand" />
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className="relative mx-auto w-full max-w-[300px] md:w-[300px]">
        {STORY.map((s, n) => (
          <div
            key={s.img}
            className={cn(
              "transition-all duration-500",
              n === 0 ? "relative" : "absolute inset-0",
              i === n ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
            )}
            aria-hidden={i !== n}
          >
            <PhoneShot src={s.img} alt={t(`home.story.${n + 1}.title`)} light={s.light} />
          </div>
        ))}
      </div>
    </div>
  );
}

const TRY = [IMG.servico, IMG.hora, IMG.dados] as const;

/** Try it: walk through the client's booking, then watch it reach the owner's app. */
export function TryIt() {
  const { t } = usePrefs();
  const [step, setStep] = useState(0);
  const [arrived, setArrived] = useState(false);
  const done = step >= TRY.length;
  const next = () => {
    if (done) {
      setStep(0);
      setArrived(false);
      return;
    }
    const s = step + 1;
    setStep(s);
    if (s >= TRY.length) window.setTimeout(() => setArrived(true), 350);
  };
  return (
    <div className="grid items-start gap-8 sm:grid-cols-2 sm:gap-10">
      <figure>
        <figcaption className="mb-4 text-center text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {t("home.try.client")}
        </figcaption>
        <div className="relative">
          {TRY.map((src, n) => (
            <div
              key={src}
              className={cn(
                "transition-opacity duration-300",
                n === 0 ? "relative" : "absolute inset-0",
                Math.min(step, TRY.length - 1) === n ? "opacity-100" : "pointer-events-none opacity-0",
              )}
              aria-hidden={Math.min(step, TRY.length - 1) !== n}
            >
              <PhoneShot src={src} alt={t(`home.try.s${n + 1}`)} light />
            </div>
          ))}
        </div>
      </figure>
      <figure>
        <figcaption className="mb-4 text-center text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {t("home.try.owner")}
        </figcaption>
        <PhoneShot src={IMG.agenda} alt={t("showcase.agenda")}>
          <Notification show={arrived} title={t("home.live.notif")} body={t("home.try.notif")} />
        </PhoneShot>
      </figure>
      <div className="flex flex-col items-center gap-3 sm:col-span-2">
        <p className="min-h-6 text-center text-sm font-semibold text-muted-foreground" aria-live="polite">
          {done ? t("home.try.done") : t(`home.try.s${step + 1}`)}
        </p>
        <button
          type="button"
          onClick={next}
          className="inline-flex h-12 min-w-48 items-center justify-center rounded-full bg-brand px-6 text-base font-bold text-brand-foreground shadow-sm transition-transform active:scale-[0.98]"
        >
          {done ? t("home.try.again") : step === 0 ? t("home.try.start") : t("home.try.next")}
        </button>
      </div>
    </div>
  );
}
