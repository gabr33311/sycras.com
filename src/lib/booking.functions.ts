import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { canonicalPhone } from "./phone";

const slugSchema = z.object({ slug: z.string().trim().min(1).max(64) });

const slotsSchema = z.object({
  businessId: z.string().uuid(),
  serviceId: z.string().uuid(),
  staffId: z.string().uuid().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const bookingSchema = z.object({
  businessId: z.string().uuid(),
  serviceId: z.string().uuid(),
  staffId: z.string().uuid().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  name: z.string().trim().min(2).max(80),
  phone: z
    .string()
    .trim()
    .min(6)
    .max(24)
    .regex(/^[0-9+\s()-]+$/)
    .transform(canonicalPhone),
  email: z.string().trim().email().max(160),
  notes: z.string().trim().max(500).optional().default(""),
  /** The 6-digit code emailed to the client, when the business asks for it. */
  code: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  /** The client agrees to get the confirmation and reminder on WhatsApp. */
  whatsapp: z.boolean().optional(),
  /** Cloudflare Turnstile token (a person, not a script), when the captcha is on. */
  captchaToken: z.string().max(4096).optional(),
});

const tokenSchema = z.object({ token: z.string().trim().length(48) });

function clientIp(): string {
  try {
    return (
      getRequestHeader("cf-connecting-ip") ??
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
      getRequest().headers.get("x-real-ip") ??
      "unknown"
    );
  } catch {
    return "unknown";
  }
}

export const getPublicBusiness = createServerFn({ method: "GET" })
  .validator((d: unknown) => slugSchema.parse(d))
  .handler(async ({ data }) => {
    const { loadPublicBusiness } = await import("./booking.server");
    return await loadPublicBusiness(data.slug);
  });

/** Whether a missing page is only paused by its owner (not gone). */
export const isPagePaused = createServerFn({ method: "GET" })
  .validator((d: unknown) => slugSchema.parse(d))
  .handler(async ({ data }) => {
    const { pageIsPaused } = await import("./booking.server");
    return await pageIsPaused(data.slug.toLowerCase());
  });

export const checkSlugAvailable = createServerFn({ method: "GET" })
  .validator((d: unknown) => slugSchema.parse(d))
  .handler(async ({ data }) => {
    const clean = data.slug.toLowerCase();
    if (!/^[a-z0-9-]{3,48}$/.test(clean)) return { available: false, invalid: true };
    const { slugTaken } = await import("./booking.server");
    return { available: !(await slugTaken(clean)), invalid: false };
  });

/** Server-side account existence check (the DB helper is no longer client-callable). */
export const emailHasAccount = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ email: z.string().trim().email().max(160) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hashIp, logSecurityEvent } = await import("./booking.server");
    // Only 10 checks per network every 15 minutes: nobody can list who has an account.
    const ipHash = await hashIp(clientIp());
    const { count } = await supabaseAdmin
      .from("security_events")
      .select("id", { count: "exact", head: true })
      .eq("kind", "email_check")
      .eq("ip_hash", ipHash)
      .gte("created_at", new Date(Date.now() - 15 * 60000).toISOString());
    if ((count ?? 0) >= 10) return { known: false as const, registered: false };
    await logSecurityEvent("email_check", ipHash, null, null);
    const { data: exists, error } = await supabaseAdmin.rpc("email_has_account", {
      _email: data.email,
    });
    if (error) return { known: false as const, registered: false };
    return { known: true as const, registered: !!exists };
  });

export const getAvailableSlots = createServerFn({ method: "GET" })
  .validator((d: unknown) => slotsSchema.parse(d))
  .handler(async ({ data }) => {
    const { computeSlots } = await import("./booking.server");
    const slots = await computeSlots(data);
    return slots.map((s) => ({ time: s.time }));
  });

export const createPublicBooking = createServerFn({ method: "POST" })
  .validator((d: unknown) => bookingSchema.parse(d))
  .handler(async ({ data }) => {
    const {
      computeSlots,
      makeToken,
      hashIp,
      rateLimitExceeded,
      logSecurityEvent,
      issueBookingCode,
      checkBookingCode,
      captchaPassed,
    } = await import("./booking.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const ipHash = await hashIp(clientIp());

    // A person, not a script. The step with the emailed code is proven by the code itself.
    if (!data.code && !(await captchaPassed(data.captchaToken, clientIp()))) {
      await logSecurityEvent("booking_captcha_failed", ipHash, data.phone, data.businessId);
      return {
        ok: false as const,
        code: "captcha",
        message: "Confirma que não és um robô e tenta outra vez.",
      };
    }

    if (await rateLimitExceeded(ipHash, data.phone)) {
      await logSecurityEvent("booking_rate_limited", ipHash, data.phone, data.businessId);
      return {
        ok: false as const,
        code: "rate_limited",
        message: "Demasiadas marcações num curto espaço de tempo. Tenta novamente mais tarde.",
      };
    }

    // A business whose plan is locked takes no online bookings.
    const { data: owner } = await supabaseAdmin
      .from("businesses")
      .select("created_at, name, verify_bookings, suspended_at, is_demo")
      .eq("id", data.businessId)
      .maybeSingle();
    const { businessAllowed } = await import("@/lib/billing.server");
    if (
      !owner ||
      owner.suspended_at ||
      !(await businessAllowed(data.businessId, owner.created_at))
    ) {
      return {
        ok: false as const,
        code: "unavailable",
        message: "Este negócio não está a aceitar marcações online de momento.",
      };
    }

    // The example page: everything works up to here, but nothing is saved.
    if (owner.is_demo) {
      return {
        ok: false as const,
        code: "demo",
        message:
          "Esta é uma página de exemplo: as marcações não são guardadas. Cria a tua página para receber marcações reais.",
      };
    }

    // Re-validate the slot server-side; never trust the browser.
    const slots = await computeSlots({
      businessId: data.businessId,
      serviceId: data.serviceId,
      staffId: data.staffId,
      date: data.date,
    });
    const slot = slots.find((s) => s.time === data.time);
    if (!slot) {
      return {
        ok: false as const,
        code: "slot_taken",
        message: "Este horário acabou de ser reservado. Escolhe outro horário.",
      };
    }

    const { data: service } = await supabaseAdmin
      .from("services")
      .select("id, name, price_cents, requires_confirmation")
      .eq("id", data.serviceId)
      .eq("business_id", data.businessId)
      .maybeSingle();
    if (!service) return { ok: false as const, code: "invalid", message: "Serviço indisponível." };

    // Blocked by the business: by phone or by email (another number does not get round it).
    const { data: blockedRows } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("business_id", data.businessId)
      .eq("is_blocked", true)
      // ilike = same email whatever the capitals; % _ \ are escaped so they match literally.
      .or(
        `phone.eq."${data.phone}",email.ilike."${data.email.replace(/[\\%_"]/g, (m) => "\\" + m)}"`,
      )
      .limit(1);
    if (blockedRows?.length) {
      await logSecurityEvent("blocked_customer", ipHash, data.phone, data.businessId);
      return {
        ok: false as const,
        code: "blocked",
        message: "Não foi possível concluir a marcação. Contacta directamente o negócio.",
      };
    }

    // The business asks for a code from new clients: email it first, book once the client
    // types it. Someone who already had a confirmed or finished visit here books straight away.
    let known = false;
    if (owner.verify_bookings && data.email) {
      const { data: seen } = await supabaseAdmin
        .from("appointments")
        .select("id")
        .eq("business_id", data.businessId)
        .in("status", ["confirmed", "completed"])
        .ilike(
          "customer_email",
          data.email.replace(/[\\%_]/g, (m) => "\\" + m),
        )
        .limit(1);
      known = !!seen?.length;
    }
    if (owner.verify_bookings && !known) {
      if (!data.code) {
        const sent = await issueBookingCode(data.businessId, owner.name, data.email);
        if (!sent) {
          return {
            ok: false as const,
            code: "code_failed",
            message: "Não foi possível enviar o código. Confirma o email e tenta novamente.",
          };
        }
        return {
          ok: false as const,
          code: "needs_code",
          message: `Enviámos um código para ${data.email}.`,
        };
      }
      const check = await checkBookingCode(data.businessId, data.email, data.code);
      if (check !== "ok") {
        await logSecurityEvent("booking_code_failed", ipHash, data.phone, data.businessId);
        return {
          ok: false as const,
          code: check === "wrong" ? "bad_code" : "code_expired",
          message:
            check === "wrong"
              ? "Código errado. Verifica o email e tenta novamente."
              : "O código expirou. Pede um novo.",
        };
      }
    }

    const request = {
      businessId: data.businessId,
      serviceId: service.id,
      staffId: slot.staffId,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      name: data.name,
      phone: data.phone,
      email: data.email,
      notes: data.notes ?? "",
      whatsapp: data.whatsapp === true,
      ipHash,
    };

    // A deposit (sinal) when the business asks for one: the time is kept while the client
    // pays on Stripe, and the booking is made once the payment is confirmed.
    const { data: pay } = await supabaseAdmin
      .from("businesses")
      .select(
        "slug, deposit_enabled, deposit_mode, deposit_value, stripe_account_id, stripe_charges_enabled",
      )
      .eq("id", data.businessId)
      .maybeSingle();
    if (pay?.deposit_enabled && pay.stripe_account_id) {
      const { businessHasPro } = await import("@/lib/billing.server");
      const { depositFor } = await import("@/lib/deposit");
      const cents = depositFor(
        {
          pro: await businessHasPro(data.businessId, owner.created_at),
          enabled: true,
          chargesEnabled: pay.stripe_charges_enabled,
          mode: pay.deposit_mode === "percent" ? "percent" : "fixed",
          value: pay.deposit_value,
        },
        service.price_cents,
      );
      if (cents > 0) {
        const { startDepositCheckout } = await import("@/lib/deposit.server");
        const started = await startDepositCheckout(request, {
          slug: pay.slug,
          origin: new URL(getRequest().url).origin,
          serviceName: service.name,
          depositCents: cents,
          stripeAccount: pay.stripe_account_id,
        });
        if (started.ok)
          return { ok: false as const, code: "needs_payment", url: started.url, message: "" };
        if (started.code === "slot_taken") {
          return {
            ok: false as const,
            code: "slot_taken",
            message: "Este horário acabou de ser reservado. Escolhe outro horário.",
          };
        }
        return {
          ok: false as const,
          code: "payment_error",
          message: "Não foi possível abrir o pagamento do sinal. Tenta novamente.",
        };
      }
    }

    const { createAppointment } = await import("@/lib/appointment-create.server");
    const created = await createAppointment(request);
    if (!created.ok) {
      return {
        ok: false as const,
        code: "slot_taken",
        message: "Este horário acabou de ser reservado. Escolhe outro horário.",
      };
    }
    return { ok: true as const, token: created.token, status: created.status };
  });

export const getBookingByToken = createServerFn({ method: "GET" })
  .validator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("booking_tokens")
      .select("appointment_id, expires_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!row) return null;
    if (row.expires_at && new Date(row.expires_at) < new Date()) return null;

    const { data: appt } = await supabaseAdmin
      .from("appointments")
      .select(
        "id, service_name, customer_name, starts_at, ends_at, price_cents, status, staff_id, business_id, service_id",
      )
      .eq("id", row.appointment_id)
      .maybeSingle();
    if (!appt) return null;

    const [{ data: business }, { data: staff }, { data: hours }] = await Promise.all([
      supabaseAdmin
        .from("businesses")
        .select(
          "name, slug, address, city, phone, timezone, cancellation_hours, brand_color, logo_url, booking_horizon_months, latitude, longitude",
        )
        .eq("id", appt.business_id)
        .maybeSingle(),
      appt.staff_id
        ? supabaseAdmin.from("staff").select("name").eq("id", appt.staff_id).maybeSingle()
        : Promise.resolve({ data: null }),
      // Weekdays with opening hours, so the reschedule picker can grey out closed days.
      supabaseAdmin.from("working_hours").select("weekday").eq("business_id", appt.business_id),
    ]);

    return {
      openWeekdays: [...new Set((hours ?? []).map((h) => h.weekday as number))],
      appointment: {
        id: appt.id,
        service_name: appt.service_name,
        customer_name: appt.customer_name,
        starts_at: appt.starts_at,
        ends_at: appt.ends_at,
        price_cents: appt.price_cents,
        status: appt.status,
        service_id: appt.service_id,
        business_id: appt.business_id,
        staff_id: appt.staff_id,
      },
      staffName: staff?.name ?? null,
      business,
    };
  });

export const cancelBookingByToken = createServerFn({ method: "POST" })
  .validator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const found = await apptFromToken(data.token);
    if (!found) return { ok: false as const, message: "Marcação não encontrada." };

    const { data: appt } = await supabaseAdmin
      .from("appointments")
      .select("id, starts_at, business_id, status, customer_name, service_name")
      .eq("id", found.id)
      .maybeSingle();
    if (!appt) return { ok: false as const, message: "Marcação não encontrada." };
    if (appt.status === "cancelled") return { ok: true as const };
    if (appt.status !== "pending" && appt.status !== "confirmed")
      return { ok: false as const, message: "Esta marcação já não pode ser alterada." };

    const { data: business } = await supabaseAdmin
      .from("businesses")
      .select("cancellation_hours")
      .eq("id", appt.business_id)
      .maybeSingle();
    const limit = (business?.cancellation_hours ?? 24) * 3600000;
    if (new Date(appt.starts_at).getTime() - Date.now() < limit) {
      return {
        ok: false as const,
        message: `O cancelamento online só é possível até ${business?.cancellation_hours ?? 24}h antes. Contacta o negócio.`,
      };
    }

    await supabaseAdmin.from("appointments").update({ status: "cancelled" }).eq("id", appt.id);
    await supabaseAdmin.from("appointment_status_history").insert({
      appointment_id: appt.id,
      business_id: appt.business_id,
      status: "cancelled",
      note: "Cancelada pelo cliente",
    });
    const note = {
      business_id: appt.business_id,
      type: "appointment_cancelled",
      title: "Marcação cancelada",
      body: `${appt.customer_name} — ${appt.service_name}`,
      appointment_id: appt.id,
    };
    await supabaseAdmin.from("notifications").insert(note);
    // The business's phones get it as a push notification, and its people an email.
    const { alertBusiness } = await import("@/lib/owner-alerts.server");
    await alertBusiness(note.business_id, {
      title: note.title,
      body: note.body,
      appointmentId: note.appointment_id,
      kind: "cancelled",
    });
    // Cancelled in time: a paid deposit goes back to the client.
    const { refundDeposit } = await import("@/lib/deposit.server");
    const refund = await refundDeposit(appt.id).catch((e: unknown) => {
      console.error("[deposit] refund on client cancel failed", e);
      return { refunded: false, cents: 0 };
    });
    return { ok: true as const, refundedCents: refund.refunded ? refund.cents : 0 };
  });

/** Loads the appointment behind a still-valid manage token (null when missing/expired). */
async function apptFromToken(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin
    .from("booking_tokens")
    .select("appointment_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
  const { data: appt } = await supabaseAdmin
    .from("appointments")
    .select("id, business_id, service_id, staff_id, status, starts_at, ends_at")
    .eq("id", row.appointment_id)
    .maybeSingle();
  return appt;
}

const rescheduleSlotsSchema = tokenSchema.extend({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Free times for rescheduling: the appointment's own slot doesn't count as busy. */
export const getRescheduleSlots = createServerFn({ method: "GET" })
  .validator((d: unknown) => rescheduleSlotsSchema.parse(d))
  .handler(async ({ data }) => {
    const appt = await apptFromToken(data.token);
    if (!appt || !appt.service_id) return [];
    const { computeSlots } = await import("./booking.server");
    const slots = await computeSlots({
      businessId: appt.business_id,
      serviceId: appt.service_id,
      staffId: appt.staff_id,
      date: data.date,
      ignore: { staffId: appt.staff_id, startsAt: appt.starts_at, endsAt: appt.ends_at },
    });
    return slots.map((s) => ({ time: s.time }));
  });

export const rescheduleBookingByToken = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    tokenSchema
      .extend({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        time: z.string().regex(/^\d{2}:\d{2}$/),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { computeSlots } = await import("./booking.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const appt = await apptFromToken(data.token);
    if (!appt || !appt.service_id)
      return { ok: false as const, message: "Marcação não encontrada." };
    if (appt.status === "cancelled")
      return { ok: false as const, message: "Esta marcação está cancelada." };
    if (appt.status !== "pending" && appt.status !== "confirmed")
      return { ok: false as const, message: "Esta marcação já não pode ser alterada." };

    // Same notice period as online cancellation.
    const { data: business } = await supabaseAdmin
      .from("businesses")
      .select("cancellation_hours")
      .eq("id", appt.business_id)
      .maybeSingle();
    const hours = business?.cancellation_hours ?? 24;
    if (new Date(appt.starts_at).getTime() - Date.now() < hours * 3600000) {
      return {
        ok: false as const,
        message: `O reagendamento online só é possível até ${hours}h antes. Contacta o negócio.`,
      };
    }

    const slots = await computeSlots({
      businessId: appt.business_id,
      serviceId: appt.service_id,
      staffId: appt.staff_id,
      date: data.date,
      ignore: { staffId: appt.staff_id, startsAt: appt.starts_at, endsAt: appt.ends_at },
    });
    const slot = slots.find((s) => s.time === data.time);
    if (!slot)
      return {
        ok: false as const,
        message: "Este horário acabou de ser reservado. Escolhe outro horário.",
      };

    const { error } = await supabaseAdmin
      .from("appointments")
      .update({ starts_at: slot.startsAt, ends_at: slot.endsAt, staff_id: slot.staffId })
      .eq("id", appt.id);
    if (error)
      return {
        ok: false as const,
        message: "Este horário acabou de ser reservado. Escolhe outro horário.",
      };

    const note = {
      business_id: appt.business_id,
      type: "appointment_rescheduled",
      title: "Marcação reagendada",
      body: `Nova data: ${data.date} às ${data.time}`,
      appointment_id: appt.id,
    };
    await supabaseAdmin.from("notifications").insert(note);
    // The business's phones get it as a push notification, and its people an email.
    const { alertBusiness } = await import("@/lib/owner-alerts.server");
    await alertBusiness(note.business_id, {
      title: note.title,
      body: note.body,
      appointmentId: note.appointment_id,
      kind: "rescheduled",
    });
    return { ok: true as const };
  });

/** The client backed out of the deposit payment: free their time and go back to the page. */
export const releaseDepositHold = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ holdId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { releaseHold } = await import("@/lib/deposit.server");
    try {
      return await releaseHold(data.holdId);
    } catch (e) {
      console.error("[deposit] release failed", e);
      return { slug: null };
    }
  });

/** Back from Stripe after paying the deposit: make (or find) the booking. */
export const finalizeDepositBooking = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ holdId: z.string().uuid(), sessionId: z.string().trim().min(8).max(255) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { finalizeDeposit } = await import("@/lib/deposit.server");
    try {
      return await finalizeDeposit(data.holdId, data.sessionId);
    } catch (e) {
      console.error("[deposit] finalize failed", e);
      return { ok: false as const, code: "not_paid" as const };
    }
  });
