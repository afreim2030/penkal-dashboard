alter table public.listing_performance
  add column import_id uuid references public.imports(id) on delete set null,
  add column status_current text,
  add column variation text,
  add column ad_quality text,
  add column purchase_experience text,
  add column unique_buyers integer,
  add column participation numeric,
  add column buyer_conversion numeric,
  add column total_reviews integer,
  add column bad_reviews integer,
  add column good_reviews integer,
  add column source_row_hash text;

create unique index listing_performance_period_mlb_key
  on public.listing_performance (period_start, period_end, mlb_raw)
  where mlb_raw is not null;

create index listing_performance_import_idx
  on public.listing_performance (import_id);

create index listing_performance_sku_period_idx
  on public.listing_performance (sku_raw, period_end);

create index listing_performance_mlb_period_idx
  on public.listing_performance (mlb_raw, period_end);
