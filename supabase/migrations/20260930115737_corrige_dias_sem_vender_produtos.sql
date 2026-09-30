-- Corrige o indicador "Sem vender" para contar os dias ate a data atual
-- de Sao Paulo, em vez de parar na ultima data completa importada.
do $$
declare
  function_sql text;
  updated_sql text;
begin
  select pg_get_functiondef('public.get_products_dashboard_data()'::regprocedure)
    into function_sql;

  updated_sql := replace(
    function_sql,
    'then bounds.max_complete_date - sales_by_product.last_sale_date',
    'then (now() at time zone ''America/Sao_Paulo'')::date - sales_by_product.last_sale_date'
  );

  if updated_sql = function_sql then
    raise exception 'Trecho esperado do calculo de dias sem vender nao foi encontrado; nenhuma alteracao foi aplicada.';
  end if;

  execute updated_sql;
end;
$$;
