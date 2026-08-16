create or replace function public.get_performance_dashboard_data()
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
with daily_source as (
  select *
  from public.listing_performance
  where period_start = period_end
), bounds as (
  select min(period_end) as min_date, max(period_end) as max_date
  from daily_source
), daily as (
  select
    period_end as date,
    coalesce(sum(visits), 0)::bigint as visits,
    coalesce(sum(sales_count), 0)::bigint as sales,
    coalesce(sum(units_sold), 0)::bigint as units,
    coalesce(sum(gross_sales), 0)::numeric as gross_sales,
    count(*)::bigint as listings
  from daily_source
  group by period_end
  order by period_end
), dates as (
  select
    bounds.*,
    bounds.max_date - 6 as last7_start,
    bounds.max_date - 13 as previous7_start,
    bounds.max_date - 7 as previous7_end,
    (select count(*) from daily where date between bounds.max_date - 6 and bounds.max_date) as last7_days,
    (select count(*) from daily where date between bounds.max_date - 13 and bounds.max_date - 7) as previous7_days
  from bounds
), latest as (
  select coalesce(jsonb_build_object(
    'date', daily.date,
    'visits', daily.visits,
    'sales', daily.sales,
    'units', daily.units,
    'grossSales', daily.gross_sales,
    'conversion', case when daily.visits > 0 then daily.sales::numeric / daily.visits else 0 end,
    'listings', daily.listings
  ), '{}'::jsonb) as value
  from dates
  left join daily on daily.date = dates.max_date
), previous as (
  select coalesce(jsonb_build_object(
    'date', daily.date,
    'visits', daily.visits,
    'sales', daily.sales,
    'units', daily.units,
    'grossSales', daily.gross_sales,
    'conversion', case when daily.visits > 0 then daily.sales::numeric / daily.visits else 0 end,
    'listings', daily.listings
  ), '{}'::jsonb) as value
  from dates
  left join daily on daily.date = dates.max_date - 1
), period_metrics as (
  select jsonb_build_object(
    'last7', case when dates.last7_days = 7 then (
      select jsonb_build_object(
        'start', dates.last7_start,
        'end', dates.max_date,
        'visits', coalesce(sum(visits), 0),
        'sales', coalesce(sum(sales_count), 0),
        'units', coalesce(sum(units_sold), 0),
        'grossSales', coalesce(sum(gross_sales), 0),
        'conversion', case when coalesce(sum(visits), 0) > 0
          then coalesce(sum(sales_count), 0)::numeric / sum(visits)
          else 0 end
      ) from daily_source where period_end between dates.last7_start and dates.max_date
    ) else null end,
    'previous7', case when dates.previous7_days = 7 then (
      select jsonb_build_object(
        'start', dates.previous7_start,
        'end', dates.previous7_end,
        'visits', coalesce(sum(visits), 0),
        'sales', coalesce(sum(sales_count), 0),
        'units', coalesce(sum(units_sold), 0),
        'grossSales', coalesce(sum(gross_sales), 0),
        'conversion', case when coalesce(sum(visits), 0) > 0
          then coalesce(sum(sales_count), 0)::numeric / sum(visits)
          else 0 end
      ) from daily_source where period_end between dates.previous7_start and dates.previous7_end
    ) else null end
  ) as value
  from dates
), listing7 as (
  select
    performance.mlb_raw,
    coalesce(max(listings.title), max(performance.mlb_raw)) as title,
    max(performance.sku_raw) as sku,
    sum(coalesce(performance.visits, 0))::bigint as visits,
    sum(coalesce(performance.sales_count, 0))::bigint as sales,
    sum(coalesce(performance.units_sold, 0))::bigint as units,
    sum(coalesce(performance.gross_sales, 0))::numeric as gross_sales,
    case when sum(coalesce(performance.visits, 0)) > 0
      then sum(coalesce(performance.sales_count, 0))::numeric / sum(performance.visits)
      else 0 end as conversion
  from daily_source performance
  cross join dates
  left join public.listings listings on listings.id = performance.listing_id
  where performance.period_end between dates.last7_start and dates.max_date
  group by performance.mlb_raw
), totals7 as (
  select
    coalesce(sum(visits), 0)::numeric as visits,
    coalesce(sum(sales), 0)::numeric as sales,
    case when coalesce(sum(visits), 0) > 0 then sum(sales)::numeric / sum(visits) else 0 end as conversion
  from listing7
), top_visits as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'mlb', ranked.mlb_raw,
    'sku', ranked.sku,
    'title', ranked.title,
    'visits', ranked.visits,
    'sales', ranked.sales,
    'units', ranked.units,
    'grossSales', ranked.gross_sales,
    'conversion', ranked.conversion
  ) order by ranked.visits desc), '[]'::jsonb) as value
  from (select * from listing7 order by visits desc, sales desc limit 20) ranked
), low_conversion as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'mlb', ranked.mlb_raw,
    'sku', ranked.sku,
    'title', ranked.title,
    'visits', ranked.visits,
    'sales', ranked.sales,
    'units', ranked.units,
    'grossSales', ranked.gross_sales,
    'conversion', ranked.conversion
  ) order by ranked.visits desc), '[]'::jsonb) as value
  from (
    select listing7.*
    from listing7, totals7
    where listing7.visits > 0
      and listing7.conversion < totals7.conversion
    order by listing7.visits desc, listing7.conversion asc
    limit 20
  ) ranked
), visits_without_sales as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'mlb', ranked.mlb_raw,
    'sku', ranked.sku,
    'title', ranked.title,
    'visits', ranked.visits,
    'sales', ranked.sales,
    'units', ranked.units,
    'grossSales', ranked.gross_sales,
    'conversion', ranked.conversion
  ) order by ranked.visits desc), '[]'::jsonb) as value
  from (
    select * from listing7
    where visits > 0 and sales = 0
    order by visits desc
    limit 20
  ) ranked
), quality as (
  select jsonb_build_object(
    'active', count(*) filter (where normalize_status = 'ativa'),
    'inactive', count(*) filter (where normalize_status <> 'ativa'),
    'basicQuality', count(*) filter (where lower(coalesce(ad_quality, '')) = 'básica'),
    'notCalculatedQuality', count(*) filter (where lower(coalesce(ad_quality, '')) = 'sem calcular'),
    'goodExperience', count(*) filter (where lower(coalesce(purchase_experience, '')) = 'boa'),
    'badExperience', count(*) filter (where lower(coalesce(purchase_experience, '')) not in ('', 'boa'))
  ) as value
  from (
    select *, lower(coalesce(status_current, '')) as normalize_status
    from daily_source, dates
    where period_end = dates.max_date
  ) latest_rows
)
select jsonb_build_object(
  'coverage', jsonb_build_object('minDate', dates.min_date, 'maxDate', dates.max_date),
  'latestDay', latest.value,
  'previousDay', previous.value,
  'periods', period_metrics.value,
  'daily', coalesce((select jsonb_agg(jsonb_build_object(
    'date', date,
    'visits', visits,
    'sales', sales,
    'units', units,
    'grossSales', gross_sales,
    'conversion', case when visits > 0 then sales::numeric / visits else 0 end,
    'listings', listings
  ) order by date) from daily), '[]'::jsonb),
  'topVisits', top_visits.value,
  'lowConversion', low_conversion.value,
  'visitsWithoutSales', visits_without_sales.value,
  'quality', quality.value
)
from dates, latest, previous, period_metrics, top_visits, low_conversion, visits_without_sales, quality;
$$;

revoke all on function public.get_performance_dashboard_data() from public;
grant execute on function public.get_performance_dashboard_data() to authenticated;
