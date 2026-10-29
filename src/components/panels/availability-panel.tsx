import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { FieldError, LoadingRows, FormError } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useMyBusiness } from "@/hooks/use-business";
import { weekdays, formatDateShort } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { Trash2, MessageCircle, Mail, Coffee, Loader2 } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { SaveBar } from "@/components/save-bar";
import { invalidateAppointmentData, setAppointmentStatus } from "@/lib/appointment-status";
import { normalizePhonePt } from "@/lib/phone";
import { timeToMinutes, zonedToUtc } from "@/lib/time";

type DayState = {
  enabled: boolean;
  start: string;
  end: string;
  lunch: boolean;
  lunchStart: string;
  lunchEnd: string;
};

/** Display order: Monday → Sunday (weekday numbers keep 0 = Sunday). */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

const DEFAULT_DAY: DayState = {
  enabled: false,
  start: "09:00",
  end: "18:00",
  lunch: false,
  lunchStart: "13:00",
  lunchEnd: "14:00",
};

function fromRows(hours: { weekday: number; start_time: string; end_time: string }[]) {
  const next: DayState[] = Array.from({ length: 7 }, () => ({ ...DEFAULT_DAY }));
  const byDay: Record<number, { start: string; end: string }[]> = {};
  for (const h of hours) {
    (byDay[h.weekday] ??= []).push({
      start: h.start_time.slice(0, 5),
      end: h.end_time.slice(0, 5),
    });
  }
  for (const [weekday, ranges] of Object.entries(byDay)) {
    const i = Number(weekday);
    const sorted = ranges.sort((a, b) => a.start.localeCompare(b.start));
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    next[i] = {
      enabled: true,
      start: first.start,
      end: last.end,
      lunch: sorted.length > 1,
      lunchStart: sorted.length > 1 ? first.end : DEFAULT_DAY.lunchStart,
      lunchEnd: sorted.length > 1 ? last.start : DEFAULT_DAY.lunchEnd,
    };
  }
  return next;
}

/** One part of availability at a time; the Manage menu lists each as its own section. */
export function AvailabilityPanel({ view }: { view: "hours" | "off" | "rules" }) {
  const { business } = useMyBusiness();
  const { t, lang } = usePrefs();
  const dayNames = weekdays(lang);
  const qc = useQueryClient();
  const [days, setDays] = useState<DayState[]>(
    Array.from({ length: 7 }, () => ({ ...DEFAULT_DAY })),
  );

  const tab = view;
  const [busy, setBusy] = useState(false);
  const [blockFrom, setBlockFrom] = useState("");
  const [blockTo, setBlockTo] = useState("");
  const [reason, setReason] = useState("");
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);
  // Errors shown on the day itself, not in a toast that names it.
  const [dayErrors, setDayErrors] = useState<Record<number, string>>({});

  function updateDay(i: number, patch: Partial<DayState>) {
    setDays((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    setDayErrors(({ [i]: _cleared, ...rest }) => rest);
  }

  const { data, isLoading } = useQuery({
    queryKey: ["availability", business?.id],
    enabled: !!business,
    queryFn: async () => {
      const [{ data: hours }, { data: blocks }] = await Promise.all([
        supabase
          .from("working_hours")
          .select("id, weekday, start_time, end_time")
          .eq("business_id", business!.id)
          .order("weekday"),
        supabase
          .from("blocked_times")
          .select("id, starts_at, ends_at, reason")
          .eq("business_id", business!.id)
          .gte("ends_at", new Date().toISOString())
          .order("starts_at"),
      ]);
      // Onboarding writes per-staff rows; the panel manages one shared week.
      const seen = new Set<string>();
      const unique = (hours ?? []).filter((h) => {
        const k = `${h.weekday}|${h.start_time}|${h.end_time}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      return { hours: unique, blocks: blocks ?? [] };
    },
  });

  useEffect(() => {
    if (!data) return;
    setDays(fromRows(data.hours));
  }, [data]);

  const dirty = !!data && JSON.stringify(days) !== JSON.stringify(fromRows(data.hours));

  async function saveHours() {
    if (!business) return;
    // Refuse invalid days instead of silently dropping them (which would close the day).
    const errors: Record<number, string> = {};
    for (const [i, d] of days.entries()) {
      if (!d.enabled) continue;
      if (d.start >= d.end) {
        errors[i] = t("pf.av.err.dayRange").replace("{day}", dayNames[i] ?? "");
      } else if (
        d.lunch &&
        !(d.start < d.lunchStart && d.lunchStart < d.lunchEnd && d.lunchEnd < d.end)
      ) {
        errors[i] = t("pf.av.err.lunchRange").replace("{day}", dayNames[i] ?? "");
      }
    }
    setDayErrors(errors);
    if (Object.keys(errors).length) {
      toast.error(t("pf.common.checkData"));
      return;
    }
    setBusy(true);
    try {
      // Snapshot the current rows so a failed insert can put them back instead of
      // leaving the business with no hours (i.e. closed every day).
      const { data: previous, error: readError } = await supabase
        .from("working_hours")
        .select("business_id, staff_id, weekday, start_time, end_time")
        .eq("business_id", business.id);
      if (readError) throw readError;
      // Replace every row (including per-staff rows created at onboarding) so the
      // saved week is exactly what the owner sees here.
      const { error: delError } = await supabase
        .from("working_hours")
        .delete()
        .eq("business_id", business.id);
      if (delError) throw delError;
      const rows = days
        .map((d, weekday) => ({ ...d, weekday }))
        .filter((d) => d.enabled)
        .flatMap((d) => {
          if (!d.lunch) {
            return [
              {
                business_id: business.id,
                staff_id: null,
                weekday: d.weekday,
                start_time: d.start,
                end_time: d.end,
              },
            ];
          }
          return [
            {
              business_id: business.id,
              staff_id: null,
              weekday: d.weekday,
              start_time: d.start,
              end_time: d.lunchStart,
            },
            {
              business_id: business.id,
              staff_id: null,
              weekday: d.weekday,
              start_time: d.lunchEnd,
              end_time: d.end,
            },
          ];
        });
      if (rows.length) {
        const { error: insError } = await supabase.from("working_hours").insert(rows);
        if (insError) {
          if (previous?.length) await supabase.from("working_hours").insert(previous);
          throw insError;
        }
      }
      toast.success(t("pf.av.saved"));
      await qc.invalidateQueries({ queryKey: ["availability"] });
    } catch (err) {
      console.error("[availability] save failed", err);
      toast.error(t("pf.av.err.save"));
    } finally {
      setBusy(false);
    }
  }

  async function addBlock() {
    if (!business || blockBusy) return;
    // datetime-local values are wall-clock times in the business timezone, not the browser's.
    const toUtc = (v: string) =>
      zonedToUtc(v.slice(0, 10), timeToMinutes(v.slice(11, 16)), business.timezone);
    if (!blockFrom || !blockTo || toUtc(blockFrom) >= toUtc(blockTo)) {
      setBlockError(t("pf.av.err.range"));
      return;
    }
    setBlockError(null);
    setBlockBusy(true);
    const { error } = await supabase.from("blocked_times").insert({
      business_id: business.id,
      starts_at: toUtc(blockFrom).toISOString(),
      ends_at: toUtc(blockTo).toISOString(),
      reason: reason.trim().slice(0, 120) || null,
    });
    setBlockBusy(false);
    if (error) {
      setBlockError(t("pf.av.err.block"));
      return;
    }
    setBlockFrom("");
    setBlockTo("");
    setReason("");
    toast.success(t("pf.av.blockAdded"));
    qc.invalidateQueries({ queryKey: ["availability"] });
    qc.invalidateQueries({ queryKey: ["calendar"] });
  }

  async function removeBlock(id: string): Promise<boolean> {
    const { error } = await supabase.from("blocked_times").delete().eq("id", id);
    if (error) {
      toast.error(t("pf.common.saveError"));
      return false;
    }
    toast.success(t("pf.av.blockRemoved"));
    qc.invalidateQueries({ queryKey: ["availability"] });
    qc.invalidateQueries({ queryKey: ["calendar"] });
    return true;
  }

  if (isLoading) return <LoadingRows rows={4} />;

  const locked = false;

  function copyMondayToWeekdays() {
    setDays((prev) => {
      const mon = prev[1]!;
      return prev.map((d, i) => (i >= 1 && i <= 5 ? { ...mon } : d));
    });
    toast.success(t("pf.av.copied"));
  }

  return (
    <div className="space-y-5">
      {tab === "hours" && (
        <section className="surface p-4">
          {/* The page already titles this "Weekly hours": only the shortcut here. */}
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={copyMondayToWeekdays}>
              {t("pf.av.copyWeek")}
            </Button>
          </div>

          <div className="mt-3 divide-y divide-border">
            {/* Monday first, like the calendar; the data keeps 0 = Sunday. */}
            {WEEK_ORDER.map((i) => {
              const d = days[i]!;
              return (
                <div
                  key={i}
                  className="py-3 sm:grid sm:grid-cols-[minmax(0,17rem)_minmax(0,24rem)] sm:items-center sm:gap-x-6"
                >
                  <div className="flex min-h-11 items-center gap-2.5">
                    <Switch
                      checked={d.enabled}
                      disabled={locked}
                      onCheckedChange={(v) => updateDay(i, { enabled: v })}
                      aria-label={dayNames[i]}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">{dayNames[i]}</span>
                    {d.enabled ? (
                      <button
                        type="button"
                        onClick={() => updateDay(i, { lunch: !d.lunch })}
                        aria-pressed={d.lunch}
                        className={
                          d.lunch
                            ? "flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-accent px-3 text-xs font-bold text-accent-foreground"
                            : "flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-border px-3 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
                        }
                      >
                        <Coffee className="size-4" strokeWidth={2.5} />
                        {d.lunch ? t("pf.av.lunch") : `+ ${t("pf.av.lunch")}`}
                      </button>
                    ) : (
                      <span className="shrink-0 text-sm text-muted-foreground">
                        {t("pf.av.closed")}
                      </span>
                    )}
                  </div>

                  {d.enabled && (
                    <div className="mt-2 flex items-center gap-2 sm:mt-0">
                      <Input
                        type="time"
                        aria-label={`${dayNames[i]} · ${t("pf.av.start")}`}
                        aria-invalid={!!dayErrors[i]}
                        value={d.start}
                        onChange={(e) => updateDay(i, { start: e.target.value })}
                        className="h-11 w-full min-w-0 flex-1 px-3 text-sm"
                      />
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {t("pf.av.to")}
                      </span>
                      <Input
                        type="time"
                        aria-label={`${dayNames[i]} · ${t("pf.av.end")}`}
                        aria-invalid={!!dayErrors[i]}
                        value={d.end}
                        onChange={(e) => updateDay(i, { end: e.target.value })}
                        className="h-11 w-full min-w-0 flex-1 px-3 text-sm"
                      />
                    </div>
                  )}

                  {d.enabled && d.lunch && (
                    <div className="mt-2 rounded-xl bg-muted/40 p-2 sm:col-start-2">
                      <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                        {t("pf.av.lunch")}
                      </span>
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          aria-label={`${dayNames[i]} · ${t("pf.av.lunch")}`}
                          value={d.lunchStart}
                          onChange={(e) => updateDay(i, { lunchStart: e.target.value })}
                          className="h-11 w-full min-w-0 flex-1 bg-background px-3 text-sm"
                        />
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {t("pf.av.to")}
                        </span>
                        <Input
                          type="time"
                          aria-label={`${dayNames[i]} · ${t("pf.av.lunch")}`}
                          value={d.lunchEnd}
                          onChange={(e) => updateDay(i, { lunchEnd: e.target.value })}
                          className="h-11 w-full min-w-0 flex-1 bg-background px-3 text-sm"
                        />
                      </div>
                    </div>
                  )}

                  {dayErrors[i] && (
                    <div className="mt-2 sm:col-start-2">
                      <FieldError message={dayErrors[i]} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <SaveBar
            dirty={dirty}
            busy={busy}
            onSave={() => void saveHours()}
            onCancel={() => data && setDays(fromRows(data.hours))}
          />
        </section>
      )}

      {tab === "off" && (
        <>
          <section className="surface p-4">
            <h2 className="text-base font-semibold">{t("pf.av.blocks")}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("pf.av.blocks.desc")}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="bf" className="font-semibold">
                  {t("pf.av.start")}
                </Label>
                <Input
                  id="bf"
                  type="datetime-local"
                  className="w-full min-w-0"
                  value={blockFrom}
                  onChange={(e) => {
                    const v = e.target.value;
                    setBlockFrom(v);
                    // Most time off is whole days: propose the end of that same day.
                    if (v && (!blockTo || blockTo <= v)) setBlockTo(`${v.slice(0, 10)}T23:59`);
                  }}
                />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="bt" className="font-semibold">
                  {t("pf.av.end")}
                </Label>
                <Input
                  id="bt"
                  type="datetime-local"
                  className="w-full min-w-0"
                  value={blockTo}
                  min={blockFrom || undefined}
                  onChange={(e) => setBlockTo(e.target.value)}
                />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="br" className="font-semibold">
                  {t("pf.av.reason")}
                </Label>
                <Input
                  id="br"
                  className="w-full min-w-0"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={120}
                  placeholder={t("pf.av.reason.placeholder")}
                />
              </div>
            </div>

            <FormError message={blockError} className="mt-3" />
            <Button className="mt-3 w-full sm:w-auto" onClick={addBlock} disabled={blockBusy}>
              {blockBusy && <Loader2 className="mr-2 size-4 animate-spin" />}
              {t("pf.av.addBlock")}
            </Button>

            {(data?.blocks.length ?? 0) === 0 && (
              <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
                {t("pf.av.blocks.empty")}
              </p>
            )}
            {(data?.blocks.length ?? 0) > 0 && (
              <ul className="animate-stagger mt-4 space-y-2 border-t border-border pt-4">
                {data!.blocks.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm"
                  >
                    <span className="min-w-0 flex-1 break-words">
                      {formatDateShort(b.starts_at, business!.timezone)} —{" "}
                      {formatDateShort(b.ends_at, business!.timezone)}
                      {b.reason ? ` · ${b.reason}` : ""}
                    </span>
                    <ConfirmAction
                      title={t("pf.av.removeBlock")}
                      description={t("pf.av.removeBlock.desc")}
                      confirmLabel={t("pf.common.remove")}
                      onConfirm={() => removeBlock(b.id)}
                      trigger={
                        <Button variant="ghost" size="icon" aria-label={t("pf.av.removeBlock")}>
                          <Trash2 className="size-4" />
                        </Button>
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <VacationConflicts blocks={data?.blocks ?? []} />
        </>
      )}

      {tab === "rules" && (
        <div className="space-y-4">
          <ApprovalSetting />
          <BookingRules />
        </div>
      )}
    </div>
  );
}

type Block = { id: string; starts_at: string; ends_at: string; reason: string | null };

/** Appointments that fall inside a time-off period, with WhatsApp/email notice. */
function VacationConflicts({ blocks }: { blocks: Block[] }) {
  const { business } = useMyBusiness();
  const { t } = usePrefs();
  const qc = useQueryClient();

  const from = blocks.length ? blocks.map((b) => b.starts_at).sort()[0]! : null;
  const to = blocks.length
    ? blocks
        .map((b) => b.ends_at)
        .sort()
        .slice(-1)[0]!
    : null;

  const { data: conflicts = [] } = useQuery({
    queryKey: ["vacation-conflicts", business?.id, from, to],
    enabled: !!business && !!from && !!to,
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select(
          "id, starts_at, ends_at, customer_name, customer_phone, customer_email, service_name",
        )
        .eq("business_id", business!.id)
        .in("status", ["pending", "confirmed"])
        .gte("starts_at", from!)
        .lt("starts_at", to!)
        .order("starts_at");
      return (data ?? []).filter((a) =>
        blocks.some((b) => a.starts_at < b.ends_at && a.ends_at > b.starts_at),
      );
    },
  });

  if (!business || conflicts.length === 0) return null;

  const message = (a: (typeof conflicts)[number]) =>
    t("pf.av.conflict.message")
      .replace("{name}", a.customer_name)
      .replace("{date}", formatDateShort(a.starts_at, business.timezone))
      .replace("{business}", business.name);

  async function cancel(id: string): Promise<boolean> {
    const res = await setAppointmentStatus({
      id,
      businessId: business!.id,
      status: "cancelled",
      note: t("acts.note.cancelled"),
    });
    if (!res.ok) {
      toast.error(res.message || t("pf.common.saveError"));
      return false;
    }
    toast.success(t("pf.av.conflict.cancelled"));
    void invalidateAppointmentData(qc);
    return true;
  }

  return (
    <section className="surface p-5">
      <h2 className="text-base font-semibold">{t("pf.av.conflict.title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("pf.av.conflict.desc")}</p>
      <ul className="animate-stagger mt-4 space-y-3">
        {conflicts.map((a) => {
          const phone = normalizePhonePt(a.customer_phone ?? "");
          return (
            <li key={a.id} className="rounded-xl border border-border p-3">
              <p className="text-sm font-bold">{a.customer_name}</p>
              <p className="text-sm text-muted-foreground">
                {formatDateShort(a.starts_at, business.timezone)} · {a.service_name}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!phone}
                  onClick={() =>
                    window.open(
                      `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message(a))}`,
                      "_blank",
                      "noopener",
                    )
                  }
                >
                  <MessageCircle className="mr-1 size-4" />
                  WhatsApp
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!a.customer_email}
                  onClick={() =>
                    window.open(
                      `mailto:${a.customer_email}?subject=${encodeURIComponent(
                        t("pf.av.conflict.subject"),
                      )}&body=${encodeURIComponent(message(a))}`,
                      "_self",
                    )
                  }
                >
                  <Mail className="mr-1 size-4" />
                  Email
                </Button>
                <ConfirmAction
                  title={`${t("acts.dialog.cancelTitle")}${a.customer_name}?`}
                  description={t("pf.av.conflict.cancelDesc")}
                  confirmLabel={t("pf.av.conflict.cancel")}
                  onConfirm={() => cancel(a.id)}
                  trigger={
                    <Button variant="ghost" size="sm">
                      {t("pf.av.conflict.cancel")}
                    </Button>
                  }
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** How online bookings arrive: confirmed straight away, or as requests to approve. */
function ApprovalSetting() {
  const { business } = useMyBusiness();
  const { t } = usePrefs();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data: services } = useQuery({
    queryKey: ["services-approval", business?.id],
    enabled: !!business,
    queryFn: async () => {
      const { data } = await supabase
        .from("services")
        .select("id, requires_confirmation")
        .eq("business_id", business!.id);
      return data ?? [];
    },
  });
  const manual = (services ?? []).some((s) => s.requires_confirmation);
  const mixed = manual && (services ?? []).some((s) => !s.requires_confirmation);

  async function choose(next: boolean) {
    if (!business) return;
    setBusy(true);
    const { error } = await supabase
      .from("services")
      .update({ requires_confirmation: next })
      .eq("business_id", business.id);
    setBusy(false);
    if (error) {
      toast.error(t("pf.common.saveError"));
      return;
    }
    toast.success(t("ui.save.auto"));
    qc.invalidateQueries({ queryKey: ["services-approval"] });
    qc.invalidateQueries({ queryKey: ["services"] });
  }

  return (
    <section className="surface space-y-3 p-5">
      <h2 className="text-base font-semibold">{t("ob.prefs.approval")}</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            [false, t("ob.prefs.auto"), t("ob.prefs.auto.sub")],
            [true, t("ob.prefs.manual"), t("ob.prefs.manual.sub")],
          ] as const
        ).map(([value, title, sub]) => {
          const active = !mixed && services !== undefined && manual === value;
          return (
            <button
              key={String(value)}
              type="button"
              disabled={busy || !services}
              aria-pressed={active}
              onClick={() => void choose(value)}
              className={cn(
                "rounded-xl border p-4 text-left transition-colors",
                active
                  ? "border-brand bg-brand/8 ring-1 ring-brand"
                  : "border-border bg-card hover:bg-muted",
              )}
            >
              <p className="text-sm font-bold">{title}</p>
              <p className="text-sm font-normal text-muted-foreground">{sub}</p>
            </button>
          );
        })}
      </div>
      {mixed && <p className="text-xs text-muted-foreground">{t("pf.av.approvalMixed")}</p>}
    </section>
  );
}

/** Minimum notice choices, in minutes. */
const NOTICE_OPTIONS = [0, 30, 60, 120, 180, 360, 720, 1440, 2880];

function noticeLabel(minutes: number, none: string): string {
  if (minutes === 0) return none;
  if (minutes < 60) return `${minutes} min`;
  return `${minutes / 60} h`;
}

function BookingRules() {
  const { business } = useMyBusiness();
  const { t } = usePrefs();
  const qc = useQueryClient();
  const [cancellation, setCancellation] = useState("24");
  const [interval, setIntervalMin] = useState("15");
  const [horizon, setHorizon] = useState("2");
  const [autoComplete, setAutoComplete] = useState(false);
  const [notice, setNotice] = useState(30);
  const [verify, setVerify] = useState(false);
  const [rulesBusy, setBusy] = useState(false);

  function resetRules() {
    if (!business) return;
    setCancellation(String(business.cancellation_hours));
    setIntervalMin(String(business.slot_interval_minutes));
    setHorizon(String(business.booking_horizon_months ?? 2));
    setAutoComplete(business.auto_complete ?? false);
    setNotice(business.min_notice_minutes ?? 30);
    setVerify(business.verify_bookings ?? false);
  }

  useEffect(resetRules, [business]);

  const rulesDirty =
    !!business &&
    (cancellation !== String(business.cancellation_hours) ||
      interval !== String(business.slot_interval_minutes) ||
      horizon !== String(business.booking_horizon_months ?? 2) ||
      autoComplete !== (business.auto_complete ?? false) ||
      notice !== (business.min_notice_minutes ?? 30) ||
      verify !== (business.verify_bookings ?? false));

  async function save() {
    if (!business) return;
    const ch = Number(cancellation);
    const si = Number(interval);
    const hz = Number(horizon);
    if (
      !Number.isFinite(ch) ||
      ch < 0 ||
      ch > 168 ||
      !Number.isFinite(si) ||
      si < 5 ||
      si > 120 ||
      !Number.isFinite(hz) ||
      hz < 1 ||
      hz > 24
    ) {
      toast.error(t("pf.common.checkData"));
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("businesses")
      .update({
        cancellation_hours: ch,
        slot_interval_minutes: si,
        booking_horizon_months: Math.round(hz),
        // Only sent when changed, so saving still works before the column exists.
        ...(autoComplete !== (business.auto_complete ?? false)
          ? { auto_complete: autoComplete }
          : {}),
        ...(notice !== (business.min_notice_minutes ?? 30) ? { min_notice_minutes: notice } : {}),
        ...(verify !== (business.verify_bookings ?? false) ? { verify_bookings: verify } : {}),
      })
      .eq("id", business.id);
    setBusy(false);
    if (error) {
      toast.error(t("pf.common.saveError"));
      return;
    }
    toast.success(t("pf.common.saved"));
    qc.invalidateQueries({ queryKey: ["my-business"] });
  }

  return (
    <section className="surface space-y-4 p-5">
      <h2 className="text-base font-semibold">{t("pf.av.limits")}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="avch" className="font-semibold">
            {t("pf.biz.cancellation")}
          </Label>
          <Input
            id="avch"
            inputMode="numeric"
            value={cancellation}
            onChange={(e) => setCancellation(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="avsi" className="font-semibold">
            {t("pf.biz.slotInterval")}
          </Label>
          <Input
            id="avsi"
            inputMode="numeric"
            value={interval}
            onChange={(e) => setIntervalMin(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="avhz" className="font-semibold">
            {t("pf.av.horizon")}
          </Label>
          <Input
            id="avhz"
            inputMode="numeric"
            value={horizon}
            onChange={(e) => setHorizon(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("pf.av.horizon.hint")}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="avmn" className="font-semibold">
            {t("pf.av.notice")}
          </Label>
          <select
            id="avmn"
            value={notice}
            onChange={(e) => setNotice(Number(e.target.value))}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {NOTICE_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {noticeLabel(m, t("pf.av.notice.none"))}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{t("pf.av.notice.hint")}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
        <div>
          <p className="text-sm font-bold">{t("pf.av.autoComplete")}</p>
          <p className="text-sm text-muted-foreground">{t("pf.av.autoComplete.desc")}</p>
        </div>
        <Switch
          checked={autoComplete}
          onCheckedChange={setAutoComplete}
          aria-label={t("pf.av.autoComplete")}
        />
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
        <div>
          <p className="text-sm font-bold">{t("pf.av.verify")}</p>
          <p className="text-sm text-muted-foreground">{t("pf.av.verify.desc")}</p>
        </div>
        <Switch checked={verify} onCheckedChange={setVerify} aria-label={t("pf.av.verify")} />
      </div>

      <SaveBar
        dirty={rulesDirty}
        busy={rulesBusy}
        onSave={() => void save()}
        onCancel={resetRules}
      />
    </section>
  );
}
