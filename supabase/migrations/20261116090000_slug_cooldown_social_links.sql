-- 1. The link (slug) can be changed in the app, at most once every 7 days.
--    The old link is free again straight away (only the current one is unique).
-- 2. Social networks as a list (Instagram, TikTok, Facebook, …), shown as icons on the page.
--    The Instagram that already exists is copied into the list.

-- 1 ----------------------------------------------------------------------------------------
alter table public.businesses add column if not exists slug_changed_at timestamptz;

create or replace function public.guard_slug_change()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.slug is distinct from old.slug and current_user in ('authenticated', 'anon') then
    if old.slug_changed_at is not null and old.slug_changed_at > now() - interval '7 days' then
      raise exception 'slug_cooldown' using hint = 'O link só pode ser mudado uma vez a cada 7 dias.';
    end if;
    new.slug_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists businesses_guard_slug_change on public.businesses;
create trigger businesses_guard_slug_change
  before update on public.businesses
  for each row execute function public.guard_slug_change();

-- 2 ----------------------------------------------------------------------------------------
alter table public.businesses
  add column if not exists social_links jsonb not null default '[]'::jsonb;

alter table public.businesses
  add constraint businesses_social_links_shape check (
    jsonb_typeof(social_links) = 'array' and jsonb_array_length(social_links) <= 12
    and length(social_links::text) <= 4000
  );

update public.businesses
set social_links = jsonb_build_array(jsonb_build_object(
  'network', 'instagram',
  'handle', regexp_replace(instagram, '^@', ''),
  'url', 'https://instagram.com/' || regexp_replace(instagram, '^@', '')
))
where coalesce(instagram, '') <> '' and social_links = '[]'::jsonb;

-- The public booking page reads it (like the other public columns).
grant select (social_links) on public.businesses to anon;
