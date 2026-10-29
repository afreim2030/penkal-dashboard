create index if not exists listing_performance_account_single_day_period_idx
on public.listing_performance (account_id, period_end desc)
where period_start = period_end;

create or replace function public.get_product_period_comparison(p_window_days integer default 7)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
with active as (
  select public.get_active_marketplace_account_id() as account_id
),
bounds as (
  select max(lp.period_end) as as_of
  from public.listing_performance lp
  cross join active a
  where lp.account_id = a.account_id
    and lp.period_start = lp.period_end
    and p_window_days between 1 and 120
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
scoped as (
  select lp.*
  from public.listing_performance lp
  cross join active a
  cross join bounds b
  cross join excluded e
  where lp.account_id = a.account_id
    and lp.period_start = lp.period_end
    and p_window_days between 1 and 120
    and b.as_of is not null
    and lp.period_end > b.as_of - (p_window_days * 4 - 1)
    and (lp.listing_id is null or lp.listing_id <> all(e.listing_ids))
    and (nullif(trim(lp.mlb_raw), '') is null or trim(lp.mlb_raw) <> all(e.mlbs))
),
bucketed as (
  select
    case when lp.product_id is not null then lp.product_id::text
      when nullif(trim(lp.sku_raw), '') is not null then 'sku:' || trim(lp.sku_raw)
      else 'mlb:' || coalesce(lp.mlb_raw, 'sem-id') end as product_key,
    max(nullif(trim(lp.sku_raw), '')) as sku,
    max(nullif(trim(lp.mlb_raw), '')) as mlb,
    coalesce(max(p.name), max(l.title), max(nullif(trim(lp.sku_raw), '')), max(nullif(trim(lp.mlb_raw), '')), 'Produto sem vínculo') as product_name,
    (floor((b.as_of - lp.period_end)::numeric / p_window_days)::integer + 1) as bucket,
    sum(coalesce(lp.visits, 0))::bigint as visits,
    sum(coalesce(lp.sales_count, 0))::bigint as sales,
    sum(coalesce(lp.units_sold, 0))::bigint as units,
    sum(coalesce(lp.gross_sales, 0))::numeric as revenue
  from scoped lp
  cross join bounds b
  left join public.products p on p.id = lp.product_id
  left join public.listings l on l.id = lp.listing_id
  group by 1, (floor((b.as_of - lp.period_end)::numeric / p_window_days)::integer + 1)
),
ranked as (
  select b.*,
    sum(revenue) over (partition by bucket) as total_revenue,
    sum(revenue) over (partition by bucket order by revenue desc, product_key rows between unbounded preceding and current row) as cumulative_revenue
  from bucketed b
),
rows as (
  select product_key, max(sku) as sku, max(mlb) as mlb, max(product_name) as product_name,
    coalesce(jsonb_object_agg(bucket, jsonb_build_object(
      'visits', visits, 'sales', sales, 'units', units, 'revenue', revenue,
      'conversion', case when visits > 0 then sales::numeric / visits else 0 end,
      'curve', case when revenue <= 0 or total_revenue <= 0 then 'E'
        when cumulative_revenue / total_revenue <= 0.80 then 'A'
        when cumulative_revenue / total_revenue <= 0.90 then 'B'
        when cumulative_revenue / total_revenue <= 0.95 then 'C'
        when cumulative_revenue / total_revenue <= 0.98 then 'D' else 'E' end
    )), '{}'::jsonb) as periods
  from ranked
  where bucket between 1 and 4
  group by product_key
)
select jsonb_build_object(
  'asOf', bounds.as_of,
  'windowDays', p_window_days,
  'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
      'sku', sku, 'mlb', mlb, 'productName', product_name, 'periods', periods
    ) order by coalesce((periods->'1'->>'revenue')::numeric, 0) desc, product_name)
    from rows
  ), '[]'::jsonb)
)
from bounds;
$function$;