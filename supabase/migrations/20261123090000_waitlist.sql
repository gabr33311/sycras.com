-- Waitlist: a client asks to be told when a full day gets a free time.
-- Only the server (service role) reads or writes it; no public access.
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  staff_id uuid references public.staff(id) on delete cascade,
  day date not null,
  email text not null check (char_length(email) between 3 and 160),
  ip_hash text,
  created_at timestamptz not null default now(),
  notified_at timestamptz
);

create unique index if not exists waitlist_once
  on public.waitlist (business_id, service_id, day, lower(email));
create index if not exists waitlist_pending
  on public.waitlist (day) where notified_at is null;

alter table public.waitlist enable row level security;
revoke all on public.waitlist from anon, authenticated;
