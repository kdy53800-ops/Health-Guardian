create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  name text,
  email text,
  gender text,
  birthday text,
  birthyear text,
  phone text,
  avatar_url text,
  auth_provider text not null default 'naver',
  oauth_provider_id text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (email);
create index if not exists profiles_phone_idx on public.profiles (phone);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create table if not exists public.daily_records (
  id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  record_date date not null,
  weight numeric not null default 0,
  walking numeric not null default 0,
  running numeric not null default 0,
  walking_km numeric not null default 0,
  running_km numeric not null default 0,
  squats numeric not null default 0,
  pushups numeric not null default 0,
  situps numeric not null default 0,
  water numeric not null default 0,
  fasting numeric not null default 0,
  diet text not null default '',
  condition integer not null default 3,
  memo text not null default '',
  custom_exercises jsonb not null default '[]'::jsonb,
  saved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists daily_records_user_date_uidx
on public.daily_records (user_id, record_date);

create index if not exists daily_records_user_date_idx
on public.daily_records (user_id, record_date desc);

create index if not exists daily_records_saved_at_idx
on public.daily_records (saved_at desc);

alter table public.daily_records enable row level security;

drop policy if exists "daily_records_select_own" on public.daily_records;
create policy "daily_records_select_own"
on public.daily_records
for select
using (auth.uid() = user_id);

drop policy if exists "daily_records_insert_own" on public.daily_records;
create policy "daily_records_insert_own"
on public.daily_records
for insert
with check (auth.uid() = user_id);

drop policy if exists "daily_records_update_own" on public.daily_records;
create policy "daily_records_update_own"
on public.daily_records
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "daily_records_delete_own" on public.daily_records;
create policy "daily_records_delete_own"
on public.daily_records
for delete
using (auth.uid() = user_id);

drop trigger if exists daily_records_set_updated_at on public.daily_records;
create trigger daily_records_set_updated_at
before update on public.daily_records
for each row
execute function public.set_updated_at();
