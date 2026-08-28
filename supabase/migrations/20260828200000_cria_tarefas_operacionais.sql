create table if not exists public.operational_tasks (
id uuid primary key default gen_random_uuid(), title text not null, description text,
category text not null default 'Operação', priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
status text not null default 'pending' check (status in ('pending','in_progress','completed')),
alert_id uuid references public.alerts(id) on delete set null, product_id uuid references public.products(id) on delete set null,
listing_id uuid references public.listings(id) on delete set null, campaign_name text, due_date date,
created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(),
updated_at timestamptz not null default now(), completed_at timestamptz);
create index if not exists operational_tasks_status_idx on public.operational_tasks(status);
create index if not exists operational_tasks_created_by_idx on public.operational_tasks(created_by);
alter table public.operational_tasks enable row level security;
revoke all on public.operational_tasks from anon;
grant select,insert,update,delete on public.operational_tasks to authenticated;
drop policy if exists "Authenticated users can manage own operational tasks" on public.operational_tasks;
create policy "Authenticated users can manage own operational tasks" on public.operational_tasks for all to authenticated
using (created_by = (select auth.uid()) or created_by is null) with check (created_by = (select auth.uid()));
drop trigger if exists operational_tasks_set_updated_at on public.operational_tasks;
create trigger operational_tasks_set_updated_at before update on public.operational_tasks for each row execute function public.set_updated_at();
insert into public.operational_tasks (title,description,category,priority,alert_id,product_id,listing_id,campaign_name)
select a.title,a.description,a.category,case a.severity when 'critical' then 'critical' when 'warning' then 'high' else 'medium' end,a.id,a.product_id,a.listing_id,a.campaign_name
from public.alerts a where not a.is_resolved and not exists (select 1 from public.operational_tasks t where t.alert_id=a.id);
create or replace function public.get_operational_tasks() returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'description',t.description,'category',t.category,'priority',t.priority,'status',t.status,'alertId',t.alert_id,'dueDate',t.due_date,'createdAt',t.created_at,'completedAt',t.completed_at) order by t.created_at desc),'[]'::jsonb) from public.operational_tasks t; $$;
revoke all on function public.get_operational_tasks() from public,anon;
grant execute on function public.get_operational_tasks() to authenticated;