-- O campo "Total (BRL)" do relatório de vendas é o valor líquido informado pelo
-- Mercado Livre. Ele já inclui tarifas, fretes, cupons e outros ajustes que
-- eventualmente não aparecem detalhados em colunas separadas.

create or replace function public.get_profit_by_product(p_start date, p_end date)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
with active as (
  select public.get_active_marketplace_account_id() id
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
  select distinct coverage.coverage_date
  from public.sales_import_coverage coverage
  cross join active a
  where coverage.account_id = a.id
    and coverage.coverage_status = 'complete'
    and coverage.coverage_date between p_start and p_end
),
sales_data as (
  select
    s.product_id,
    max(p.sku) sku,
    max(p.name) name,
    sum(s.quantity) units,
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
    ) revenue,
    sum(abs(coalesce(s.sale_fee_tax, s.fees, 0)) + abs(coalesce(s.installment_fee, 0))) fees,
    sum(
      greatest(0, abs(coalesce(s.shipping_fee, 0)) - greatest(coalesce(s.shipping_revenue, 0), 0))
      + abs(coalesce(s.exchange_shipping_cost, 0))
      + abs(coalesce(s.declared_dimensions_shipping_cost, 0))
      + abs(coalesce(s.dimensions_difference_cost, 0))
    ) shipping_costs,
    sum(abs(coalesce(s.discounts_bonuses, 0)) + abs(coalesce(s.cancellations_refunds, 0))) adjustments,
    sum(
      abs(coalesce(s.sale_fee_tax, s.fees, 0))
      + abs(coalesce(s.installment_fee, 0))
      + greatest(0, abs(coalesce(s.shipping_fee, 0)) - greatest(coalesce(s.shipping_revenue, 0), 0))
      + abs(coalesce(s.exchange_shipping_cost, 0))
      + abs(coalesce(s.declared_dimensions_shipping_cost, 0))
      + abs(coalesce(s.dimensions_difference_cost, 0))
      + abs(coalesce(s.discounts_bonuses, 0))
      + abs(coalesce(s.cancellations_refunds, 0))
    ) operational_costs,
    sum(s.quantity * coalesce(pc.unit_cost, 0)) product_costs
  from public.sales s
  cross join active a
  join complete_days d on d.coverage_date = (s.sale_date at time zone 'America/Sao_Paulo')::date
  left join public.products p on p.id = s.product_id
  left join package_net_amount on package_net_amount.item_id = s.id
  left join public.product_costs pc on pc.product_id = s.product_id and pc.account_id = s.account_id
  where s.account_id = a.id
    and s.record_type = 'sale_item'
    and not coalesce(s.cancelled, false)
  group by s.product_id
),
ads as (
  select m.product_id, sum(m.investment) investment
  from public.ad_metrics m
  cross join active a
  where m.account_id = a.id
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
      'productCosts', s.product_costs,
      'fees', s.fees,
      'shippingCosts', s.shipping_costs,
      'adjustments', s.adjustments,
      'operationalCosts', s.operational_costs,
      'adsInvestment', coalesce(a.investment, 0),
      'afterAds', s.revenue - s.product_costs - coalesce(a.investment, 0)
    )
    order by (s.revenue - s.product_costs - coalesce(a.investment, 0)) asc
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
  select distinct coverage.coverage_date
  from public.sales_import_coverage coverage
  cross join active a
  where coverage.account_id = a.account_id
    and coverage.coverage_status = 'complete'
    and coverage.coverage_date between p_start and p_end
),
current_sales as (
  select
    coalesce(sum(
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
    ), 0) revenue,
    coalesce(sum(s.quantity), 0) units,
    coalesce(sum(
      abs(coalesce(s.sale_fee_tax, s.fees, 0))
      + abs(coalesce(s.installment_fee, 0))
      + greatest(0, abs(coalesce(s.shipping_fee, 0)) - greatest(coalesce(s.shipping_revenue, 0), 0))
      + abs(coalesce(s.exchange_shipping_cost, 0))
      + abs(coalesce(s.declared_dimensions_shipping_cost, 0))
      + abs(coalesce(s.dimensions_difference_cost, 0))
      + abs(coalesce(s.discounts_bonuses, 0))
      + abs(coalesce(s.cancellations_refunds, 0))
    ), 0) operational_costs,
    coalesce(sum(s.quantity * coalesce(pc.unit_cost, 0)), 0) product_costs,
    count(distinct s.sale_number) orders
  from public.sales s
  cross join active a
  join complete_days d on d.coverage_date = (s.sale_date at time zone 'America/Sao_Paulo')::date
  left join package_net_amount on package_net_amount.item_id = s.id
  left join public.product_costs pc on pc.product_id = s.product_id and pc.account_id = s.account_id
  where s.account_id = a.account_id
    and s.record_type = 'sale_item'
    and not coalesce(s.cancelled, false)
),
ads as (
  select coalesce(sum(m.investment), 0) investment
  from public.ad_metrics m
  cross join active a
  where m.account_id = a.account_id
    and m.period_start = m.period_end
    and m.period_start between p_start and p_end
)
select jsonb_build_object(
  'start', p_start,
  'end', p_end,
  'revenue', cs.revenue,
  'units', cs.units,
  'orders', cs.orders,
  'operationalCosts', cs.operational_costs,
  'productCosts', cs.product_costs,
  'contribution', cs.revenue - cs.product_costs,
  'adsInvestment', ads.investment,
  'afterAds', cs.revenue - cs.product_costs - ads.investment,
  'costCoverage', case when cs.units = 0 then 0 else round(cs.product_costs / nullif(cs.units, 0), 2) end
)
from current_sales cs
cross join ads;
$function$;
