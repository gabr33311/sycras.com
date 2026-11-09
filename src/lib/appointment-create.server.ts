// Server-only: turns a checked public booking into an appointment (customer record, the
// appointment, its manage link, the business's alerts and the client's confirmation).
// Used straight away for a normal booking, and after the deposit is paid for one with a deposit.

export type PublicBookingRequest = {
  businessId: string;
  serviceId: string;
  staffId: string | null;
  startsAt: string;
  endsAt: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  whatsapp: boolean;
  /** Hashed IP of the client, for the security log. */
  ipHash: string;
};

export async function createAppointment(
  req: PublicBookingRequest,
  deposit?: { cents: number; paymentIntent: string },
): Promise<
  | { ok: true; token: string; status: "pending" | "confirmed"; appointmentId: string }
  | { ok: false; code: "slot_taken" }
> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { makeToken, logSecurityEvent } = await import("./booking.server");

  const { data: service } = await supabaseAdmin
    .from("services")
    .select("id, name, price_cents, requires_confirmation")
    .eq("id", req.serviceId)
    .eq("business_id", req.businessId)
    .maybeSingle();
  if (!service) return { ok: false, code: "slot_taken" };

  // Find or create the customer for this business only.
  let customerId: string | null = null;
  const { data: existing } = await supabaseAdmin
    .from("customers")
    .select("id")
    .eq("business_id", req.businessId)
    .eq("phone", req.phone)
    .maybeSingle();
  if (existing) {
    // Same phone = same person: keep one record and refresh name/email.
    customerId = existing.id;
    await supabaseAdmin
      .from("customers")
      .update({ name: req.name, email: req.email || null })
      .eq("id", existing.id);
  } else {
    const { data: created } = await supabaseAdmin
      .from("customers")
      .insert({
        business_id: req.businessId,
        name: req.name,
        phone: req.phone,
        email: req.email || null,
      })
      .select("id")
      .single();
    customerId = created?.id ?? null;
  }

  // Services that need approval arrive as requests; the others are confirmed at once.
  const status = service.requires_confirmation ? ("pending" as const) : ("confirmed" as const);
  const { data: appointment, error } = await supabaseAdmin
    .from("appointments")
    .insert({
      business_id: req.businessId,
      service_id: service.id,
      staff_id: req.staffId,
      customer_id: customerId,
      service_name: service.name,
      customer_name: req.name,
      customer_phone: req.phone,
      customer_email: req.email || null,
      starts_at: req.startsAt,
      ends_at: req.endsAt,
      price_cents: service.price_cents,
      status,
      notes: req.notes || null,
      source: "public",
      // The client ticked "WhatsApp": consent to get the confirmation and reminder there.
      whatsapp_ok: req.whatsapp === true,
      ...(deposit
        ? {
            deposit_cents: deposit.cents,
            deposit_status: "paid",
            deposit_payment_intent: deposit.paymentIntent,
          }
        : {}),
    })
    .select("id, starts_at, ends_at, status")
    .single();

  if (error || !appointment) return { ok: false, code: "slot_taken" };

  const token = makeToken();
  await supabaseAdmin.from("booking_tokens").insert({
    token,
    appointment_id: appointment.id,
    expires_at: new Date(new Date(appointment.ends_at).getTime() + 90 * 86400000).toISOString(),
  });

  const note = {
    business_id: req.businessId,
    type: "appointment_requested",
    title: appointment.status === "confirmed" ? "Nova marcação" : "Novo pedido de marcação",
    body: `${req.name} — ${service.name}`,
    appointment_id: appointment.id,
  };
  await supabaseAdmin.from("notifications").insert(note);
  // The business's phones get it as a push notification, and its people an email.
  const { alertBusiness } = await import("@/lib/owner-alerts.server");
  await alertBusiness(note.business_id, {
    title: note.title,
    body: note.body,
    appointmentId: note.appointment_id,
    kind: appointment.status === "confirmed" ? "booking" : "request",
  });

  await logSecurityEvent("booking_created", req.ipHash, req.phone, req.businessId);

  // Confirmed straight away: the client gets the confirmation email now.
  if (appointment.status === "confirmed" && req.email) {
    const { sendConfirmedEmail } = await import("@/lib/confirmation-email.server");
    await sendConfirmedEmail(appointment.id);
  }
  // And on WhatsApp, when they asked for it and the business has it (Pro).
  if (appointment.status === "confirmed" && req.whatsapp) {
    const { sendWhatsApp } = await import("@/lib/whatsapp.server");
    await sendWhatsApp(appointment.id, "confirmed").catch(() => false);
  }

  return {
    ok: true,
    token,
    status: appointment.status as "pending" | "confirmed",
    appointmentId: appointment.id,
  };
}

/** The manage token of the appointment paid with this deposit, if it already exists. */
export async function tokenForPayment(paymentIntent: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: appt } = await supabaseAdmin
    .from("appointments")
    .select("id")
    .eq("deposit_payment_intent", paymentIntent)
    .maybeSingle();
  if (!appt) return null;
  const { data: row } = await supabaseAdmin
    .from("booking_tokens")
    .select("token")
    .eq("appointment_id", appt.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return row?.token ?? null;
}
