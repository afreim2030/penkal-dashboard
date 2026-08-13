create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_sku_not_blank check (btrim(sku) <> ''),
  constraint products_name_not_blank check (btrim(name) <> '')
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  mlb text not null unique,
  product_id uuid references public.products (id) on delete set null,
  title text not null,
  listing_type text,
  status text,
  current_price numeric(14, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_mlb_not_blank check (btrim(mlb) <> ''),
  constraint listings_current_price_nonnegative check (current_price is null or current_price >= 0)
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  sale_number text not null,
  sale_date timestamptz not null,
  product_id uuid references public.products (id) on delete set null,
  listing_id uuid references public.listings (id) on delete set null,
  sku_raw text,
  mlb_raw text,
  source_row_number integer,
  source_row_hash text,
  record_type text not null default 'sale_item',
  quantity integer not null,
  unit_price numeric(14, 2) not null,
  gross_amount numeric(14, 2) not null,
  net_amount numeric(14, 2),
  fees numeric(14, 2),
  cancelled boolean not null default false,
  ads_sale boolean not null default false,
  source_file text not null,
  created_at timestamptz not null default now(),
  constraint sales_sale_number_not_blank check (btrim(sale_number) <> ''),
  constraint sales_record_type_valid check (record_type in ('sale_item', 'package_summary', 'exchange_summary')),
  constraint sales_quantity_positive check (quantity > 0)
);

create table public.full_inventory_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  product_id uuid references public.products (id) on delete set null,
  listing_id uuid references public.listings (id) on delete set null,
  sku_raw text,
  mlb_raw text,
  quantity_full integer not null,
  sales_30d integer,
  source_file text not null,
  created_at timestamptz not null default now(),
  constraint full_inventory_snapshots_natural_key
    unique nulls not distinct (snapshot_date, sku_raw, mlb_raw),
  constraint full_inventory_snapshots_quantity_nonnegative check (quantity_full >= 0),
  constraint full_inventory_snapshots_sales_30d_nonnegative check (sales_30d is null or sales_30d >= 0)
);

create table public.full_inbounds (
  id uuid primary key default gen_random_uuid(),
  inbound_id text not null,
  received_at timestamptz,
  product_id uuid references public.products (id) on delete set null,
  sku_raw text not null,
  listing_numbers text[],
  units_declared integer,
  units_processed integer,
  units_sellable integer,
  units_unsellable integer,
  source_file text not null,
  created_at timestamptz not null default now(),
  constraint full_inbounds_inbound_sku_key unique (inbound_id, sku_raw),
  constraint full_inbounds_inbound_id_not_blank check (btrim(inbound_id) <> ''),
  constraint full_inbounds_sku_raw_not_blank check (btrim(sku_raw) <> ''),
  constraint full_inbounds_units_nonnegative check (
    (units_declared is null or units_declared >= 0)
    and (units_processed is null or units_processed >= 0)
    and (units_sellable is null or units_sellable >= 0)
    and (units_unsellable is null or units_unsellable >= 0)
  )
);

create table public.listing_performance (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  listing_id uuid references public.listings (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  sku_raw text,
  mlb_raw text not null,
  visits integer,
  sales_count integer,
  units_sold integer,
  gross_sales numeric(14, 2),
  conversion numeric(12, 6),
  source_file text not null,
  created_at timestamptz not null default now(),
  constraint listing_performance_mlb_period_key unique (mlb_raw, period_start, period_end),
  constraint listing_performance_period_valid check (period_end >= period_start),
  constraint listing_performance_mlb_raw_not_blank check (btrim(mlb_raw) <> ''),
  constraint listing_performance_counts_nonnegative check (
    (visits is null or visits >= 0)
    and (sales_count is null or sales_count >= 0)
    and (units_sold is null or units_sold >= 0)
  ),
  constraint listing_performance_gross_sales_nonnegative check (gross_sales is null or gross_sales >= 0),
  constraint listing_performance_conversion_nonnegative check (conversion is null or conversion >= 0)
);

create table public.ad_metrics (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  campaign_name text not null,
  listing_id uuid references public.listings (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  mlb_raw text,
  impressions bigint,
  clicks bigint,
  cpc numeric(14, 4),
  ctr numeric(12, 6),
  conversion numeric(12, 6),
  revenue numeric(14, 2),
  investment numeric(14, 2),
  acos numeric(12, 6),
  roas numeric(14, 6),
  direct_sales integer,
  indirect_sales integer,
  source_file text not null,
  created_at timestamptz not null default now(),
  constraint ad_metrics_natural_key unique nulls not distinct (campaign_name, mlb_raw, period_start, period_end),
  constraint ad_metrics_period_valid check (period_end >= period_start),
  constraint ad_metrics_campaign_name_not_blank check (btrim(campaign_name) <> ''),
  constraint ad_metrics_counts_nonnegative check (
    (impressions is null or impressions >= 0)
    and (clicks is null or clicks >= 0)
    and (direct_sales is null or direct_sales >= 0)
    and (indirect_sales is null or indirect_sales >= 0)
  ),
  constraint ad_metrics_values_nonnegative check (
    (cpc is null or cpc >= 0)
    and (ctr is null or ctr >= 0)
    and (conversion is null or conversion >= 0)
    and (revenue is null or revenue >= 0)
    and (investment is null or investment >= 0)
    and (acos is null or acos >= 0)
    and (roas is null or roas >= 0)
  )
);

create table public.campaign_changes (
  id uuid primary key default gen_random_uuid(),
  campaign_name text not null,
  changed_at timestamptz not null default now(),
  change_type text not null,
  notes text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint campaign_changes_campaign_name_not_blank check (btrim(campaign_name) <> ''),
  constraint campaign_changes_change_type_not_blank check (btrim(change_type) <> '')
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  severity text not null,
  title text not null,
  description text,
  product_id uuid references public.products (id) on delete set null,
  listing_id uuid references public.listings (id) on delete set null,
  campaign_name text,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  is_resolved boolean not null default false,
  created_at timestamptz not null default now(),
  constraint alerts_resolution_consistent check (
    (is_resolved and resolved_at is not null)
    or (not is_resolved and resolved_at is null)
  )
);

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  import_type text not null,
  file_name text not null,
  file_hash text not null unique,
  period_start date,
  period_end date,
  status text not null,
  row_count integer not null default 0,
  error_count integer not null default 0,
  imported_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint imports_file_hash_not_blank check (btrim(file_hash) <> ''),
  constraint imports_period_valid check (period_start is null or period_end is null or period_end >= period_start),
  constraint imports_counts_nonnegative check (row_count >= 0 and error_count >= 0)
);

create table public.saved_filters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  page text not null,
  filters jsonb not null default '{}'::jsonb,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  constraint saved_filters_name_not_blank check (btrim(name) <> ''),
  constraint saved_filters_page_not_blank check (btrim(page) <> ''),
  constraint saved_filters_filters_object check (jsonb_typeof(filters) = 'object'),
  constraint saved_filters_user_name_page_key unique (user_id, name, page)
);

create index listings_product_id_idx on public.listings (product_id);
create index sales_sale_date_idx on public.sales (sale_date);
create index sales_product_id_idx on public.sales (product_id);
create index sales_listing_id_idx on public.sales (listing_id);
create index sales_sku_raw_idx on public.sales (sku_raw);
create index sales_mlb_raw_idx on public.sales (mlb_raw);
create unique index sales_sale_item_natural_key_idx
on public.sales (sale_number, sku_raw, mlb_raw)
where record_type = 'sale_item' and sku_raw is not null and mlb_raw is not null;
create unique index sales_source_row_hash_idx on public.sales (source_row_hash) where source_row_hash is not null;
create index full_inventory_snapshots_snapshot_date_idx on public.full_inventory_snapshots (snapshot_date);
create index full_inventory_snapshots_product_id_idx on public.full_inventory_snapshots (product_id);
create index full_inventory_snapshots_listing_id_idx on public.full_inventory_snapshots (listing_id);
create index full_inventory_snapshots_sku_raw_idx on public.full_inventory_snapshots (sku_raw);
create index full_inventory_snapshots_mlb_raw_idx on public.full_inventory_snapshots (mlb_raw);
create index full_inbounds_received_at_idx on public.full_inbounds (received_at);
create index full_inbounds_product_id_idx on public.full_inbounds (product_id);
create index full_inbounds_sku_raw_idx on public.full_inbounds (sku_raw);
create index listing_performance_period_idx on public.listing_performance (period_start, period_end);
create index listing_performance_listing_id_idx on public.listing_performance (listing_id);
create index listing_performance_product_id_idx on public.listing_performance (product_id);
create index listing_performance_sku_raw_idx on public.listing_performance (sku_raw);
create index ad_metrics_period_idx on public.ad_metrics (period_start, period_end);
create index ad_metrics_campaign_name_idx on public.ad_metrics (campaign_name);
create index ad_metrics_listing_id_idx on public.ad_metrics (listing_id);
create index ad_metrics_product_id_idx on public.ad_metrics (product_id);
create index campaign_changes_campaign_name_idx on public.campaign_changes (campaign_name);
create index campaign_changes_changed_at_idx on public.campaign_changes (changed_at);
create index alerts_detected_at_idx on public.alerts (detected_at);
create index alerts_product_id_idx on public.alerts (product_id);
create index alerts_listing_id_idx on public.alerts (listing_id);
create index alerts_campaign_name_idx on public.alerts (campaign_name);
create index imports_created_at_idx on public.imports (created_at);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create trigger listings_set_updated_at
before update on public.listings
for each row execute function public.set_updated_at();

alter table public.products enable row level security;
alter table public.listings enable row level security;
alter table public.sales enable row level security;
alter table public.full_inventory_snapshots enable row level security;
alter table public.full_inbounds enable row level security;
alter table public.listing_performance enable row level security;
alter table public.ad_metrics enable row level security;
alter table public.campaign_changes enable row level security;
alter table public.alerts enable row level security;
alter table public.imports enable row level security;
alter table public.saved_filters enable row level security;

revoke all on table public.products from anon;
revoke all on table public.listings from anon;
revoke all on table public.sales from anon;
revoke all on table public.full_inventory_snapshots from anon;
revoke all on table public.full_inbounds from anon;
revoke all on table public.listing_performance from anon;
revoke all on table public.ad_metrics from anon;
revoke all on table public.campaign_changes from anon;
revoke all on table public.alerts from anon;
revoke all on table public.imports from anon;
revoke all on table public.saved_filters from anon;

grant select, insert, update, delete on table public.products to authenticated;
grant select, insert, update, delete on table public.listings to authenticated;
grant select, insert, update, delete on table public.sales to authenticated;
grant select, insert, update, delete on table public.full_inventory_snapshots to authenticated;
grant select, insert, update, delete on table public.full_inbounds to authenticated;
grant select, insert, update, delete on table public.listing_performance to authenticated;
grant select, insert, update, delete on table public.ad_metrics to authenticated;
grant select, insert, update, delete on table public.campaign_changes to authenticated;
grant select, insert, update, delete on table public.alerts to authenticated;
grant select, insert, update, delete on table public.imports to authenticated;
grant select, insert, update, delete on table public.saved_filters to authenticated;

create policy "Authenticated users can manage products"
on public.products for all to authenticated using (true) with check (true);

create policy "Authenticated users can manage listings"
on public.listings for all to authenticated using (true) with check (true);

create policy "Authenticated users can manage sales"
on public.sales for all to authenticated using (true) with check (true);

create policy "Authenticated users can manage full inventory snapshots"
on public.full_inventory_snapshots for all to authenticated using (true) with check (true);

create policy "Authenticated users can manage full inbounds"
on public.full_inbounds for all to authenticated using (true) with check (true);

create policy "Authenticated users can manage listing performance"
on public.listing_performance for all to authenticated using (true) with check (true);

create policy "Authenticated users can manage ad metrics"
on public.ad_metrics for all to authenticated using (true) with check (true);

create policy "Authenticated users can manage campaign changes"
on public.campaign_changes for all to authenticated using (true) with check (true);

create policy "Authenticated users can manage alerts"
on public.alerts for all to authenticated using (true) with check (true);

create policy "Authenticated users can manage imports"
on public.imports for all to authenticated using (true) with check (true);

create policy "Authenticated users can manage saved filters"
on public.saved_filters for all to authenticated using (true) with check (true);
