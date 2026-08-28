create table public.identifier_link_overrides (
  id uuid primary key default gen_random_uuid(),
  identifier_type text not null,
  raw_value text not null,
  target_product_id uuid references public.products (id) on delete cascade,
  target_listing_id uuid references public.listings (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint identifier_link_overrides_type_valid
    check (identifier_type in ('sku', 'mlb')),
  constraint identifier_link_overrides_raw_value_not_blank
    check (btrim(raw_value) <> ''),
  constraint identifier_link_overrides_target_valid
    check (
      (identifier_type = 'sku' and target_product_id is not null and target_listing_id is null)
      or
      (identifier_type = 'mlb' and target_listing_id is not null)
    ),
  constraint identifier_link_overrides_type_raw_key
    unique (identifier_type, raw_value)
);

create index identifier_link_overrides_product_id_idx
  on public.identifier_link_overrides (target_product_id);

create index identifier_link_overrides_listing_id_idx
  on public.identifier_link_overrides (target_listing_id);

create index identifier_link_overrides_created_by_idx
  on public.identifier_link_overrides (created_by);

create trigger identifier_link_overrides_set_updated_at
before update on public.identifier_link_overrides
for each row execute function public.set_updated_at();

alter table public.identifier_link_overrides enable row level security;

revoke all on table public.identifier_link_overrides from anon;
grant select, insert, update, delete on table public.identifier_link_overrides to authenticated;

create policy "Users can read own identifier overrides"
on public.identifier_link_overrides
for select
to authenticated
using ((select auth.uid()) = created_by);

create policy "Users can insert own identifier overrides"
on public.identifier_link_overrides
for insert
to authenticated
with check ((select auth.uid()) = created_by);

create policy "Users can update own identifier overrides"
on public.identifier_link_overrides
for update
to authenticated
using ((select auth.uid()) = created_by)
with check ((select auth.uid()) = created_by);

create policy "Users can delete own identifier overrides"
on public.identifier_link_overrides
for delete
to authenticated
using ((select auth.uid()) = created_by);

create or replace function public.reconcile_data_links()
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  sales_products integer := 0;
  sales_listings integer := 0;
  full_products integer := 0;
  full_listings integer := 0;
  inbound_products integer := 0;
  inbound_listings integer := 0;
  performance_rows integer := 0;
  ad_rows integer := 0;
  affected integer := 0;
begin
  update public.sales s
  set product_id = p.id
  from public.products p
  where s.record_type = 'sale_item'
    and s.product_id is null
    and p.sku = s.sku_raw;
  get diagnostics sales_products = row_count;

  update public.sales s
  set product_id = o.target_product_id
  from public.identifier_link_overrides o
  where s.record_type = 'sale_item'
    and s.product_id is null
    and o.identifier_type = 'sku'
    and o.raw_value = s.sku_raw
    and o.target_product_id is not null;
  get diagnostics affected = row_count;
  sales_products := sales_products + affected;

  update public.sales s
  set listing_id = l.id
  from public.listings l
  where s.record_type = 'sale_item'
    and s.listing_id is null
    and l.mlb = s.mlb_raw;
  get diagnostics sales_listings = row_count;

  update public.sales s
  set listing_id = o.target_listing_id
  from public.identifier_link_overrides o
  where s.record_type = 'sale_item'
    and s.listing_id is null
    and o.identifier_type = 'mlb'
    and o.raw_value = s.mlb_raw
    and o.target_listing_id is not null;
  get diagnostics affected = row_count;
  sales_listings := sales_listings + affected;

  update public.sales s
  set product_id = l.product_id
  from public.listings l
  where s.record_type = 'sale_item'
    and s.product_id is null
    and s.listing_id = l.id
    and l.product_id is not null;
  get diagnostics affected = row_count;
  sales_products := sales_products + affected;

  update public.full_inventory_snapshots f
  set product_id = p.id
  from public.products p
  where f.product_id is null
    and p.sku = f.sku_raw;
  get diagnostics full_products = row_count;

  update public.full_inventory_snapshots f
  set listing_id = l.id
  from public.listings l
  where f.listing_id is null
    and l.mlb = f.mlb_raw;
  get diagnostics full_listings = row_count;

  update public.full_inbounds i
  set product_id = p.id
  from public.products p
  where i.product_id is null
    and p.sku = i.sku_raw;
  get diagnostics inbound_products = row_count;

  update public.full_inbounds i
  set listing_id = l.id
  from public.listings l
  where i.listing_id is null
    and cardinality(i.listing_numbers) = 1
    and l.mlb = i.listing_numbers[1];
  get diagnostics inbound_listings = row_count;

  update public.listing_performance performance
  set listing_id = l.id
  from public.listings l
  where performance.listing_id is null
    and l.mlb = performance.mlb_raw;
  get diagnostics performance_rows = row_count;

  update public.listing_performance performance
  set product_id = p.id
  from public.products p
  where performance.product_id is null
    and p.sku = performance.sku_raw;
  get diagnostics affected = row_count;
  performance_rows := performance_rows + affected;

  update public.listing_performance performance
  set product_id = l.product_id
  from public.listings l
  where performance.product_id is null
    and performance.listing_id = l.id
    and l.product_id is not null;
  get diagnostics affected = row_count;
  performance_rows := performance_rows + affected;

  update public.ad_metrics ads
  set
    listing_id = coalesce(ads.listing_id, l.id),
    product_id = coalesce(ads.product_id, l.product_id)
  from public.listings l
  where l.mlb = ads.mlb_raw
    and (ads.listing_id is null or ads.product_id is null);
  get diagnostics ad_rows = row_count;

  return jsonb_build_object(
    'salesProducts', sales_products,
    'salesListings', sales_listings,
    'fullProducts', full_products,
    'fullListings', full_listings,
    'inboundProducts', inbound_products,
    'inboundListings', inbound_listings,
    'performanceRows', performance_rows,
    'adRows', ad_rows
  );
end;
$$;

revoke all on function public.reconcile_data_links() from public, anon;
grant execute on function public.reconcile_data_links() to authenticated;

create or replace function public.get_linking_dashboard_data()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
with issues as (
  select
    'sku'::text as identifier_type,
    s.sku_raw as raw_value,
    'Vendas'::text as source,
    count(*)::integer as affected_rows
  from public.sales s
  where s.record_type = 'sale_item'
    and s.product_id is null
    and s.sku_raw is not null
    and btrim(s.sku_raw) <> ''
  group by s.sku_raw

  union all

  select
    'mlb'::text,
    s.mlb_raw,
    'Vendas'::text,
    count(*)::integer
  from public.sales s
  where s.record_type = 'sale_item'
    and s.listing_id is null
    and s.mlb_raw is not null
    and btrim(s.mlb_raw) <> ''
  group by s.mlb_raw

  union all

  select
    'mlb'::text,
    raw_mlb,
    'Estoque FULL'::text,
    count(distinct f.id)::integer
  from public.full_inventory_snapshots f
  cross join lateral regexp_split_to_table(f.mlb_raw, '\\s*[|,;]\\s*') as raw_mlb
  left join public.listings l on l.mlb = raw_mlb
  where f.mlb_raw is not null
    and btrim(raw_mlb) <> ''
    and l.id is null
  group by raw_mlb

  union all

  select
    'mlb'::text,
    raw_mlb,
    'Envios FULL'::text,
    count(distinct i.id)::integer
  from public.full_inbounds i
  cross join lateral unnest(coalesce(i.listing_numbers, array[]::text[])) as raw_mlb
  left join public.listings l on l.mlb = raw_mlb
  where btrim(raw_mlb) <> ''
    and l.id is null
  group by raw_mlb

  union all

  select
    'mlb'::text,
    performance.mlb_raw,
    'Performance'::text,
    count(*)::integer
  from public.listing_performance performance
  where performance.listing_id is null
    and performance.mlb_raw is not null
    and btrim(performance.mlb_raw) <> ''
  group by performance.mlb_raw

  union all

  select
    'mlb'::text,
    ads.mlb_raw,
    'Publicidade'::text,
    count(*)::integer
  from public.ad_metrics ads
  where ads.listing_id is null
    and ads.mlb_raw is not null
    and btrim(ads.mlb_raw) <> ''
  group by ads.mlb_raw
), ordered_issues as (
  select *
  from issues
  order by affected_rows desc, identifier_type, raw_value
  limit 100
)
select jsonb_build_object(
  'summary',
  jsonb_build_object(
    'identifiers', (select count(*) from issues),
    'affectedRows', (select coalesce(sum(affected_rows), 0) from issues),
    'skuIdentifiers', (select count(*) from issues where identifier_type = 'sku'),
    'mlbIdentifiers', (select count(*) from issues where identifier_type = 'mlb')
  ),
  'issues',
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'identifierType', identifier_type,
          'rawValue', raw_value,
          'source', source,
          'affectedRows', affected_rows
        )
        order by affected_rows desc, identifier_type, raw_value
      )
      from ordered_issues
    ),
    '[]'::jsonb
  )
);
$$;

revoke all on function public.get_linking_dashboard_data() from public, anon;
grant execute on function public.get_linking_dashboard_data() to authenticated;

select public.reconcile_data_links();