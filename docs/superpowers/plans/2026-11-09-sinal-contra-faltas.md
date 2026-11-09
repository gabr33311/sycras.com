# Sinal contra faltas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clients booking on a business's public page pay a deposit through the business's own Stripe account; refunds and "kept" deposits follow the agreed rules, and the owner sees what was paid on web and in the app.

**Architecture:** Stripe Connect with the barber's own account (controller: full dashboard, fees and losses on the account, Stripe collects requirements) and direct charges via hosted Checkout created on that account. An unpaid booking lives in a new `booking_holds` table (service-role only) that blocks the slot for 15 minutes; the appointment row is only created once the payment is confirmed (by the return page or the Connect webhook, both calling one idempotent `finalizeDeposit`). Refunds go through one `refundDeposit` used by every cancel path.

**Tech Stack:** TanStack Start (server fns + file API routes) on Vercel, Supabase (Postgres, RLS, pg_cron), `stripe@^17`, vitest; Expo app (`C:\Users\admin\Desktop\sycras-mobile`).

**Spec:** `docs/superpowers/specs/2026-11-09-sinal-contra-faltas-design.md`

## Global Constraints

- Only for paying Pro: `businessHasPro()` in `src/lib/billing.server.ts` (`access.pro`). Trial does not count.
- Deposit = one setting per business: fixed cents or percent of the service price. Minimum 1 € (100 cents); capped at the service price; price under 1 € → no deposit.
- Hold: slot reserved 15 minutes (`hold_until = now + 15 min`). Stripe Checkout `expires_at = now + 30 min` (Stripe minimum).
- Owner-created bookings (app or web) never ask a deposit.
- Declining a request (pending → cancelled) always refunds, with no "Devolver o sinal?" question; the question only appears for a confirmed booking cancelled late.
- Rescheduling (client link or owner drag) keeps the same appointment row, so the deposit simply moves with it; nothing to build.
- Refund: client cancels online (only possible inside `cancellation_hours`) → always; owner cancels/declines → refund, except when the owner cancels late (`starts_at - now < cancellation_hours`) and chooses "Ficar com o sinal"; no-show/completed → no refund.
- If the business is not Pro, not `stripe_charges_enabled`, or the computed deposit is 0, the page books without a deposit (never blocks booking).
- All user-facing copy in pt-PT (web also en; the other 5 locales may fall back). No technical words on screen (no "Connect", "PaymentIntent", "webhook").
- Money from deposits goes only to the barber's account; SYCRAS takes no application fee.
- New env var: `STRIPE_CONNECT_WEBHOOK_SECRET` (Vercel). The Connect webhook endpoint is created by the owner in Stripe (sandbox first, then live).
- Migrations are applied with the Supabase MCP (project `tiydpvgcmxupqghmjjuo`) before the web is published; web publish only after the owner says "publica".

## Review Focus

- Client pays after the 15-minute hold ran out and someone else took the time → automatic refund and the message "Esse horário já foi ocupado. O sinal foi devolvido." (Task 4 test `finalizeOutcome slot lost → refund`).
- Return page and webhook finalize the same payment at the same moment → exactly one appointment (unique index on `deposit_payment_intent`; Task 4 test `finalizeOutcome already booked → reuse`).
- Client abandons Checkout → no appointment; the time is free again after 15 minutes even if the cron has not run yet (Task 1 SQL check: expired holds are not busy).
- Owner cancels a paid booking whose client has no email → refund still happens (Task 6: refund runs before the `no_email` early return; manual check in Task 8).
- Business loses Pro or its Stripe account stops accepting payments → bookings go through with no deposit (Task 2 test `depositFor → 0 when not pro / charges disabled`).

---

### Task 1: Database

**Files:**
- Create: `supabase/migrations/20261109120000_deposits.sql`
- Modify: `src/integrations/supabase/types.ts` (regenerate with the Supabase MCP `generate_typescript_types`), `C:\Users\admin\Desktop\sycras-mobile\src\lib\database.types.ts` (same output)

**Interfaces:**
- Produces: `businesses.deposit_enabled boolean not null default false`, `businesses.deposit_mode text not null default 'fixed' check in ('fixed','percent')`, `businesses.deposit_value integer not null default 500` (cents when fixed, percent 1–100 when percent), `businesses.stripe_account_id text`, `businesses.stripe_charges_enabled boolean not null default false`; `appointments.deposit_cents integer`, `appointments.deposit_status text check in ('paid','refunded')`, `appointments.deposit_payment_intent text` (unique where not null), `appointments.deposit_refunded_at timestamptz`; table `booking_holds(id uuid pk default gen_random_uuid(), business_id uuid not null references businesses on delete cascade, service_id uuid not null, staff_id uuid, starts_at timestamptz not null, ends_at timestamptz not null, payload jsonb not null, deposit_cents integer not null, checkout_session_id text, hold_until timestamptz not null, created_at timestamptz not null default now())`, RLS enabled with no policies (service role only), index on `(business_id, starts_at)`.
- `public_busy_intervals` gains a third `union all`: `'hold'`, holds with `hold_until > now()` overlapping `_from/_to` (same published/not-deleted join).

- [ ] **Step 1:** Write the migration (columns, table, unique partial index, replaced `public_busy_intervals`).
- [ ] **Step 2:** Apply with `apply_migration`; verify with `execute_sql`: insert a hold with `hold_until = now() + interval '15 min'` for a published test business, `select * from public_busy_intervals(...)` returns a `hold` row; set `hold_until = now() - interval '1 min'` → the row is gone; delete the test hold.
- [ ] **Step 3:** Regenerate types in both repos; `npx tsc --noEmit` passes in both.
- [ ] **Step 4:** Commit both repos (`feat: deposit columns and booking holds`).

### Task 2: Deposit rules (pure)

**Files:**
- Create: `src/lib/deposit.ts`, `src/lib/deposit.test.ts`; copy `deposit.ts` (without tests) to `C:\Users\admin\Desktop\sycras-mobile\src\lib\deposit.ts`

**Interfaces:**
- Produces:
  - `computeDeposit(priceCents: number, mode: "fixed" | "percent", value: number): number`
  - `depositFor(b: { pro: boolean; enabled: boolean; chargesEnabled: boolean; mode: "fixed" | "percent"; value: number }, priceCents: number): number` (0 = no deposit)
  - `ownerCancelRefund(startsAt: string, now: Date, cancellationHours: number): "always" | "ask"` ("ask" when late)

- [ ] **Step 1: Failing tests**

```ts
expect(computeDeposit(1500, "fixed", 500)).toBe(500);
expect(computeDeposit(1500, "percent", 30)).toBe(450);
expect(computeDeposit(1999, "percent", 33)).toBe(660);
expect(computeDeposit(1500, "percent", 5)).toBe(100);   // minimum 1 €
expect(computeDeposit(300, "fixed", 500)).toBe(300);    // capped at price
expect(computeDeposit(80, "fixed", 500)).toBe(0);       // under 1 € → none
expect(computeDeposit(0, "percent", 30)).toBe(0);
const on = { pro: true, enabled: true, chargesEnabled: true, mode: "fixed" as const, value: 500 };
expect(depositFor(on, 1500)).toBe(500);
expect(depositFor({ ...on, pro: false }, 1500)).toBe(0);
expect(depositFor({ ...on, chargesEnabled: false }, 1500)).toBe(0);
expect(depositFor({ ...on, enabled: false }, 1500)).toBe(0);
expect(ownerCancelRefund("2026-11-10T10:00:00Z", new Date("2026-11-09T09:00:00Z"), 24)).toBe("always");
expect(ownerCancelRefund("2026-11-10T10:00:00Z", new Date("2026-11-09T11:00:00Z"), 24)).toBe("ask");
```

- [ ] **Step 2:** `npm test -- deposit` → FAIL (module missing).
- [ ] **Step 3:** Implement the three functions (percent rounds with `Math.round`; result `min(price, max(100, raw))`, 0 when price < 100).
- [ ] **Step 4:** `npm test -- deposit` → PASS.
- [ ] **Step 5:** Commit.

### Task 3: Connecting the barber's Stripe account

**Files:**
- Create: `src/lib/connect.server.ts`, `src/routes/api/payments/connect.ts`, `src/routes/api/payments/status.ts`, `src/routes/connect.done.tsx`

**Interfaces:**
- Consumes: `stripe()` from `billing.server.ts`; owner/manager check as in `billableBusiness`.
- Produces:
  - `startConnectOnboarding(input: { userId: string; businessId: string; from: "web" | "app" }): Promise<{ ok: true; url: string } | { ok: false; message: string }>` — creates the account once (`country: "PT"`, `email` = business email, `controller: { stripe_dashboard: { type: "full" }, fees: { payer: "account" }, losses: { payments: "stripe" }, requirement_collection: "stripe" }`), saves `stripe_account_id`, returns an `account_onboarding` account link. `return_url`/`refresh_url`: web → `${origin}/profile?pagamentos=1`; app → `${origin}/connect/done`.
  - `refreshConnectStatus(businessId: string): Promise<{ connected: boolean; chargesEnabled: boolean }>` — `accounts.retrieve`, writes `stripe_charges_enabled`.
  - `POST /api/payments/connect` body `{ businessId, from }` → `{ url }`; `POST /api/payments/status` body `{ businessId }` → `{ connected, chargesEnabled }`. Both: `Authorization: Bearer <supabase access token>`, 401/403 like `src/routes/api/appointments/cancelled.ts`.
  - `/connect/done`: a plain page "Conta de pagamentos ligada. Já podes voltar à SYCRAS." with a button to `sycras://gestao`.

- [ ] **Step 1:** Implement `connect.server.ts` and the two routes.
- [ ] **Step 2:** Manual check in the Stripe sandbox with local dev (test keys): call `/api/payments/connect` with a logged-in owner token → URL opens Stripe onboarding; finish with test data → `/api/payments/status` returns `chargesEnabled: true` and the column is true.
- [ ] **Step 3:** `npx tsc --noEmit` passes. Commit.

### Task 4: Booking with a deposit (hold → Checkout → appointment)

**Files:**
- Create: `src/lib/deposit.server.ts`, `src/routes/booking.pay.$hold.tsx`, `src/routes/api/stripe/connect-webhook.ts`; tests in `src/lib/deposit.test.ts`
- Modify: `src/lib/booking.functions.ts` (`createPublicBooking`, new `finalizeDepositBooking` server fn), `src/lib/booking.server.ts` (public business gets `deposit: { mode; value } | null`), `src/routes/$slug.tsx` (deposit hint on services, `needs_payment` redirect), `src/lib/email-templates/appointment-confirmed.tsx` + its sender (line "Sinal pago: X €")

**Interfaces:**
- Consumes: `depositFor`, `computeDeposit` (Task 2); Task 1 columns/table.
- Produces:
  - `createAppointment(req: PublicBookingRequest, deposit?: { cents: number; paymentIntent: string }): Promise<{ ok: true; token: string; status: "pending" | "confirmed"; appointmentId: string } | { ok: false; code: "slot_taken" }>` — the existing customer upsert + insert + token + notifications + emails of `createPublicBooking`, moved out unchanged and reused. `PublicBookingRequest` = `{ businessId, serviceId, staffId: string | null, startsAt, endsAt, name, phone, email, notes, whatsapp }`.
  - `startDepositCheckout(req: PublicBookingRequest, ctx: { slug: string; origin: string; serviceName: string; depositCents: number; stripeAccount: string }): Promise<{ ok: true; url: string } | { ok: false; code: "slot_taken" }>` — refuses when an active hold overlaps the same staff; inserts the hold; creates Checkout (`mode: "payment"`, one `price_data` line `Sinal · {serviceName}` in eur, `customer_email`, `metadata.hold_id`, `payment_intent_data.metadata.hold_id`, `expires_at` +30 min, `success_url` `${origin}/booking/pay/{holdId}?session_id={CHECKOUT_SESSION_ID}`, `cancel_url` `${origin}/${slug}`) with `{ stripeAccount }`; stores `checkout_session_id`.
  - `finalizeOutcome(s: { paid: boolean; existingToken: string | null; created: "ok" | "slot_taken" | null }): "not_paid" | "reuse" | "booked" | "refund"` (pure, tested).
  - `finalizeDeposit(holdId: string, sessionId: string): Promise<{ ok: true; token: string } | { ok: false; code: "not_paid" | "slot_lost" | "not_found" }>` — session must match the hold; idempotent through the unique `deposit_payment_intent` (insert conflict → load and reuse); slot lost → `refunds.create({ payment_intent }, { stripeAccount })` and delete the hold.
  - `createPublicBooking` returns a new `{ ok: false, code: "needs_payment", url }` when `depositFor(...) > 0`.
  - `finalizeDepositBooking` server fn `{ holdId, sessionId }` → result of `finalizeDeposit`.
  - Connect webhook: verifies with `STRIPE_CONNECT_WEBHOOK_SECRET`; `checkout.session.completed` → `finalizeDeposit(metadata.hold_id, session.id)`; `account.updated` → set `stripe_charges_enabled` for that `stripe_account_id`.

- [ ] **Step 1: Failing tests** for `finalizeOutcome`:

```ts
expect(finalizeOutcome({ paid: false, existingToken: null, created: null })).toBe("not_paid");
expect(finalizeOutcome({ paid: true, existingToken: "t1", created: null })).toBe("reuse");          // already booked
expect(finalizeOutcome({ paid: true, existingToken: null, created: "ok" })).toBe("booked");
expect(finalizeOutcome({ paid: true, existingToken: null, created: "slot_taken" })).toBe("refund"); // slot lost → refund
```

- [ ] **Step 2:** `npm test -- deposit` → FAIL.
- [ ] **Step 3:** Extract `createAppointment`; make `createPublicBooking` use it (no behaviour change when there is no deposit); `npm test` still passes (existing 21 tests).
- [ ] **Step 4:** Implement `deposit.server.ts`, `finalizeDepositBooking`, the webhook, the pay route (shows "A confirmar o pagamento…", then navigates to `/booking/$token`; on `slot_lost` shows "Esse horário já foi ocupado. O sinal foi devolvido." with a button back to the page), the `$slug.tsx` changes (hint "Sinal de {x} € ao marcar"; `needs_payment` → `window.location.href = res.url`), and the confirmation email line.
- [ ] **Step 5:** `npm test` → PASS; `npx tsc --noEmit` passes.
- [ ] **Step 6:** Sandbox check (local dev, test keys, connected test account with charges enabled, Pro forced on the test business): book → Stripe Checkout → card `4242 4242 4242 4242` → confirmation page; appointment has `deposit_cents` and `deposit_status = 'paid'`; reload the return URL → same booking, no duplicate.
- [ ] **Step 7:** Commit.

### Task 5: Abandoned holds

**Files:**
- Modify: `src/lib/deposit.server.ts` (add `expireStaleHolds`), `src/routes/api/cron/reminders.ts` (call it; runs every 10 min)

**Interfaces:**
- Produces: `expireStaleHolds(): Promise<{ finalized: number; expired: number }>` — for each hold with `hold_until < now()`: retrieve its session; paid → `finalizeDeposit`; otherwise `checkout.sessions.expire` (ignore "already expired/complete" errors) and delete the hold.

- [ ] **Step 1:** Implement and wire into the cron handler (errors logged, never fail the reminders run).
- [ ] **Step 2:** Sandbox check: start a booking, close Checkout, set the hold's `hold_until` to the past with `execute_sql`, call the cron route with the cron secret → hold deleted, session expired, slot free on the page.
- [ ] **Step 3:** Commit.

### Task 6: Refunds on cancel

**Files:**
- Modify: `src/lib/deposit.server.ts` (add `refundDeposit`), `src/lib/booking.functions.ts` (`cancelBookingByToken`), `src/routes/api/appointments/cancelled.ts`, `src/lib/confirmation-email.functions.ts` (`sendAppointmentCancelledEmail`), `src/lib/confirmation-email.server.ts` + `src/lib/email-templates/appointment-cancelled.tsx` (line "O sinal de X € foi devolvido.")

**Interfaces:**
- Produces:
  - `refundDeposit(appointmentId: string): Promise<{ refunded: boolean; cents: number }>` — only when `deposit_status = 'paid'`; refund on the business's account; sets `deposit_status = 'refunded'`, `deposit_refunded_at`. Idempotent.
  - `/api/appointments/cancelled` and `sendAppointmentCancelledEmail` accept `refund?: boolean` (default `true`); they refund **before** the `no_email` return and include `refunded: boolean` in the response.
  - `cancelBookingByToken` always refunds after cancelling.
  - `sendCancelledEmail(id, { declined, refundedCents? })`.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Sandbox check: cancel a paid booking through the client link → refund visible in the connected account, `deposit_status = 'refunded'`, email says it was returned.
- [ ] **Step 3:** `npx tsc --noEmit`; commit.

### Task 7: Owner screens on the web

**Files:**
- Modify: `src/components/panels/availability-panel.tsx` (settings), `src/lib/appointment-status.ts` (`setAppointmentStatus` gets `refundDeposit?: boolean`, passed to the email fn), `src/components/appointment-commands.tsx` (late cancel with paid deposit → dialog "Devolver o sinal?" with "Devolver" / "Ficar com o sinal"), `src/components/app-sheets.tsx` (deposit line), `src/lib/i18n/profile.ts` (+ en)

**Interfaces:**
- Consumes: `ownerCancelRefund`, `computeDeposit` (Task 2); `/api/payments/connect|status` (Task 3).
- Copy (pt): toggle "Pedir sinal ao marcar"; desc "O cliente paga um adiantamento ao marcar online. Se faltar, ficas com ele."; not Pro: "Disponível no SYCRAS Pro."; button "Ligar conta de pagamentos"; pending: "Termina o registo na Stripe para começares a receber."; modes "Valor fixo" / "Percentagem"; example "Num serviço de 15 €, o cliente paga {x} ao marcar."; sheet lines "Sinal pago: {x} · falta {y}", "Sinal devolvido", "Sinal retido: {x}" (no-show).

- [ ] **Step 1:** Implement; returning to `/profile?pagamentos=1` calls `/api/payments/status` and opens the rules panel.
- [ ] **Step 2:** Browser check at phone width (local dev): connect flow, saving mode/value, sheet lines for paid / refunded / no-show, the late-cancel dialog both ways.
- [ ] **Step 3:** Commit.

### Task 8: Owner screens in the app

**Files (sycras-mobile):**
- Modify: `src/components/panels/rules.tsx` (same settings and copy as Task 7; connect opens `WebBrowser.openBrowserAsync(url)`, then calls `/api/payments/status` when it closes), `src/lib/data.ts` (`setStatus(appt, status, opts?: { refund?: boolean })`; the cancelled endpoint is called whenever `deposit_status === 'paid'`, even without client email), `src/app/marcacao/[id].tsx` (deposit line under the price; late cancel with paid deposit → `Alert` "Devolver o sinal?" with "Devolver", "Ficar com o sinal", "Voltar"), `src/app/(tabs)/gestao.tsx` (warning row when `deposit_enabled && !stripe_charges_enabled`: "Termina o registo de pagamentos")

**Interfaces:**
- Consumes: `computeDeposit`, `ownerCancelRefund` (mobile copy of Task 2), API routes of Tasks 3 and 6.

- [ ] **Step 1:** Implement; `npx tsc --noEmit` passes.
- [ ] **Step 2:** Release build with JDK 17, install on the phone, check: settings, connect (sandbox), a paid test booking shows "Sinal pago", cancel late → both choices, cancel a booking without client email → refunded.
- [ ] **Step 3:** Commit.

### Task 9: Going live (with the owner)

- [ ] **Step 1:** Owner creates the Connect webhook endpoint `https://sycras.com/api/stripe/connect-webhook` ("eventos em contas conectadas": `checkout.session.completed`, `account.updated`) in live mode and pastes its secret into Vercel as `STRIPE_CONNECT_WEBHOOK_SECRET`; owner completes the live Connect platform profile.
- [ ] **Step 2:** Apply the migration to production (already done in Task 1 — the project is shared) and publish the web only after the owner says "publica".
- [ ] **Step 3:** Build the store bundle (`SYCRAS-loja-<date>.aab`) and tell the owner to upload it.
