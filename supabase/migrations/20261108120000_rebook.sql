-- "Está na hora de voltar": some weeks after a finished visit, the client gets an
-- email with the link to book the next one (only if nothing is booked yet).
-- rebook_weeks: null = off; otherwise 2 to 12 weeks after the visit.
alter table public.businesses
  add column if not exists rebook_weeks smallint
  check (rebook_weeks is null or rebook_weeks between 2 and 12);
