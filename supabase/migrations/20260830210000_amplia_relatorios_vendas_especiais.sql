create or replace function public.get_sales_time_reports()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
with effective_coverage as (
  select coverage_date
  from public.sales_import_coverage
  group by coverage_date
  having bool_or(coverage_status = 'complete')
), base as (
  select
    s.sale_number,
    p.sku,
    p.name,
    coalesce(s.quantity, 1)::int as quantity,
    coalesce(s.product_revenue, s.gross_amount, s.unit_price * s.quantity, 0)::numeric as revenue,
    extract(hour from s.sale_date at time zone 'America/Sao_Paulo')::int as hour,
    extract(isodow from s.sale_date at time zone 'America/Sao_Paulo')::int as weekday,
    (s.sale_date at time zone 'America/Sao_Paulo')::date as business_date
  from public.sales s
  join effective_coverage coverage
    on coverage.coverage_date = (s.sale_date at time zone 'America/Sao_Paulo')::date
  join public.products p on p.id = s.product_id
  where s.record_type = 'sale_item'
    and not coalesce(s.cancelled, false)
    and s.sale_date is not null
    and nullif(btrim(p.sku), '') is not null
    and (s.sale_status is null or s.sale_status not in (
      'Cancelada pelo comprador',
      'Venda cancelada. Não envie.',
      'Pacote cancelado pelo Mercado Livre'
    ))
), bounds as (
  select min(business_date) start_date, max(business_date) end_date, count(distinct business_date)::int days
  from base
), periods as (
  select case when hour >= 12 then '12:00–23:59' else '00:00–11:59' end period,
    count(distinct sale_number)::int orders, sum(quantity)::int units, sum(revenue)::numeric revenue
  from base group by 1
), hours as (
  select hour, count(distinct sale_number)::int orders, sum(quantity)::int units, sum(revenue)::numeric revenue
  from base group by hour order by units desc, hour limit 24
), weekdays as (
  select weekday, count(distinct sale_number)::int orders, sum(quantity)::int units, sum(revenue)::numeric revenue,
    count(distinct business_date)::int days_observed,
    sum(quantity)::numeric / nullif(count(distinct business_date), 0) as average_units
  from base group by weekday order by weekday
), product_groups as (
  select case when hour >= 12 then 'evening' else 'morning' end group_key, sku, max(name) name,
    count(distinct sale_number)::int orders, sum(quantity)::int units, sum(revenue)::numeric revenue
  from base group by 1, sku
  union all
  select case weekday when 6 then 'saturday' else 'sunday' end, sku, max(name),
    count(distinct sale_number)::int, sum(quantity)::int, sum(revenue)::numeric
  from base where weekday in (6, 7) group by 1, sku
), ranked_products as (
  select *, row_number() over (partition by group_key order by units desc, revenue desc, sku) rank
  from product_groups
), products_json as (
  select group_key, jsonb_agg(jsonb_build_object(
    'rank', rank, 'sku', sku, 'name', name, 'orders', orders, 'units', units, 'revenue', revenue
  ) order by rank) value
  from ranked_products where rank <= 100 group by group_key
)
select jsonb_build_object(
  'coverage', jsonb_build_object('start', bounds.start_date, 'end', bounds.end_date, 'days', bounds.days),
  'periods', coalesce((select jsonb_agg(to_jsonb(periods) order by period) from periods), '[]'::jsonb),
  'hours', coalesce((select jsonb_agg(to_jsonb(hours) order by units desc, hour) from hours), '[]'::jsonb),
  'weekdays', coalesce((select jsonb_agg(to_jsonb(weekdays) order by weekday) from weekdays), '[]'::jsonb),
  'products', jsonb_build_object(
    'morning', coalesce((select value from products_json where group_key = 'morning'), '[]'::jsonb),
    'evening', coalesce((select value from products_json where group_key = 'evening'), '[]'::jsonb),
    'saturday', coalesce((select value from products_json where group_key = 'saturday'), '[]'::jsonb),
    'sunday', coalesce((select value from products_json where group_key = 'sunday'), '[]'::jsonb)
  )
)
from bounds;
$$;

revoke all on function public.get_sales_time_reports() from public, anon;
grant execute on function public.get_sales_time_reports() to authenticated;
