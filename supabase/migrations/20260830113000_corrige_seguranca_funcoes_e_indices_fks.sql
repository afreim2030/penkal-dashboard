revoke all on function public.create_task_from_alert() from public, anon, authenticated;
revoke all on function public.sync_task_when_alert_changes() from public, anon, authenticated;

create index if not exists alert_resolutions_resolved_by_idx
  on public.alert_resolutions (resolved_by);

create index if not exists identifier_link_ignores_created_by_idx
  on public.identifier_link_ignores (created_by);

create index if not exists operational_tasks_listing_id_idx
  on public.operational_tasks (listing_id);

create index if not exists operational_tasks_product_id_idx
  on public.operational_tasks (product_id);
