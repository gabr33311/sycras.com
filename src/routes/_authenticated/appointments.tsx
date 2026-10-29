import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarViewSwitch } from "@/components/calendar-view-switch";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { usePrefs } from "@/lib/prefs";
import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorState, LoadingRows, PageHeader, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { useMyBusiness } from "@/hooks/use-business";
import { formatDateLong, formatDateShort, formatTime } from "@/lib/format";
import { useMoney } from "@/hooks/use-money-hidden";
import { NewAppointmentDialog } from "@/components/new-appointment-dialog";
import {
  CalendarX,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  UserX,
  Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAppointmentSheet } from "@/lib/appointment-sheet-context";
import { invalidateAppointmentData, setAppointmentStatus } from "@/lib/appointment-status";
import { todayIn, zonedToUtc } from "@/lib/time";

const filterSchema = z.enum([
  "upcoming",
  "today",
  "past",
  "cancelled",
  "confirmed",
  "pending",
  "completed",
]);

export const Route = createFileRoute("/_authenticated/appointments")({
  validateSearch: z.object({ new: z.boolean().optional(), filter: filterSchema.optional() }),
  head: () => ({
    meta: [
      { title: "Marcações — SYCRAS" },
      { name: "description", content: "Todas as marcações do teu negócio num só lugar." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AppointmentsPage,
});

const STATUS_FILTERS = ["all", "confirmed", "pending", "cancelled", "completed"] as const;
const TIME_FILTERS = ["upcoming", "today", "past", "all"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
type TimeFilter = (typeof TIME_FILTERS)[number];

function AppointmentsPage() {
  const { t } = usePrefs();
  const search = Route.useSearch();
  const { business } = useMyBusiness();
  const { openAppointment } = useAppointmentSheet();
  const qc = useQueryClient();
  const initial = search.filter;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    initial && (STATUS_FILTERS as readonly string[]).includes(initial)
      ? (initial as StatusFilter)
      : "all",
  );
  const [timeFilter, setTimeFilter] = useState<TimeFilter>(
    initial && (TIME_FILTERS as readonly string[]).includes(initial)
      ? (initial as TimeFilter)
      : initial
        ? "all"
        : "upcoming",
  );
  const [newOpen, setNewOpen] = useState(Boolean(search.new));
  const isWide = useMediaQuery("(min-width: 1024px)");
  const [overdueIdx, setOverdueIdx] = useState(0);

  const { data: overdue } = useQuery({
    queryKey: ["appointments", business?.id, "overdue"],
    enabled: !!business,
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select(
          "id, starts_at, customer_name, customer_phone, service_name, price_cents, status, notes",
        )
        .eq("business_id", business!.id)
        .in("status", ["confirmed", "pending"])
        .lt("starts_at", new Date().toISOString())
        .order("starts_at")
        .limit(100);
      return data ?? [];
    },
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["appointments", business?.id, statusFilter, timeFilter],
    enabled: !!business,
    queryFn: async () => {
      let q = supabase
        .from("appointments")
        .select(
          "id, starts_at, customer_name, customer_phone, service_name, price_cents, status, notes",
        )
        .eq("business_id", business!.id);
      const now = new Date().toISOString();
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (timeFilter === "upcoming") q = q.gte("starts_at", now);
      if (timeFilter === "today") {
        // The calendar day in the business timezone, not "now ± 12h".
        const tz = business!.timezone;
        const day = todayIn(tz);
        q = q
          .gte("starts_at", zonedToUtc(day, 0, tz).toISOString())
          .lt("starts_at", zonedToUtc(day, 24 * 60, tz).toISOString());
      }
      if (timeFilter === "past") q = q.lt("starts_at", now);
      if (statusFilter === "all" && timeFilter === "upcoming") q = q.neq("status", "cancelled");
      const descending =
        timeFilter === "past" || statusFilter === "cancelled" || statusFilter === "completed";
      q = q.order("starts_at", { ascending: !descending });
      const { data, error } = await q.limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function setStatus(id: string, status: "completed" | "no_show") {
    if (!business) return;
    const result = await setAppointmentStatus({ id, businessId: business.id, status });
    if (!result.ok) {
      toast.error(t("appt.toast.updateError"));
      return;
    }
    toast.success(t("appt.toast.updated"));
    void invalidateAppointmentData(qc);
  }

  return (
    <AppShell>
      {/* The calendar's list view: same title and switch as the day view. */}
      <PageHeader
        title={t("cal.title")}
        action={
          <div className="flex items-center gap-2">
            <CalendarViewSwitch value="list" withWeek={isWide} />
            <Button className="hidden lg:inline-flex" onClick={() => setNewOpen(true)}>
              {t("appt.new")}
            </Button>
          </div>
        }
      />

      {(overdue?.length ?? 0) > 0 && (
        <OverdueReview
          items={overdue!}
          idx={Math.min(overdueIdx, overdue!.length - 1)}
          setIdx={setOverdueIdx}
          timezone={business!.timezone}
          currency={business!.currency}
          onSetStatus={setStatus}
        />
      )}

      {/* One period switch; the status is a quiet filter next to the count. */}
      <div
        role="group"
        aria-label={t("appt.group.time")}
        className="grid grid-cols-4 gap-1 rounded-full bg-muted p-1 lg:w-[28rem]"
      >
        {TIME_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={timeFilter === f}
            onClick={() => setTimeFilter(f)}
            className={cn(
              "h-10 rounded-full px-2 text-[13px] font-bold transition-all duration-200",
              timeFilter === f
                ? "bg-card text-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(f === "all" ? "appt.filter.allTime" : `appt.filter.${f}`)}
          </button>
        ))}
      </div>

      <div className="mb-3 mt-4 flex items-center justify-between gap-3 px-1">
        <p className="text-sm font-semibold text-muted-foreground">
          {isLoading
            ? "\u00a0"
            : t(data?.length === 1 ? "appt.count.one" : "appt.count").replace(
                "{n}",
                String(data?.length ?? 0),
              )}
        </p>
        <label className="relative">
          <span className="sr-only">{t("appt.group.status")}</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className={cn(
              "h-10 appearance-none rounded-full border border-border bg-card pl-4 pr-9 text-[13px] font-bold transition-colors hover:bg-muted",
              statusFilter !== "all" && "border-brand text-foreground",
            )}
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f} value={f}>
                {t(f === "all" ? "appt.filter.allStatus" : `appt.filter.${f}`)}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        </label>
      </div>

      {isLoading ? (
        <LoadingRows rows={4} />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<CalendarX className="size-6" />}
          title={t("appt.empty.title")}
          description={t("appt.empty.desc")}
          action={
            // No bookings yet: the fix is getting the link out there.
            <Button variant="outline" asChild>
              <Link to="/profile" search={{ section: "share" }}>
                <Share2 /> {t("appt.empty.share")}
              </Link>
            </Button>
          }
        />
      ) : (
        // Grouped by day: the date is said once, the rows only show the time.
        <div key={`${statusFilter}-${timeFilter}`} className="animate-stagger space-y-5">
          {groupByDay(data!, business!.timezone).map(([day, rows]) => (
            <section key={day}>
              <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
                {day === todayIn(business!.timezone)
                  ? `${t("appt.filter.today")} · ${formatDateLong(rows[0]!.starts_at, business!.timezone)}`
                  : formatDateLong(rows[0]!.starts_at, business!.timezone)}
              </h2>
              <ul className="surface divide-y divide-border overflow-hidden p-0">
                {rows.map((a) => (
                  <li key={a.id}>
                    {/* The row opens the appointment sheet with every action in it. */}
                    <button
                      type="button"
                      onClick={() => openAppointment(a.id)}
                      className="flex min-h-16 w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                    >
                      <span className="w-12 shrink-0 font-display text-[15px] font-bold tabular-nums">
                        {formatTime(a.starts_at, business!.timezone)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{a.customer_name}</span>
                        <span className="block truncate text-sm font-normal text-muted-foreground">
                          {a.service_name}
                        </span>
                      </span>
                      <StatusBadge status={a.status} />
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {business && (
        <NewAppointmentDialog business={business} open={newOpen} onOpenChange={setNewOpen} />
      )}
    </AppShell>
  );
}

function groupByDay<T extends { starts_at: string }>(rows: T[], tz: string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(r.starts_at));
    const list = groups.get(day);
    if (list) list.push(r);
    else groups.set(day, [r]);
  }
  return [...groups.entries()];
}

type OverdueItem = {
  id: string;
  starts_at: string;
  customer_name: string;
  customer_phone: string | null;
  service_name: string;
  price_cents: number;
  status: string;
  notes: string | null;
};

function OverdueReview({
  items,
  idx,
  setIdx,
  timezone,
  currency,
  onSetStatus,
}: {
  items: OverdueItem[];
  idx: number;
  setIdx: (i: number) => void;
  timezone: string;
  currency: string;
  onSetStatus: (id: string, status: "completed" | "no_show") => void;
}) {
  const { t } = usePrefs();
  const money = useMoney();
  const a = items[idx];
  if (!a) return null;
  return (
    <section className="surface mb-5 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold">{t("appt.overdue.title")}</h2>
          <p className="text-xs font-normal text-muted-foreground">{t("appt.overdue.desc")}</p>
        </div>
        <span className="text-xs font-bold tabular-nums text-muted-foreground">
          {t("appt.overdue.counter")
            .replace("{current}", String(idx + 1))
            .replace("{total}", String(items.length))}
        </span>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("appt.overdue.prev")}
          disabled={idx === 0}
          onClick={() => setIdx(idx - 1)}
        >
          <ChevronLeft className="size-5" />
        </Button>
        <div className="min-w-0 flex-1 rounded-2xl border border-border bg-muted/40 p-4 text-center">
          <p className="truncate text-sm font-bold">{a.customer_name}</p>
          <p className="truncate text-sm text-muted-foreground">{a.service_name}</p>
          <p className="mt-1 text-xs font-semibold tabular-nums text-muted-foreground">
            {formatDateShort(a.starts_at, timezone)} · {formatTime(a.starts_at, timezone)} ·{" "}
            {money(a.price_cents, currency)}
          </p>
          <div className="mt-3 flex justify-center gap-2">
            <Button size="sm" onClick={() => onSetStatus(a.id, "completed")}>
              <Check className="size-4" />
              {t("appt.overdue.done")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => onSetStatus(a.id, "no_show")}>
              <UserX className="size-4" />
              {t("appt.overdue.noShow")}
            </Button>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("appt.overdue.next")}
          disabled={idx >= items.length - 1}
          onClick={() => setIdx(idx + 1)}
        >
          <ChevronRight className="size-5" />
        </Button>
      </div>
    </section>
  );
}
