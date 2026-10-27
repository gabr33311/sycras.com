-- Photos of the shop, shown on the public booking page (storage paths in the
-- private "business-logos" bucket, like the logo and the cover). Up to 12.
alter table public.businesses
  add column if not exists gallery text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'businesses_gallery_max') then
    alter table public.businesses
      add constraint businesses_gallery_max check (cardinality(gallery) <= 12);
  end if;
end $$;
