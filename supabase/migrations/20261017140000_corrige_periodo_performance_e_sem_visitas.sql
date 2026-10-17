do $$
declare fn text;
begin
  select pg_get_functiondef(p.oid) into fn
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_performance_dashboard_data'
    and pg_get_function_identity_arguments(p.oid) = 'p_start date, p_end date';

  fn := replace(fn, 'daily.date = dates.max_date', 'daily.date = p_end');
  fn := replace(fn, 'daily.date = dates.max_date - 1', 'daily.date = p_end - 1');
  fn := replace(fn, '''end'', dates.max_date', '''end'', p_end');
  fn := replace(fn, 'period_end between dates.last7_start and dates.max_date', 'period_end between dates.last7_start and p_end');
  fn := replace(fn, 'where performance.period_end between dates.last7_start and dates.max_date', 'where performance.period_end between dates.last7_start and p_end');
  fn := replace(
    fn,
    '), quality as (',
    '), no_visits as (
  select coalesce(jsonb_agg(jsonb_build_object(
    ''mlb'', ranked.mlb_raw,
    ''sku'', ranked.sku,
    ''title'', ranked.title,
    ''visits'', ranked.visits,
    ''sales'', ranked.sales,
    ''units'', ranked.units,
    ''grossSales'', ranked.gross_sales,
    ''conversion'', ranked.conversion
  ) order by ranked.visits asc, ranked.sales asc), ''[]''::jsonb) as value
  from (
    select * from listing7
    where visits = 0
    order by visits asc, sales asc, title asc
  ) ranked
), quality as ('
  );
  fn := replace(fn, '''visitsWithoutSales'', visits_without_sales.value,', '''visitsWithoutSales'', visits_without_sales.value,
  ''noVisits'', no_visits.value,');
  fn := replace(fn, 'top_visits, low_conversion, visits_without_sales, quality;', 'top_visits, low_conversion, visits_without_sales, no_visits, quality;');

  execute fn;
end $$;
