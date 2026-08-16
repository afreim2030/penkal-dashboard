create or replace function public.get_ads_dashboard_data()
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
with selected_period as (
  select period_start, period_end
  from public.ad_metrics
  order by period_end desc, period_start desc
  limit 1
), scoped as (
  select metrics.*
  from public.ad_metrics metrics
  join selected_period period
    on period.period_start = metrics.period_start
   and period.period_end = metrics.period_end
), summary as (
  select
    coalesce(sum(investment), 0)::numeric as investment,
    coalesce(sum(revenue), 0)::numeric as revenue,
    coalesce(sum(impressions), 0)::bigint as impressions,
    coalesce(sum(clicks), 0)::bigint as clicks,
    coalesce(sum(direct_sales), 0)::bigint as direct_sales,
    coalesce(sum(indirect_sales), 0)::bigint as indirect_sales,
    count(distinct campaign_name)::bigint as campaigns,
    count(*)::bigint as rows
  from scoped
), campaigns as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'campaignName', ranked.campaign_name,
    'investment', ranked.investment,
    'revenue', ranked.revenue,
    'impressions', ranked.impressions,
    'clicks', ranked.clicks,
    'sales', ranked.sales,
    'ctr', case when ranked.impressions > 0 then ranked.clicks::numeric / ranked.impressions else 0 end,
    'cpc', case when ranked.clicks > 0 then ranked.investment / ranked.clicks else 0 end,
    'acos', case when ranked.revenue > 0 then ranked.investment / ranked.revenue else null end,
    'roas', case when ranked.investment > 0 then ranked.revenue / ranked.investment else null end
  ) order by ranked.investment desc, ranked.revenue desc), '[]'::jsonb) as value
  from (
    select
      campaign_name,
      coalesce(sum(investment), 0)::numeric as investment,
      coalesce(sum(revenue), 0)::numeric as revenue,
      coalesce(sum(impressions), 0)::bigint as impressions,
      coalesce(sum(clicks), 0)::bigint as clicks,
      (coalesce(sum(direct_sales), 0) + coalesce(sum(indirect_sales), 0))::bigint as sales
    from scoped
    group by campaign_name
    order by investment desc, revenue desc
    limit 30
  ) ranked
), listings_rank as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'mlb', ranked.mlb_raw,
    'title', ranked.title,
    'investment', ranked.investment,
    'revenue', ranked.revenue,
    'impressions', ranked.impressions,
    'clicks', ranked.clicks,
    'sales', ranked.sales,
    'acos', case when ranked.revenue > 0 then ranked.investment / ranked.revenue else null end,
    'roas', case when ranked.investment > 0 then ranked.revenue / ranked.investment else null end
  ) order by ranked.investment desc, ranked.revenue desc), '[]'::jsonb) as value
  from (
    select
      scoped.mlb_raw,
      coalesce(max(listings.title), max(scoped.mlb_raw), 'Sem anúncio') as title,
      coalesce(sum(scoped.investment), 0)::numeric as investment,
      coalesce(sum(scoped.revenue), 0)::numeric as revenue,
      coalesce(sum(scoped.impressions), 0)::bigint as impressions,
      coalesce(sum(scoped.clicks), 0)::bigint as clicks,
      (coalesce(sum(scoped.direct_sales), 0) + coalesce(sum(scoped.indirect_sales), 0))::bigint as sales
    from scoped
    left join public.listings on listings.id = scoped.listing_id
    group by scoped.mlb_raw
    order by investment desc, revenue desc
    limit 30
  ) ranked
)
select jsonb_build_object(
  'period', case when selected_period.period_start is null then null else jsonb_build_object(
    'start', selected_period.period_start,
    'end', selected_period.period_end
  ) end,
  'summary', jsonb_build_object(
    'investment', summary.investment,
    'revenue', summary.revenue,
    'impressions', summary.impressions,
    'clicks', summary.clicks,
    'sales', summary.direct_sales + summary.indirect_sales,
    'directSales', summary.direct_sales,
    'indirectSales', summary.indirect_sales,
    'campaigns', summary.campaigns,
    'rows', summary.rows,
    'ctr', case when summary.impressions > 0 then summary.clicks::numeric / summary.impressions else 0 end,
    'cpc', case when summary.clicks > 0 then summary.investment / summary.clicks else 0 end,
    'acos', case when summary.revenue > 0 then summary.investment / summary.revenue else null end,
    'roas', case when summary.investment > 0 then summary.revenue / summary.investment else null end
  ),
  'campaigns', campaigns.value,
  'listings', listings_rank.value
)
from summary
cross join campaigns
cross join listings_rank
left join selected_period on true;
$$;

revoke all on function public.get_ads_dashboard_data() from public;
grant execute on function public.get_ads_dashboard_data() to authenticated;
