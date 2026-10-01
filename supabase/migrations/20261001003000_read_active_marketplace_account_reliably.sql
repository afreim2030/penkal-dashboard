create or replace function public.get_active_marketplace_account_id()
returns uuid
language sql
security definer
set search_path = public
as $$
  select account_id
  from public.user_active_marketplace_accounts
  where user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.get_active_marketplace_account_id() from public;
grant execute on function public.get_active_marketplace_account_id() to authenticated;
