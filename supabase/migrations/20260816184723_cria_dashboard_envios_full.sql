create or replace function public.get_full_inbounds_dashboard_data()
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
with inbound_summary as (
  select
    inbound_id,
    min(received_at) as received_at,
    count(*)::bigint as sku_rows,
    count(distinct sku_raw)::bigint as skus,
    coalesce(sum(units_declared), 0)::bigint as declared,
    coalesce(sum(units_processed), 0)::bigint as processed,
    coalesce(sum(units_sellable), 0)::bigint as sellable,
    coalesce(sum(units_unsellable), 0)::bigint as unsellable,
    coalesce(sum(units_difference), 0)::bigint as difference,
    coalesce(sum(units_unidentified), 0)::bigint as unidentified,
    bool_or(coalesce(units_difference, 0) <> 0) as has_difference,
    string_agg(distinct coalesce(status_raw, '—'), ' | ' order by coalesce(status_raw, '—')) as status
  from public.full_inbounds
  group by inbound_id
), sku_summary as (
  select
    inbounds.sku_raw,
    max(products.name) as product_name,
    coalesce(sum(inbounds.units_declared), 0)::bigint as declared,
    coalesce(sum(inbounds.units_processed), 0)::bigint as processed,
    coalesce(sum(inbounds.units_difference), 0)::bigint as difference,
    count(distinct inbounds.inbound_id)::bigint as inbound_count,
    max(inbounds.received_at) as last_received_at
  from public.full_inbounds inbounds
  left join public.products products on products.id = inbounds.product_id
  group by inbounds.sku_raw
), top_differences as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'sku', ranked.sku_raw,
    'productName', ranked.product_name,
    'declared', ranked.declared,
    'processed', ranked.processed,
    'difference', ranked.difference,
    'inboundCount', ranked.inbound_count,
    'lastReceivedAt', ranked.last_received_at
  ) order by abs(ranked.difference) desc, ranked.processed desc), '[]'::jsonb) as value
  from (
    select * from sku_summary
    where difference <> 0
    order by abs(difference) desc, processed desc
    limit 20
  ) ranked
), top_received as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'sku', ranked.sku_raw,
    'productName', ranked.product_name,
    'declared', ranked.declared,
    'processed', ranked.processed,
    'difference', ranked.difference,
    'inboundCount', ranked.inbound_count,
    'lastReceivedAt', ranked.last_received_at
  ) order by ranked.processed desc), '[]'::jsonb) as value
  from (
    select * from sku_summary
    order by processed desc, declared desc
    limit 20
  ) ranked
)
select jsonb_build_object(
  'summary', jsonb_build_object(
    'rows', (select count(*) from public.full_inbounds),
    'inbounds', count(*),
    'skus', (select count(distinct sku_raw) from public.full_inbounds),
    'declared', coalesce(sum(declared), 0),
    'processed', coalesce(sum(processed), 0),
    'sellable', coalesce(sum(sellable), 0),
    'unsellable', coalesce(sum(unsellable), 0),
    'difference', coalesce(sum(difference), 0),
    'unidentified', coalesce(sum(unidentified), 0),
    'withDifference', count(*) filter (where has_difference),
    'firstReceivedAt', min(received_at),
    'lastReceivedAt', max(received_at)
  ),
  'inbounds', coalesce(jsonb_agg(jsonb_build_object(
    'inboundId', inbound_id,
    'receivedAt', received_at,
    'skuRows', sku_rows,
    'skus', skus,
    'declared', declared,
    'processed', processed,
    'sellable', sellable,
    'unsellable', unsellable,
    'difference', difference,
    'unidentified', unidentified,
    'hasDifference', has_difference,
    'status', status
  ) order by received_at desc), '[]'::jsonb),
  'topDifferences', (select value from top_differences),
  'topReceived', (select value from top_received)
)
from inbound_summary;
$$;

revoke all on function public.get_full_inbounds_dashboard_data() from public;
grant execute on function public.get_full_inbounds_dashboard_data() to authenticated;
