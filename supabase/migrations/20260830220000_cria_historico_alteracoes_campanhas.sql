alter table public.campaign_changes
  add column if not exists campaign_status text,
  add column if not exists investment numeric(14,2),
  add column if not exists revenue numeric(14,2),
  add column if not exists roas numeric(14,6),
  add column if not exists acos numeric(12,6),
  add column if not exists clicks bigint,
  add column if not exists sales integer,
  add column if not exists conversion numeric(12,6);

create or replace function public.record_campaign_change(
  p_campaign_name text,
  p_change_type text,
  p_campaign_status text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  change_id uuid;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado'; end if;
  if nullif(btrim(p_campaign_name), '') is null then raise exception 'Campanha obrigatória'; end if;
  if p_change_type not in ('Orçamento', 'ACOS alvo', 'Produtos', 'Campanha', 'Outro') then
    raise exception 'Tipo de alteração inválido';
  end if;

  insert into public.campaign_changes (
    campaign_name, change_type, campaign_status, notes, created_by,
    investment, revenue, roas, acos, clicks, sales, conversion
  )
  select
    p_campaign_name, p_change_type, nullif(btrim(p_campaign_status), ''), nullif(btrim(p_notes), ''), auth.uid(),
    coalesce(sum(m.investment), 0), coalesce(sum(m.revenue), 0),
    case when sum(m.investment) > 0 then sum(m.revenue) / sum(m.investment) else null end,
    case when sum(m.revenue) > 0 then sum(m.investment) / sum(m.revenue) else null end,
    coalesce(sum(m.clicks), 0)::bigint,
    coalesce(sum(m.direct_sales), 0)::int + coalesce(sum(m.indirect_sales), 0)::int,
    case when sum(m.clicks) > 0 then (coalesce(sum(m.direct_sales), 0) + coalesce(sum(m.indirect_sales), 0))::numeric / sum(m.clicks) else null end
  from public.ad_metrics m
  where m.campaign_name = p_campaign_name
    and (m.period_start, m.period_end) = (select period_start, period_end from public.ad_metrics order by period_end desc, period_start desc limit 1)
  returning id into change_id;
  return change_id;
end;
$$;

create or replace function public.get_campaign_history_data()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
with selected_period as (
  select period_start, period_end from public.ad_metrics order by period_end desc, period_start desc limit 1
), campaign_metrics as (
  select m.campaign_name,
    coalesce(sum(m.investment), 0)::numeric investment,
    coalesce(sum(m.revenue), 0)::numeric revenue,
    coalesce(sum(m.clicks), 0)::bigint clicks,
    (coalesce(sum(m.direct_sales), 0) + coalesce(sum(m.indirect_sales), 0))::bigint sales,
    case when sum(m.investment) > 0 then sum(m.revenue) / sum(m.investment) else null end roas,
    case when sum(m.revenue) > 0 then sum(m.investment) / sum(m.revenue) else null end acos,
    case when sum(m.clicks) > 0 then (coalesce(sum(m.direct_sales), 0) + coalesce(sum(m.indirect_sales), 0))::numeric / sum(m.clicks) else null end conversion,
    case when bool_or(lower(coalesce(m.status, '')) = 'ativo') then 'Ativa' else coalesce(max(m.status), 'Sem status') end campaign_status
  from public.ad_metrics m join selected_period p on p.period_start=m.period_start and p.period_end=m.period_end
  group by m.campaign_name
), last_changes as (
  select distinct on (campaign_name) campaign_name, changed_at, change_type, campaign_status, notes
  from public.campaign_changes order by campaign_name, changed_at desc
), campaigns as (
  select cm.*,
    lc.changed_at last_changed_at,
    greatest(0, current_date - coalesce((lc.changed_at at time zone 'America/Sao_Paulo')::date, p.period_end)) days_without_change,
    coalesce(lc.campaign_status, cm.campaign_status) status,
    lc.change_type last_change_type,
    lc.notes last_notes
  from campaign_metrics cm cross join selected_period p left join last_changes lc using (campaign_name)
), history as (
  select * from public.campaign_changes order by changed_at desc limit 100
)
select jsonb_build_object(
  'period', (select jsonb_build_object('start', period_start, 'end', period_end) from selected_period),
  'campaigns', coalesce((select jsonb_agg(jsonb_build_object(
    'campaignName', campaign_name, 'investment', investment, 'revenue', revenue, 'clicks', clicks, 'sales', sales,
    'roas', roas, 'acos', acos, 'conversion', conversion, 'status', status, 'lastChangedAt', last_changed_at,
    'daysWithoutChange', days_without_change, 'lastChangeType', last_change_type, 'lastNotes', last_notes
  ) order by days_without_change desc nulls first, investment desc) from campaigns), '[]'::jsonb),
  'history', coalesce((select jsonb_agg(jsonb_build_object(
    'id', id, 'campaignName', campaign_name, 'changedAt', changed_at, 'changeType', change_type,
    'status', campaign_status, 'notes', notes, 'investment', investment, 'revenue', revenue,
    'roas', roas, 'acos', acos, 'clicks', clicks, 'sales', sales, 'conversion', conversion
  ) order by changed_at desc) from history), '[]'::jsonb)
);
$$;

revoke all on function public.record_campaign_change(text,text,text,text) from public, anon;
grant execute on function public.record_campaign_change(text,text,text,text) to authenticated;
revoke all on function public.get_campaign_history_data() from public, anon;
grant execute on function public.get_campaign_history_data() to authenticated;
