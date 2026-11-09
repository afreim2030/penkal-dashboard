create or replace function public.get_listings_with_visits_without_ads()
returns table (
  mlb text,
  title text,
  visits bigint,
  period_start date,
  period_end date
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
with active as (
  select public.get_active_marketplace_account_id() as account_id
),
latest_ads_import as (
  select i.id
  from public.imports i
  cross join active a
  where i.account_id = a.account_id
    and i.import_type = 'ad_metrics'
    and i.status in ('completed', 'completed_with_errors')
  order by i.created_at desc
  limit 1
),
ads_period as (
  select min(m.period_start) as period_start, max(m.period_end) as period_end
  from public.ad_metrics m
  join latest_ads_import latest on latest.id = m.import_id
),
ads_listings as (
  select distinct m.listing_id, nullif(trim(m.mlb_raw), '') as mlb
  from public.ad_metrics m
  join latest_ads_import latest on latest.id = m.import_id
),
visits_by_listing as (
  select
    l.id as listing_id,
    l.mlb,
    l.title,
    sum(coalesce(lp.visits, 0))::bigint as visits,
    period.period_start,
    period.period_end
  from public.listing_performance lp
  cross join active a
  cross join ads_period period
  join public.listings l
    on l.id = lp.listing_id
   and l.account_id = a.account_id
  where lp.account_id = a.account_id
    and lp.period_start = lp.period_end
    and lp.period_end between period.period_start and period.period_end
    and lower(coalesce(l.status, '')) in ('ativo', 'active')
  group by l.id, l.mlb, l.title, period.period_start, period.period_end
  having sum(coalesce(lp.visits, 0)) > 0
)
select v.mlb, v.title, v.visits, v.period_start, v.period_end
from visits_by_listing v
where not exists (
  select 1
  from ads_listings ads
  where ads.listing_id = v.listing_id
     or (ads.mlb is not null and ads.mlb = v.mlb)
)
order by v.visits desc, v.mlb;
$function$;

grant execute on function public.get_listings_with_visits_without_ads() to authenticated;
