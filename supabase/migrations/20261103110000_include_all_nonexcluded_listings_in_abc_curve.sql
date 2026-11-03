-- Mantém a lista da Curva ABCDE completa: anúncios ativos e pausados
-- também aparecem com métricas zeradas; anúncios excluídos continuam fora.
do $migration$
declare
  source_definition text;
  patched_definition text;
  replacement text := $sql$
),
catalog_base as (
  select
    case
      when nullif(trim(p.sku), '') is not null then 'sku:' || trim(p.sku) || ':mlb:' || coalesce(nullif(trim(l.mlb), ''), 'sem-mlb')
      when nullif(trim(l.mlb), '') is not null then 'mlb:' || trim(l.mlb)
      else 'listing:' || l.id::text
    end as product_key,
    nullif(trim(p.sku), '') as sku,
    nullif(trim(l.mlb), '') as mlb,
    coalesce(p.name, l.title, nullif(trim(p.sku), ''), nullif(trim(l.mlb), ''), 'Produto sem vínculo') as product_name,
    0::bigint as current_visits,
    0::bigint as current_sales,
    0::bigint as current_units,
    0::numeric as current_revenue,
    0::bigint as previous_visits,
    0::bigint as previous_sales,
    0::numeric as previous_revenue
  from public.listings l
  cross join active a
  left join public.products p on p.id = l.product_id
  where l.account_id = a.account_id
    and lower(coalesce(l.status, '')) not in ('excluído', 'excluido', 'deleted')
),
base as (
  select product_key, max(sku) as sku, max(mlb) as mlb, max(product_name) as product_name,
    sum(current_visits)::bigint as current_visits,
    sum(current_sales)::bigint as current_sales,
    sum(current_units)::bigint as current_units,
    sum(current_revenue)::numeric as current_revenue,
    sum(previous_visits)::bigint as previous_visits,
    sum(previous_sales)::bigint as previous_sales,
    sum(previous_revenue)::numeric as previous_revenue
  from (
    select * from performance_base
    union all
    select * from catalog_base
  ) sources
  group by product_key
),
ranked_current as (
$sql$;
begin
  select pg_get_functiondef('public.get_abc_curve_dashboard_data(date,date)'::regprocedure)
  into source_definition;

  patched_definition := replace(
    source_definition,
    E'\nbase as (\n',
    E'\nperformance_base as (\n'
  );
  patched_definition := replace(
    patched_definition,
    E'\n),\nranked_current as (\n',
    replacement
  );

  if patched_definition = source_definition then
    raise exception 'Could not include all non-excluded listings in ABC curve function';
  end if;

  execute patched_definition;
end;
$migration$;
