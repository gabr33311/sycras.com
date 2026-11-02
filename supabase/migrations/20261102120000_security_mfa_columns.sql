-- Security, 2 Nov 2026.
-- 1. The public key (anon) can no longer read the owner's phone, email or account id,
--    nor internal settings. The public page gets the phone/email through the server,
--    only when the owner chose to show them.
-- 2. Two-step verification is enforced by the database too: an account that turned it
--    on cannot read or change its data with a session that has not given the code.

-- 1. Column-level reads for the public key ------------------------------------------
revoke select on public.businesses from anon;
grant select (
  id, slug, name, business_type, description, address, city, website, instagram,
  logo_url, cover_url, brand_color, timezone, currency, cancellation_hours,
  slot_interval_minutes, is_published, seo_indexable, is_demo, show_team, show_contacts,
  booking_horizon_months, latitude, longitude, show_map, min_notice_minutes,
  verify_bookings, gallery, created_at, updated_at, deleted_at, suspended_at
) on public.businesses to anon;

revoke select on public.staff from anon;
grant select (
  id, business_id, name, specialty, photo_url, color, is_active, sort_order, created_at, updated_at
) on public.staff to anon;

-- 2. Two-step verification enforced on every owner table -----------------------------
create or replace function public.mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      );
$$;
revoke all on function public.mfa_ok() from public;
grant execute on function public.mfa_ok() to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'appointments', 'appointment_status_history', 'appointment_reminders', 'audit_logs',
    'blocked_times', 'booking_codes', 'booking_tokens', 'business_members', 'businesses',
    'customers', 'notifications', 'profiles', 'push_tokens', 'services', 'staff',
    'staff_services', 'subscriptions', 'waitlist_entries', 'working_hours'
  ]
  loop
    execute format('drop policy if exists "two_step_required" on public.%I', t);
    execute format(
      'create policy "two_step_required" on public.%I as restrictive for all to authenticated
         using ((select public.mfa_ok())) with check ((select public.mfa_ok()))',
      t
    );
  end loop;
end $$;
