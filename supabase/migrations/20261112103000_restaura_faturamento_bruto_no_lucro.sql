-- Mantém o faturamento como venda bruta e usa o Total (BRL) somente para
-- calcular o lucro líquido. Assim, a métrica Faturamento continua batendo
-- com o Mercado Livre e cupons não detalhados reduzem corretamente o lucro.

create or replace function public.get_profit_by_product(p_start date, p_end date)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
with active as (
  select public.get_active_marketplace_account_id() as account_id
),
package_net_amount as (
  select
    child.id as item_id,
    parent.net_amount
      * coalesce(child.product_revenue, child.gross_amount, child.unit_price * child.quantity, 0)
      / nullif(
        sum(coalesce(child.product_revenue, child.gross_amount, child.unit_price * child.quantity, 0))
          over (partition by parent.id),
        0
      ) as allocated_net_amount
  from public.sales parent
  join public.sales child
    on child.account_id = parent.account_id
   and child.package_parent_sale_number = parent.sale_number
   and child.record_type = 'sale_item'
  where parent.record_type = 'package_summary'
    and parent.net_amount is not null
),
complete_days as (
  select distinct c.coverage_date
  from public.sales_import_coverage c
  cross join active a
  where c.account_id = a.account_id
    and c.coverage_status = 'complete'
    and c.coverage_date between p_start and p_end
),
sales_data as (
  select
    s.product_id,
    max(p.sku) as sku,
    max(p.name) as name,
    sum(s.quantity) as units,
    sum(coalesce(s.product_revenue, s.gross_amount, s.unit_price * s.quantity, 0)) as revenue,
    sum(
      coalesce(
        package_net_amount.allocated_net_amount,
        s.net_amount,
        coalesce(s.product_revenue, s.gross_amount, s.unit_price * s.quantity, 0)
          - abs(coalesce(s.sale_fee_tax, s.fees, 0))
          - abs(coalesce(s.installment_fee, 0))
          - greatest(0, abs(coalesce(s.shipping_fee, 0)) - greatest(coalesce(s.shipping_revenue, 0), 0))
          - abs(coalesce(s.exchange_shipping_cost, 0))
          - abs(coalesce(s.declared_dimensions_shipping_cost, 0))
          - abs(coalesce(s.dimensions_difference_cost, 0))
          - abs(coalesce(s.discounts_bonuses, 0))
          - abs(coalesce(s.cancellations_refunds, 0))
      )
    ) as net_received,
    sum(abs(coalesce(s.sale_fee_tax, s.fees, 0)) + abs(coalesce(s.installment_fee, 0))) as fees,
    sum(
      greatest(0, abs(coalesce(s.shipping_fee, 0)) - greatest(coalesce(s.shipping_revenue, 0), 0))
      + abs(coalesce(s.exchange_shipping_cost, 0))
      + abs(coalesce(s.declared_dimensions_shipping_cost, 0))
      + abs(coalesce(s.dimensions_difference_cost, 0))
    ) as shipping_costs,
    sum(abs(coalesce(s.discounts_bonuses, 0)) + abs(coalesce(s.cancellations_refunds, 0))) as adjustments,
    sum(
      abs(coalesce(s.sale_fee_tax, s.fees, 0))
      + abs(coalesce(s.installment_fee, 0))
      + greatest(0, abs(coalesce(s.shipping_fee, 0)) - greatest(coalesce(s.shipping_revenue, 0), 0))
      + abs(coalesce(s.exchange_shipping_cost, 0))
      + abs(coalesce(s.declared_dimensions_shipping_cost, 0))
      + abs(coalesce(s.dimensions_difference_cost, 0))
      + abs(coalesce(s.discounts_bonuses, 0))
      + abs(coalesce(s.cancellations_refunds, 0))
    ) as operational_costs,
    sum(s.quantity * coalesce(pc.unit_cost, 0)) as product_costs
  from public.sales s
  cross join active a
  join complete_days d on d.coverage_date = (s.sale_date at time zone 'America/Sao_Paulo')::date
  left join public.products p on p.id = s.product_id
  left join package_net_amount on package_net_amount.item_id = s.id
  left join public.product_costs pc on pc.product_id = s.product_id and pc.account_id = s.account_id
  where s.account_id = a.account_id
    and s.record_type = 'sale_item'
    and not coalesce(s.cancelled, false)
  group by s.product_id
),
ads as (
  select m.product_id, sum(m.investment) as investment
  from public.ad_metrics m
  cross join active a
  where m.account_id = a.account_id
    and m.period_start = m.period_end
    and m.period_start between p_start and p_end
    and m.product_id is not null
  group by m.product_id
)
select coalesce(
  jsonb_agg(
    jsonb_build_object(
      'sku', coalesce(s.sku, 'Sem SKU'),
      'name', coalesce(s.name, 'Produto não vinculado'),
      'units', s.units,
      'revenue', s.revenue,
      'netReceived', s.net_received,
      'productCosts', s.product_costs,
      'fees', s.fees,
      'shippingCosts', s.shipping_costs,
      'adjustments', s.adjustments,
      'operationalCosts', s.operational_costs,
      'adsInvestment', coalesce(a.investment, 0),
      'afterAds', s.net_received - s.product_costs - coalesce(a.investment, 0)
    )
    order by (s.net_received - s.product_costs - coalesce(a.investment, 0)) asc
  ),
  '[]'::jsonb
)
from sales_data s
left join ads a on a.product_id = s.product_id;
$function$;

create or replace function public.get_profit_dashboard_data(p_start date, p_end date)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
with active as (
  select public.get_active_marketplace_account_id() as account_id
),
product_rows as (
  select jsonb_array_elements(public.get_profit_by_product(p_start, p_end)) as row
),
sales_summary as (
  select
    coalesce(sum((row ->> 'revenue')::numeric), 0) as revenue,
    coalesce(sum((row ->> 'netReceived')::numeric), 0) as net_received,
    coalesce(sum((row ->> 'units')::numeric), 0) as units,
    coalesce(sum((row ->> 'operationalCosts')::numeric), 0) as operational_costs,
    coalesce(sum((row ->> 'productCosts')::numeric), 0) as product_costs
  from product_rows
),
orders as (
  select count(distinct s.sale_number) as count
  from public.sales s
  cross join active a
  join public.sales_import_coverage c
    on c.account_id = a.account_id
   and c.coverage_status = 'complete'
   and c.coverage_date = (s.sale_date at time zone 'America/Sao_Paulo')::date
  where s.account_id = a.account_id
    and s.record_type = 'sale_item'
    and not coalesce(s.cancelled, false)
    and (s.sale_date at time zone 'America/Sao_Paulo')::date between p_start and p_end
),
ads as (
  select coalesce(sum(m.investment), 0) as investment
  from public.ad_metrics m
  cross join active a
  where m.account_id = a.account_id
    and m.period_start = m.period_end
    and m.period_start between p_start and p_end
)
select jsonb_build_object(
  'start', p_start,
  'end', p_end,
  'revenue', sales_summary.revenue,
  'netReceived', sales_summary.net_received,
  'units', sales_summary.units,
  'orders', orders.count,
  'operationalCosts', sales_summary.operational_costs,
  'productCosts', sales_summary.product_costs,
  'contribution', sales_summary.net_received - sales_summary.product_costs,
  'adsInvestment', ads.investment,
  'afterAds', sales_summary.net_received - sales_summary.product_costs - ads.investment,
  'costCoverage', case when sales_summary.units = 0 then 0 else round(sales_summary.product_costs / nullif(sales_summary.units, 0), 2) end
)
from sales_summary
cross join orders
cross join ads;
$function$;
