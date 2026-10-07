-- Reusable exercise routines, scoped to each profile and limited to four slots.
create table if not exists public.record_routines (
  user_id uuid not null references public.profiles (id) on delete cascade,
  slot smallint not null check (slot between 1 and 4),
  routine_id text not null check (length(routine_id) between 1 and 100),
  name text not null check (length(btrim(name)) between 1 and 30),
  walking numeric not null default 0 check (walking between 0 and 999),
  walking_km numeric not null default 0 check (walking_km between 0 and 999),
  running numeric not null default 0 check (running between 0 and 999),
  running_km numeric not null default 0 check (running_km between 0 and 999),
  custom_exercises jsonb not null default '[]'::jsonb check (jsonb_typeof(custom_exercises) = 'array' and jsonb_array_length(custom_exercises) <= 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, slot),
  unique (user_id, routine_id)
);

create index if not exists record_routines_user_idx on public.record_routines (user_id);
alter table public.record_routines enable row level security;
revoke all on public.record_routines from anon, authenticated;
-- The authenticated application API uses its service role after verifying the session.
