-- Deposit against no-shows (sinal): settings per business, the deposit on each appointment,
-- and short holds that keep a time while the client pays.

alter table public.businesses
  add column if not exists deposit_enabled boolean not null default false,
  add column if not exists deposit_mode text not null default 'fixed',
  add column if not exists deposit_value integer not null default 500,
  add column if not exists stripe_account_id text,
  add column if not exists stripe_charges_enabled boolean not null default false;

alter table public.businesses drop constraint if exists businesses_deposit_mode_check;
alter table public.businesses
  add constraint businesses_deposit_mode_check check (deposit_mode in ('fixed', 'percent'));
alter table public.businesses drop constraint if exists businesses_deposit_value_check;
alter table public.businesses
  add constraint businesses_deposit_value_check check (deposit_value > 0);

alter table public.appointments
  add column if not exists deposit_cents integer,
  add column if not exists deposit_status text,
  add column if not exists deposit_payment_intent text,
  add column if not exists deposit_refunded_at timestamptz;

alter table public.appointments drop constraint if exists appointments_deposit_status_check;
alter table public.appointments
  add constraint appointments_deposit_status_check check (deposit_status in ('paid', 'refunded'));

-- One payment can only ever become one appointment (the return page and the webhook may race).
create unique index if not exists appointments_deposit_payment_intent_key
  on public.appointments (deposit_payment_intent) where deposit_payment_intent is not null;

-- A time kept for 15 minutes while the client pays. Only the server touches it.
create table if not exists public.booking_holds (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  service_id uuid not null,
  staff_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  payload jsonb not null,
  deposit_cents integer not null,
  checkout_session_id text,
  hold_until timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists booking_holds_business_start_idx on public.booking_holds (business_id, starts_at);
alter table public.booking_holds enable row level security;
grant all on public.booking_holds to service_role;

-- The busy times on the public page now also include times being paid for.
create or replace function public.public_busy_intervals(_business_id uuid, _from timestamptz, _to timestamptz)
returns table(kind text, staff_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql
stable security definer
set search_path to 'public'
as $function$
  select 'appointment'::text, a.staff_id, a.starts_at, a.ends_at
  from public.appointments a
  join public.businesses b on b.id = a.business_id and b.is_published and b.deleted_at is null
  where a.business_id = _business_id and a.status in ('pending','confirmed')
    and a.starts_at < _to and a.ends_at > _from
  union all
  select 'block'::text, t.staff_id, t.starts_at, t.ends_at
  from public.blocked_times t
  join public.businesses b on b.id = t.business_id and b.is_published and b.deleted_at is null
  where t.business_id = _business_id and t.starts_at < _to and t.ends_at > _from
    and _to - _from <= interval '400 days'
  union all
  select 'hold'::text, h.staff_id, h.starts_at, h.ends_at
  from public.booking_holds h
  join public.businesses b on b.id = h.business_id and b.is_published and b.deleted_at is null
  where h.business_id = _business_id and h.hold_until > now()
    and h.starts_at < _to and h.ends_at > _from
$function$;

grant execute on function public.public_busy_intervals(uuid, timestamptz, timestamptz) to anon, authenticated, service_role;
