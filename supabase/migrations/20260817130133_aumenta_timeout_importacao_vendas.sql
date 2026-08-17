alter function public.process_sales_import_batch(jsonb)
  set statement_timeout = '60s';

alter function public.process_sales_import_batch_core(jsonb)
  set statement_timeout = '60s';
