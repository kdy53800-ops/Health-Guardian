-- Keep the checked-in schema aligned with the production project and make
-- health-document images private. Safe to run more than once.
alter table public.profiles
  add column if not exists is_blocked boolean not null default false;

alter table public.inbody_records
  add column if not exists phase_angle numeric not null default 0;

insert into storage.buckets (id, name, public)
values ('inbody_images', 'inbody_images', false)
on conflict (id) do update set public = false;

drop policy if exists "Public Access" on storage.objects;
