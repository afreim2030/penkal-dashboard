-- Inclui os cupons/descontos não detalhados no detalhamento do lucro
-- e distribui custos de linhas-resumo de kits proporcionalmente entre os itens.

create or replace function public.get_profit_by_product(p_start date, p_end date)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
with active as (
  select public.get_active_marketplace_account_id() as account_id
),
package_values as (
  select
    child.id as item_id,
    (
      coalesce(child.product_revenue, child.gross_amount, child.unit_price * child.quantity, 0)
      / nullif(
        sum(coalesce(child.product_revenue, child.gross_amount, child.unit_price * child.quantity, 0))
          over (partition by parent.id),
        0
      )
    ) as item_share,
    parent.net_amount as parent_net_amount,
    abs(coalesce(parent.sale_fee_tax, parent.fees, 0)) + abs(coalesce(parent.installment_fee, 0)) as parent_fees,
    greatest(0, abs(coalesce(parent.shipping_fee, 0)) - greatest(coalesce(parent.shipping_revenue, 0), 0))
      + abs(coalesce(parent.exchange_shipping_cost, 0))
      + abs(coalesce(parent.declared_dimensions_shipping_cost, 0))
      + abs(coalesce(parent.dimensions_difference_cost, 0)) as parent_shipping,
    abs(coalesce(parent.discounts_bonuses, 0)) + abs(coalesce(parent.cancellations_refunds, 0)) as parent_adjustments
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
items as (
  select
    s.product_id,
    s.quantity,
    coalesce(s.product_revenue, s.gross_amount, s.unit_price * s.quantity, 0) as gross_revenue,
    coalesce(
      package_values.parent_net_amount * package_values.item_share,
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
    ) as net_received,
    abs(coalesce(s.sale_fee_tax, s.fees, 0))
      + abs(coalesce(s.installment_fee, 0))
      + coalesce(package_values.parent_fees * package_values.item_share, 0) as fees,
    greatest(0, abs(coalesce(s.shipping_fee, 0)) - greatest(coalesce(s.shipping_revenue, 0), 0))
      + abs(coalesce(s.exchange_shipping_cost, 0))
      + abs(coalesce(s.declared_dimensions_shipping_cost, 0))
      + abs(coalesce(s.dimensions_difference_cost, 0))
      + coalesce(package_values.parent_shipping * package_values.item_share, 0) as shipping_costs,
    abs(coalesce(s.discounts_bonuses, 0))
      + abs(coalesce(s.cancellations_refunds, 0))
      + coalesce(package_values.parent_adjustments * package_values.item_share, 0) as adjustments,
    coalesce(pc.unit_cost, 0) * s.quantity as product_costs
  from public.sales s
  cross join active a
  join complete_days d on d.coverage_date = (s.sale_date at time zone 'America/Sao_Paulo')::date
  left join package_values on package_values.item_id = s.id
  left join public.product_costs pc on pc.product_id = s.product_id and pc.account_id = s.account_id
  where s.account_id = a.account_id
    and s.record_type = 'sale_item'
    and not coalesce(s.cancelled, false)
),
sales_data as (
  select
    i.product_id,
    max(p.sku) as sku,
    max(p.name) as name,
    sum(i.quantity) as units,
    sum(i.gross_revenue) as revenue,
    sum(i.net_received) as net_received,
    sum(i.product_costs) as product_costs,
    sum(i.fees) as fees,
    sum(i.shipping_costs) as shipping_costs,
    sum(i.adjustments) as adjustments,
    sum(i.gross_revenue - i.net_received - i.fees - i.shipping_costs - i.adjustments) as coupon_costs
  from items i
  left join public.products p on p.id = i.product_id
  group by i.product_id
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
      'couponCosts', s.coupon_costs,
      'operationalCosts', s.fees + s.shipping_costs + s.adjustments + s.coupon_costs,
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