create or replace function public.normalize_sales_import_coverage()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
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

  -- A cobertura descreve o escopo temporal do arquivo e continua valida
  -- quando a importacao terminou com pendencias de linhas. Bloqueamos
  -- apenas importacoes ainda em processamento ou que falharam de fato.
  if source_import.status not in ('completed', 'completed_with_errors') then
    return null;
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
    new.evidence := coalesce(metadata.evidence, 'Escopo mensal validado para este arquivo historico.');
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
    new.evidence := 'Data coincide com o dia de exportacao do relatorio; tratada como parcial ate confirmacao de fechamento.';
  end if;

  return new;
end;
$function$;

insert into public.sales_import_coverage (
  import_id,
  coverage_date,
  coverage_status,
  coverage_source,
  evidence
)
select
  i.id,
  d::date,
  'unknown',
  'report_scope',
  'Cobertura reconstruida apos importacao concluida com pendencias.'
from public.imports i
join public.sales_import_metadata_overrides m on m.file_hash = i.file_hash
cross join lateral generate_series(m.period_start::timestamp, m.period_end::timestamp, interval '1 day') as d
where i.import_type = 'sales'
  and i.status in ('completed', 'completed_with_errors')
  and m.period_start is not null
  and m.period_end is not null
on conflict (import_id, coverage_date) do update
set
  coverage_status = excluded.coverage_status,
  coverage_source = excluded.coverage_source,
  evidence = excluded.evidence;
