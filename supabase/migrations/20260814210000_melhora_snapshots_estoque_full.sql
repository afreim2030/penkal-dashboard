alter table public.full_inventory_snapshots
  add column snapshot_at timestamptz,
  add column import_id uuid references public.imports (id) on delete cascade,
  add column units_affect_stock_time integer,
  add constraint full_inventory_snapshots_units_affect_stock_time_nonnegative
    check (units_affect_stock_time is null or units_affect_stock_time >= 0);

do $$
declare
  duplicate_sku record;
begin
  select snapshot_date, source_file, sku_raw, count(*) as duplicate_count
  into duplicate_sku
  from public.full_inventory_snapshots
  where sku_raw is not null
  group by snapshot_date, source_file, sku_raw
  having count(*) > 1
  limit 1;

  if found then
    raise exception using
      message = format(
        'Não é possível criar a unicidade (import_id, sku_raw): o legado contém %s linhas para snapshot_date=%s, source_file=%s, sku_raw=%s.',
        duplicate_sku.duplicate_count,
        duplicate_sku.snapshot_date,
        duplicate_sku.source_file,
        duplicate_sku.sku_raw
      ),
      hint = 'Revise manualmente as linhas históricas duplicadas por MLB; a migration não soma nem consolida estoque legado.';
  end if;
end
$$;

with legacy_snapshots as (
  select
    snapshot_date,
    source_file,
    min(created_at) as created_at,
    'legacy-full:v1:' || snapshot_date::text || ':' || octet_length(source_file)::text || ':' || source_file as file_hash,
    count(*)::integer as row_count
  from public.full_inventory_snapshots
  group by snapshot_date, source_file
)
insert into public.imports (
  import_type,
  file_name,
  file_hash,
  status,
  row_count,
  error_count,
  imported_by,
  created_at
)
select 'full_inventory_legacy', source_file, file_hash, 'completed', row_count, 0, null, created_at
from legacy_snapshots;

update public.full_inventory_snapshots as snapshots
set
  import_id = imports.id,
  snapshot_at = imports.created_at
from public.imports as imports
where imports.file_hash = 'legacy-full:v1:' || snapshots.snapshot_date::text || ':'
  || octet_length(snapshots.source_file)::text || ':' || snapshots.source_file;

alter table public.full_inventory_snapshots
  alter column snapshot_at set not null,
  alter column import_id set not null;

alter table public.full_inventory_snapshots
  drop constraint full_inventory_snapshots_natural_key;

create unique index full_inventory_snapshots_import_sku_key
  on public.full_inventory_snapshots (import_id, sku_raw)
  where sku_raw is not null;

create index full_inventory_snapshots_snapshot_at_idx
  on public.full_inventory_snapshots (snapshot_at);

create index full_inventory_snapshots_import_id_idx
  on public.full_inventory_snapshots (import_id);
