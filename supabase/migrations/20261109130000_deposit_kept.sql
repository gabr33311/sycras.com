-- The owner can keep a deposit when cancelling late: remember that choice, so the automatic
-- sweep (which refunds cancelled bookings still holding the money) leaves it alone.
alter table public.appointments drop constraint if exists appointments_deposit_status_check;
alter table public.appointments
  add constraint appointments_deposit_status_check check (deposit_status in ('paid', 'refunded', 'kept'));
