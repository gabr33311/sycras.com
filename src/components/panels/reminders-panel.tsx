import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BellRing, Loader2, Mail, RotateCcw, Send } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { sendTestReminder } from "@/lib/reminders.functions";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { SaveBar } from "@/components/save-bar";
import { useMyBusiness } from "@/hooks/use-business";
import { ProLock } from "@/components/pro-lock";
import { useHasPro } from "@/hooks/use-subscription";
import { usePrefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { brandColors } from "@/lib/brand";
import {
  DEFAULT_REMINDER_MESSAGE,
  REMINDER_VARIABLES,
  renderReminderMessage,
} from "@/lib/reminder-message";

/** Suggested lead times, in hours; any other value goes in "Other". */
const LEADS = [2, 12, 24, 48];
const MAX_HOURS = 168;
const MAX_MESSAGE = 600;

/** Pro: clients get an email before their appointment, so fewer of them forget. */
export function RemindersPanel({ withReview = true }: { withReview?: boolean } = {}) {
  const { business } = useMyBusiness();
  const { t } = usePrefs();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const sendTest = useServerFn(sendTestReminder);
  const hasPro = useHasPro();

  // Draft values, saved together with the save bar.
  const [hours, setHours] = useState(24);
  const [custom, setCustom] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [customUnit, setCustomUnit] = useState<"h" | "d">("h");
  const [message, setMessage] = useState(DEFAULT_REMINDER_MESSAGE);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const savedHours = business?.reminder_hours ?? 24;
  const savedMessage = business?.reminder_message?.trim() || DEFAULT_REMINDER_MESSAGE;

  function hydrate() {
    if (!business) return;
    setHours(savedHours);
    const isCustom = !LEADS.includes(savedHours);
    setCustom(isCustom);
    const inDays = isCustom && savedHours % 24 === 0;
    setCustomUnit(inDays ? "d" : "h");
    setCustomValue(isCustom ? String(inDays ? savedHours / 24 : savedHours) : "");
    setMessage(savedMessage);
  }
  useEffect(hydrate, [business]);

  // "Other": the typed number in hours or days.
  useEffect(() => {
    if (!custom) return;
    const n = Number(customValue);
    if (Number.isFinite(n) && n > 0) setHours(Math.round(customUnit === "d" ? n * 24 : n));
  }, [custom, customValue, customUnit]);

  const enabled = business?.reminders_enabled ?? true;
  const page = brandColors(business?.brand_color);
  const hoursValid = Number.isInteger(hours) && hours >= 1 && hours <= MAX_HOURS;
  const dirty = !!business && (hours !== savedHours || message.trim() !== savedMessage);

  const { data: sent } = useQuery({
    queryKey: ["reminders-sent", business?.id],
    enabled: !!business,
    queryFn: async () => {
      const { count } = await supabase
        .from("appointment_reminders")
        .select("id", { count: "exact", head: true })
        .eq("business_id", business!.id)
        .eq("kind", "email")
        .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString());
      return count ?? 0;
    },
  });

  async function toggle(v: boolean) {
    if (!business) return;
    setBusy(true);
    const { error } = await supabase
      .from("businesses")
      .update({ reminders_enabled: v })
      .eq("id", business.id);
    setBusy(false);
    if (error) {
      toast.error(t("pf.common.saveError"));
      return;
    }
    toast.success(t("ui.save.auto"));
    qc.invalidateQueries({ queryKey: ["my-business"] });
  }

  async function save() {
    if (!business) return;
    if (!hoursValid) {
      toast.error(t("rm.custom.invalid"));
      return;
    }
    const text = message.trim();
    setBusy(true);
    const { error } = await supabase
      .from("businesses")
      .update({
        reminder_hours: hours,
        // The suggestion is stored as "no custom text", so it can improve later.
        reminder_message: !text || text === DEFAULT_REMINDER_MESSAGE ? null : text,
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

  /** Puts a variable where the cursor is (or at the end). */
  function insertVariable(v: string) {
    const el = textRef.current;
    const start = el?.selectionStart ?? message.length;
    const end = el?.selectionEnd ?? message.length;
    const next = (message.slice(0, start) + v + message.slice(end)).slice(0, MAX_MESSAGE);
    setMessage(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + v.length, start + v.length);
    });
  }

  async function test() {
    if (!business) return;
    setTesting(true);
    try {
      const res = await sendTest({ data: { businessId: business.id } });
      if (res.ok) toast.success(t("rm.test.sent").replace("{email}", res.to));
      else
        toast.error(
          res.reason === "not_configured" ? t("rm.test.notConfigured") : t("rm.test.failed"),
          // The real cause, so a failing setup can be fixed.
          "detail" in res && res.detail ? { description: res.detail } : undefined,
        );
    } catch (e) {
      toast.error(t("rm.test.failed"), {
        description: e instanceof Error ? e.message.slice(0, 160) : undefined,
      });
    } finally {
      setTesting(false);
    }
  }

  const preview = renderReminderMessage(message, {
    nome: "Ana",
    serviço: t("rm.preview.sampleService"),
    data: t("rm.preview.sampleDate"),
    hora: "10:30",
    negócio: business?.name,
  });

  const chip = (active: boolean) =>
    cn(
      "h-11 rounded-xl border text-sm font-bold transition-colors",
      active
        ? "border-brand bg-brand text-brand-foreground"
        : "border-border bg-card hover:bg-muted",
    );

  return (
    <div className="space-y-4">
      {/* Reminders only go out with paid Pro (not in the free trial). */}
      {hasPro === false && <ProLock text={t("rm.locked")} />}
      <section className="surface divide-y divide-border">
        <div className="flex items-center justify-between gap-4 p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand/12 dark:bg-brand/25 text-brand-ink">
              <BellRing className="size-[17px]" />
            </span>
            <div>
              <p className="flex items-center gap-2 text-sm font-bold">
                {t("rm.toggle")}
                <span className="rounded-full border border-subscription-accent px-2 py-px text-[10px] font-bold uppercase">
                  Pro
                </span>
              </p>
              <p className="text-sm text-muted-foreground">{t("rm.toggle.desc")}</p>
            </div>
          </div>
          <Switch
            checked={enabled}
            disabled={busy || !business}
            onCheckedChange={(v) => void toggle(v)}
            aria-label={t("rm.toggle")}
          />
        </div>

        <div className={cn("space-y-5 p-5", !enabled && "pointer-events-none opacity-50")}>
          {/* When: suggestions plus any other value. */}
          <div className="space-y-3">
            <p className="text-sm font-bold">{t("rm.when")}</p>
            <div className="grid grid-cols-5 gap-2">
              {LEADS.map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-pressed={!custom && hours === h}
                  onClick={() => {
                    setCustom(false);
                    setHours(h);
                  }}
                  className={chip(!custom && hours === h)}
                >
                  {h}h
                </button>
              ))}
              <button
                type="button"
                aria-pressed={custom}
                onClick={() => {
                  setCustom(true);
                  if (!customValue) setCustomValue(String(hours));
                }}
                className={chip(custom)}
              >
                {t("rm.custom")}
              </button>
            </div>
            {custom && (
              <div className="flex items-center gap-2">
                <Input
                  inputMode="numeric"
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                  className="w-24 text-center font-bold tabular-nums"
                  aria-label={t("rm.custom")}
                  autoFocus
                />
                <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-card p-1">
                  {(["h", "d"] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      aria-pressed={customUnit === u}
                      onClick={() => setCustomUnit(u)}
                      className={cn(
                        "h-9 rounded-lg px-3 text-sm font-bold transition-colors",
                        customUnit === u ? "bg-brand text-brand-foreground" : "hover:bg-muted",
                      )}
                    >
                      {u === "h" ? t("rm.unit.hours") : t("rm.unit.days")}
                    </button>
                  ))}
                </div>
                <span className="text-sm text-muted-foreground">{t("rm.custom.before")}</span>
              </div>
            )}
            <p className={cn("text-xs", hoursValid ? "text-muted-foreground" : "text-destructive")}>
              {hoursValid ? t("rm.when.hint") : t("rm.custom.invalid")}
            </p>
          </div>

          {/* What: the business's own message. */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold">{t("rm.message")}</p>
              {message.trim() !== DEFAULT_REMINDER_MESSAGE && (
                <button
                  type="button"
                  onClick={() => setMessage(DEFAULT_REMINDER_MESSAGE)}
                  className="flex items-center gap-1 text-xs font-bold text-brand-ink hover:underline"
                >
                  <RotateCcw className="size-3" /> {t("rm.message.reset")}
                </button>
              )}
            </div>
            <Textarea
              ref={textRef}
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE))}
              rows={4}
              aria-label={t("rm.message")}
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{t("rm.message.insert")}</span>
              {REMINDER_VARIABLES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertVariable(v)}
                  className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-bold hover:bg-muted"
                >
                  {v}
                </button>
              ))}
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                {message.length}/{MAX_MESSAGE}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 p-5">
          <p className="text-sm text-muted-foreground">{t("rm.sent30")}</p>
          <p className="text-lg font-bold tabular-nums">{sent ?? "—"}</p>
        </div>
      </section>

      {/* What the client receives, live. */}
      <section className="surface space-y-3 p-5">
        <p className="flex items-center gap-2 text-sm font-bold">
          <Mail className="size-4 text-brand-ink" /> {t("rm.preview")}
        </p>
        <div className="rounded-xl border border-border bg-background p-4 text-sm">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            {business?.name}
          </p>
          <p className="mt-1 text-lg font-bold">{t("rm.preview.title")}</p>
          <p className="mt-1 whitespace-pre-line text-muted-foreground">{preview}</p>
          <div className="mt-3 rounded-lg border border-border p-3 text-[13px]">
            <p>
              <b>{t("rm.preview.service")}</b> {t("rm.preview.sampleService")}
            </p>
            <p>
              <b>{t("rm.preview.time")}</b> {t("rm.preview.sampleDate")}, 10:30
            </p>
          </div>
          {/* The email uses the page colour, the one clients know. */}
          <p
            className="mt-3 inline-block rounded-lg px-3 py-2 text-[13px] font-bold"
            style={{ backgroundColor: page.brand, color: page.foreground }}
          >
            {t("rm.preview.cta")}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">{t("rm.onlyEmail")}</p>
        <Button
          variant="outline"
          onClick={() => void test()}
          disabled={testing || !business || dirty}
        >
          {testing ? <Loader2 className="animate-spin" /> : <Send />}
          {t("rm.test")}
        </Button>
        {dirty && <p className="text-xs text-muted-foreground">{t("rm.test.saveFirst")}</p>}
      </section>

      {withReview && <ReviewLink />}

      <SaveBar dirty={dirty} busy={busy} onSave={() => void save()} onCancel={hydrate} />
    </div>
  );
}

/** The review link for the "How did it go?" email (a Pro extra, sent with the reminders). */
export function ReviewLink() {
  const { business } = useMyBusiness();
  const { t } = usePrefs();
  const qc = useQueryClient();
  const saved = business?.review_url ?? "";
  const [url, setUrl] = useState(saved);
  const [busy, setBusy] = useState(false);
  useEffect(() => setUrl(saved), [saved]);

  async function save() {
    if (!business) return;
    const next = url.trim();
    if (next && !/^https:\/\/\S+$/.test(next)) {
      toast.error(t("rv.invalid"));
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("businesses")
      .update({ review_url: next || null })
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
    <section className="surface space-y-3 p-5">
      <div>
        <p className="flex items-center gap-2 text-sm font-bold">
          {t("rv.title")}
          <span className="rounded-full border border-subscription-accent px-2 py-px text-[10px] font-bold uppercase">
            Pro
          </span>
        </p>
        <p className="text-sm text-muted-foreground">{t("rv.desc")}</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="url"
          inputMode="url"
          placeholder="https://g.page/r/…/review"
          aria-label={t("rv.label")}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          maxLength={500}
        />
        <Button
          variant="outline"
          disabled={busy || url.trim() === saved}
          onClick={() => void save()}
        >
          {busy && <Loader2 className="animate-spin" />}
          {t("pf.common.save")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("rv.hint")}</p>
    </section>
  );
}
