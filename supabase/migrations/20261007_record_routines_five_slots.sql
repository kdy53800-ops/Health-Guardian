-- Allow one additional saved routine per user without changing existing slots.
alter table public.record_routines
  drop constraint if exists record_routines_slot_check,
  add constraint record_routines_slot_check check (slot between 1 and 5);
