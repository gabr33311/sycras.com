import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  sendAppointmentCancelledEmail,
  sendAppointmentConfirmedEmail,
} from "@/lib/confirmation-email.functions";
import { haptic } from "@/lib/native";

export type ApptStatus =
  "confirmed" | "completed" | "cancelled" | "no_show" | "pending" | "expired";

/** Every cached view built from appointments; refreshed together so no screen goes stale. */
const APPOINTMENT_QUERY_KEYS = [
  "appointments",
  "calendar",
  "requests",
  "pending-capsule",
  "dashboard-day",
  "dashboard-requests",
  "customers",
  "customers-cancelled",
  "customer-history",
  "vacation-conflicts",
  "analytics",
  "today",
  "appointment-sheet",
  "customer-card",
] as const;

export function invalidateAppointmentData(qc: QueryClient) {
  return Promise.all(
    APPOINTMENT_QUERY_KEYS.map((key) => qc.invalidateQueries({ queryKey: [key] })),
  );
}

/** True when a professional/service still has pending or confirmed appointments ahead. */
export async function hasUpcomingAppointments(
  column: "staff_id" | "service_id",
  id: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq(column, id)
    .in("status", ["pending", "confirmed"])
    .gte("ends_at", new Date().toISOString());
  // When unsure, err on the side of keeping the data.
  return !!error || (count ?? 0) > 0;
}

/**
 * Updates an appointment status directly through the Data API (RLS restricts
 * this to business members) and records the change in the status history.
 * Confirming a pending appointment emails the client and shows the outcome.
 */
export async function setAppointmentStatus(input: {
  id: string;
  businessId: string;
  status: ApptStatus;
  note?: string;
  /** False when the owner keeps a paid deposit (late cancel). Requests not accepted always refund. */
  refundDeposit?: boolean;
}): Promise<{ ok: true; emailed?: boolean } | { ok: false; message: string }> {
  let wasPending = false;
  if (input.status === "confirmed" || input.status === "cancelled") {
    const { data } = await supabase
      .from("appointments")
      .select("status")
      .eq("id", input.id)
      .maybeSingle();
    wasPending = data?.status === "pending";
  }

  const { error } = await supabase
    .from("appointments")
    .update({ status: input.status })
    .eq("id", input.id)
    .eq("business_id", input.businessId);

  if (error) {
    // 23P01 = appointments_no_overlap: that professional is already booked at this time.
    if (error.code === "23P01")
      return { ok: false, message: "Este horário já está ocupado por outra marcação." };
    return { ok: false, message: error.message };
  }

  // A light confirmation on the phone (native app only).
  void haptic(input.status === "cancelled" || input.status === "no_show" ? "warning" : "success");

  await supabase.from("appointment_status_history").insert({
    appointment_id: input.id,
    business_id: input.businessId,
    status: input.status,
    note: input.note ?? null,
  });

  // Cancelled by the business (or a request not accepted): the client must know.
  if (input.status === "cancelled") {
    try {
      const res = await sendAppointmentCancelledEmail({
        data: {
          appointmentId: input.id,
          declined: wasPending,
          refund: wasPending || input.refundDeposit !== false,
        },
      });
      if (res.status === "sent") toast.success("Cancelada. O cliente recebeu um email.");
      else if (res.status === "no_email") toast.success("Marcação cancelada.");
      else toast.error("A marcação foi cancelada, mas o email ao cliente não foi enviado.");
    } catch {
      toast.error("A marcação foi cancelada, mas o email ao cliente não foi enviado.");
    }
    return { ok: true, emailed: true };
  }

  if (wasPending && input.status === "confirmed") {
    try {
      const res = await sendAppointmentConfirmedEmail({ data: { appointmentId: input.id } });
      if (res.status === "sent") toast.success("Marcação confirmada e email enviado!");
      else if (res.status === "no_email") toast.success("Marcação confirmada.");
      else
        toast.error("A marcação foi confirmada, mas houve um erro ao enviar o email ao cliente.");
    } catch {
      toast.error("A marcação foi confirmada, mas houve um erro ao enviar o email ao cliente.");
    }
    return { ok: true, emailed: true };
  }

  return { ok: true };
}
