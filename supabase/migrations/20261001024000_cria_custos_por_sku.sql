create table if not exists public.product_costs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.marketplace_accounts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  updated_at timestamptz not null default now(),
  unique (account_id, product_id)
);

alter table public.product_costs enable row level security;
revoke all on public.product_costs from anon;
grant select, insert, update, delete on public.product_costs to authenticated;
create policy "Users manage their account product costs" on public.product_costs for all to authenticated
using (account_id in (select id from public.marketplace_accounts where owner_user_id = auth.uid()))
with check (account_id in (select id from public.marketplace_accounts where owner_user_id = auth.uid()));
