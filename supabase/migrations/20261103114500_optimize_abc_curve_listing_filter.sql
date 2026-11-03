-- Substitui a validação correlacionada por uma junção indexada ao anúncio atual.
-- Mantém fora apenas anúncios excluídos e reduz drasticamente o tempo da Curva ABCDE.
do $migration$
declare
  source_definition text;
  patched_definition text;
begin
  select pg_get_functiondef('public.get_abc_curve_dashboard_data(date,date)'::regprocedure)
  into source_definition;

  patched_definition := replace(
    source_definition,
    E'  cross join periods pr\n  cross join excluded e\n  left join public.products p on p.id = lp.product_id\n  left join public.listings l on l.id = lp.listing_id',
    E'  cross join periods pr\n  join public.listings current_listing\n    on current_listing.id = lp.listing_id\n   and current_listing.account_id = a.account_id\n   and lower(coalesce(current_listing.status, '''')) not in (''excluído'', ''excluido'', ''deleted'')\n  left join public.products p on p.id = lp.product_id'
  );
  patched_definition := replace(
    patched_definition,
    'max(l.title)',
    'max(current_listing.title)'
  );
  patched_definition := replace(
    patched_definition,
    E'    and (lp.listing_id is null or lp.listing_id <> all(e.listing_ids))\n    and (nullif(trim(lp.mlb_raw), '''') is null or trim(lp.mlb_raw) <> all(e.mlbs))\n    and exists (\n      select 1\n      from public.listings current_listing\n      where current_listing.account_id = a.account_id\n        and lower(coalesce(current_listing.status, '''')) not in (''excluído'', ''excluido'', ''deleted'')\n        and (\n          current_listing.id = lp.listing_id\n          or (nullif(trim(lp.mlb_raw), '''') is not null and current_listing.mlb = trim(lp.mlb_raw))\n        )\n    )\n',
    E''
  );

  if patched_definition = source_definition then
    raise exception 'Could not optimize ABC curve listing filter';
  end if;

  execute patched_definition;
end;
$migration$;
