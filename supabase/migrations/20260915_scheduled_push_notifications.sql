-- Per-user reminder time and device Web Push subscriptions.
create extension if not exists "pgcrypto";
create extension if not exists "pg_cron";
create extension if not exists "pg_net";

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  enabled boolean not null default false,
  reminder_time time not null default '20:00:00',
  timezone text not null default 'Asia/Seoul' check (timezone = 'Asia/Seoul'),
  last_sent_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists notification_preferences_due_idx
  on public.notification_preferences (enabled, reminder_time, last_sent_on);
create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;

revoke all on public.notification_preferences from anon, authenticated;
revoke all on public.push_subscriptions from anon, authenticated;

-- The server API uses the service role. Cron registration is intentionally
-- performed separately so deployment secrets are never committed to Git.
