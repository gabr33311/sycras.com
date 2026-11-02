-- WhatsApp confirmations and reminders (Pro).
-- businesses.whatsapp_reminders: the owner turned WhatsApp messages on.
-- appointments.whatsapp_ok: the client ticked "send me the confirmation and reminder on WhatsApp".
alter table public.businesses add column if not exists whatsapp_reminders boolean not null default false;
alter table public.appointments add column if not exists whatsapp_ok boolean not null default false;

-- The public page shows the WhatsApp box only for businesses that have it on.
grant select (whatsapp_reminders) on public.businesses to anon;
