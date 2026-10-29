create or replace function public.get_abc_curve_dashboard_data(p_start date default null, p_end date default null)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
with active as (
  select public.get_active_marketplace_account_id() as account_id
),
latest as (
  select max(lp.period_end) as last_day
  from public.listing_performance lp
  cross join active a
  where lp.account_id = a.account_id
    and lp.period_start = lp.period_end
),
period_seed as (
  select
    coalesce(p_start, date_trunc('month', last_day)::date) as current_start,
    coalesce(p_end, last_day) as current_end
  from latest
),
periods as (
  select
    current_start,
    current_end,
    (current_start - (current_end - current_start + 1))::date as previous_start,
    (current_start - 1)::date as previous_end
  from period_seed
),
excluded as (
  select
    coalesce(array_agg(l.id), array[]::uuid[]) as listing_ids,
    coalesce(array_agg(l.mlb) filter (where l.mlb is not null), array[]::text[]) as mlbs
  from public.listings l
  cross join active a
  where l.account_id = a.account_id
    and lower(coalesce(l.status, '')) in ('excluído', 'excluido', 'deleted')
),
base as (
  select
    case
      when nullif(trim(lp.sku_raw), '') is not null then 'sku:' || trim(lp.sku_raw) || ':mlb:' || coalesce(nullif(trim(lp.mlb_raw), ''), 'sem-mlb')
      when nullif(trim(lp.mlb_raw), '') is not null then 'mlb:' || trim(lp.mlb_raw)
      when lp.product_id is not null then 'product:' || lp.product_id::text
      else 'sem-id'
    end as product_key,
    max(nullif(trim(lp.sku_raw), '')) as sku,
    max(nullif(trim(lp.mlb_raw), '')) as mlb,
    coalesce(max(p.name), max(l.title), max(nullif(trim(lp.sku_raw), '')), max(nullif(trim(lp.mlb_raw), '')), 'Produto sem vínculo') as product_name,
    sum(coalesce(lp.visits, 0)) filter (where lp.period_end between pr.current_start and pr.current_end)::bigint as current_visits,
    sum(coalesce(lp.sales_count, 0)) filter (where lp.period_end between pr.current_start and pr.current_end)::bigint as current_sales,
    sum(coalesce(lp.units_sold, 0)) filter (where lp.period_end between pr.current_start and pr.current_end)::bigint as current_units,
    sum(coalesce(lp.gross_sales, 0)) filter (where lp.period_end between pr.current_start and pr.current_end)::numeric as current_revenue,
    sum(coalesce(lp.visits, 0)) filter (where lp.period_end between pr.previous_start and pr.previous_end)::bigint as previous_visits,
    sum(coalesce(lp.sales_count, 0)) filter (where lp.period_end between pr.previous_start and pr.previous_end)::bigint as previous_sales,
    sum(coalesce(lp.gross_sales, 0)) filter (where lp.period_end between pr.previous_start and pr.previous_end)::numeric as previous_revenue
  from public.listing_performance lp
  cross join active a
  cross join periods pr
  cross join excluded e
  left join public.products p on p.id = lp.product_id
  left join public.listings l on l.id = lp.listing_id
  where lp.account_id = a.account_id
    and lp.period_start = lp.period_end
    and pr.current_start is not null
    and lp.period_end between pr.previous_start and pr.current_end
    and (lp.listing_id is null or lp.listing_id <> all(e.listing_ids))
    and (nullif(trim(lp.mlb_raw), '') is null or trim(lp.mlb_raw) <> all(e.mlbs))
  group by 1
),
ranked_current as (
  select b.*,
    coalesce(sum(current_revenue) over (), 0) as total_current,
    coalesce(sum(current_revenue) over (order by current_revenue desc, product_key rows between unbounded preceding and current row), 0) as cumulative_current
  from base b
),
ranked_previous as (
  select product_key,
    coalesce(sum(previous_revenue) over (), 0) as total_previous,
    coalesce(sum(previous_revenue) over (order by previous_revenue desc, product_key rows between unbounded preceding and current row), 0) as cumulative_previous
  from base
),
rows as (
  select c.*,
    case
      when current_revenue <= 0 or total_current <= 0 then 'E'
      when cumulative_current / total_current <= .8 then 'A'
      when cumulative_current / total_current <= .9 then 'B'
      when cumulative_current / total_current <= .95 then 'C'
      when cumulative_current / total_current <= .98 then 'D'
      else 'E'
    end as current_curve,
    case
      when p.total_previous <= 0 or c.previous_revenue <= 0 then null
      when p.cumulative_previous / p.total_previous <= .8 then 'A'
      when p.cumulative_previous / p.total_previous <= .9 then 'B'
      when p.cumulative_previous / p.total_previous <= .95 then 'C'
      when p.cumulative_previous / p.total_previous <= .98 then 'D'
      else 'E'
    end as previous_curve
  from ranked_current c
  left join ranked_previous p using (product_key)
),
final_rows as (
  select *,
    case current_curve when 'A' then 1 when 'B' then 2 when 'C' then 3 when 'D' then 4 else 5 end as current_rank,
    case previous_curve when 'A' then 1 when 'B' then 2 when 'C' then 3 when 'D' then 4 else 5 end as previous_rank
  from rows
)
select jsonb_build_object(
  'currentMonth', periods.current_start,
  'previousMonth', periods.previous_start,
  'period', jsonb_build_object('start', periods.current_start, 'end', periods.current_end, 'previousStart', periods.previous_start, 'previousEnd', periods.previous_end),
  'hasPreviousMonth', exists (select 1 from final_rows where previous_curve is not null),
  'summary', jsonb_build_object(
    'products', (select count(*) from final_rows),
    'dropped', (select count(*) from final_rows where previous_curve is not null and current_rank > previous_rank),
    'improved', (select count(*) from final_rows where previous_curve is not null and current_rank < previous_rank),
    'stable', (select count(*) from final_rows where previous_curve is not null and current_rank = previous_rank)
  ),
  'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
      'sku', sku, 'mlb', mlb, 'productName', product_name,
      'currentCurve', current_curve, 'previousCurve', previous_curve,
      'movement', case when previous_curve is null then 'novo' when current_rank > previous_rank then 'caiu' when current_rank < previous_rank then 'subiu' else 'manteve' end,
      'currentVisits', coalesce(current_visits, 0), 'currentSales', coalesce(current_sales, 0),
      'currentUnits', coalesce(current_units, 0), 'currentRevenue', coalesce(current_revenue, 0),
      'currentConversion', case when coalesce(current_visits, 0) > 0 then current_sales::numeric / current_visits else 0 end,
      'previousVisits', coalesce(previous_visits, 0), 'previousSales', coalesce(previous_sales, 0),
      'previousConversion', case when coalesce(previous_visits, 0) > 0 then previous_sales::numeric / previous_visits else 0 end
    ) order by current_revenue desc)
    from final_rows
  ), '[]'::jsonb)
)
from periods;
$function$;