-- A linha de resumo de troca deve continuar fora das métricas por SKU,
-- mas a linha do item vendido não deixa de ser sale_item apenas por existir
-- uma solicitação de troca para o mesmo número de venda.
update public.sales
set record_type = 'sale_item'
where record_type = 'exchange_summary'
  and sku_raw is not null
  and mlb_raw is not null
  and quantity is not null;

create or replace function public.process_sales_import_batch(p_rows jsonb)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select public.process_sales_import_batch_core(p_rows);
$$;

revoke all on function public.process_sales_import_batch(jsonb) from public;
grant execute on function public.process_sales_import_batch(jsonb) to authenticated;
