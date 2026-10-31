create table public.historical_sku_rankings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.marketplace_accounts(id) on delete cascade,
  import_id uuid not null references public.imports(id) on delete cascade,
  sku text not null check (btrim(sku) <> ''),
  product_name text null,
  historical_units integer not null check (historical_units >= 0),
  historical_rank integer not null check (historical_rank > 0),
  historical_curve text not null check (historical_curve in ('A', 'B', 'C', 'D', 'E')),
  source_file text not null,
  created_at timestamptz not null default now(),
  unique (account_id, sku)
);

create index historical_sku_rankings_account_rank_idx
  on public.historical_sku_rankings (account_id, historical_rank);

alter table public.historical_sku_rankings enable row level security;

create policy "Current marketplace account only"
  on public.historical_sku_rankings
  for all
  to authenticated
  using (account_id = public.current_marketplace_account_id())
  with check (account_id = public.current_marketplace_account_id());
