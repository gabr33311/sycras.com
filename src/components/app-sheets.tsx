import { useState, type ReactNode, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { onOpenAppointmentRequest } from "@/lib/native";
import { useNavigate } from "@tanstack/react-router";
import { useHasPro } from "@/hooks/use-subscription";
import { useMoney } from "@/hooks/use-money-hidden";
import {
  Ban,
  BellRing,
  CalendarClock,
  CalendarPlus,
  Check,
  ChevronRight,
  Clock,
  Loader2,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  RotateCcw,
  ShieldCheck,
  StickyNote,
  Trash2,
  UserX,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui-bits";
import { EditCustomerDialog } from "@/components/edit-customer-dialog";
import { NewAppointmentDialog } from "@/components/new-appointment-dialog";
import { useAppointmentCommands, type ApptStatusValue } from "@/components/appointment-commands";
import { useMyBusiness } from "@/hooks/use-business";
import { useIsMobile } from "@/hooks/use-mobile";
import { AppointmentSheetContext } from "@/lib/appointment-sheet-context";
import { usePrefs } from "@/lib/prefs";
import { normalizePhonePt } from "@/lib/phone";
import {
  displayCustomerName,
  formatDateLong,
  formatDateShort,
  formatPrice,
  formatTime,
  initials,
} from "@/lib/format";

/** Bottom sheet on phones, centred dialog on larger screens. */
function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const mobile = useIsMobile();
  if (mobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92dvh] pb-[var(--sab)]">
          <DrawerTitle className="sr-only">{title}</DrawerTitle>
          {description && <DrawerDescription className="sr-only">{description}</DrawerDescription>}
          <div className="overflow-y-auto px-5 pb-6 pt-3">{children}</div>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-md">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {description && <DialogDescription className="sr-only">{description}</DialogDescription>}
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** One label/value line inside a details card. */
function InfoRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-12 items-center gap-3 px-4 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </span>
      <span className="w-20 shrink-0 text-xs font-semibold text-muted-foreground sm:w-24">
        {label}
      </span>
      <span className="min-w-0 flex-1 text-right text-sm font-semibold">{children}</span>
    </div>
  );
}

type SheetAppointment = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  customer_id: string | null;
  service_name: string;
  price_cents: number | null;
  status: ApptStatusValue;
  notes: string | null;
  staff_id: string | null;
  source: string;
  deposit_cents?: number | null;
  deposit_status?: string | null;
};

function useSheetAppointment(id: string | null) {
  return useQuery({
    queryKey: ["appointment-sheet", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id, starts_at, ends_at, customer_name, customer_phone, customer_email, customer_id, service_name, price_cents, status, notes, staff_id, source, deposit_cents, deposit_status",
        )
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      // When the client's reminder email went out (if it did).
      const { data: reminder } = await supabase
        .from("appointment_reminders")
        .select("created_at")
        .eq("appointment_id", data.id)
        .eq("kind", "email")
        .maybeSingle();
      let staffName: string | null = null;
      if (data.staff_id) {
        const { data: staff } = await supabase
          .from("staff")
          .select("name")
          .eq("id", data.staff_id)
          .maybeSingle();
        staffName = staff?.name ?? null;
      }
      return {
        appt: data as SheetAppointment,
        staffName,
        reminderAt: reminder?.created_at ?? null,
      };
    },
  });
}

/** Everything about one appointment, with the actions that fit its state. */
function AppointmentSheetBody({
  appt,
  staffName,
  reminderAt,
  onClose,
  onOpenCustomer,
}: {
  appt: SheetAppointment;
  staffName: string | null;
  reminderAt: string | null;
  onClose: () => void;
  onOpenCustomer: (id: string) => void;
}) {
  const { t } = usePrefs();
  const { business } = useMyBusiness();
  const tz = business?.timezone ?? "Europe/Lisbon";
  const cmd = useAppointmentCommands(
    {
      id: appt.id,
      status: appt.status,
      customerName: appt.customer_name,
      customerPhone: appt.customer_phone,
      startsAt: appt.starts_at,
      serviceName: appt.service_name,
      timezone: tz,
    },
    onClose,
  );
  const phone = appt.customer_phone ? normalizePhonePt(appt.customer_phone) : null;
  const money = useMoney();
  const end = appt.ends_at ? ` – ${formatTime(appt.ends_at, tz)}` : "";
  const minutes = appt.ends_at
    ? Math.round((new Date(appt.ends_at).getTime() - new Date(appt.starts_at).getTime()) / 60000)
    : null;
  const due = cmd.can.complete && appt.status !== "no_show";
  // The client's reminder: sent, scheduled, or impossible (no email).
  const upcoming =
    new Date(appt.starts_at).getTime() > Date.now() &&
    (appt.status === "confirmed" || appt.status === "pending");
  const sendAt = new Date(
    new Date(appt.starts_at).getTime() - (business?.reminder_hours ?? 24) * 3600000,
  );
  const reminder = reminderAt
    ? t("sheet.reminder.sent")
        .replace("{date}", formatDateLong(reminderAt, tz))
        .replace("{time}", formatTime(reminderAt, tz))
    : !upcoming || !business?.reminders_enabled
      ? null
      : !appt.customer_email
        ? t("sheet.reminder.noEmail")
        : sendAt.getTime() > Date.now()
          ? t("sheet.reminder.scheduled")
              .replace("{date}", formatDateLong(sendAt.toISOString(), tz))
              .replace("{time}", formatTime(sendAt.toISOString(), tz))
          : null;

  async function act(next: ApptStatusValue) {
    const ok = await cmd.setStatus(next);
    if (ok && next !== "confirmed") onClose();
  }

  return (
    <div className="space-y-4">
      {/* Who and what */}
      <div>
        <div className="flex items-center gap-2">
          <StatusBadge status={due ? "pending" : appt.status} />
          {due && (
            <span className="text-xs font-semibold text-muted-foreground">{t("sheet.due")}</span>
          )}
        </div>
        <h2 className="mt-2 font-display text-2xl font-bold leading-tight tracking-tight">
          {displayCustomerName(appt.customer_name)}
        </h2>
        <p className="mt-0.5 text-[15px] text-muted-foreground">
          {appt.service_name}
          {minutes ? ` · ${t("sheet.duration").replace("{min}", String(minutes))}` : ""}
        </p>
      </div>

      {/* The decision this appointment needs right now, as big buttons. */}
      {appt.status === "pending" && (
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" onClick={() => void act("confirmed")} disabled={cmd.busy}>
            {cmd.busy ? <Loader2 className="animate-spin" /> : <Check strokeWidth={3} />}
            {t("acts.confirm")}
          </Button>
          <Button size="lg" variant="outline" onClick={cmd.openCancel} disabled={cmd.busy}>
            <X strokeWidth={3} />
            {t("sheet.decline")}
          </Button>
        </div>
      )}
      {due && appt.status !== "pending" && (
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" onClick={() => void act("completed")} disabled={cmd.busy}>
            {cmd.busy ? <Loader2 className="animate-spin" /> : <Check strokeWidth={3} />}
            {t("sheet.done")}
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => void act("no_show")}
            disabled={cmd.busy}
          >
            <UserX />
            {t("sheet.noShow")}
          </Button>
        </div>
      )}

      {/* Details */}
      <div className="surface divide-y divide-border overflow-hidden p-0">
        <InfoRow icon={<Clock className="size-4" />} label={t("sheet.when")}>
          <span className="block">{formatDateLong(appt.starts_at, tz)}</span>
          <span className="block tabular-nums text-muted-foreground">
            {formatTime(appt.starts_at, tz)}
            {end}
          </span>
        </InfoRow>
        {staffName && (
          <InfoRow icon={<Users className="size-4" />} label={t("sheet.staff")}>
            {staffName}
          </InfoRow>
        )}
        {appt.price_cents != null && (
          <InfoRow icon={<span className="text-xs font-bold">€</span>} label={t("sheet.price")}>
            <span className="tabular-nums">
              {money(appt.price_cents, business?.currency ?? "EUR")}
            </span>
            {appt.deposit_status && appt.deposit_cents ? (
              <span className="mt-0.5 block text-xs font-semibold text-muted-foreground">
                {appt.deposit_status === "refunded"
                  ? t("dp.refunded")
                  : appt.status === "no_show"
                    ? t("dp.kept").replace(
                        "{x}",
                        money(appt.deposit_cents, business?.currency ?? "EUR"),
                      )
                    : t("dp.paid")
                        .replace("{x}", money(appt.deposit_cents, business?.currency ?? "EUR"))
                        .replace(
                          "{y}",
                          money(
                            Math.max(0, (appt.price_cents ?? 0) - appt.deposit_cents),
                            business?.currency ?? "EUR",
                          ),
                        )}
              </span>
            ) : null}
          </InfoRow>
        )}
        {appt.customer_phone && (
          <InfoRow icon={<Phone className="size-4" />} label={t("sheet.phone")}>
            <a href={`tel:${appt.customer_phone}`} className="underline-offset-2 hover:underline">
              {appt.customer_phone}
            </a>
          </InfoRow>
        )}
        {appt.customer_email && (
          <InfoRow icon={<Mail className="size-4" />} label={t("sheet.email")}>
            <a
              href={`mailto:${appt.customer_email}`}
              title={appt.customer_email}
              className="block truncate underline-offset-2 hover:underline"
            >
              {appt.customer_email}
            </a>
          </InfoRow>
        )}
        {reminder && (
          <InfoRow icon={<BellRing className="size-4" />} label={t("sheet.reminder")}>
            {reminder}
          </InfoRow>
        )}
        <InfoRow icon={<CalendarPlus className="size-4" />} label={t("sheet.source")}>
          {appt.source === "manual" ? t("sheet.source.manual") : t("sheet.source.online")}
        </InfoRow>
      </div>

      {appt.notes?.trim() && (
        <div className="rounded-2xl bg-muted/60 p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
            <StickyNote className="size-3.5" /> {t("sheet.notes")}
          </p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm">{appt.notes}</p>
        </div>
      )}

      {/* Contact and follow-up */}
      {(phone || cmd.can.reschedule || cmd.can.remind) && (
        <div className="grid grid-cols-2 gap-2">
          {phone && (
            <Button asChild variant="outline">
              <a href={`tel:${phone.replace(/[^\d+]/g, "")}`}>
                <Phone /> {t("sheet.call")}
              </a>
            </Button>
          )}
          {phone && (
            <Button asChild variant="outline">
              <a
                href={`https://wa.me/${phone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle /> {t("sheet.whatsapp")}
              </a>
            </Button>
          )}
          {cmd.can.reschedule && (
            <Button variant="outline" onClick={cmd.openReschedule} disabled={cmd.busy}>
              <CalendarClock /> {t("acts.reschedule")}
            </Button>
          )}
          {cmd.can.remind && (
            <Button variant="outline" onClick={cmd.remind}>
              <BellRing /> {t("acts.remindWhatsapp")}
            </Button>
          )}
        </div>
      )}

      {/* Quieter, less frequent actions */}
      <div className="space-y-1 border-t border-border pt-3">
        {appt.customer_id && (
          <SheetLink
            icon={<ChevronRight className="size-4" />}
            onClick={() => onOpenCustomer(appt.customer_id!)}
          >
            {t("sheet.customer")}
          </SheetLink>
        )}
        {cmd.can.revert && (
          <SheetLink
            icon={<RotateCcw className="size-4" />}
            onClick={() => void cmd.setStatus("confirmed")}
          >
            {t("acts.revertCompleted")}
          </SheetLink>
        )}
        {cmd.can.cancel && appt.status !== "pending" && (
          <SheetLink icon={<XCircle className="size-4" />} onClick={cmd.openCancel}>
            {t("acts.cancelAppt")}
          </SheetLink>
        )}
        {cmd.can.delete && (
          <SheetLink icon={<Trash2 className="size-4" />} onClick={cmd.openDelete}>
            {t("acts.deleteAppt")}
          </SheetLink>
        )}
      </div>
      {cmd.dialogs}
    </div>
  );
}

function SheetLink({
  icon,
  onClick,
  children,
}: {
  icon: ReactNode;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 w-full items-center justify-between rounded-xl px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
      {icon}
    </button>
  );
}

function AppointmentSheet({
  id,
  onOpenChange,
  onOpenCustomer,
}: {
  id: string | null;
  onOpenChange: (o: boolean) => void;
  onOpenCustomer: (id: string) => void;
}) {
  const { t } = usePrefs();
  const { data, isLoading } = useSheetAppointment(id);
  return (
    <ResponsiveSheet
      open={!!id}
      onOpenChange={onOpenChange}
      title={data?.appt.customer_name ?? t("appt.page.title")}
    >
      {isLoading || (!data && !!id && data === undefined) ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      ) : !data ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("sheet.notFound")}</p>
      ) : (
        <AppointmentSheetBody
          key={data.appt.id}
          appt={data.appt}
          staffName={data.staffName}
          reminderAt={data.reminderAt}
          onClose={() => onOpenChange(false)}
          onOpenCustomer={onOpenCustomer}
        />
      )}
    </ResponsiveSheet>
  );
}

// ---------------------------------------------------------------- client card

function useCustomerCard(id: string | null) {
  return useQuery({
    queryKey: ["customer-card", id],
    enabled: !!id,
    queryFn: async () => {
      const [{ data: customer, error }, { data: appts }] = await Promise.all([
        supabase
          .from("customers")
          .select("id, name, phone, email, notes, is_blocked")
          .eq("id", id!)
          .maybeSingle(),
        supabase
          .from("appointments")
          .select("id, starts_at, service_name, price_cents, status")
          .eq("customer_id", id!)
          .order("starts_at", { ascending: false })
          .limit(50),
      ]);
      if (error) throw error;
      return customer ? { customer, appts: appts ?? [] } : null;
    },
  });
}

function CustomerSheet({
  id,
  onOpenChange,
  onOpenAppointment,
}: {
  id: string | null;
  onOpenChange: (o: boolean) => void;
  onOpenAppointment: (id: string) => void;
}) {
  const { t } = usePrefs();
  const qc = useQueryClient();
  const { business } = useMyBusiness();
  const { data, isLoading } = useCustomerCard(id);
  const hasPro = useHasPro();
  const navigate = useNavigate();
  const money = useMoney();
  const [editing, setEditing] = useState(false);
  const [booking, setBooking] = useState(false);
  const tz = business?.timezone ?? "Europe/Lisbon";
  const currency = business?.currency ?? "EUR";

  const appts = data?.appts ?? [];
  const now = Date.now();
  const next = [...appts]
    .reverse()
    .find(
      (a) =>
        new Date(a.starts_at).getTime() > now &&
        (a.status === "pending" || a.status === "confirmed"),
    );
  const spent = appts
    .filter((a) => a.status === "completed")
    .reduce((s, a) => s + (a.price_cents ?? 0), 0);
  const visits = appts.filter((a) => a.status === "completed").length;
  const noShows = appts.filter((a) => a.status === "no_show").length;
  const phone = data?.customer.phone ? normalizePhonePt(data.customer.phone) : null;

  async function toggleBlock() {
    if (!data) return;
    // Blocking is a paid Pro extra (unblocking always works).
    if (!data.customer.is_blocked && hasPro === false) {
      toast(t("sub.locked"), {
        description: t("sub.only.block"),
        action: { label: t("sub.locked.cta"), onClick: () => void navigate({ to: "/plans" }) },
      });
      return;
    }
    const { error } = await supabase
      .from("customers")
      .update({ is_blocked: !data.customer.is_blocked })
      .eq("id", data.customer.id);
    if (error) {
      toast.error(t("cust.toast.updateError"));
      return;
    }
    toast.success(data.customer.is_blocked ? t("cust.toast.unblocked") : t("cust.toast.blocked"));
    void qc.invalidateQueries({ queryKey: ["customer-card", id] });
    void qc.invalidateQueries({ queryKey: ["customers"] });
  }

  return (
    <>
      <ResponsiveSheet
        open={!!id && !editing && !booking}
        onOpenChange={onOpenChange}
        title={data?.customer.name ?? t("cust.title")}
      >
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
        ) : !data ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("cust.empty.none")}</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3.5">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground">
                {initials(data.customer.name)}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-display text-2xl font-bold leading-tight tracking-tight">
                  {data.customer.name}
                </h2>
                <p className="truncate text-sm text-muted-foreground">
                  {data.customer.phone ?? data.customer.email ?? t("cust.noContact")}
                </p>
              </div>
              {data.customer.is_blocked && <StatusBadge status="cancelled" />}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {phone ? (
                <Button asChild variant="outline" className="h-auto flex-col gap-1 py-3">
                  <a href={`tel:${phone.replace(/[^\d+]/g, "")}`}>
                    <Phone /> <span className="text-xs">{t("sheet.call")}</span>
                  </a>
                </Button>
              ) : (
                <Button variant="outline" disabled className="h-auto flex-col gap-1 py-3">
                  <Phone /> <span className="text-xs">{t("sheet.call")}</span>
                </Button>
              )}
              {phone ? (
                <Button asChild variant="outline" className="h-auto flex-col gap-1 py-3">
                  <a
                    href={`https://wa.me/${phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle /> <span className="text-xs">{t("sheet.whatsapp")}</span>
                  </a>
                </Button>
              ) : (
                <Button variant="outline" disabled className="h-auto flex-col gap-1 py-3">
                  <MessageCircle /> <span className="text-xs">{t("sheet.whatsapp")}</span>
                </Button>
              )}
              <Button className="h-auto flex-col gap-1 py-3" onClick={() => setBooking(true)}>
                <CalendarPlus /> <span className="text-xs">{t("ccard.book")}</span>
              </Button>
            </div>

            <div className="grid grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-card">
              {[
                [t("ccard.visits"), String(visits)],
                [t("ccard.spent"), money(spent, currency)],
                [t("ccard.noShows"), String(noShows)],
              ].map(([label, value]) => (
                <div key={label} className="px-3 py-3 text-center">
                  <p className="font-display text-lg font-bold tabular-nums">{value}</p>
                  <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            {next && (
              <button
                type="button"
                onClick={() => onOpenAppointment(next.id)}
                className="surface flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/40"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <CalendarClock className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-muted-foreground">
                    {t("ccard.next")}
                  </span>
                  <span className="block truncate text-sm font-bold">
                    {formatDateLong(next.starts_at, tz)} · {formatTime(next.starts_at, tz)}
                  </span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">
                    {next.service_name}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            )}

            {/* Two or more no-shows: offer to block, in one tap. */}
            {noShows >= 2 && !data.customer.is_blocked && (
              <div className="flex items-center gap-3 rounded-2xl border border-st-noshow/30 bg-st-noshow/8 p-3.5">
                <Ban className="size-4 shrink-0 text-st-noshow-fg" />
                <p className="min-w-0 flex-1 text-sm font-semibold">
                  {t("cust.noShowHint").replace("{n}", String(noShows))}
                </p>
                <Button size="sm" variant="outline" onClick={() => void toggleBlock()}>
                  {t("cust.noShowBlock")}
                </Button>
              </div>
            )}

            {data.customer.notes?.trim() && (
              <div className="rounded-2xl bg-muted/60 p-4">
                <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                  <StickyNote className="size-3.5" /> {t("cust.field.notes")}
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm">{data.customer.notes}</p>
              </div>
            )}

            <section>
              <h3 className="mb-2 text-sm font-bold">{t("cust.history.title")}</h3>
              {appts.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  {t("cust.history.empty")}
                </p>
              ) : (
                <ul className="surface divide-y divide-border overflow-hidden p-0">
                  {appts.slice(0, 12).map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => onOpenAppointment(a.id)}
                        className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
                      >
                        <span className="w-16 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                          {formatDateShort(a.starts_at, tz)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {a.service_name}
                        </span>
                        <StatusBadge status={a.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="space-y-1 border-t border-border pt-3">
              <SheetLink icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                {t("ccard.edit")}
              </SheetLink>
              <SheetLink
                icon={
                  data.customer.is_blocked ? (
                    <ShieldCheck className="size-4" />
                  ) : (
                    <Ban className="size-4" />
                  )
                }
                onClick={() => void toggleBlock()}
              >
                {data.customer.is_blocked ? t("cust.unblock") : t("cust.block")}
              </SheetLink>
            </div>
          </div>
        )}
      </ResponsiveSheet>

      {data && (
        <EditCustomerDialog
          key={`edit-${data.customer.id}`}
          customer={data.customer}
          open={editing}
          onOpenChange={(o) => {
            setEditing(o);
            if (!o) void qc.invalidateQueries({ queryKey: ["customer-card", id] });
          }}
        />
      )}
      {business && data && (
        <NewAppointmentDialog
          key={`book-${data.customer.id}`}
          business={business}
          open={booking}
          onOpenChange={setBooking}
          defaultCustomer={{
            id: data.customer.id,
            name: data.customer.name,
            phone: data.customer.phone,
          }}
        />
      )}
    </>
  );
}

/** Provides `useAppointmentSheet()` to the whole signed-in app. */
export function AppSheetsProvider({ children }: { children: ReactNode }) {
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const api = {
    openAppointment: (id: string) => {
      setCustomerId(null);
      setAppointmentId(id);
    },
    openCustomer: (id: string) => {
      setAppointmentId(null);
      setCustomerId(id);
    },
  };
  // A tapped push notification opens its appointment here.
  useEffect(() => onOpenAppointmentRequest(api.openAppointment), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppointmentSheetContext.Provider value={api}>
      {children}
      <AppointmentSheet
        id={appointmentId}
        onOpenChange={(o) => !o && setAppointmentId(null)}
        onOpenCustomer={api.openCustomer}
      />
      <CustomerSheet
        id={customerId}
        onOpenChange={(o) => !o && setCustomerId(null)}
        onOpenAppointment={api.openAppointment}
      />
    </AppointmentSheetContext.Provider>
  );
}
