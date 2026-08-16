alter table public.imports
  drop constraint imports_source_exported_at_source_valid;

alter table public.imports
  add constraint imports_source_exported_at_source_valid check (
    source_exported_at_source in (
      'filename',
      'report_header',
      'user_confirmed',
      'unknown'
    )
  );

create table public.sales_import_metadata_overrides (
  file_hash text primary key,
  source_exported_at timestamptz not null,
  source_exported_at_source text not null default 'report_header',
  period_start date,
  period_end date,
  evidence text,
  created_at timestamptz not null default now(),
  constraint sales_import_metadata_overrides_source_valid check (
    source_exported_at_source in ('report_header', 'user_confirmed')
  ),
  constraint sales_import_metadata_overrides_period_valid check (
    period_start is null or period_end is null or period_start <= period_end
  )
);

alter table public.sales_import_metadata_overrides enable row level security;
revoke all on table public.sales_import_metadata_overrides from anon;
grant select on table public.sales_import_metadata_overrides to authenticated;

create policy "Authenticated users can read sales import metadata overrides"
on public.sales_import_metadata_overrides
for select to authenticated
using (true);

insert into public.sales_import_metadata_overrides (
  file_hash,
  source_exported_at,
  source_exported_at_source,
  period_start,
  period_end,
  evidence
)
values
  (
    '579006c4a9f030f0ebcdaa11145080f85e5a0390cfe5b144a6251f664799dc77',
    '2026-08-05 12:53:00-03'::timestamptz,
    'report_header',
    '2026-01-01',
    '2026-01-31',
    'Cabecalho do relatorio: Status das suas vendas em 5 de agosto de 2026, as 12:53 hs. Arquivo mensal JANEIRO; linhas posteriores de troca ficam fora do periodo mensal.'
  ),
  (
    'ad43ed8627b52c9a8c55931ab8fa060f0678dc9ce204e2a5c8a584057b115dc7',
    '2026-08-05 12:57:00-03'::timestamptz,
    'report_header',
    '2026-02-01',
    '2026-02-28',
    'Cabecalho do relatorio: Status das suas vendas em 5 de agosto de 2026, as 12:57 hs. Arquivo mensal FEVEREIRO.'
  ),
  (
    'cd9ea3bd7d60cc5fe5093844da6c8dbeb1063cad7b17e4a817554e3367f56798',
    '2026-08-05 13:07:00-03'::timestamptz,
    'report_header',
    '2026-03-01',
    '2026-03-31',
    'Cabecalho do relatorio: Status das suas vendas em 5 de agosto de 2026, as 13:07 hs. Arquivo mensal MARCO.'
  ),
  (
    '7cb61587a3cdc4c7684e823e8ae7fd633ce58029d87ca9d54da138e20c634d3c',
    '2026-08-05 13:09:00-03'::timestamptz,
    'report_header',
    '2026-04-01',
    '2026-04-30',
    'Cabecalho do relatorio: Status das suas vendas em 5 de agosto de 2026, as 13:09 hs. Arquivo mensal ABRIL.'
  ),
  (
    '7b56d7962e7ef42d479ae582581226e64a054bfde68aad6640160cb444c7cd5f',
    '2026-08-05 13:11:00-03'::timestamptz,
    'report_header',
    '2026-05-01',
    '2026-05-31',
    'Cabecalho do relatorio: Status das suas vendas em 5 de agosto de 2026, as 13:11 hs. Arquivo mensal MAIO.'
  ),
  (
    '0f136a00cfa678ed02ec8d69e852f411588f2cbc2e28e28a0b31780fba6695e7',
    '2026-08-05 13:13:00-03'::timestamptz,
    'report_header',
    '2026-06-01',
    '2026-06-30',
    'Cabecalho do relatorio: Status das suas vendas em 5 de agosto de 2026, as 13:13 hs. Arquivo mensal JUNHO; linhas posteriores de troca ficam fora do periodo mensal.'
  ),
  (
    '91b8d3a67dbf1294b0499c647f4ba03bb72473df0bb3c78166d1bacf831d1aa6',
    '2026-08-05 13:15:00-03'::timestamptz,
    'report_header',
    '2026-07-01',
    '2026-07-31',
    'Cabecalho do relatorio: Status das suas vendas em 5 de agosto de 2026, as 13:15 hs. Arquivo mensal JULHO.'
  )
on conflict (file_hash) do update
set
  source_exported_at = excluded.source_exported_at,
  source_exported_at_source = excluded.source_exported_at_source,
  period_start = excluded.period_start,
  period_end = excluded.period_end,
  evidence = excluded.evidence;

create or replace function public.apply_sales_import_metadata_override()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  metadata public.sales_import_metadata_overrides%rowtype;
begin
  if new.import_type = 'sales' then
    select *
    into metadata
    from public.sales_import_metadata_overrides
    where file_hash = new.file_hash;

    if found then
      new.source_exported_at := metadata.source_exported_at;
      new.source_exported_at_source := metadata.source_exported_at_source;
      if metadata.period_start is not null then
        new.period_start := metadata.period_start;
      end if;
      if metadata.period_end is not null then
        new.period_end := metadata.period_end;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists apply_sales_import_metadata_override on public.imports;
create trigger apply_sales_import_metadata_override
before insert or update on public.imports
for each row
execute function public.apply_sales_import_metadata_override();

alter function public.process_sales_import_batch(jsonb)
rename to process_sales_import_batch_core;

create function public.process_sales_import_batch(p_rows jsonb)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  with expanded as (
    select
      entries.ordinality,
      entries.item,
      imports.source_exported_at as import_source_exported_at
    from jsonb_array_elements(p_rows) with ordinality as entries(item, ordinality)
    left join public.imports
      on imports.id = nullif(entries.item ->> 'import_id', '')::uuid
  ),
  with_timestamp as (
    select
      ordinality,
      case
        when item ->> 'source_exported_at' is null
          and import_source_exported_at is not null
        then jsonb_set(item, '{source_exported_at}', to_jsonb(import_source_exported_at), true)
        else item
      end as item
    from expanded
  ),
  exchange_sale_numbers as (
    select distinct item ->> 'sale_number' as sale_number
    from with_timestamp
    where item ->> 'record_type' = 'exchange_summary'
      and item ->> 'sale_number' is not null
  ),
  normalized as (
    select
      ordinality,
      case
        when item ->> 'record_type' = 'sale_item'
          and exists (
            select 1
            from exchange_sale_numbers
            where exchange_sale_numbers.sale_number = item ->> 'sale_number'
          )
        then jsonb_set(item, '{record_type}', '"exchange_summary"'::jsonb, true)
        else item
      end as item
    from with_timestamp
  )
  select public.process_sales_import_batch_core(
    coalesce(jsonb_agg(item order by ordinality), '[]'::jsonb)
  )
  from normalized;
$$;

revoke all on function public.process_sales_import_batch(jsonb) from public;
grant execute on function public.process_sales_import_batch(jsonb) to authenticated;
grant execute on function public.process_sales_import_batch_core(jsonb) to authenticated;

update public.sales as sale_item
set record_type = 'exchange_summary'
where sale_item.record_type = 'sale_item'
  and exists (
    select 1
    from public.sales as exchange_summary
    where exchange_summary.record_type = 'exchange_summary'
      and exchange_summary.sale_number = sale_item.sale_number
  );
