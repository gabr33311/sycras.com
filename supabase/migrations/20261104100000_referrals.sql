-- Invites ("Convida e ganha"), 4 Nov 2026.
-- Every business gets a code (made from its name, changeable once). Whoever creates an
-- account with it gets 15 more free days; when that new business pays its first month
-- (and 14 days pass, the refund window), the inviter earns 10 €. From 20 € the inviter can
-- ask for a bank transfer. The money side lives in tables only the server can write.

alter table public.businesses
  add column if not exists referral_code text,
  add column if not exists referral_code_changed boolean not null default false,
  add column if not exists referred_by uuid references public.businesses(id) on delete set null,
  add column if not exists trial_bonus_days integer not null default 0;

create unique index if not exists businesses_referral_code_key
  on public.businesses (upper(referral_code)) where referral_code is not null;

-- Owners may not set these themselves (only the server, after its checks): otherwise anyone
-- could give themselves endless free days or claim someone else as their inviter.
create or replace function public.guard_referral_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.referral_code := null;
      new.referral_code_changed := false;
      new.referred_by := null;
      new.trial_bonus_days := 0;
    elsif new.referral_code is distinct from old.referral_code
       or new.referral_code_changed is distinct from old.referral_code_changed
       or new.referred_by is distinct from old.referred_by
       or new.trial_bonus_days is distinct from old.trial_bonus_days then
      raise exception 'referral fields are set by the server';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists businesses_guard_referral on public.businesses;
create trigger businesses_guard_referral
  before insert or update on public.businesses
  for each row execute function public.guard_referral_columns();

-- One reward per invited business.
create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referrer_business_id uuid not null references public.businesses(id) on delete cascade,
  referred_business_id uuid not null unique references public.businesses(id) on delete cascade,
  amount_cents integer not null default 1000,
  -- pending: paid, inside the 14-day refund window; available: can be withdrawn;
  -- cancelled: refunded or cancelled in time.
  status text not null default 'pending' check (status in ('pending', 'available', 'cancelled')),
  available_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists referral_rewards_referrer_idx on public.referral_rewards (referrer_business_id);

create table if not exists public.referral_payouts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 2000),
  holder_name text not null,
  iban text not null,
  status text not null default 'requested' check (status in ('requested', 'paid', 'rejected')),
  requested_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists referral_payouts_business_idx on public.referral_payouts (business_id);

alter table public.referral_rewards enable row level security;
alter table public.referral_payouts enable row level security;
revoke all on public.referral_rewards from anon, authenticated;
revoke all on public.referral_payouts from anon, authenticated;
grant all on public.referral_rewards to service_role;
grant all on public.referral_payouts to service_role;
-- No policies: the owner reads them through the server (/api/referral/me), which masks the IBAN.
