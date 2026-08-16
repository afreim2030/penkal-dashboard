create or replace function public.process_listing_performance_batch(
  p_import_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  affected integer := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  insert into public.listing_performance (
    period_start, period_end, listing_id, product_id, sku_raw, mlb_raw,
    visits, sales_count, units_sold, gross_sales, conversion, source_file,
    import_id, status_current, variation, ad_quality, purchase_experience,
    unique_buyers, participation, buyer_conversion, total_reviews,
    bad_reviews, good_reviews, source_row_hash
  )
  select
    rows.period_start,
    rows.period_end,
    listings.id,
    coalesce(listings.product_id, products.id),
    rows.sku_raw,
    rows.mlb_raw,
    rows.visits,
    rows.sales_count,
    rows.units_sold,
    rows.gross_sales,
    rows.conversion,
    rows.source_file,
    p_import_id,
    rows.status_current,
    rows.variation,
    rows.ad_quality,
    rows.purchase_experience,
    rows.unique_buyers,
    rows.participation,
    rows.buyer_conversion,
    rows.total_reviews,
    rows.bad_reviews,
    rows.good_reviews,
    rows.source_row_hash
  from jsonb_to_recordset(p_rows) as rows(
    period_start date,
    period_end date,
    sku_raw text,
    mlb_raw text,
    visits integer,
    sales_count integer,
    units_sold integer,
    gross_sales numeric,
    conversion numeric,
    source_file text,
    status_current text,
    variation text,
    ad_quality text,
    purchase_experience text,
    unique_buyers integer,
    participation numeric,
    buyer_conversion numeric,
    total_reviews integer,
    bad_reviews integer,
    good_reviews integer,
    source_row_hash text
  )
  left join public.listings listings on listings.mlb = rows.mlb_raw
  left join public.products products on products.sku = rows.sku_raw
  on conflict (period_start, period_end, mlb_raw)
    where mlb_raw is not null
  do update set
    listing_id = excluded.listing_id,
    product_id = excluded.product_id,
    sku_raw = excluded.sku_raw,
    visits = excluded.visits,
    sales_count = excluded.sales_count,
    units_sold = excluded.units_sold,
    gross_sales = excluded.gross_sales,
    conversion = excluded.conversion,
    source_file = excluded.source_file,
    import_id = excluded.import_id,
    status_current = excluded.status_current,
    variation = excluded.variation,
    ad_quality = excluded.ad_quality,
    purchase_experience = excluded.purchase_experience,
    unique_buyers = excluded.unique_buyers,
    participation = excluded.participation,
    buyer_conversion = excluded.buyer_conversion,
    total_reviews = excluded.total_reviews,
    bad_reviews = excluded.bad_reviews,
    good_reviews = excluded.good_reviews,
    source_row_hash = excluded.source_row_hash;

  get diagnostics affected = row_count;
  return jsonb_build_object('processed', affected);
end;
$$;

revoke all on function public.process_listing_performance_batch(uuid, jsonb) from public;
grant execute on function public.process_listing_performance_batch(uuid, jsonb) to authenticated;
