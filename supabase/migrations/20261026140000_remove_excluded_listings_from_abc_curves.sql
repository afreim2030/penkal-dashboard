-- The dashboard functions existed before this repository began tracking their
-- definitions. Patch their current definitions without changing the API shape.
do $migration$
declare
  source_definition text;
  patched_definition text;
  exclusion_clause constant text := $sql$
    and not exists (
      select 1
      from public.listings excluded_listing
      where excluded_listing.account_id = lp.account_id
        and lower(coalesce(excluded_listing.status, '')) in ('excluído', 'excluido', 'deleted')
        and (
          excluded_listing.id = lp.listing_id
          or (
            nullif(trim(lp.mlb_raw), '') is not null
            and excluded_listing.mlb = trim(lp.mlb_raw)
          )
        )
    )$sql$;
begin
  select pg_get_functiondef('public.get_abc_curve_dashboard_data(date,date)'::regprocedure)
    into source_definition;
  patched_definition := replace(
    source_definition,
    'and lp.period_start=lp.period_end',
    'and lp.period_start=lp.period_end' || exclusion_clause
  );
  if patched_definition = source_definition then
    raise exception 'Could not add excluded-listing filter to get_abc_curve_dashboard_data';
  end if;
  execute patched_definition;

  select pg_get_functiondef('public.get_product_period_comparison(integer)'::regprocedure)
    into source_definition;
  patched_definition := replace(
    source_definition,
    'and lp.period_start = lp.period_end',
    'and lp.period_start = lp.period_end' || exclusion_clause
  );
  if patched_definition = source_definition then
    raise exception 'Could not add excluded-listing filter to get_product_period_comparison';
  end if;
  execute patched_definition;
end;
$migration$;