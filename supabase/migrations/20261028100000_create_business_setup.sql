-- Sign-up in one go: the business, its owner, services, team, opening hours and the plan
-- row are created together or not at all. Before, they were 6 separate requests from the
-- app: if one in the middle failed, a half-made business stayed behind, its link was taken,
-- and the owner had to fill everything in again with another link.
--
-- Called by the website and the app with the onboarding answers (JSON). Runs as the owner
-- (auth.uid()); security definer only so the plan row can be written too.
create or replace function public.create_business_setup(p jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  biz uuid;
  clean_slug text := lower(trim(coalesce(p->>'slug', '')));
  svc_ids uuid[] := '{}';
  staff_ids uuid[] := '{}';
  new_id uuid;
  item jsonb;
  n int := 0;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if clean_slug !~ '^[a-z0-9-]{3,48}$' then
    raise exception 'invalid link' using errcode = '22023';
  end if;
  if coalesce(trim(p->>'name'), '') = '' then
    raise exception 'missing name' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p->'services', '[]')) > 50
     or jsonb_array_length(coalesce(p->'team', '[]')) > 20
     or jsonb_array_length(coalesce(p->'hours', '[]')) > 28 then
    raise exception 'too many items' using errcode = '22023';
  end if;

  insert into public.businesses (
    name, slug, business_type, description, city, address, phone, instagram, brand_color,
    cancellation_hours, created_by, onboarding_completed, auto_complete, latitude, longitude
  ) values (
    left(trim(p->>'name'), 120),
    clean_slug,
    coalesce(nullif(p->>'business_type', ''), 'other'),
    nullif(left(trim(coalesce(p->>'description', '')), 600), ''),
    nullif(left(trim(coalesce(p->>'city', '')), 120), ''),
    nullif(left(trim(coalesce(p->>'address', '')), 200), ''),
    nullif(left(trim(coalesce(p->>'phone', '')), 40), ''),
    nullif(left(trim(coalesce(p->>'instagram', '')), 60), ''),
    coalesce(nullif(p->>'brand_color', ''), '#0a6cf0'),
    coalesce((p->>'cancellation_hours')::int, 24),
    uid,
    true,
    coalesce((p->>'auto_complete')::boolean, false),
    (p->>'latitude')::numeric,
    (p->>'longitude')::numeric
  )
  returning id into biz;

  insert into public.business_members (business_id, user_id, role) values (biz, uid, 'owner');

  n := 0;
  for item in select value from jsonb_array_elements(coalesce(p->'services', '[]')) loop
    insert into public.services (business_id, name, duration_minutes, price_cents, requires_confirmation, sort_order)
    values (
      biz,
      left(trim(item->>'name'), 120),
      greatest(5, coalesce((item->>'duration_minutes')::int, 30)),
      greatest(0, coalesce((item->>'price_cents')::int, 0)),
      coalesce((p->>'requires_confirmation')::boolean, false),
      n
    )
    returning id into new_id;
    svc_ids := svc_ids || new_id;
    n := n + 1;
  end loop;

  n := 0;
  for item in select value from jsonb_array_elements(coalesce(p->'team', '[]')) loop
    insert into public.staff (business_id, name, user_id, sort_order)
    values (biz, left(trim(item #>> '{}'), 80), case when n = 0 then uid end, n)
    returning id into new_id;
    staff_ids := staff_ids || new_id;
    n := n + 1;
  end loop;

  -- Everyone does every service.
  insert into public.staff_services (staff_id, service_id, business_id)
  select st, sv, biz from unnest(staff_ids) as st, unnest(svc_ids) as sv;

  -- The week is shared by the whole team.
  insert into public.working_hours (business_id, staff_id, weekday, start_time, end_time)
  select biz, null, (h->>'weekday')::int, (h->>'start_time')::time, (h->>'end_time')::time
  from jsonb_array_elements(coalesce(p->'hours', '[]')) as h;

  -- The free trial is counted from today.
  insert into public.subscriptions (business_id, plan) values (biz, 'free')
  on conflict (business_id) do nothing;

  return json_build_object('id', biz, 'slug', clean_slug);
end;
$$;

revoke all on function public.create_business_setup(jsonb) from public, anon;
grant execute on function public.create_business_setup(jsonb) to authenticated;
