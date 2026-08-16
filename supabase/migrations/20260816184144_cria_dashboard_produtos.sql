create or replace function public.get_products_dashboard_data()
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
    max(coverage_date) filter (where coverage_status = 'complete') as max_complete_date,
    count(*) filter (
      where coverage_status = 'complete'
        and coverage_date between
          (select max(coverage_date) filter (where coverage_status = 'complete') from effective_coverage) - 6
          and (select max(coverage_date) filter (where coverage_status = 'complete') from effective_coverage)
    ) as current7_days,
    count(*) filter (
      where coverage_status = 'complete'
        and coverage_date between
          (select max(coverage_date) filter (where coverage_status = 'complete') from effective_coverage) - 13
          and (select max(coverage_date) filter (where coverage_status = 'complete') from effective_coverage) - 7
    ) as previous7_days,
    count(*) filter (
      where coverage_status = 'complete'
        and coverage_date between
          (select max(coverage_date) filter (where coverage_status = 'complete') from effective_coverage) - 29
          and (select max(coverage_date) filter (where coverage_status = 'complete') from effective_coverage)
    ) as available30_days
  from effective_coverage
), valid_sales as (
  select
    sales.product_id,
    sales.quantity,
    coalesce(
      sales.gross_amount,
      sales.product_revenue,
      case when sales.unit_price is not null and sales.quantity is not null
        then sales.unit_price * sales.quantity end,
      0
    )::numeric as revenue,
    (sales.sale_date at time zone 'America/Sao_Paulo')::date as business_date
  from public.sales
  join effective_coverage coverage
    on coverage.coverage_date = (sales.sale_date at time zone 'America/Sao_Paulo')::date
   and coverage.coverage_status = 'complete'
  where sales.record_type = 'sale_item'
    and (sales.sale_status is null or sales.sale_status not in (
      'Cancelada pelo comprador',
      'Venda cancelada. Não envie.',
      'Pacote cancelado pelo Mercado Livre'
    ))
    and coalesce(sales.cancellations_refunds, 0) >= 0
), sales_by_product as (
  select
    valid_sales.product_id,
    coalesce(sum(quantity) filter (
      where business_date between bounds.max_complete_date - 29 and bounds.max_complete_date
    ), 0)::bigint as units_period,
    coalesce(sum(revenue) filter (
      where business_date between bounds.max_complete_date - 29 and bounds.max_complete_date
    ), 0)::numeric as revenue_period,
    coalesce(sum(quantity) filter (
      where business_date between bounds.max_complete_date - 6 and bounds.max_complete_date
    ), 0)::bigint as units_current7,
    coalesce(sum(quantity) filter (
      where business_date between bounds.max_complete_date - 13 and bounds.max_complete_date - 7
    ), 0)::bigint as units_previous7,
    max(business_date) as last_sale_date
  from valid_sales
  cross join bounds
  group by valid_sales.product_id
), latest_full_date as (
  select max(snapshot_at) as snapshot_at
  from public.full_inventory_snapshots
), full_by_product as (
  select
    snapshots.product_id,
    sum(coalesce(snapshots.quantity_full, 0))::bigint as full_stock,
    sum(coalesce(snapshots.units_affect_stock_time, 0))::bigint as stock_time_affected
  from public.full_inventory_snapshots snapshots
  join latest_full_date latest on snapshots.snapshot_at = latest.snapshot_at
  group by snapshots.product_id
), listing_state as (
  select
    product_id,
    count(*)::bigint as listing_count,
    count(*) filter (where lower(coalesce(status, '')) = 'ativo')::bigint as active_listings,
    case
      when count(*) filter (where lower(coalesce(status, '')) = 'ativo') > 0 then 'Ativo'
      when count(*) > 0 then 'Inativo'
      else 'Sem anúncio'
    end as status
  from public.listings
  where product_id is not null
  group by product_id
), performance_bounds as (
  select max(period_end) filter (where period_start = period_end) as max_date
  from public.listing_performance
), performance_by_product as (
  select
    performance.product_id,
    sum(coalesce(performance.visits, 0))::bigint as visits,
    sum(coalesce(performance.sales_count, 0))::bigint as sales,
    case when sum(coalesce(performance.visits, 0)) > 0
      then sum(coalesce(performance.sales_count, 0))::numeric / sum(performance.visits)
      else null end as conversion
  from public.listing_performance performance
  cross join bounds
  where performance.period_start = performance.period_end
    and performance.product_id is not null
    and performance.period_end between bounds.max_complete_date - 6 and bounds.max_complete_date
  group by performance.product_id
), product_rows as (
  select
    products.id,
    products.sku,
    products.name,
    products.category,
    coalesce(listing_state.status, 'Sem anúncio') as status,
    coalesce(listing_state.listing_count, 0) as listing_count,
    coalesce(listing_state.active_listings, 0) as active_listings,
    coalesce(full_by_product.full_stock, 0) as full_stock,
    coalesce(full_by_product.stock_time_affected, 0) as stock_time_affected,
    coalesce(sales_by_product.units_period, 0) as units_period,
    coalesce(sales_by_product.revenue_period, 0) as revenue_period,
    case when bounds.current7_days = 7 then coalesce(sales_by_product.units_current7, 0) else null end as units_current7,
    case when bounds.previous7_days = 7 then coalesce(sales_by_product.units_previous7, 0) else null end as units_previous7,
    case
      when bounds.current7_days = 7 and bounds.previous7_days = 7
        and coalesce(sales_by_product.units_previous7, 0) > 0
      then (coalesce(sales_by_product.units_current7, 0) - sales_by_product.units_previous7)::numeric
        / sales_by_product.units_previous7
      else null
    end as trend7,
    sales_by_product.last_sale_date,
    case when sales_by_product.last_sale_date is not null
      then bounds.max_complete_date - sales_by_product.last_sale_date
      else null end as days_since_sale,
    performance_by_product.visits,
    performance_by_product.sales as performance_sales,
    performance_by_product.conversion
  from public.products products
  cross join bounds
  left join listing_state on listing_state.product_id = products.id
  left join full_by_product on full_by_product.product_id = products.id
  left join sales_by_product on sales_by_product.product_id = products.id
  left join performance_by_product on performance_by_product.product_id = products.id
)
select jsonb_build_object(
  'asOf', jsonb_build_object(
    'salesDate', bounds.max_complete_date,
    'salesDaysAvailable', bounds.available30_days,
    'fullSnapshotAt', latest_full_date.snapshot_at,
    'performanceDate', performance_bounds.max_date,
    'current7Complete', bounds.current7_days = 7,
    'previous7Complete', bounds.previous7_days = 7
  ),
  'summary', jsonb_build_object(
    'products', count(*),
    'activeProducts', count(*) filter (where status = 'Ativo'),
    'withFullStock', count(*) filter (where full_stock > 0),
    'stockTimeAffectedUnits', coalesce(sum(stock_time_affected), 0),
    'unitsPeriod', coalesce(sum(units_period), 0),
    'revenuePeriod', coalesce(sum(revenue_period), 0)
  ),
  'products', coalesce(jsonb_agg(jsonb_build_object(
    'sku', sku,
    'name', name,
    'category', category,
    'status', status,
    'listingCount', listing_count,
    'activeListings', active_listings,
    'fullStock', full_stock,
    'stockTimeAffected', stock_time_affected,
    'unitsPeriod', units_period,
    'revenuePeriod', revenue_period,
    'unitsCurrent7', units_current7,
    'unitsPrevious7', units_previous7,
    'trend7', trend7,
    'lastSaleDate', last_sale_date,
    'daysSinceSale', days_since_sale,
    'visits7', visits,
    'performanceSales7', performance_sales,
    'conversion7', conversion
  ) order by units_period desc, full_stock desc, sku), '[]'::jsonb)
)
from product_rows, bounds, latest_full_date, performance_bounds
cross join lateral (select 1) dummy
where true
group by bounds.max_complete_date, bounds.available30_days, bounds.current7_days, bounds.previous7_days,
  latest_full_date.snapshot_at, performance_bounds.max_date;
$$;

revoke all on function public.get_products_dashboard_data() from public;
grant execute on function public.get_products_dashboard_data() to authenticated;
