revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

create index if not exists campaign_changes_created_by_idx
  on public.campaign_changes (created_by);

create index if not exists imports_imported_by_idx
  on public.imports (imported_by);

create index if not exists sales_import_conflicts_existing_import_id_idx
  on public.sales_import_conflicts (existing_import_id);

create unique index if not exists full_inventory_snapshots_import_mlb_key
  on public.full_inventory_snapshots (import_id, mlb_raw)
  where sku_raw is null and mlb_raw is not null;

alter table public.full_inbounds
  add column if not exists import_id uuid references public.imports (id) on delete set null;

create index if not exists full_inbounds_import_id_idx
  on public.full_inbounds (import_id);

alter table public.ad_metrics
  add column if not exists import_id uuid references public.imports (id) on delete set null;

create index if not exists ad_metrics_import_id_idx
  on public.ad_metrics (import_id);

drop policy if exists "Authenticated users can update own import staging" on storage.objects;

create policy "Authenticated users can update own import staging"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'import-staging'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'import-staging'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
