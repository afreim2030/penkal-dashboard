alter table public.ad_metrics
  add column if not exists import_id uuid references public.imports (id) on delete set null,
  add column if not exists ad_title text,
  add column if not exists status text,
  add column if not exists source_row_hash text;

create index if not exists ad_metrics_import_id_idx on public.ad_metrics (import_id);
create index if not exists ad_metrics_source_row_hash_idx on public.ad_metrics (source_row_hash);

create or replace function public.process_ad_metrics_batch(p_import_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare affected integer := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'p_rows must be a JSON array'; end if;
  insert into public.ad_metrics (
    period_start, period_end, campaign_name, listing_id, product_id, mlb_raw,
    impressions, clicks, cpc, ctr, conversion, revenue, investment, acos, roas,
    direct_sales, indirect_sales, source_file, import_id, ad_title, status, source_row_hash
  )
  select rows.period_start, rows.period_end, rows.campaign_name, listings.id, listings.product_id, rows.mlb_raw,
    rows.impressions, rows.clicks, rows.cpc, rows.ctr, rows.conversion, rows.revenue, rows.investment, rows.acos, rows.roas,
    rows.direct_sales, rows.indirect_sales, rows.source_file, p_import_id, rows.ad_title, rows.status, rows.source_row_hash
  from jsonb_to_recordset(p_rows) as rows(
    period_start date, period_end date, campaign_name text, ad_title text, mlb_raw text, status text,
    impressions bigint, clicks bigint, cpc numeric, ctr numeric, conversion numeric, revenue numeric, investment numeric,
    acos numeric, roas numeric, direct_sales integer, indirect_sales integer, source_file text, source_row_hash text
  )
  left join public.listings listings on listings.mlb = rows.mlb_raw
  on conflict (campaign_name, mlb_raw, period_start, period_end)
  do update set listing_id = excluded.listing_id, product_id = excluded.product_id, impressions = excluded.impressions,
    clicks = excluded.clicks, cpc = excluded.cpc, ctr = excluded.ctr, conversion = excluded.conversion,
    revenue = excluded.revenue, investment = excluded.investment, acos = excluded.acos, roas = excluded.roas,
    direct_sales = excluded.direct_sales, indirect_sales = excluded.indirect_sales, source_file = excluded.source_file,
    import_id = excluded.import_id, ad_title = excluded.ad_title, status = excluded.status, source_row_hash = excluded.source_row_hash;
  get diagnostics affected = row_count;
  return jsonb_build_object('processed', affected);
end;
$$;

revoke all on function public.process_ad_metrics_batch(uuid, jsonb) from public;
grant execute on function public.process_ad_metrics_batch(uuid, jsonb) to authenticated;

create or replace function public.get_ads_dashboard_data()
returns jsonb language sql security invoker set search_path = public, pg_temp as $$
with selected_period as (select period_start, period_end from public.ad_metrics order by period_end desc, period_start desc limit 1),
scoped as (select metrics.* from public.ad_metrics metrics join selected_period period on period.period_start = metrics.period_start and period.period_end = metrics.period_end),
summary as (select coalesce(sum(investment),0)::numeric investment, coalesce(sum(revenue),0)::numeric revenue, coalesce(sum(impressions),0)::bigint impressions, coalesce(sum(clicks),0)::bigint clicks, coalesce(sum(direct_sales),0)::bigint direct_sales, coalesce(sum(indirect_sales),0)::bigint indirect_sales, count(distinct campaign_name)::bigint campaigns, count(*)::bigint rows from scoped),
campaigns as (select coalesce(jsonb_agg(jsonb_build_object('campaignName',r.campaign_name,'investment',r.investment,'revenue',r.revenue,'impressions',r.impressions,'clicks',r.clicks,'sales',r.sales,'ctr',case when r.impressions>0 then r.clicks::numeric/r.impressions else 0 end,'cpc',case when r.clicks>0 then r.investment/r.clicks else 0 end,'acos',case when r.revenue>0 then r.investment/r.revenue else null end,'roas',case when r.investment>0 then r.revenue/r.investment else null end) order by r.investment desc,r.revenue desc),'[]'::jsonb) value from (select campaign_name,coalesce(sum(investment),0)::numeric investment,coalesce(sum(revenue),0)::numeric revenue,coalesce(sum(impressions),0)::bigint impressions,coalesce(sum(clicks),0)::bigint clicks,(coalesce(sum(direct_sales),0)+coalesce(sum(indirect_sales),0))::bigint sales from scoped group by campaign_name order by investment desc,revenue desc limit 30) r),
listings_rank as (select coalesce(jsonb_agg(jsonb_build_object('mlb',r.mlb_raw,'title',r.title,'investment',r.investment,'revenue',r.revenue,'impressions',r.impressions,'clicks',r.clicks,'sales',r.sales,'acos',case when r.revenue>0 then r.investment/r.revenue else null end,'roas',case when r.investment>0 then r.revenue/r.investment else null end) order by r.investment desc,r.revenue desc),'[]'::jsonb) value from (select scoped.mlb_raw,coalesce(max(listings.title),max(scoped.ad_title),max(scoped.mlb_raw),'Sem anúncio') title,coalesce(sum(scoped.investment),0)::numeric investment,coalesce(sum(scoped.revenue),0)::numeric revenue,coalesce(sum(scoped.impressions),0)::bigint impressions,coalesce(sum(scoped.clicks),0)::bigint clicks,(coalesce(sum(scoped.direct_sales),0)+coalesce(sum(scoped.indirect_sales),0))::bigint sales from scoped left join public.listings on listings.id=scoped.listing_id group by scoped.mlb_raw order by investment desc,revenue desc limit 30) r)
select jsonb_build_object('period',case when selected_period.period_start is null then null else jsonb_build_object('start',selected_period.period_start,'end',selected_period.period_end) end,'summary',jsonb_build_object('investment',summary.investment,'revenue',summary.revenue,'impressions',summary.impressions,'clicks',summary.clicks,'sales',summary.direct_sales+summary.indirect_sales,'directSales',summary.direct_sales,'indirectSales',summary.indirect_sales,'campaigns',summary.campaigns,'rows',summary.rows,'ctr',case when summary.impressions>0 then summary.clicks::numeric/summary.impressions else 0 end,'cpc',case when summary.clicks>0 then summary.investment/summary.clicks else 0 end,'acos',case when summary.revenue>0 then summary.investment/summary.revenue else null end,'roas',case when summary.investment>0 then summary.revenue/summary.investment else null end),'campaigns',campaigns.value,'listings',listings_rank.value) from summary cross join campaigns cross join listings_rank left join selected_period on true;
$$;

revoke all on function public.get_ads_dashboard_data() from public;
grant execute on function public.get_ads_dashboard_data() to authenticated;
