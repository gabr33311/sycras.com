import {
  addMonthsClamped,
  zonedToUtc,
  weekdayOf,
  minutesToTime,
  timeToMinutes,
  todayIn,
} from "./time";
import { directionsUrl } from "./map-tiles";

export type PublicBusiness = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  business_type: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  logo_url: string | null;
  cover_url: string | null;
  /** Photos of the shop (signed URLs). */
  gallery: string[];
  brand_color: string;
  timezone: string;
  currency: string;
  cancellation_hours: number;
  slot_interval_minutes: number;
  seo_indexable: boolean;
  show_team: boolean;
  show_contacts: boolean;
  booking_horizon_months: number;
  latitude: number | null;
  longitude: number | null;
  /** The owner can hide the map link. */
  show_map: boolean;
  /** Clients confirm their email with a code before the booking is made. */
  verify_bookings: boolean;
  /** The example page from the homepage: bookings are never saved. */
  is_demo: boolean;
  /** The shop's map card (OpenStreetMap), when the owner shows the map and placed the pin. */
  map: { lat: number; lng: number; directions: string; label: string } | null;
};

/** Where the shop is on the map, and the route there (no map service key needed). */
function shopMap(b: {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  city: string | null;
  show_map: boolean;
}): PublicBusiness["map"] {
  if (b.show_map === false || b.latitude == null || b.longitude == null) return null;
  const place = [b.address, b.city].filter(Boolean).join(", ");
  return {
    lat: b.latitude,
    lng: b.longitude,
    directions: directionsUrl(b.latitude, b.longitude),
    label: place || `${b.latitude.toFixed(5)}, ${b.longitude.toFixed(5)}`,
  };
}

export type PublicService = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  duration_minutes: number;
  buffer_minutes: number;
  category: string | null;
  image_url: string | null;
  requires_confirmation: boolean;
};

export type PublicStaff = {
  id: string;
  name: string;
  specialty: string | null;
  photo_url: string | null;
  service_ids: string[];
};

const BUSINESS_FIELDS =
  "id, slug, name, description, business_type, address, city, phone, email, website, instagram, logo_url, cover_url, brand_color, timezone, currency, cancellation_hours, slot_interval_minutes, seo_indexable, show_team, show_contacts, booking_horizon_months, latitude, longitude, show_map, verify_bookings, is_demo";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Public read client (anon key + RLS). Works on any host with only the public env vars. */
async function publicDb() {
  const { createClient } = await import("@supabase/supabase-js");
  const url =
    process.env["SUPABASE_URL"] ||
    process.env["VITE_SUPABASE_URL"] ||
    import.meta.env["VITE_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["SUPABASE_ANON_KEY"] ||
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["VITE_SUPABASE_ANON_KEY"] ||
    import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    import.meta.env["VITE_SUPABASE_ANON_KEY"];
  if (!url || !key) throw new Error("Missing Supabase URL/key for public reads");
  const opaque = String(key).startsWith("sb_");
  return createClient<import("@/integrations/supabase/types").Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (opaque && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export async function loadPublicBusiness(slug: string): Promise<{
  business: PublicBusiness;
  services: PublicService[];
  staff: PublicStaff[];
  openWeekdays: number[];
  blocks: { from: string; to: string }[];
  /** False when the business's plan is locked (trial over, no subscription). */
  bookable: boolean;
} | null> {
  // Service key may be absent on external hosts (e.g. Vercel) — fall back to anon + RLS.
  const db: Awaited<ReturnType<typeof publicDb>> = process.env["SUPABASE_SERVICE_ROLE_KEY"]
    ? ((await admin()) as unknown as typeof db)
    : await publicDb();
  const { data: business } = await db
    .from("businesses")
    .select(BUSINESS_FIELDS)
    .eq("slug", slug)
    .eq("is_published", true)
    .is("deleted_at", null)
    // A suspended account has no public page.
    .is("suspended_at", null)
    .maybeSingle();
  if (!business) return null;

  const [{ data: services }, { data: staff }, { data: links }] = await Promise.all([
    db
      .from("services")
      .select(
        "id, name, description, price_cents, duration_minutes, buffer_minutes, category, image_url, requires_confirmation",
      )
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("sort_order")
      .order("created_at"),
    db
      .from("staff")
      .select("id, name, specialty, photo_url")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("sort_order")
      .order("created_at"),
    db.from("staff_services").select("staff_id, service_id").eq("business_id", business.id),
  ]);

  // Read on its own and never fatal: the page still works on a database without the column.
  const { data: photos } = await db
    .from("businesses")
    .select("gallery")
    .eq("id", business.id)
    .maybeSingle();
  const [logo_url, cover_url, gallery] = await Promise.all([
    signedImage(business.logo_url),
    signedImage(business.cover_url),
    Promise.all(
      ((photos as { gallery?: string[] } | null)?.gallery ?? []).slice(0, 12).map(signedImage),
    ),
  ]);

  // Calendar availability: open weekdays + business-wide blocks (vacations).
  const horizonEnd = new Date(
    Date.now() + ((business.booking_horizon_months ?? 2) + 1) * 31 * 86400000,
  );
  const [{ data: hours }, { data: busyRows }] = await Promise.all([
    db.from("working_hours").select("weekday").eq("business_id", business.id),
    db.rpc("public_busy_intervals", {
      _business_id: business.id,
      _from: new Date().toISOString(),
      _to: horizonEnd.toISOString(),
    }),
  ]);
  const openWeekdays = [...new Set((hours ?? []).map((h) => h.weekday as number))];
  // Single-professional businesses: that person's time off closes the whole day too.
  const singleStaff = (staff ?? []).length <= 1;
  const blocks = (busyRows ?? [])
    .filter((b) => b.kind === "block" && (b.staff_id === null || singleStaff))
    .map((b) => ({ from: b.starts_at as string, to: b.ends_at as string }));

  // Contacts only leave the server when the owner enables "show contacts".
  const showContacts = business.show_contacts === true;
  const { data: created } = await db
    .from("businesses")
    .select("created_at")
    .eq("id", business.id)
    .maybeSingle();
  const { businessAllowed } = await import("@/lib/billing.server");
  const bookable = created ? await businessAllowed(business.id, created.created_at) : true;

  return {
    business: {
      ...business,
      logo_url,
      cover_url,
      gallery: gallery.filter((u): u is string => !!u),
      map: shopMap(business),
      phone: showContacts ? business.phone : null,
      email: showContacts ? business.email : null,
    } as PublicBusiness,
    services: (services ?? []) as PublicService[],
    staff: (staff ?? []).map((s) => ({
      ...s,
      service_ids: (links ?? []).filter((l) => l.staff_id === s.id).map((l) => l.service_id),
    })),
    openWeekdays,
    blocks,
    bookable,
  };
}

/** Storage paths are private; hand the browser a short-lived signed URL. */
async function signedImage(path: string | null): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  if (!process.env["SUPABASE_SERVICE_ROLE_KEY"]) return null;
  const db = await admin();
  const { data } = await db.storage.from("business-logos").createSignedUrl(path, 60 * 60 * 12);
  return data?.signedUrl ?? null;
}

export type SlotOption = { time: string; staffId: string; startsAt: string; endsAt: string };

/**
 * Server-side availability. Never trust slots supplied by the browser.
 */
export async function computeSlots(params: {
  businessId: string;
  serviceId: string;
  staffId: string | null;
  date: string;
  /** Interval of the appointment being rescheduled, so it doesn't clash with itself. */
  ignore?: { staffId: string | null; startsAt: string; endsAt: string };
}): Promise<SlotOption[]> {
  // Service key may be absent on external hosts (e.g. Vercel) — fall back to anon + RLS.
  type Db = Awaited<ReturnType<typeof publicDb>>;
  const db: Db = process.env["SUPABASE_SERVICE_ROLE_KEY"]
    ? ((await admin()) as unknown as Db)
    : await publicDb();
  const { data: business } = await db
    .from("businesses")
    .select(
      "id, timezone, slot_interval_minutes, is_published, deleted_at, booking_horizon_months, created_at, min_notice_minutes, suspended_at",
    )
    .eq("id", params.businessId)
    .maybeSingle();
  if (!business || !business.is_published || business.deleted_at || business.suspended_at)
    return [];
  // Trial over and no subscription: no online bookings until the owner subscribes.
  const { businessAllowed } = await import("@/lib/billing.server");
  if (!(await businessAllowed(business.id, business.created_at))) return [];

  const { data: service } = await db
    .from("services")
    .select("id, duration_minutes, buffer_minutes, is_active")
    .eq("id", params.serviceId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!service || !service.is_active) return [];

  const tz = business.timezone;
  const today = todayIn(tz);
  if (params.date < today) return [];
  if (params.date > addMonthsClamped(today, business.booking_horizon_months ?? 2)) return [];

  const { data: allStaff } = await db
    .from("staff")
    .select("id")
    .eq("business_id", business.id)
    .eq("is_active", true);
  const { data: links } = await db
    .from("staff_services")
    .select("staff_id")
    .eq("business_id", business.id)
    .eq("service_id", service.id);

  const linkedIds = (links ?? []).map((l) => l.staff_id);
  let staffIds = (allStaff ?? []).map((s) => s.id);
  if (linkedIds.length > 0) staffIds = staffIds.filter((id) => linkedIds.includes(id));
  if (params.staffId) staffIds = staffIds.filter((id) => id === params.staffId);
  if (staffIds.length === 0) return [];

  const weekday = weekdayOf(params.date);
  const { data: hours } = await db
    .from("working_hours")
    .select("staff_id, start_time, end_time")
    .eq("business_id", business.id)
    .eq("weekday", weekday);

  const dayStart = zonedToUtc(params.date, 0, tz);
  const dayEnd = zonedToUtc(params.date, 24 * 60, tz);

  // Privacy-safe RPC: only occupied intervals, no names/reasons.
  let busyRows: { staff_id: string | null; starts_at: string; ends_at: string }[] = [];
  const { data: rpcRows, error: busyErr } = await db.rpc("public_busy_intervals", {
    _business_id: business.id,
    _from: dayStart.toISOString(),
    _to: dayEnd.toISOString(),
  });
  if (!busyErr) {
    busyRows = (rpcRows ?? []) as typeof busyRows;
  } else {
    // Fallback when the function isn't deployed on this database: read only times, never identities.
    console.warn("public_busy_intervals unavailable, using fallback:", busyErr.message);
    const [{ data: appts }, { data: blocks }] = await Promise.all([
      db
        .from("appointments")
        .select("staff_id, starts_at, ends_at")
        .eq("business_id", business.id)
        .in("status", ["pending", "confirmed"])
        .lt("starts_at", dayEnd.toISOString())
        .gt("ends_at", dayStart.toISOString()),
      db
        .from("blocked_times")
        .select("staff_id, starts_at, ends_at")
        .eq("business_id", business.id)
        .lt("starts_at", dayEnd.toISOString())
        .gt("ends_at", dayStart.toISOString()),
    ]);
    busyRows = [...(appts ?? []), ...(blocks ?? [])] as typeof busyRows;
  }

  if (params.ignore) {
    const ig = params.ignore;
    const igFrom = new Date(ig.startsAt).getTime();
    const igTo = new Date(ig.endsAt).getTime();
    const idx = busyRows.findIndex(
      (b) =>
        b.staff_id === ig.staffId &&
        new Date(b.starts_at).getTime() === igFrom &&
        new Date(b.ends_at).getTime() === igTo,
    );
    if (idx >= 0) busyRows = busyRows.filter((_, i) => i !== idx);
  }

  const busy = busyRows.map((b) => ({
    staffId: b.staff_id as string | null,
    from: new Date(b.starts_at).getTime(),
    to: new Date(b.ends_at).getTime(),
  }));

  const step = Math.max(5, business.slot_interval_minutes || 15);
  const total = service.duration_minutes + service.buffer_minutes;
  const now = Date.now();
  // Minimum notice chosen by the owner (how long before a slot it can still be booked).
  const leadMs = (business.min_notice_minutes ?? 30) * 60 * 1000;

  const found = new Map<string, SlotOption>();

  for (const staffId of staffIds) {
    const windows = (hours ?? []).filter((h) => h.staff_id === staffId || h.staff_id === null);
    for (const w of windows) {
      const from = timeToMinutes(w.start_time as unknown as string);
      const to = timeToMinutes(w.end_time as unknown as string);
      for (let m = from; m + total <= to; m += step) {
        const startsAt = zonedToUtc(params.date, m, tz);
        const endsAt = new Date(startsAt.getTime() + total * 60000);
        if (startsAt.getTime() < now + leadMs) continue;
        const clash = busy.some(
          (b) =>
            (b.staffId === null || b.staffId === staffId) &&
            startsAt.getTime() < b.to &&
            endsAt.getTime() > b.from,
        );
        if (clash) continue;
        const label = minutesToTime(m);
        if (!found.has(label)) {
          found.set(label, {
            time: label,
            staffId,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
          });
        }
      }
    }
  }

  return [...found.values()].sort((a, b) => a.time.localeCompare(b.time));
}

export function makeToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`marca:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

/** Simple abuse guard: too many bookings from one IP or phone in a short window. */
export async function rateLimitExceeded(ipHash: string, phone: string | null) {
  const db = await admin();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: ipCount } = await db
    .from("security_events")
    .select("id", { count: "exact", head: true })
    .eq("kind", "booking_created")
    .eq("ip_hash", ipHash)
    .gte("created_at", since);
  if ((ipCount ?? 0) >= 8) return true;
  if (phone) {
    const { count: phoneCount } = await db
      .from("security_events")
      .select("id", { count: "exact", head: true })
      .eq("kind", "booking_created")
      .eq("identifier", phone)
      .gte("created_at", since);
    if ((phoneCount ?? 0) >= 4) return true;
  }
  return false;
}

export async function logSecurityEvent(
  kind: string,
  ipHash: string,
  identifier: string | null,
  businessId: string | null,
) {
  const db = await admin();
  await db.from("security_events").insert({
    kind,
    ip_hash: ipHash,
    identifier,
    business_id: businessId,
  });
}

async function hashCode(businessId: string, email: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`code:${businessId}:${email}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const CODE_TTL_MS = 10 * 60 * 1000;

/**
 * Emails a 6-digit code the client must type to finish the booking. A code
 * sent in the last 30 seconds is reused (no flood of emails). False when the
 * email could not be sent.
 */
export async function issueBookingCode(
  businessId: string,
  businessName: string,
  email: string,
): Promise<boolean> {
  const db = await admin();
  const to = email.trim().toLowerCase();
  const { data: recent } = await db
    .from("booking_codes")
    .select("id")
    .eq("business_id", businessId)
    .eq("email", to)
    .gte("created_at", new Date(Date.now() - 30_000).toISOString())
    .limit(1);
  if (recent?.length) return true;

  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  const code = String(bytes[0]! % 1_000_000).padStart(6, "0");
  // A new code replaces the old ones for this email.
  await db.from("booking_codes").delete().eq("business_id", businessId).eq("email", to);
  await db.from("booking_codes").insert({
    business_id: businessId,
    email: to,
    code_hash: await hashCode(businessId, to, code),
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  try {
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const res = await sendTemplateEmail("booking-code", to, {
      templateData: { code, businessName },
    });
    return res.sent;
  } catch (e) {
    console.error("[booking] code email failed", e);
    return false;
  }
}

/** Checks the code the client typed (5 tries per code, valid 10 minutes). */
export async function checkBookingCode(
  businessId: string,
  email: string,
  code: string,
): Promise<"ok" | "wrong" | "expired"> {
  const db = await admin();
  const to = email.trim().toLowerCase();
  const { data: row } = await db
    .from("booking_codes")
    .select("id, code_hash, attempts, expires_at")
    .eq("business_id", businessId)
    .eq("email", to)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row || new Date(row.expires_at).getTime() < Date.now() || row.attempts >= 5) {
    return "expired";
  }
  if (row.code_hash !== (await hashCode(businessId, to, code))) {
    await db
      .from("booking_codes")
      .update({ attempts: row.attempts + 1 })
      .eq("id", row.id);
    return "wrong";
  }
  await db.from("booking_codes").delete().eq("id", row.id);
  return "ok";
}

/** True when this page exists but its owner suspended the account (shown as "temporarily unavailable"). */
export async function pageIsPaused(slug: string): Promise<boolean> {
  const db = await admin();
  const { data } = await db
    .from("businesses")
    .select("id")
    .eq("slug", slug)
    .is("deleted_at", null)
    .not("suspended_at", "is", null)
    .maybeSingle();
  return !!data;
}

export async function slugTaken(slug: string): Promise<boolean> {
  const db = await admin();
  const { data } = await db.from("businesses").select("id").eq("slug", slug).maybeSingle();
  return !!data;
}

/** Resolves the signed-in client from the request bearer token (null when guest). */
export async function userIdFromAuthHeader(header?: string | null): Promise<string | null> {
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  const db = await admin();
  const { data } = await db.auth.getUser(token);
  return data.user?.id ?? null;
}
