-- Aggregate administrator dashboard totals in Postgres so the browser does not
-- download every historical health record just to show counts and averages.
create or replace function public.admin_record_rollup(p_month text default null)
returns table (
  user_id uuid,
  record_count bigint,
  total_minutes numeric,
  walking_sum numeric,
  walking_entries bigint,
  running_sum numeric,
  running_entries bigint,
  custom_sum numeric,
  custom_entries bigint,
  active_this_month boolean,
  last_date date
)
language sql
stable
security invoker
set search_path = ''
as $$
  with source as (
    select r.user_id, r.record_date, r.walking, r.running,
      coalesce((
        select sum(case when e->>'duration' ~ '^[0-9]+(\.[0-9]+)?$'
          then (e->>'duration')::numeric else 0 end)
        from jsonb_array_elements(
          case when jsonb_typeof(r.custom_exercises) = 'array'
            then r.custom_exercises else '[]'::jsonb end
        ) e
      ), 0) as custom_minutes
    from public.daily_records r
    where p_month is null or (
      r.record_date >= to_date(p_month || '-01', 'YYYY-MM-DD')
      and r.record_date < (to_date(p_month || '-01', 'YYYY-MM-DD') + interval '1 month')::date
    )
  )
  select source.user_id, count(*)::bigint,
    coalesce(sum(source.walking + source.running + source.custom_minutes), 0),
    coalesce(sum(source.walking), 0), count(*) filter (where source.walking > 0)::bigint,
    coalesce(sum(source.running), 0), count(*) filter (where source.running > 0)::bigint,
    coalesce(sum(source.custom_minutes), 0), count(*) filter (where source.custom_minutes > 0)::bigint,
    bool_or(source.record_date >= date_trunc('month', now() at time zone 'Asia/Seoul')::date
      and source.record_date < (date_trunc('month', now() at time zone 'Asia/Seoul') + interval '1 month')::date),
    max(source.record_date)
  from source
  group by source.user_id;
$$;

revoke all on function public.admin_record_rollup(text) from public, anon, authenticated;
grant execute on function public.admin_record_rollup(text) to service_role;
