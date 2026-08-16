create table public.sales_import_coverage (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null
    references public.imports(id)
    on delete cascade,
  coverage_date date not null,
  coverage_status text not null,
  coverage_source text not null,
  evidence text,
  created_at timestamptz not null default now(),

  constraint sales_import_coverage_status_valid
    check (
      coverage_status in (
        'complete',
        'partial',
        'unknown'
      )
    ),

  constraint sales_import_coverage_source_valid
    check (
      coverage_source in (
        'report_scope',
        'export_datetime',
        'user_confirmed',
        'legacy_manual'
      )
    ),

  constraint sales_import_coverage_date_key
    unique (import_id, coverage_date)
);

create index sales_import_coverage_date_idx
  on public.sales_import_coverage (
    coverage_date,
    coverage_status
  );

create index sales_import_coverage_import_idx
  on public.sales_import_coverage (
    import_id
  );

alter table public.sales_import_coverage enable row level security;

revoke all on table public.sales_import_coverage from anon;

grant select, insert, update, delete on table public.sales_import_coverage to authenticated;

create policy "Authenticated users can manage sales import coverage"
on public.sales_import_coverage for all to authenticated using (true) with check (true);
