create or replace function public.normalize_sales_import_coverage()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  source_import public.imports%rowtype;
  metadata public.sales_import_metadata_overrides%rowtype;
begin
  select * into source_import
  from public.imports
  where id = new.import_id;

  if not found then
    return new;
  end if;

  select * into metadata
  from public.sales_import_metadata_overrides
  where file_hash = source_import.file_hash;

  if found
     and metadata.period_start is not null
     and metadata.period_end is not null then
    if new.coverage_date < metadata.period_start
       or new.coverage_date > metadata.period_end then
      return null;
    end if;

    new.coverage_status := 'complete';
    new.coverage_source := 'legacy_manual';
    new.evidence := coalesce(metadata.evidence, 'Escopo mensal validado para este arquivo histórico.');
    return new;
  end if;

  if source_import.period_start is not null
     and new.coverage_date < source_import.period_start then
    return null;
  end if;

  if source_import.period_end is not null
     and new.coverage_date > source_import.period_end then
    return null;
  end if;

  if source_import.source_exported_at is not null
     and new.coverage_date = (source_import.source_exported_at at time zone 'America/Sao_Paulo')::date
     and new.coverage_status <> 'complete' then
    new.coverage_status := 'partial';
    new.coverage_source := 'export_datetime';
    new.evidence := 'Data coincide com o dia de exportação do relatório; tratada como parcial até confirmação de fechamento.';
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_sales_import_coverage on public.sales_import_coverage;
create trigger normalize_sales_import_coverage
before insert or update on public.sales_import_coverage
for each row
execute function public.normalize_sales_import_coverage();
