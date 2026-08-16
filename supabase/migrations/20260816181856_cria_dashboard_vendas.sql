create or replace function public.get_sales_dashboard_data()
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
with effective_coverage as (
  select
    coverage_date,
    case
      when bool_or(coverage_status = 'complete') then 'complete'
      when bool_or(coverage_status = 'partial') then 'partial'
      else 'unknown'
    end as coverage_status
  from public.sales_import_coverage
  group by coverage_date
), bounds as (
  select
    min(coverage_date) filter (where coverage_status = 'complete') as min_complete_date,
    max(coverage_date) filter (where coverage_status = 'complete') as max_complete_date,
    max(coverage_date) as max_covered_date
  from effective_coverage
), sale_rows as (
  select
    sales.*,
    (sales.sale_date at time zone 'America/Sao_Paulo')::date as business_date,
    (
      sales.record_type = 'sale_item'
      and (sales.sale_status is null or sales.sale_status not in (
        'Cancelada pelo comprador',
        'Venda cancelada. Não envie.',
        'Pacote cancelado pelo Mercado Livre'
      ))
      and coalesce(sales.cancellations_refunds, 0) >= 0
    ) as is_valid,
    coalesce(
      sales.gross_amount,
      sales.product_revenue,
      case
        when sales.unit_price is not null and sales.quantity is not null
          then sales.unit_price * sales.quantity
      end,
      0
    )::numeric as revenue_value
  from public.sales
), daily_agg as (
  select
    business_date,
    coalesce(sum(quantity) filter (where is_valid), 0)::bigint as units,
    count(distinct sale_number) filter (where is_valid)::bigint as orders,
    coalesce(sum(revenue_value) filter (where is_valid), 0)::numeric as revenue,
    count(distinct sale_number) filter (
      where record_type = 'sale_item' and not is_valid
    )::bigint as cancelled_orders
  from sale_rows
  group by business_date
), daily as (
  select
    coverage.coverage_date as date,
    coverage.coverage_status,
    coalesce(daily_agg.units, 0) as units,
    coalesce(daily_agg.orders, 0) as orders,
    coalesce(daily_agg.revenue, 0) as revenue,
    coalesce(daily_agg.cancelled_orders, 0) as cancelled_orders
  from effective_coverage as coverage
  left join daily_agg on daily_agg.business_date = coverage.coverage_date
  cross join bounds
  where coverage.coverage_date >= greatest(
    coalesce(bounds.min_complete_date, coverage.coverage_date),
    coalesce(bounds.max_complete_date - 44, coverage.coverage_date)
  )
  order by coverage.coverage_date
), latest_dates as (
  select
    bounds.*,
    (
      select max(coverage_date)
      from effective_coverage
      where coverage_status = 'complete'
        and coverage_date < bounds.max_complete_date
    ) as previous_complete_date,
    case
      when exists (
        select 1 from effective_coverage
        where coverage_status = 'complete'
          and coverage_date = bounds.max_complete_date - 7
      ) then bounds.max_complete_date - 7
      else null
    end as same_weekday_previous_week
  from bounds
), latest_metrics as (
  select coalesce(jsonb_build_object(
    'date', d.date,
    'units', d.units,
    'orders', d.orders,
    'revenue', d.revenue,
    'ticket', case when d.orders > 0 then d.revenue / d.orders else 0 end,
    'cancelledOrders', d.cancelled_orders
  ), '{}'::jsonb) as value
  from latest_dates
  left join daily d on d.date = latest_dates.max_complete_date
), previous_metrics as (
  select coalesce(jsonb_build_object(
    'date', d.date,
    'units', d.units,
    'orders', d.orders,
    'revenue', d.revenue,
    'ticket', case when d.orders > 0 then d.revenue / d.orders else 0 end,
    'cancelledOrders', d.cancelled_orders
  ), '{}'::jsonb) as value
  from latest_dates
  left join daily d on d.date = latest_dates.previous_complete_date
), weekday_metrics as (
  select coalesce(jsonb_build_object(
    'date', d.date,
    'units', d.units,
    'orders', d.orders,
    'revenue', d.revenue,
    'ticket', case when d.orders > 0 then d.revenue / d.orders else 0 end,
    'cancelledOrders', d.cancelled_orders
  ), '{}'::jsonb) as value
  from latest_dates
  left join daily d on d.date = latest_dates.same_weekday_previous_week
), period_defs as (
  select
    max_complete_date,
    max_complete_date - 6 as last7_start,
    max_complete_date - 13 as previous7_start,
    max_complete_date - 7 as previous7_end,
    date_trunc('month', max_complete_date)::date as month_start,
    (date_trunc('month', max_complete_date) - interval '1 month')::date as previous_month_start,
    least(
      (date_trunc('month', max_complete_date) - interval '1 month')::date
        + (max_complete_date - date_trunc('month', max_complete_date)::date),
      (date_trunc('month', max_complete_date)::date - 1)
    )::date as previous_month_end
  from bounds
), period_stats as (
  select
    defs.*,
    (select count(*) from effective_coverage where coverage_status='complete' and coverage_date between defs.last7_start and defs.max_complete_date) as last7_complete_days,
    (select count(*) from effective_coverage where coverage_status='complete' and coverage_date between defs.previous7_start and defs.previous7_end) as previous7_complete_days,
    (select count(*) from effective_coverage where coverage_status='complete' and coverage_date between defs.month_start and defs.max_complete_date) as month_complete_days,
    (select count(*) from effective_coverage where coverage_status='complete' and coverage_date between defs.previous_month_start and defs.previous_month_end) as previous_month_complete_days
  from period_defs defs
), period_metrics as (
  select jsonb_build_object(
    'last7', case when stats.last7_complete_days = 7 then (
      select jsonb_build_object(
        'start', stats.last7_start,
        'end', stats.max_complete_date,
        'units', coalesce(sum(quantity) filter (where is_valid), 0),
        'orders', count(distinct sale_number) filter (where is_valid),
        'revenue', coalesce(sum(revenue_value) filter (where is_valid), 0),
        'days', 7
      ) from sale_rows where business_date between stats.last7_start and stats.max_complete_date
    ) else null end,
    'previous7', case when stats.previous7_complete_days = 7 then (
      select jsonb_build_object(
        'start', stats.previous7_start,
        'end', stats.previous7_end,
        'units', coalesce(sum(quantity) filter (where is_valid), 0),
        'orders', count(distinct sale_number) filter (where is_valid),
        'revenue', coalesce(sum(revenue_value) filter (where is_valid), 0),
        'days', 7
      ) from sale_rows where business_date between stats.previous7_start and stats.previous7_end
    ) else null end,
    'monthToDate', case when stats.month_complete_days = (stats.max_complete_date - stats.month_start + 1) then (
      select jsonb_build_object(
        'start', stats.month_start,
        'end', stats.max_complete_date,
        'units', coalesce(sum(quantity) filter (where is_valid), 0),
        'orders', count(distinct sale_number) filter (where is_valid),
        'revenue', coalesce(sum(revenue_value) filter (where is_valid), 0),
        'days', stats.month_complete_days
      ) from sale_rows where business_date between stats.month_start and stats.max_complete_date
    ) else null end,
    'previousMonthToDate', case when stats.previous_month_complete_days = (stats.previous_month_end - stats.previous_month_start + 1) then (
      select jsonb_build_object(
        'start', stats.previous_month_start,
        'end', stats.previous_month_end,
        'units', coalesce(sum(quantity) filter (where is_valid), 0),
        'orders', count(distinct sale_number) filter (where is_valid),
        'revenue', coalesce(sum(revenue_value) filter (where is_valid), 0),
        'days', stats.previous_month_complete_days
      ) from sale_rows where business_date between stats.previous_month_start and stats.previous_month_end
    ) else null end
  ) as value
  from period_stats stats
), top_skus as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'sku', ranked.sku,
    'productName', ranked.product_name,
    'units', ranked.units,
    'orders', ranked.orders,
    'revenue', ranked.revenue
  ) order by ranked.units desc, ranked.revenue desc), '[]'::jsonb) as value
  from (
    select
      coalesce(sales.sku_raw, 'SEM SKU') as sku,
      max(products.name) as product_name,
      sum(sales.quantity)::bigint as units,
      count(distinct sales.sale_number)::bigint as orders,
      sum(sales.revenue_value)::numeric as revenue
    from sale_rows sales
    join effective_coverage coverage
      on coverage.coverage_date = sales.business_date
     and coverage.coverage_status = 'complete'
    cross join bounds
    left join public.products products on products.id = sales.product_id
    where sales.is_valid
      and sales.business_date between bounds.max_complete_date - 29 and bounds.max_complete_date
    group by coalesce(sales.sku_raw, 'SEM SKU')
    order by units desc, revenue desc
    limit 20
  ) ranked
), hourly as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'hour', ranked.hour,
    'units', ranked.units,
    'orders', ranked.orders
  ) order by ranked.hour), '[]'::jsonb) as value
  from (
    select
      extract(hour from sales.sale_date at time zone 'America/Sao_Paulo')::integer as hour,
      sum(sales.quantity)::bigint as units,
      count(distinct sales.sale_number)::bigint as orders
    from sale_rows sales
    join effective_coverage coverage
      on coverage.coverage_date = sales.business_date
     and coverage.coverage_status = 'complete'
    cross join bounds
    where sales.is_valid
      and sales.business_date between bounds.max_complete_date - 29 and bounds.max_complete_date
    group by 1
  ) ranked
), weekdays as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'weekday', ranked.weekday,
    'units', ranked.units,
    'orders', ranked.orders,
    'daysObserved', ranked.days_observed,
    'averageUnitsPerDay', case when ranked.days_observed > 0 then ranked.units::numeric / ranked.days_observed else 0 end
  ) order by ranked.weekday), '[]'::jsonb) as value
  from (
    select
      extract(isodow from coverage.coverage_date)::integer as weekday,
      coalesce(sum(sales.quantity) filter (where sales.is_valid), 0)::bigint as units,
      count(distinct sales.sale_number) filter (where sales.is_valid)::bigint as orders,
      count(distinct coverage.coverage_date)::bigint as days_observed
    from effective_coverage coverage
    cross join bounds
    left join sale_rows sales on sales.business_date = coverage.coverage_date
    where coverage.coverage_status = 'complete'
      and coverage.coverage_date between bounds.max_complete_date - 29 and bounds.max_complete_date
    group by 1
  ) ranked
)
select jsonb_build_object(
  'coverage', jsonb_build_object(
    'minCompleteDate', latest_dates.min_complete_date,
    'maxCompleteDate', latest_dates.max_complete_date,
    'maxCoveredDate', latest_dates.max_covered_date,
    'previousCompleteDate', latest_dates.previous_complete_date,
    'sameWeekdayPreviousWeek', latest_dates.same_weekday_previous_week
  ),
  'latestDay', latest_metrics.value,
  'previousDay', previous_metrics.value,
  'sameWeekdayPreviousWeek', weekday_metrics.value,
  'periods', period_metrics.value,
  'daily', coalesce((select jsonb_agg(jsonb_build_object(
    'date', daily.date,
    'coverageStatus', daily.coverage_status,
    'units', daily.units,
    'orders', daily.orders,
    'revenue', daily.revenue,
    'ticket', case when daily.orders > 0 then daily.revenue / daily.orders else 0 end,
    'cancelledOrders', daily.cancelled_orders
  ) order by daily.date) from daily), '[]'::jsonb),
  'topSkus', top_skus.value,
  'hourly', hourly.value,
  'weekdays', weekdays.value
)
from latest_dates, latest_metrics, previous_metrics, weekday_metrics, period_metrics, top_skus, hourly, weekdays;
$$;

revoke all on function public.get_sales_dashboard_data() from public;
grant execute on function public.get_sales_dashboard_data() to authenticated;
