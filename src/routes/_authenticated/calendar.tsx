import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { ErrorState, LoadingRows, PageHeader, StickyTop } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { useMyBusiness } from "@/hooks/use-business";
import { displayCustomerName } from "@/lib/format";
import { useMoney } from "@/hooks/use-money-hidden";
import { PendingCapsule } from "@/components/pending-sheet";
import { useAppointmentSheet } from "@/lib/appointment-sheet-context";
import { addDays, minutesToTime, timeToMinutes, todayIn, weekdayOf, zonedToUtc } from "@/lib/time";
import { NewAppointmentDialog } from "@/components/new-appointment-dialog";
import {
  BellRing,
  CalendarDays,
  List,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Lock,
  Moon,
  Plus,
  StickyNote,
  Unlock,
  UserX,
  CalendarOff,
} from "lucide-react";
import { de, enGB, es, fr, it, pt, ptBR, type Locale } from "date-fns/locale";
import type { Lang } from "@/lib/prefs-types";

const DATE_FNS_LOCALE: Record<Lang, Locale> = { pt, "pt-BR": ptBR, en: enGB, es, fr, it, de };
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { layoutLanes } from "@/lib/calendar-layout";
import { useMediaQuery } from "@/hooks/use-media-query";
import { CalendarWeek } from "@/components/calendar-week";
import { usePrefs } from "@/lib/prefs";
import { currentLocale, formatTime, statusLabel } from "@/lib/format";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { invalidateAppointmentData, setAppointmentStatus } from "@/lib/appointment-status";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({
    meta: [
      { title: "Agenda — SYCRAS" },
      { name: "description", content: "Your team's daily calendar, hour by hour." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CalendarPage,
});

/**
 * Parses the real working ranges of the day into minutes from midnight and
 * merges overlapping/duplicated rows (business-wide + per-staff entries can
 * describe the same window), so the agenda never renders the same slot twice.
 */
function rangesFromRows(rows: { start: string; end: string }[]): { start: number; end: number }[] {
  const sorted = rows
    .map((r) => ({
      start: timeToMinutes(r.start.slice(0, 5)),
      end: timeToMinutes(r.end.slice(0, 5)),
    }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

/** Compact, language-neutral duration label: 45 min, 1h, 1h30. */
function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

type Appt = {
  id: string;
  starts_at: string;
  ends_at?: string | null;

  customer_name: string;
  customer_phone: string | null;
  service_name: string;
  price_cents: number | null;
  status: "pending" | "confirmed" | "completed" | "cancelled" | "no_show" | "expired";
  notes: string | null;
  staff_id: string | null;
};

type Block = {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  staff_id: string | null;
};

type AgendaRow =
  | { kind: "free"; start: number; end: number }
  | { kind: "appt"; appt: Appt; start: number; end: number }
  | { kind: "block"; block: Block; start: number; end: number };

function isReleased(status: Appt["status"]): boolean {
  return status === "cancelled" || status === "expired";
}

/** Minutes from midnight of an ISO instant, as seen in the business timezone. */
function minuteOfDay(iso: string, tz: string): number {
  return timeToMinutes(formatTime(iso, tz));
}

/** Base vertical density. Pinching changes this value without scaling content. */
const PX_PER_MIN = 1.25;
const ZOOM_MIN = 0.75;
const ZOOM_MAX = 1.8;

/** Empty stretches become tappable slots of the business booking step. */
function freeChunks(start: number, end: number, step: number): AgendaRow[] {
  const span = end - start;
  if (span <= 0) return [];
  const size = step;
  const out: AgendaRow[] = [];
  let cursor = start;
  while (end - cursor > size * 1.5) {
    out.push({ kind: "free", start: cursor, end: cursor + size });
    cursor += size;
  }
  if (end - cursor > 0) out.push({ kind: "free", start: cursor, end });
  return out;
}

/**
 * Dynamic timeline: real appointment/block spans, with the actual empty gaps
 * between them surfaced as bookable slots.
 */
function buildAgenda(
  ranges: { start: number; end: number }[],
  appts: Appt[],
  blocks: Block[],
  tz: string,
  step: number,
  dayFrom: string,
  dayTo: string,
): AgendaRow[] {
  const fromMs = new Date(dayFrom).getTime();
  const toMs = new Date(dayTo).getTime();
  const busy: AgendaRow[] = [
    ...appts.map((a) => {
      const start = minuteOfDay(a.starts_at, tz);
      const rawEnd = a.ends_at ? minuteOfDay(a.ends_at, tz) : start + 60;
      return { kind: "appt" as const, appt: a, start, end: rawEnd > start ? rawEnd : start + 60 };
    }),
    // Multi-day blocks are clamped to the visible day, so they show up on every
    // day they cover instead of only the one they started on.
    ...blocks.map((b) => {
      const startMs = new Date(b.starts_at).getTime();
      const endMs = new Date(b.ends_at).getTime();
      const start = startMs <= fromMs ? 0 : minuteOfDay(b.starts_at, tz);
      const end = endMs >= toMs ? 24 * 60 : minuteOfDay(b.ends_at, tz);
      return { kind: "block" as const, block: b, start, end: end > start ? end : 24 * 60 };
    }),
  ].sort((a, b) => a.start - b.start);

  const rows: AgendaRow[] = [...busy];
  // Cancelled/expired appointments stay visible but no longer occupy the time.
  const occupying = busy.filter((r) => r.kind !== "appt" || !isReleased(r.appt.status));
  for (const range of ranges) {
    let cursor = range.start;
    for (const item of occupying) {
      if (item.end <= range.start || item.start >= range.end) continue;
      if (item.start > cursor)
        rows.push(...freeChunks(cursor, Math.min(item.start, range.end), step));
      cursor = Math.max(cursor, item.end);
      if (cursor >= range.end) break;
    }
    if (cursor < range.end) rows.push(...freeChunks(cursor, range.end, step));
  }
  return rows.sort((a, b) => a.start - b.start || a.end - b.end);
}

function CalendarPage() {
  const { t, lang } = usePrefs();
  const formatPrice = useMoney();
  const { business } = useMyBusiness();
  const { openAppointment } = useAppointmentSheet();
  const qc = useQueryClient();
  const tz = business?.timezone ?? "Europe/Lisbon";
  const [date, setDate] = useState(todayIn(tz));
  // The first render uses the fallback timezone; once the business loads, "today"
  // must be today in the business timezone (they differ around midnight).
  const tzSynced = useRef(false);
  useEffect(() => {
    if (!business || tzSynced.current) return;
    tzSynced.current = true;
    setDate(todayIn(business.timezone));
  }, [business]);
  const [newOpen, setNewOpen] = useState(false);
  const [newTime, setNewTime] = useState("09:00");
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [slotMenu, setSlotMenu] = useState<number | null>(null);
  const [view, setView] = useState<"day" | "week">("day");

  // Pinch changes only the vertical time density; text and controls stay crisp.
  const [zoom, setZoom] = useState(1);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const nowRef = useRef<HTMLDivElement | null>(null);

  const scrolledFor = useRef<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["calendar", business?.id, date],
    enabled: !!business,
    queryFn: async () => {
      const from = zonedToUtc(date, 0, tz).toISOString();
      const to = zonedToUtc(date, 24 * 60, tz).toISOString();
      const results = await Promise.all([
        supabase
          .from("appointments")
          .select(
            "id, starts_at, ends_at, customer_name, customer_phone, service_name, price_cents, status, staff_id, notes",
          )
          .eq("business_id", business!.id)
          .gte("starts_at", from)
          .lt("starts_at", to)
          .order("starts_at"),
        supabase
          .from("staff")
          .select("id, name")
          .eq("business_id", business!.id)
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("working_hours")
          .select("start_time, end_time")
          .eq("business_id", business!.id)
          .eq("weekday", weekdayOf(date))
          .order("start_time"),
        supabase
          .from("blocked_times")
          .select("id, starts_at, ends_at, reason, staff_id")
          .eq("business_id", business!.id)
          .lt("starts_at", to)
          .gt("ends_at", from)
          .order("starts_at"),
      ]);
      // A failed request must never read as an empty day off.
      const failed = results.find((r) => r.error);
      if (failed) throw failed.error;
      const [{ data: appts }, { data: staff }, { data: hours }, { data: blocks }] = results;
      return {
        from,
        to,
        appts: appts ?? [],
        staff: staff ?? [],
        blocks: blocks ?? [],
        ranges: rangesFromRows(
          (hours ?? []).map((h) => ({ start: h.start_time, end: h.end_time })),
        ),
      };
    },
  });

  const staffList = data?.staff ?? [];
  const matchesStaff = (id: string | null) =>
    staffFilter === "all" || id === staffFilter || id === null;
  const appts = (data?.appts ?? []).filter((a) => matchesStaff(a.staff_id));
  const blocks = (data?.blocks ?? []).filter((b) => matchesStaff(b.staff_id));
  // Free time is offered in chunks of at least 30 min: smaller rows are too thin to tap.
  const step = Math.min(60, Math.max(30, business?.slot_interval_minutes ?? 30));
  const agendaRows = data
    ? buildAgenda(data.ranges, appts, blocks, tz, step, data.from, data.to)
    : [];

  // Weekends / closed days: nothing is scheduled and nothing is bookable.
  const isDayOff = !!data && data.ranges.length === 0 && appts.length === 0 && blocks.length === 0;

  const isToday = date === todayIn(tz);
  const nowMinutes = timeToMinutes(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz,
    }).format(new Date()),
  );

  // Grid geometry: the day spans exactly the working hours, widened only to fit
  // anything scheduled outside them, snapped to whole hours. 08–20 is just the
  // fallback for a day with nothing at all.
  const spanStarts = [
    ...(data?.ranges ?? []).map((r) => r.start),
    ...agendaRows.map((r) => r.start),
  ];
  const spanEnds = [...(data?.ranges ?? []).map((r) => r.end), ...agendaRows.map((r) => r.end)];
  const hasSpan = spanStarts.length > 0;
  const dayStart = hasSpan ? Math.max(0, Math.floor(Math.min(...spanStarts) / 60) * 60) : 8 * 60;
  const dayEnd = hasSpan
    ? Math.min(24 * 60, Math.max(dayStart + 60, Math.ceil(Math.max(...spanEnds) / 60) * 60))
    : 20 * 60;
  const pxPerMinute = PX_PER_MIN * zoom;
  const gridHeight = (dayEnd - dayStart) * pxPerMinute;
  const hourMarks = Array.from(
    { length: Math.max(1, Math.floor((dayEnd - dayStart) / 60) + 1) },
    (_, i) => dayStart + i * 60,
  );
  const freeRows = agendaRows.filter(
    (r): r is Extract<AgendaRow, { kind: "free" }> => r.kind === "free",
  );
  const blockRows = agendaRows.filter(
    (r): r is Extract<AgendaRow, { kind: "block" }> => r.kind === "block",
  );
  const apptRows = agendaRows.filter(
    (r): r is Extract<AgendaRow, { kind: "appt" }> => r.kind === "appt",
  );
  const isWide = useMediaQuery("(min-width: 1024px)");
  const week = isWide && view === "week";
  // Desktop with a team: one column per professional instead of stacking.
  const staffColumns = isWide && !week && staffFilter === "all" && staffList.length > 1;
  const lanes = staffColumns
    ? new Map(
        apptRows.map((r) => [
          r.appt.id,
          {
            lane: Math.max(
              0,
              staffList.findIndex((p) => p.id === r.appt.staff_id),
            ),
            lanes: staffList.length,
          },
        ]),
      )
    : layoutLanes(
        apptRows.map((r) => ({
          id: r.appt.id,
          start: r.start,
          end: r.end,
          released: isReleased(r.appt.status),
        })),
      );

  // Land where there is something to see: today, the current moment while
  // appointments are still to come; otherwise the day's first appointment.
  useEffect(() => {
    if (isLoading || scrolledFor.current === date) return;
    const live = apptRows.filter((r) => !isReleased(r.appt.status));
    const stillAhead = isToday && live.some((r) => r.end >= nowMinutes);
    const first = live[0] ?? apptRows[0];
    const node =
      (isToday && (stillAhead || !first) ? nowRef.current : null) ??
      (first ? document.querySelector<HTMLElement>(`[data-appt-id="${first.appt.id}"]`) : null);
    if (!node) return;
    scrolledFor.current = date;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, isToday, isLoading, gridHeight, apptRows.length]);

  // Live cockpit — only meaningful while looking at today.
  const liveToday = isToday
    ? appts.filter((a) => !["cancelled", "no_show", "expired"].includes(a.status))
    : [];
  const nextUp = liveToday.find(
    (a) => new Date(a.starts_at).getTime() > now && a.status !== "completed",
  );
  const doneCount = liveToday.filter((a) => a.status === "completed").length;
  const dayRevenue = liveToday.reduce((sum, a) => sum + (a.price_cents ?? 0), 0);
  const progressPill = t("cal.progress.pill")
    .replace("{done}", String(doneCount))
    .replace("{total}", String(liveToday.length))
    .replace("{revenue}", formatPrice(dayRevenue));

  const weekStart = addDays(date, -((weekdayOf(date) + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const dayShort = (d: string) =>
    new Intl.DateTimeFormat(currentLocale(), {
      weekday: "short",
      timeZone: "UTC",
    }).format(new Date(`${d}T12:00:00Z`));

  async function blockSlot(startMin: number, endMin: number) {
    if (!business) return;
    if (isPastMinute(endMin)) return;
    const from = isToday ? Math.max(startMin, nowMinutes) : startMin;
    const start = zonedToUtc(date, from, tz);
    const end = zonedToUtc(date, endMin, tz);

    const { data: created, error } = await supabase
      .from("blocked_times")
      .insert({
        business_id: business.id,
        staff_id: staffFilter === "all" ? null : staffFilter,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        reason: t("cal.block.reason"),
      })
      .select("id")
      .single();
    if (error) {
      toast.error(t("cal.toast.blockError"));
      return;
    }
    toast.success(t("cal.toast.blocked"), {
      action: { label: t("cal.undo"), onClick: () => void unblock(created.id, true) },
    });
    qc.invalidateQueries({ queryKey: ["calendar"] });
  }

  function isPastMinute(minute: number) {
    return zonedToUtc(date, minute, tz).getTime() <= now;
  }

  function verticalTouchDistance(e: React.TouchEvent) {
    const [a, b] = [e.touches[0]!, e.touches[1]!];
    return Math.max(20, Math.abs(a.clientY - b.clientY));
  }

  function onPinchStart(e: React.TouchEvent) {
    if (e.touches.length !== 2) return;
    pinchRef.current = { dist: verticalTouchDistance(e), zoom };
  }

  function onPinchMove(e: React.TouchEvent) {
    const base = pinchRef.current;
    if (!base || e.touches.length !== 2) return;
    const ratio = verticalTouchDistance(e) / (base.dist || 1);
    // Recalculate geometry instead of applying scaleY, so text never stretches.
    setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, base.zoom * ratio)));
  }

  function onPinchEnd() {
    pinchRef.current = null;
    // Soft snap back to the default resolution when close to it.
    setZoom((z) => (Math.abs(z - 1) < 0.06 ? 1 : z));
  }

  function needsValidation(appt: Appt) {
    if (["completed", "cancelled", "no_show", "expired"].includes(appt.status)) return false;
    const start = new Date(appt.starts_at).getTime();
    const end = appt.ends_at ? new Date(appt.ends_at).getTime() : start + 3_600_000;
    return end <= now;
  }

  async function validateAppointment(
    id: string,
    status: Appt["status"],
    previous?: Appt["status"],
  ) {
    if (!business) return;
    const result = await setAppointmentStatus({
      id,
      businessId: business.id,
      status,
      note: t("acts.note.changed"),
    });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    // Completed / no-show sit side by side on small screens: offer a quick undo.
    toast.success(
      t("acts.toast.updated"),
      previous
        ? {
            action: { label: t("cal.undo"), onClick: () => void validateAppointment(id, previous) },
          }
        : undefined,
    );
    void invalidateAppointmentData(qc);
  }

  async function unblock(id: string, silent = false) {
    const removed = data?.blocks.find((b) => b.id === id);
    const { error } = await supabase.from("blocked_times").delete().eq("id", id);
    if (error) {
      toast.error(t("cal.toast.blockError"));
      return;
    }
    qc.invalidateQueries({ queryKey: ["calendar"] });
    if (silent) return;
    toast.success(t("cal.toast.unblocked"), {
      action:
        removed && business
          ? {
              label: t("cal.undo"),
              onClick: async () => {
                const { error: restoreError } = await supabase.from("blocked_times").insert({
                  business_id: business.id,
                  staff_id: removed.staff_id,
                  starts_at: removed.starts_at,
                  ends_at: removed.ends_at,
                  reason: removed.reason,
                });
                if (restoreError) toast.error(t("cal.toast.blockError"));
                qc.invalidateQueries({ queryKey: ["calendar"] });
              },
            }
          : undefined,
    });
  }

  const locale = currentLocale();
  const labelDate = new Date(`${date}T12:00:00Z`);
  const wd = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: tz })
    .format(labelDate)
    .replace(".", "")
    .slice(0, 3);
  const dayNum = new Intl.DateTimeFormat(locale, { day: "numeric", timeZone: tz }).format(
    labelDate,
  );
  const monthShort = new Intl.DateTimeFormat(locale, { month: "short", timeZone: tz })
    .format(labelDate)
    .replace(".", "");
  const dm = `${dayNum} ${monthShort}`;

  const rawLabel = `${wd}, ${dm}`;
  const weekLabel = (() => {
    const fmt = (d: string, opts: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" })
        .format(new Date(`${d}T12:00:00Z`))
        .replace(".", "");
    const end = addDays(weekStart, 6);
    return `${fmt(weekStart, { day: "numeric" })} – ${fmt(end, { day: "numeric" })} ${fmt(end, { month: "short" })}`;
  })();
  const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);

  return (
    <AppShell>
      <StickyTop>
        <PageHeader
          inline
          title={t("cal.title")}
          subtitle={t("cal.subtitle")}
          action={
            <div className="flex items-center gap-2">
              {isToday && !week && liveToday.length > 0 && (
                <span className="hidden shrink-0 rounded-full border border-border bg-card px-2.5 py-2 text-[11px] sm:inline-flex font-black tabular-nums text-muted-foreground sm:px-3 sm:text-[11px]">
                  {progressPill}
                </span>
              )}
              <PendingCapsule variant="badge" />
              <div
                role="group"
                aria-label={t("cal.view")}
                className="hidden items-center rounded-full bg-muted p-1 lg:flex"
              >
                {(["day", "week"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    onClick={() => setView(v)}
                    className={cn(
                      "h-9 rounded-full px-4 text-[13px] font-bold transition-all duration-200",
                      view === v
                        ? "bg-card text-foreground shadow-soft"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t(v === "day" ? "cal.view.day" : "cal.view.week")}
                  </button>
                ))}
              </div>
              <Button
                asChild
                variant="outline"
                size="icon"
                aria-label={t("cal.list")}
                title={t("cal.list")}
                className="shrink-0"
              >
                <Link to="/appointments">
                  <List className="size-4" />
                </Link>
              </Button>
              {/* Days off and holidays are planned from the calendar. */}
              <Button
                asChild
                variant="outline"
                size="icon"
                aria-label={t("pf.s.timeoff")}
                title={t("pf.s.timeoff")}
                className="shrink-0"
              >
                <Link to="/time-off">
                  <CalendarOff className="size-4" />
                </Link>
              </Button>
              <Button className="hidden lg:inline-flex" onClick={() => setNewOpen(true)}>
                {t("cal.new")}
              </Button>
            </div>
          }
        />

        <div className="surface rounded-[12px]! p-1">
          <div className="flex h-11 items-center gap-1">
            {/* Only offered when away from today (it does nothing on today itself). */}
            {!(isToday || (week && weekDays.includes(todayIn(tz)))) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDate(todayIn(tz))}
                className="h-9 shrink-0 rounded-full px-3 text-xs font-bold"
              >
                <CalendarDays className="size-3.5 text-brand-ink" />
                {t("cal.today")}
              </Button>
            )}
            <button
              onClick={() => setDate(addDays(date, week ? -7 : -1))}
              aria-label={week ? t("cal.week.prev") : t("cal.prevDay")}
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
            </button>
            {/* Jumping weeks/months day by day was tedious: the label opens a month picker. */}
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={t("cal.pickDate")}
                  className="mx-auto flex h-10 min-w-0 items-center justify-center gap-1 rounded-full px-3 text-sm font-bold transition-colors hover:bg-muted"
                >
                  <span className="truncate">{week ? weekLabel : label}</span>
                  <ChevronDown
                    className="size-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={2.6}
                  />
                </button>
              </PopoverTrigger>
              <PopoverContent align="center" className="w-auto p-0">
                <Calendar
                  mode="single"
                  locale={DATE_FNS_LOCALE[lang]}
                  weekStartsOn={1}
                  selected={new Date(`${date}T12:00:00`)}
                  defaultMonth={new Date(`${date}T12:00:00`)}
                  onSelect={(d) => {
                    if (!d) return;
                    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                    setDate(iso);
                    setPickerOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
            <button
              onClick={() => setDate(addDays(date, week ? 7 : 1))}
              aria-label={week ? t("cal.week.next") : t("cal.nextDay")}
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div className={cn("mt-1 grid grid-cols-7 gap-1", week && "hidden")}>
            {weekDays.map((d) => {
              const active = d === date;
              const isTodayCell = d === todayIn(tz);
              return (
                <button
                  key={d}
                  onClick={() => setDate(d)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-2xl border border-transparent py-1.5 transition-colors",
                    active
                      ? "bg-brand text-brand-foreground"
                      : isTodayCell
                        ? "border-brand text-foreground hover:bg-muted"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span className="text-[11px] font-bold uppercase tracking-wide">
                    {dayShort(d).replace(".", "").slice(0, 3)}
                  </span>
                  <span className="text-sm font-black tabular-nums">{Number(d.slice(8, 10))}</span>
                </button>
              );
            })}
          </div>
        </div>
      </StickyTop>

      {staffList.length > 1 && (
        <div className="mb-4 flex items-center gap-1.5 overflow-x-auto rounded-full bg-muted p-1">
          {[{ id: "all", name: t("cal.staff.all") }, ...staffList].map((s) => (
            <button
              key={s.id}
              onClick={() => setStaffFilter(s.id)}
              className={cn(
                "h-9 shrink-0 rounded-full px-4 text-[13px] font-bold transition-all duration-200",
                staffFilter === s.id
                  ? "bg-card text-foreground shadow-soft"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {week && business ? (
        <CalendarWeek
          businessId={business.id}
          tz={tz}
          weekStart={weekStart}
          staffFilter={staffFilter}
          onOpen={openAppointment}
          onPickDay={(d) => {
            setDate(d);
            setView("day");
          }}
        />
      ) : isLoading ? (
        <LoadingRows rows={5} />
      ) : isError ? (
        <ErrorState message={t("cal.loadError")} onRetry={() => void refetch()} />
      ) : isDayOff ? (
        <section className="surface flex flex-col items-center gap-2 px-6 py-12 text-center">
          <Moon className="size-7 text-muted-foreground" strokeWidth={2.2} />
          <p className="font-display text-[20px] font-black leading-snug">
            {t("cal.offday.title")}
          </p>
          <p className="max-w-xs text-sm leading-snug text-muted-foreground">
            {t("cal.offday.desc")}
          </p>
        </section>
      ) : (
        <>
          {/* One quiet line of help instead of a "+" on every empty slot. */}
          {freeRows.some((r) => !isPastMinute(r.end)) && (
            <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">
              {t("cal.empty.hint")}
            </p>
          )}
          {staffColumns && (
            // Column titles: one per professional, aligned with the grid below.
            <div className="mb-1.5 flex pl-14">
              {staffList.map((p) => (
                <span
                  key={p.id}
                  className="min-w-0 flex-1 truncate px-2 text-center text-xs font-bold text-muted-foreground"
                >
                  {p.name}
                </span>
              ))}
            </div>
          )}
          <div
            // Remount per day so switching days gets the same soft entrance.
            key={date}
            onTouchStart={onPinchStart}
            onTouchMove={onPinchMove}
            onTouchEnd={onPinchEnd}
            onTouchCancel={onPinchEnd}
            className="surface animate-enter overflow-hidden rounded-[12px]! bg-muted/40 p-0 shadow-none!"
            style={{
              touchAction: "pan-y",
            }}
          >
            <div className="flex">
              <div
                className="relative w-14 shrink-0 border-r border-border/60 bg-card"
                style={{ height: gridHeight }}
              >
                {hourMarks.map((m) => (
                  <span
                    key={`h-${m}`}
                    className={cn(
                      "absolute right-2 text-[11px] font-bold leading-none tabular-nums text-muted-foreground",
                      m <= dayStart
                        ? "translate-y-1"
                        : m >= dayEnd
                          ? "-translate-y-[calc(100%+4px)]"
                          : "-translate-y-1/2",
                    )}
                    style={{ top: (m - dayStart) * pxPerMinute }}
                  >
                    {minutesToTime(m)}
                  </span>
                ))}
              </div>

              <div className="relative min-w-0 flex-1" style={{ height: gridHeight }}>
                {hourMarks.map((m) => (
                  <span
                    key={`l-${m}`}
                    aria-hidden
                    className="absolute inset-x-0 border-t border-border/50"
                    style={{ top: (m - dayStart) * pxPerMinute }}
                  />
                ))}

                {freeRows.map((row) => {
                  const past = isPastMinute(row.end);
                  const bookFrom =
                    isToday && row.start < nowMinutes
                      ? Math.min(row.end - 5, Math.ceil(nowMinutes / 5) * 5)
                      : row.start;
                  return (
                    <div
                      key={`free-${row.start}`}
                      className="absolute inset-x-1"
                      style={{
                        top: (row.start - dayStart) * pxPerMinute,
                        height: Math.max((row.end - row.start) * pxPerMinute - 2, 18),
                      }}
                    >
                      {past ? (
                        <div aria-hidden className="size-full rounded-lg bg-muted/25" />
                      ) : (
                        // One tap on free time asks what to do with it: book or block.
                        <Popover
                          open={slotMenu === row.start}
                          onOpenChange={(o) => setSlotMenu(o ? row.start : null)}
                        >
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              aria-label={t("cal.newAt").replace("{time}", minutesToTime(bookFrom))}
                              className={cn(
                                "group flex size-full items-start rounded-lg px-2 py-1 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 active:bg-muted/60",
                                slotMenu === row.start && "bg-muted/60",
                              )}
                            >
                              {/* Quiet on desktop until hover; always faintly visible on touch screens. */}
                              <span className="flex items-center gap-1 text-[11px] font-bold tabular-nums text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
                                <Plus className="size-3.5" strokeWidth={2.6} />
                                {minutesToTime(bookFrom)}
                              </span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-60 p-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSlotMenu(null);
                                setNewTime(minutesToTime(bookFrom));
                                setNewOpen(true);
                              }}
                              className="flex h-11 w-full items-center gap-2.5 rounded-xl px-3 text-sm font-bold transition-colors hover:bg-muted"
                            >
                              <Plus className="size-4" strokeWidth={2.6} />
                              {t("cal.slot.menu.book")}
                              <span className="ml-auto tabular-nums text-muted-foreground">
                                {minutesToTime(bookFrom)}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSlotMenu(null);
                                void blockSlot(row.start, row.end);
                              }}
                              className="flex h-11 w-full items-center gap-2.5 rounded-xl px-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                              <Lock className="size-4" strokeWidth={2.6} />
                              {staffFilter === "all" && staffList.length > 1
                                ? t("cal.slot.menu.blockAll")
                                : t("cal.slot.menu.block")}
                            </button>
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                  );
                })}

                {blockRows.map((row) => (
                  <div
                    key={`block-${row.block.id}-${row.start}`}
                    className="absolute inset-x-1 z-10 overflow-hidden rounded-xl border border-dashed border-border bg-muted/60 px-2 py-1"
                    style={{
                      top: (row.start - dayStart) * pxPerMinute,
                      height: Math.max((row.end - row.start) * pxPerMinute - 2, 26),
                    }}
                  >
                    <div className="flex items-start gap-1">
                      <p className="min-w-0 flex-1 truncate text-[11px] font-bold text-muted-foreground">
                        {t("cal.blocked")}
                        {row.block.reason ? ` · ${row.block.reason}` : ""}
                      </p>
                      <button
                        onClick={() => unblock(row.block.id)}
                        aria-label={t("cal.unblock")}
                        title={t("cal.unblock")}
                        className="tap-target relative flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <Unlock className="size-3" strokeWidth={2.6} />
                      </button>
                    </div>
                  </div>
                ))}

                {apptRows.map((row, i) => {
                  const due = needsValidation(row.appt);
                  const isNext = isToday && nextUp?.id === row.appt.id;
                  const height = Math.max((row.end - row.start) * pxPerMinute - 2, 34);
                  const tier = height >= 76 ? "roomy" : height >= 52 ? "regular" : "tiny";
                  const name = displayCustomerName(row.appt.customer_name, null, i + 1);
                  const timeText = `${formatTime(row.appt.starts_at, tz)}${
                    row.appt.ends_at ? ` – ${formatTime(row.appt.ends_at, tz)}` : ""
                  }`;
                  const priceText =
                    row.appt.price_cents != null ? formatPrice(row.appt.price_cents) : null;
                  const lane = lanes.get(row.appt.id) ?? { lane: 0, lanes: 1 };
                  // The whole card opens the appointment sheet; inner buttons stop the tap.
                  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
                  return (
                    <div
                      key={row.appt.id}
                      data-appt-id={row.appt.id}
                      data-status={due ? "pending" : row.appt.status}
                      role="button"
                      tabIndex={0}
                      aria-label={`${name} · ${timeText} · ${row.appt.service_name}`}
                      onClick={() => openAppointment(row.appt.id)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        openAppointment(row.appt.id);
                      }}
                      className={cn(
                        "appointment-state appointment-pop surface surface-hover absolute cursor-pointer overflow-hidden p-0",
                        // A rebooked slot draws the live appointment over the cancelled one.
                        isReleased(row.appt.status) ? "z-[5] opacity-70" : "z-10",
                        isNext && "ring-1 ring-foreground/40",
                      )}
                      style={{
                        top: (row.start - dayStart) * pxPerMinute,
                        height,
                        // Overlapping appointments (several professionals) share the width.
                        // Flush with the column edges, square corners.
                        left: `calc(100% * ${lane.lane / lane.lanes})`,
                        width: `calc(100% / ${lane.lanes} - ${lane.lanes > 1 ? 1 : 0}px)`,
                        borderRadius: 0,
                      }}
                    >
                      <span
                        data-status={due ? "pending" : row.appt.status}
                        aria-hidden
                        className="appointment-rail absolute inset-y-0 left-0 w-1"
                      />
                      <div
                        className={cn(
                          "flex h-full min-w-0 items-center gap-2 pl-3 pr-2",
                          tier === "tiny" ? "py-0.5" : "py-1",
                        )}
                      >
                        <div className="flex h-full min-w-0 flex-1 flex-col justify-center gap-px">
                          {tier === "tiny" ? (
                            // Compact block: everything on one line, so short slots still show it all.
                            <p className="truncate text-[12px] font-semibold leading-tight text-muted-foreground">
                              <span className="font-display text-[13px] font-bold text-foreground">
                                {name}
                              </span>
                              <span className="tabular-nums">
                                {" "}
                                · {formatTime(row.appt.starts_at, tz)}
                              </span>
                              <span> · {row.appt.service_name}</span>
                            </p>
                          ) : (
                            <>
                              <p className="truncate font-display text-[14px] font-bold leading-tight">
                                {name}
                              </p>
                              <p className="truncate text-[12px] font-medium tabular-nums leading-tight text-muted-foreground">
                                {timeText} · {row.appt.service_name}
                                {priceText && <span> · {priceText}</span>}
                              </p>
                              {tier === "roomy" && row.appt.notes?.trim() && (
                                <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] font-medium text-muted-foreground">
                                  <StickyNote className="size-3 shrink-0" strokeWidth={2.6} />
                                  <span className="truncate">{row.appt.notes}</span>
                                </p>
                              )}
                            </>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center">
                          {due ? (
                            // Past and not closed yet: one clear button, two choices.
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  onClick={stop}
                                  onKeyDown={stop}
                                  className={cn(
                                    "tap-target relative flex items-center justify-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-bold text-primary-foreground shadow-sm active:scale-95",
                                    tier === "tiny" ? "h-7" : "h-9",
                                  )}
                                >
                                  <Check className="size-3.5" strokeWidth={3} />
                                  {t("cal.validate.short")}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent align="end" className="w-52 p-1.5" onClick={stop}>
                                <button
                                  type="button"
                                  onClick={() =>
                                    validateAppointment(row.appt.id, "completed", row.appt.status)
                                  }
                                  className="flex h-11 w-full items-center gap-2.5 rounded-xl px-3 text-sm font-bold transition-colors hover:bg-muted"
                                >
                                  <Check className="size-4" strokeWidth={3} />
                                  {t("sheet.done")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    validateAppointment(row.appt.id, "no_show", row.appt.status)
                                  }
                                  className="flex h-11 w-full items-center gap-2.5 rounded-xl px-3 text-sm font-bold transition-colors hover:bg-muted"
                                >
                                  <UserX className="size-4" strokeWidth={2.8} />
                                  {t("sheet.noShow")}
                                </button>
                              </PopoverContent>
                            </Popover>
                          ) : row.appt.status === "completed" || row.appt.status === "no_show" ? (
                            <span
                              className={cn(
                                "hidden items-center gap-1 text-[11px] font-bold uppercase tracking-wide min-[380px]:flex",
                                row.appt.status === "completed"
                                  ? "status-done-text"
                                  : "text-destructive",
                              )}
                            >
                              {row.appt.status === "completed" ? (
                                <Check className="size-3.5" strokeWidth={3} />
                              ) : (
                                <UserX className="size-3.5" strokeWidth={2.8} />
                              )}
                              {statusLabel(row.appt.status, lang)}
                            </span>
                          ) : row.appt.status === "pending" ? (
                            <span className="pending-halo flex h-7 items-center gap-1 rounded-full border border-border bg-card px-2.5 text-[11px] font-bold text-muted-foreground">
                              <BellRing className="size-3.5" strokeWidth={2.6} />
                              {tier !== "tiny" && t("cal.status.pending")}
                            </span>
                          ) : isNext && tier !== "tiny" ? (
                            <span className="rounded-full bg-foreground px-2.5 py-1 text-[11px] font-bold text-background">
                              {t("cal.next.inline")}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {isToday && nowMinutes >= dayStart && nowMinutes <= dayEnd && (
                  <div
                    ref={nowRef}
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                    style={{ top: (nowMinutes - dayStart) * pxPerMinute }}
                  >
                    <span className="-ml-1 size-2.5 rounded-full bg-brand ring-2 ring-card" />
                    <span className="h-0.5 flex-1 bg-brand" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {business && (
        <NewAppointmentDialog
          key={`${date}-${newTime}`}
          business={business}
          open={newOpen}
          onOpenChange={setNewOpen}
          defaultDate={date}
          defaultTime={newTime}
        />
      )}
    </AppShell>
  );
}
