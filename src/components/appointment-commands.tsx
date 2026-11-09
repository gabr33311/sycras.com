import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormError } from "@/components/ui-bits";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/hooks/use-business";
import { invalidateAppointmentData, setAppointmentStatus } from "@/lib/appointment-status";
import { ownerCancelRefund } from "@/lib/deposit";
import { normalizePhonePt } from "@/lib/phone";
import { formatDateLong, formatTime } from "@/lib/format";
import { timeToMinutes, zonedToUtc } from "@/lib/time";
import { usePrefs } from "@/lib/prefs";

export type ApptStatusValue =
  "pending" | "confirmed" | "completed" | "cancelled" | "no_show" | "expired";

export type AppointmentCommandTarget = {
  id: string;
  status: ApptStatusValue;
  customerName: string;
  customerPhone?: string | null | undefined;
  startsAt?: string | undefined;
  serviceName?: string | undefined;
  timezone?: string | undefined;
};

/**
 * Everything the business can do to one appointment — change its status,
 * reschedule, cancel, delete, remind — in one place, so the calendar menu and
 * the appointment sheet behave exactly the same. Render `dialogs` once.
 */
export function useAppointmentCommands(target: AppointmentCommandTarget, onDone?: () => void) {
  const { id, status, customerName, customerPhone, startsAt, serviceName } = target;
  const { t } = usePrefs();
  const qc = useQueryClient();
  const { business } = useMyBusiness();
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  const tz = target.timezone ?? business?.timezone ?? "Europe/Lisbon";
  const startMs = startsAt ? new Date(startsAt).getTime() : null;
  const isFuture = startMs !== null && startMs > Date.now();
  const live = status === "pending" || status === "confirmed";
  const phone = customerPhone ? normalizePhonePt(customerPhone) : null;

  const can = {
    confirm: status === "pending",
    // Completing an appointment that hasn't started yet makes no sense.
    complete: (live || status === "no_show") && !isFuture,
    // Only a confirmed booking can be a no-show (a request with a deposit is refunded instead).
    noShow: status === "confirmed" && !isFuture,
    revert: status === "completed" || status === "no_show",
    reschedule: !!startsAt && live,
    cancel: live,
    delete: status === "completed" || status === "cancelled" || status === "expired",
    remind: !!phone && !!startsAt && isFuture && live,
  };

  // A confirmed booking with a paid deposit, cancelled late: the owner chooses whether to refund.
  const [askDeposit, setAskDeposit] = useState(false);
  useEffect(() => {
    if (!cancelOpen || !business || status !== "confirmed" || !startsAt) {
      setAskDeposit(false);
      return;
    }
    void supabase
      .from("appointments")
      .select("deposit_status")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) =>
        setAskDeposit(
          data?.deposit_status === "paid" &&
            ownerCancelRefund(startsAt, new Date(), business.cancellation_hours) === "ask",
        ),
      );
  }, [cancelOpen, business, status, startsAt, id]);

  async function setStatus(next: ApptStatusValue, refundDeposit = true): Promise<boolean> {
    if (!business || busy) return false;
    setBusy(true);
    const result = await setAppointmentStatus({
      id,
      businessId: business.id,
      status: next,
      note: next === "cancelled" ? t("acts.note.cancelled") : t("acts.note.changed"),
      refundDeposit,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.message);
      return false;
    }
    // Confirming a pending booking already shows its own email outcome toast.
    if (!result.emailed) {
      toast.success(next === "cancelled" ? t("acts.toast.cancelled") : t("acts.toast.updated"));
    }
    void invalidateAppointmentData(qc);
    return true;
  }

  async function deleteAppointment() {
    if (!business || busy) return;
    setBusy(true);
    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", id)
      .eq("business_id", business.id);
    setBusy(false);
    if (error) {
      toast.error(t("acts.err.generic"));
      return;
    }
    setDeleteOpen(false);
    toast.success(t("acts.toast.deleted"));
    void invalidateAppointmentData(qc);
    onDone?.();
  }

  function openReschedule() {
    if (!startsAt) return;
    setNewDate(new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(startsAt)));
    setNewTime(formatTime(startsAt, tz));
    setRescheduleError(null);
    setRescheduleOpen(true);
  }

  async function saveReschedule() {
    if (!business || busy) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || !/^\d{2}:\d{2}$/.test(newTime)) {
      setRescheduleError(t("acts.err.dateTime"));
      return;
    }
    const start = zonedToUtc(newDate, timeToMinutes(newTime), tz);
    if (start.getTime() <= Date.now()) {
      setRescheduleError(t("acts.err.past"));
      return;
    }
    setBusy(true);
    setRescheduleError(null);
    // Keep the original span (service + buffer) at the new start.
    const { data: current } = await supabase
      .from("appointments")
      .select("starts_at, ends_at")
      .eq("id", id)
      .maybeSingle();
    const span = current?.ends_at
      ? new Date(current.ends_at).getTime() - new Date(current.starts_at).getTime()
      : 3_600_000;
    const { error } = await supabase
      .from("appointments")
      .update({
        starts_at: start.toISOString(),
        ends_at: new Date(start.getTime() + span).toISOString(),
      })
      .eq("id", id)
      .eq("business_id", business.id);
    if (error) {
      setBusy(false);
      // 23P01 = appointments_no_overlap: that professional is already booked.
      setRescheduleError(error.code === "23P01" ? t("acts.err.conflict") : t("acts.err.generic"));
      return;
    }
    await supabase.from("appointment_status_history").insert({
      appointment_id: id,
      business_id: business.id,
      status,
      note: t("acts.note.rescheduled"),
    });
    setBusy(false);
    setRescheduleOpen(false);
    toast.success(
      t("acts.toast.rescheduled").replace(
        "{when}",
        `${formatDateLong(start.toISOString(), tz)} · ${formatTime(start.toISOString(), tz)}`,
      ),
    );
    void invalidateAppointmentData(qc);
  }

  function remind() {
    if (!phone || !startsAt) return;
    const message = `${t("acts.remind.hello")}${customerName}${t("acts.remind.body1")}${
      serviceName ? `${t("acts.remind.of")}${serviceName}` : ""
    }${t("acts.remind.on")}${formatDateLong(startsAt, tz)}${t("acts.remind.at")}${formatTime(startsAt, tz)}${t("acts.remind.bye")}`;
    window.open(
      `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener",
    );
  }

  const dialogs = (
    <>
      <AlertDialog open={cancelOpen} onOpenChange={(o) => !busy && setCancelOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("acts.dialog.cancelTitle")}
              {customerName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {askDeposit ? t("dp.keepBody") : t("acts.dialog.cancelDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("acts.dialog.keep")}</AlertDialogCancel>
            {askDeposit ? (
              <AlertDialogAction
                disabled={busy}
                className="bg-muted text-foreground hover:bg-muted/80"
                onClick={(e) => {
                  e.preventDefault();
                  void setStatus("cancelled", false).then((ok) => ok && setCancelOpen(false));
                }}
              >
                {t("dp.keep")}
              </AlertDialogAction>
            ) : null}
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                // Stay open until the server answers, so failures are visible here.
                e.preventDefault();
                void setStatus("cancelled").then((ok) => ok && setCancelOpen(false));
              }}
            >
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              {askDeposit ? t("dp.refund") : t("acts.cancelAppt")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={(o) => !busy && setDeleteOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("acts.dialog.deleteTitle")}
              {customerName}?
            </AlertDialogTitle>
            <AlertDialogDescription>{t("acts.dialog.deleteDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("acts.dialog.keep")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void deleteAppointment();
              }}
            >
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              {t("acts.deleteAppt")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={rescheduleOpen} onOpenChange={(o) => !busy && setRescheduleOpen(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t("acts.dialog.rescheduleTitle")}
              {customerName}
            </DialogTitle>
            <DialogDescription>
              {startsAt
                ? t("acts.dialog.rescheduleDesc").replace(
                    "{when}",
                    `${formatDateLong(startsAt, tz)} · ${formatTime(startsAt, tz)}`,
                  )
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`rs-date-${id}`}>{t("cal.field.date")}</Label>
              <Input
                id={`rs-date-${id}`}
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`rs-time-${id}`}>{t("cal.field.time")}</Label>
              <Input
                id={`rs-time-${id}`}
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
              />
            </div>
          </div>
          <FormError message={rescheduleError} />
          <Button className="w-full" onClick={() => void saveReschedule()} disabled={busy}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t("acts.reschedule")}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );

  return {
    busy,
    can,
    setStatus,
    openCancel: () => setCancelOpen(true),
    openDelete: () => setDeleteOpen(true),
    openReschedule,
    remind,
    dialogs,
  };
}
