-- Remove dados de performance sem anúncio atual do resultado da Curva ABCDE.
-- A tabela deve refletir exatamente os anúncios existentes e não excluídos.
do $migration$
declare
  source_definition text;
  patched_definition text;
begin
  select pg_get_functiondef('public.get_abc_curve_dashboard_data(date,date)'::regprocedure)
  into source_definition;

  patched_definition := replace(
    source_definition,
    E'and (nullif(trim(lp.mlb_raw), '''') is null or trim(lp.mlb_raw) <> all(e.mlbs))\n  group by 1',
    E'and (nullif(trim(lp.mlb_raw), '''') is null or trim(lp.mlb_raw) <> all(e.mlbs))\n    and exists (\n      select 1\n      from public.listings current_listing\n      where current_listing.account_id = a.account_id\n        and lower(coalesce(current_listing.status, '''')) not in (''excluído'', ''excluido'', ''deleted'')\n        and (\n          current_listing.id = lp.listing_id\n          or (nullif(trim(lp.mlb_raw), '''') is not null and current_listing.mlb = trim(lp.mlb_raw))\n        )\n    )\n  group by 1'
  );

  if patched_definition = source_definition then
    raise exception 'Could not restrict ABC curve performance to current listings';
  end if;

  execute patched_definition;
end;
$migration$;
