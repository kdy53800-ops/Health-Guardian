-- Fine-grained reminder schedule and temporary suppression controls.
alter table public.notification_preferences
  add column if not exists reminder_days smallint[] not null default array[0,1,2,3,4,5,6]::smallint[],
  add column if not exists skip_if_recorded boolean not null default true,
  add column if not exists muted_on date,
  add column if not exists snoozed_until timestamptz;

alter table public.notification_preferences
  drop constraint if exists notification_preferences_reminder_days_check;

alter table public.notification_preferences
  add constraint notification_preferences_reminder_days_check
  check (
    cardinality(reminder_days) between 1 and 7
    and reminder_days <@ array[0,1,2,3,4,5,6]::smallint[]
  );

create index if not exists notification_preferences_enabled_idx
  on public.notification_preferences (enabled)
  where enabled = true;
-- Fine-grained reminder schedule and temporary suppression controls.
alter table public.notification_preferences
  add column if not exists reminder_days smallint[] not null default array[0,1,2,3,4,5,6]::smallint[],
  add column if not exists skip_if_recorded boolean not null default true,
  add column if not exists muted_on date,
  add column if not exists snoozed_until timestamptz;

alter table public.notification_preferences
  drop constraint if exists notification_preferences_reminder_days_check;

alter table public.notification_preferences
  add constraint notification_preferences_reminder_days_check
  check (
    cardinality(reminder_days) between 1 and 7
    and reminder_days <@ array[0,1,2,3,4,5,6]::smallint[]
  );

create index if not exists notification_preferences_enabled_idx
  on public.notification_preferences (enabled)
  where enabled = true;
