-- Security hardening (2026-11-10 audit).
-- 1. Payment and system columns of a business can only be changed by the server.
-- 2. Size and format limits on everything the apps write straight to the database
--    (generous: above every limit the site and the app already show, so nothing visible changes).
-- 3. A shared request counter for rate limiting (used only by the server).
-- 4. Uploads: images only, up to 15 MB (the limit the site already tells people).

-- 1 ----------------------------------------------------------------------------------------
create or replace function public.guard_server_columns()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.stripe_account_id := null;
      new.stripe_charges_enabled := false;
      new.is_demo := false;
    elsif new.stripe_account_id is distinct from old.stripe_account_id
       or new.stripe_charges_enabled is distinct from old.stripe_charges_enabled
       or new.is_demo is distinct from old.is_demo
       or new.created_by is distinct from old.created_by then
      raise exception 'these fields are set by the server';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists businesses_guard_server_columns on public.businesses;
create trigger businesses_guard_server_columns
  before insert or update on public.businesses
  for each row execute function public.guard_server_columns();

-- 2 ----------------------------------------------------------------------------------------
alter table public.businesses
  add constraint businesses_name_len check (char_length(name) between 1 and 200),
  add constraint businesses_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  add constraint businesses_description_len check (description is null or char_length(description) <= 2000),
  add constraint businesses_address_len check (address is null or char_length(address) <= 300),
  add constraint businesses_city_len check (city is null or char_length(city) <= 120),
  add constraint businesses_phone_len check (phone is null or char_length(phone) <= 40),
  add constraint businesses_email_len check (email is null or char_length(email) <= 320),
  add constraint businesses_website_len check (website is null or char_length(website) <= 500),
  add constraint businesses_instagram_len check (instagram is null or char_length(instagram) <= 100),
  add constraint businesses_review_url_len check (review_url is null or char_length(review_url) <= 500),
  add constraint businesses_logo_url_len check (logo_url is null or char_length(logo_url) <= 500),
  add constraint businesses_cover_url_len check (cover_url is null or char_length(cover_url) <= 500),
  add constraint businesses_brand_color_format check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$'),
  add constraint businesses_gallery_size check (gallery is null or coalesce(array_length(gallery, 1), 0) <= 40);

alter table public.customers
  add constraint customers_name_len check (char_length(name) <= 200),
  add constraint customers_phone_len check (phone is null or char_length(phone) <= 40),
  add constraint customers_email_len check (email is null or char_length(email) <= 320),
  add constraint customers_notes_len check (notes is null or char_length(notes) <= 4000);

alter table public.services
  add constraint services_name_len check (char_length(name) between 1 and 200),
  add constraint services_description_len check (description is null or char_length(description) <= 2000),
  add constraint services_category_len check (category is null or char_length(category) <= 120),
  add constraint services_image_url_len check (image_url is null or char_length(image_url) <= 500),
  add constraint services_price_range check (price_cents is null or price_cents between 0 and 10000000),
  add constraint services_duration_range check (duration_minutes between 1 and 1440),
  add constraint services_buffer_range check (buffer_minutes is null or buffer_minutes between 0 and 1440),
  add constraint services_deposit_range check (deposit_cents is null or deposit_cents between 0 and 10000000);

alter table public.staff
  add constraint staff_name_len check (char_length(name) between 1 and 200),
  add constraint staff_specialty_len check (specialty is null or char_length(specialty) <= 200),
  add constraint staff_photo_url_len check (photo_url is null or char_length(photo_url) <= 500),
  add constraint staff_color_format check (color is null or color ~ '^#[0-9a-fA-F]{6}$');

alter table public.appointments
  add constraint appointments_customer_name_len check (customer_name is null or char_length(customer_name) <= 200),
  add constraint appointments_customer_phone_len check (customer_phone is null or char_length(customer_phone) <= 40),
  add constraint appointments_customer_email_len check (customer_email is null or char_length(customer_email) <= 320),
  add constraint appointments_notes_len check (notes is null or char_length(notes) <= 2000),
  add constraint appointments_service_name_len check (service_name is null or char_length(service_name) <= 200),
  add constraint appointments_price_range check (price_cents is null or price_cents between 0 and 10000000);

alter table public.blocked_times
  add constraint blocked_times_reason_len check (reason is null or char_length(reason) <= 500);

alter table public.waitlist_entries
  add constraint waitlist_customer_name_len check (customer_name is null or char_length(customer_name) <= 200),
  add constraint waitlist_customer_phone_len check (customer_phone is null or char_length(customer_phone) <= 40),
  add constraint waitlist_customer_email_len check (customer_email is null or char_length(customer_email) <= 320),
  add constraint waitlist_preference_len check (preference is null or char_length(preference) <= 500);

-- 3 ----------------------------------------------------------------------------------------
create schema if not exists private;

create table if not exists private.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);
alter table private.rate_limits enable row level security;

-- One more request for this key. True while it is within the limit for the window.
create or replace function public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_hits integer;
begin
  insert into private.rate_limits as r (key, window_start, hits)
  values (left(p_key, 200), now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end;
$$;

-- Old counters are cleared once a day by the reminders cron.
create or replace function public.rate_limit_cleanup()
returns void
language sql
security definer
set search_path to ''
as $$
  delete from private.rate_limits where window_start < now() - interval '1 day';
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.rate_limit_cleanup() from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
grant execute on function public.rate_limit_cleanup() to service_role;

-- 4 ----------------------------------------------------------------------------------------
update storage.buckets
set file_size_limit = 15 * 1024 * 1024,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif'
    ]
where id = 'business-logos';
