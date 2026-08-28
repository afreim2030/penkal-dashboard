create or replace function public.get_linking_dashboard_data()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
with issues as (
  select 'sku'::text as identifier_type, s.sku_raw as raw_value, 'Vendas'::text as source,
    count(*)::integer as affected_rows
  from public.sales s
  where s.record_type = 'sale_item' and s.product_id is null
    and s.sku_raw is not null and btrim(s.sku_raw) <> ''
  group by s.sku_raw

  union all

  select 'mlb'::text, s.mlb_raw, 'Vendas'::text, count(*)::integer
  from public.sales s
  where s.record_type = 'sale_item' and s.listing_id is null
    and s.mlb_raw is not null and btrim(s.mlb_raw) <> ''
  group by s.mlb_raw

  union all

  select 'mlb'::text, raw_mlb, 'Estoque FULL'::text, count(distinct f.id)::integer
  from public.full_inventory_snapshots f
  cross join lateral regexp_split_to_table(f.mlb_raw, '[|,;]') as raw_mlb
  left join public.listings l on l.mlb = btrim(raw_mlb)
  where f.mlb_raw is not null and btrim(raw_mlb) <> '' and l.id is null
  group by raw_mlb

  union all

  select 'mlb'::text, raw_mlb, 'Envios FULL'::text, count(distinct i.id)::integer
  from public.full_inbounds i
  cross join lateral unnest(coalesce(i.listing_numbers, array[]::text[])) as raw_mlb
  left join public.listings l on l.mlb = raw_mlb
  where btrim(raw_mlb) <> '' and l.id is null
  group by raw_mlb

  union all

  select 'mlb'::text, performance.mlb_raw, 'Performance'::text, count(*)::integer
  from public.listing_performance performance
  where performance.listing_id is null and performance.mlb_raw is not null
    and btrim(performance.mlb_raw) <> ''
  group by performance.mlb_raw

  union all

  select 'mlb'::text, ads.mlb_raw, 'Publicidade'::text, count(*)::integer
  from public.ad_metrics ads
  where ads.listing_id is null and ads.mlb_raw is not null and btrim(ads.mlb_raw) <> ''
  group by ads.mlb_raw
), ordered_issues as (
  select * from issues
  order by affected_rows desc, identifier_type, raw_value
  limit 100
)
select jsonb_build_object(
  'summary', jsonb_build_object(
    'identifiers', (select count(*) from issues),
    'affectedRows', (select coalesce(sum(affected_rows), 0) from issues),
    'skuIdentifiers', (select count(*) from issues where identifier_type = 'sku'),
    'mlbIdentifiers', (select count(*) from issues where identifier_type = 'mlb')
  ),
  'issues', coalesce((
    select jsonb_agg(jsonb_build_object(
      'identifierType', identifier_type, 'rawValue', btrim(raw_value),
      'source', source, 'affectedRows', affected_rows
    ) order by affected_rows desc, identifier_type, raw_value)
    from ordered_issues
  ), '[]'::jsonb)
);
$$;

revoke all on function public.get_linking_dashboard_data() from public, anon;
grant execute on function public.get_linking_dashboard_data() to authenticated;