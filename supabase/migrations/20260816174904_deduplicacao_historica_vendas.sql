alter table public.imports
  add column source_exported_at timestamptz,
  add column source_exported_at_source text,
  add constraint imports_source_exported_at_source_valid check (
    source_exported_at_source in ('filename', 'user_confirmed', 'unknown')
  );

create index imports_source_exported_at_idx
  on public.imports (source_exported_at);

alter table public.sales
  add column import_id uuid references public.imports(id) on delete set null;

create index sales_import_id_idx on public.sales (import_id);

with parsed as (
  select
    id,
    regexp_match(
      file_name,
      '(20[0-9]{2})-([0-9]{2})-([0-9]{2})[_ -]([0-9]{1,2})-([0-9]{2})hs?',
      'i'
    ) as parts
  from public.imports
  where import_type = 'sales'
)
update public.imports as target
set
  source_exported_at = case
    when parsed.parts is null then null
    when parsed.parts[2]::integer not between 1 and 12 then null
    when parsed.parts[3]::integer < 1 then null
    when parsed.parts[3]::integer > extract(
      day from (
        make_date(parsed.parts[1]::integer, parsed.parts[2]::integer, 1)
        + interval '1 month - 1 day'
      )
    ) then null
    when parsed.parts[4]::integer not between 0 and 23 then null
    when parsed.parts[5]::integer not between 0 and 59 then null
    else make_timestamptz(
      parsed.parts[1]::integer,
      parsed.parts[2]::integer,
      parsed.parts[3]::integer,
      parsed.parts[4]::integer,
      parsed.parts[5]::integer,
      0,
      'America/Sao_Paulo'
    )
  end,
  source_exported_at_source = case
    when parsed.parts is null then 'unknown'
    when parsed.parts[2]::integer not between 1 and 12 then 'unknown'
    when parsed.parts[3]::integer < 1 then 'unknown'
    when parsed.parts[3]::integer > extract(
      day from (
        make_date(parsed.parts[1]::integer, parsed.parts[2]::integer, 1)
        + interval '1 month - 1 day'
      )
    ) then 'unknown'
    when parsed.parts[4]::integer not between 0 and 23 then 'unknown'
    when parsed.parts[5]::integer not between 0 and 59 then 'unknown'
    else 'filename'
  end
from parsed
where target.id = parsed.id;

with unique_matches as (
  select
    sales.id as sale_id,
    (array_agg(imports.id order by imports.id))[1] as import_id
  from public.sales
  join public.imports
    on imports.import_type = 'sales'
   and imports.file_name = sales.source_file
  group by sales.id
  having count(*) = 1
)
update public.sales
set import_id = unique_matches.import_id
from unique_matches
where public.sales.id = unique_matches.sale_id;

create table public.sales_import_conflicts (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.imports(id) on delete cascade,
  existing_sale_id uuid references public.sales(id) on delete set null,
  existing_import_id uuid references public.imports(id) on delete set null,
  sale_number text,
  sku_raw text,
  mlb_raw text,
  record_type text,
  incoming_source_row_hash text,
  existing_source_row_hash text,
  incoming_source_exported_at timestamptz,
  existing_source_exported_at timestamptz,
  conflict_type text not null,
  details jsonb,
  created_at timestamptz not null default now(),
  constraint sales_import_conflicts_type_valid check (
    conflict_type in (
      'missing_timestamp',
      'same_timestamp_different_content',
      'natural_identity_missing',
      'hash_collision'
    )
  )
);

create unique index sales_import_conflicts_dedup_idx
  on public.sales_import_conflicts (
    import_id,
    coalesce(existing_sale_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(sale_number, ''),
    coalesce(sku_raw, ''),
    coalesce(mlb_raw, ''),
    coalesce(record_type, ''),
    conflict_type,
    coalesce(incoming_source_row_hash, '')
  );

create index sales_import_conflicts_import_idx
  on public.sales_import_conflicts (import_id);

create index sales_import_conflicts_sale_idx
  on public.sales_import_conflicts (existing_sale_id);

alter table public.sales_import_conflicts enable row level security;
revoke all on table public.sales_import_conflicts from anon;
grant select, insert, update, delete on table public.sales_import_conflicts to authenticated;

create policy "Authenticated users can manage sales import conflicts"
on public.sales_import_conflicts
for all to authenticated
using (true)
with check (true);

create or replace function public.process_sales_import_batch(p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  lock table public.sales in share row exclusive mode;

  create temp table sales_import_batch_rows (
    import_id uuid not null,
    source_exported_at timestamptz,
    sale_number text,
    sale_date timestamptz,
    product_id uuid,
    listing_id uuid,
    sku_raw text,
    mlb_raw text,
    source_row_number integer not null,
    source_row_hash text,
    record_type text not null,
    quantity integer,
    unit_price numeric(14, 2),
    gross_amount numeric(14, 2),
    net_amount numeric(14, 2),
    fees numeric(14, 2),
    cancelled boolean,
    ads_sale boolean,
    source_file text,
    sale_status text,
    status_description text,
    multi_product_package boolean,
    belongs_to_kit boolean,
    product_revenue numeric(14, 2),
    additional_price_revenue numeric(14, 2),
    installment_fee numeric(14, 2),
    sale_fee_tax numeric(14, 2),
    shipping_revenue numeric(14, 2),
    shipping_fee numeric(14, 2),
    exchange_shipping_cost numeric(14, 2),
    declared_dimensions_shipping_cost numeric(14, 2),
    dimensions_difference_cost numeric(14, 2),
    discounts_bonuses numeric(14, 2),
    cancellations_refunds numeric(14, 2),
    billing_month text,
    official_store text,
    listing_title text,
    variation text,
    listing_type_raw text,
    shipping_method text,
    package_parent_sale_number text,
    package_size integer
  ) on commit drop;

  create temp table sales_import_batch_actions (
    import_id uuid not null,
    source_row_number integer not null,
    action text not null,
    primary key (import_id, source_row_number)
  ) on commit drop;

  insert into sales_import_batch_rows
  select *
  from jsonb_to_recordset(p_rows) as rows(
    import_id uuid,
    source_exported_at timestamptz,
    sale_number text,
    sale_date timestamptz,
    product_id uuid,
    listing_id uuid,
    sku_raw text,
    mlb_raw text,
    source_row_number integer,
    source_row_hash text,
    record_type text,
    quantity integer,
    unit_price numeric(14, 2),
    gross_amount numeric(14, 2),
    net_amount numeric(14, 2),
    fees numeric(14, 2),
    cancelled boolean,
    ads_sale boolean,
    source_file text,
    sale_status text,
    status_description text,
    multi_product_package boolean,
    belongs_to_kit boolean,
    product_revenue numeric(14, 2),
    additional_price_revenue numeric(14, 2),
    installment_fee numeric(14, 2),
    sale_fee_tax numeric(14, 2),
    shipping_revenue numeric(14, 2),
    shipping_fee numeric(14, 2),
    exchange_shipping_cost numeric(14, 2),
    declared_dimensions_shipping_cost numeric(14, 2),
    dimensions_difference_cost numeric(14, 2),
    discounts_bonuses numeric(14, 2),
    cancellations_refunds numeric(14, 2),
    billing_month text,
    official_store text,
    listing_title text,
    variation text,
    listing_type_raw text,
    shipping_method text,
    package_parent_sale_number text,
    package_size integer
  );

  -- Identidades repetidas dentro do mesmo arquivo/lote.
  with ranked as (
    select
      rows.*,
      row_number() over (
        partition by sale_number, sku_raw, mlb_raw
        order by source_row_number
      ) as rn,
      first_value(source_row_hash) over (
        partition by sale_number, sku_raw, mlb_raw
        order by source_row_number
      ) as first_hash
    from sales_import_batch_rows as rows
    where record_type = 'sale_item'
      and sale_number is not null
      and sku_raw is not null
      and mlb_raw is not null
  )
  insert into public.sales_import_conflicts (
    import_id, sale_number, sku_raw, mlb_raw, record_type,
    incoming_source_row_hash, incoming_source_exported_at,
    conflict_type, details
  )
  select
    import_id, sale_number, sku_raw, mlb_raw, record_type,
    source_row_hash, source_exported_at,
    'same_timestamp_different_content',
    jsonb_build_object('reason', 'same identity repeated in the same incoming file')
  from ranked
  where rn > 1
    and source_row_hash is distinct from first_hash
  on conflict do nothing;

  with ranked as (
    select
      rows.*,
      row_number() over (
        partition by sale_number, sku_raw, mlb_raw
        order by source_row_number
      ) as rn,
      first_value(source_row_hash) over (
        partition by sale_number, sku_raw, mlb_raw
        order by source_row_number
      ) as first_hash
    from sales_import_batch_rows as rows
    where record_type = 'sale_item'
      and sale_number is not null
      and sku_raw is not null
      and mlb_raw is not null
  )
  insert into sales_import_batch_actions (import_id, source_row_number, action)
  select
    import_id,
    source_row_number,
    case when source_row_hash is not distinct from first_hash
      then 'duplicate_exact'
      else 'conflict'
    end
  from ranked
  where rn > 1
  on conflict do nothing;

  -- Linhas sem identidade natural segura.
  insert into public.sales_import_conflicts (
    import_id, sale_number, sku_raw, mlb_raw, record_type,
    incoming_source_row_hash, incoming_source_exported_at,
    conflict_type, details
  )
  select
    rows.import_id,
    rows.sale_number,
    rows.sku_raw,
    rows.mlb_raw,
    rows.record_type,
    rows.source_row_hash,
    rows.source_exported_at,
    'natural_identity_missing',
    jsonb_build_object(
      'missing_sale_number', rows.sale_number is null,
      'missing_sku', rows.sku_raw is null,
      'missing_mlb', rows.mlb_raw is null
    )
  from sales_import_batch_rows as rows
  where rows.record_type = 'sale_item'
    and (rows.sale_number is null or rows.sku_raw is null or rows.mlb_raw is null)
  on conflict do nothing;

  insert into sales_import_batch_actions (import_id, source_row_number, action)
  select rows.import_id, rows.source_row_number, 'conflict'
  from sales_import_batch_rows as rows
  where rows.record_type = 'sale_item'
    and (rows.sale_number is null or rows.sku_raw is null or rows.mlb_raw is null)
  on conflict do nothing;

  -- Duplicados exatos já persistidos.
  insert into sales_import_batch_actions (import_id, source_row_number, action)
  select rows.import_id, rows.source_row_number, 'duplicate_exact'
  from sales_import_batch_rows as rows
  where exists (
    select 1
    from public.sales as existing
    where existing.source_row_hash = rows.source_row_hash
      and (
        rows.record_type <> 'sale_item'
        or (
          existing.record_type = 'sale_item'
          and existing.sale_number = rows.sale_number
          and existing.sku_raw = rows.sku_raw
          and existing.mlb_raw = rows.mlb_raw
        )
      )
  )
  on conflict do nothing;

  -- Hash idêntico pertencendo a outra identidade de venda.
  insert into public.sales_import_conflicts (
    import_id, existing_sale_id, existing_import_id,
    sale_number, sku_raw, mlb_raw, record_type,
    incoming_source_row_hash, existing_source_row_hash,
    incoming_source_exported_at, existing_source_exported_at,
    conflict_type, details
  )
  select
    rows.import_id,
    existing.id,
    existing.import_id,
    rows.sale_number,
    rows.sku_raw,
    rows.mlb_raw,
    rows.record_type,
    rows.source_row_hash,
    existing.source_row_hash,
    rows.source_exported_at,
    existing_import.source_exported_at,
    'hash_collision',
    jsonb_build_object('reason', 'source_row_hash belongs to another sale identity')
  from sales_import_batch_rows as rows
  join public.sales as existing
    on existing.source_row_hash = rows.source_row_hash
  left join public.imports as existing_import
    on existing_import.id = existing.import_id
  where rows.record_type = 'sale_item'
    and not (
      existing.record_type = 'sale_item'
      and existing.sale_number = rows.sale_number
      and existing.sku_raw = rows.sku_raw
      and existing.mlb_raw = rows.mlb_raw
    )
  on conflict do nothing;

  insert into sales_import_batch_actions (import_id, source_row_number, action)
  select rows.import_id, rows.source_row_number, 'conflict'
  from sales_import_batch_rows as rows
  where rows.record_type = 'sale_item'
    and exists (
      select 1
      from public.sales as existing
      where existing.source_row_hash = rows.source_row_hash
        and not (
          existing.record_type = 'sale_item'
          and existing.sale_number = rows.sale_number
          and existing.sku_raw = rows.sku_raw
          and existing.mlb_raw = rows.mlb_raw
        )
    )
  on conflict do nothing;

  -- Mesma identidade, conteúdo diferente, mas sem versão temporal comparável.
  insert into public.sales_import_conflicts (
    import_id, existing_sale_id, existing_import_id,
    sale_number, sku_raw, mlb_raw, record_type,
    incoming_source_row_hash, existing_source_row_hash,
    incoming_source_exported_at, existing_source_exported_at,
    conflict_type, details
  )
  select
    rows.import_id,
    existing.id,
    existing.import_id,
    rows.sale_number,
    rows.sku_raw,
    rows.mlb_raw,
    rows.record_type,
    rows.source_row_hash,
    existing.source_row_hash,
    rows.source_exported_at,
    existing_import.source_exported_at,
    case
      when rows.source_exported_at is null or existing_import.source_exported_at is null
        then 'missing_timestamp'
      else 'same_timestamp_different_content'
    end,
    jsonb_build_object('reason', 'version cannot be ordered safely')
  from sales_import_batch_rows as rows
  join public.sales as existing
    on existing.record_type = 'sale_item'
   and existing.sale_number = rows.sale_number
   and existing.sku_raw = rows.sku_raw
   and existing.mlb_raw = rows.mlb_raw
  left join public.imports as existing_import
    on existing_import.id = existing.import_id
  where rows.record_type = 'sale_item'
    and rows.source_row_hash is distinct from existing.source_row_hash
    and (
      rows.source_exported_at is null
      or existing_import.source_exported_at is null
      or rows.source_exported_at = existing_import.source_exported_at
    )
  on conflict do nothing;

  insert into sales_import_batch_actions (import_id, source_row_number, action)
  select rows.import_id, rows.source_row_number, 'conflict'
  from sales_import_batch_rows as rows
  join public.sales as existing
    on existing.record_type = 'sale_item'
   and existing.sale_number = rows.sale_number
   and existing.sku_raw = rows.sku_raw
   and existing.mlb_raw = rows.mlb_raw
  left join public.imports as existing_import
    on existing_import.id = existing.import_id
  where rows.record_type = 'sale_item'
    and rows.source_row_hash is distinct from existing.source_row_hash
    and (
      rows.source_exported_at is null
      or existing_import.source_exported_at is null
      or rows.source_exported_at = existing_import.source_exported_at
    )
  on conflict do nothing;

  -- Versões antigas são ignoradas sem alterar o estado mais novo.
  insert into sales_import_batch_actions (import_id, source_row_number, action)
  select rows.import_id, rows.source_row_number, 'old_ignored'
  from sales_import_batch_rows as rows
  join public.sales as existing
    on existing.record_type = 'sale_item'
   and existing.sale_number = rows.sale_number
   and existing.sku_raw = rows.sku_raw
   and existing.mlb_raw = rows.mlb_raw
  join public.imports as existing_import
    on existing_import.id = existing.import_id
  where rows.record_type = 'sale_item'
    and rows.source_row_hash is distinct from existing.source_row_hash
    and rows.source_exported_at is not null
    and existing_import.source_exported_at is not null
    and rows.source_exported_at < existing_import.source_exported_at
  on conflict do nothing;

  -- Versões mais novas substituem apenas os campos mutáveis/proveniência.
  with updated as (
    update public.sales as existing
    set
      sale_date = rows.sale_date,
      product_id = rows.product_id,
      listing_id = rows.listing_id,
      source_row_number = rows.source_row_number,
      source_row_hash = rows.source_row_hash,
      quantity = rows.quantity,
      unit_price = rows.unit_price,
      gross_amount = rows.gross_amount,
      net_amount = rows.net_amount,
      fees = rows.fees,
      cancelled = coalesce(rows.cancelled, false),
      ads_sale = rows.ads_sale,
      source_file = rows.source_file,
      sale_status = rows.sale_status,
      status_description = rows.status_description,
      multi_product_package = rows.multi_product_package,
      belongs_to_kit = rows.belongs_to_kit,
      product_revenue = rows.product_revenue,
      additional_price_revenue = rows.additional_price_revenue,
      installment_fee = rows.installment_fee,
      sale_fee_tax = rows.sale_fee_tax,
      shipping_revenue = rows.shipping_revenue,
      shipping_fee = rows.shipping_fee,
      exchange_shipping_cost = rows.exchange_shipping_cost,
      declared_dimensions_shipping_cost = rows.declared_dimensions_shipping_cost,
      dimensions_difference_cost = rows.dimensions_difference_cost,
      discounts_bonuses = rows.discounts_bonuses,
      cancellations_refunds = rows.cancellations_refunds,
      billing_month = rows.billing_month,
      official_store = rows.official_store,
      listing_title = rows.listing_title,
      variation = rows.variation,
      listing_type_raw = rows.listing_type_raw,
      shipping_method = rows.shipping_method,
      package_parent_sale_number = rows.package_parent_sale_number,
      package_size = rows.package_size,
      import_id = rows.import_id
    from sales_import_batch_rows as rows
    join public.imports as existing_import
      on existing_import.id = existing.import_id
    where rows.record_type = 'sale_item'
      and existing.record_type = 'sale_item'
      and existing.sale_number = rows.sale_number
      and existing.sku_raw = rows.sku_raw
      and existing.mlb_raw = rows.mlb_raw
      and rows.source_row_hash is distinct from existing.source_row_hash
      and rows.source_exported_at is not null
      and existing_import.source_exported_at is not null
      and rows.source_exported_at > existing_import.source_exported_at
      and not exists (
        select 1
        from sales_import_batch_actions as actions
        where actions.import_id = rows.import_id
          and actions.source_row_number = rows.source_row_number
      )
      and not exists (
        select 1
        from public.sales as hash_owner
        where hash_owner.source_row_hash = rows.source_row_hash
          and hash_owner.id <> existing.id
      )
    returning rows.import_id, rows.source_row_number
  )
  insert into sales_import_batch_actions (import_id, source_row_number, action)
  select import_id, source_row_number, 'updated'
  from updated
  on conflict do nothing;

  -- Novos itens de venda com identidade segura.
  with inserted as (
    insert into public.sales (
      sale_number, sale_date, product_id, listing_id, sku_raw, mlb_raw,
      source_row_number, source_row_hash, record_type, quantity, unit_price,
      gross_amount, net_amount, fees, cancelled, ads_sale, source_file,
      sale_status, status_description, multi_product_package, belongs_to_kit,
      product_revenue, additional_price_revenue, installment_fee, sale_fee_tax,
      shipping_revenue, shipping_fee, exchange_shipping_cost,
      declared_dimensions_shipping_cost, dimensions_difference_cost,
      discounts_bonuses, cancellations_refunds, billing_month, official_store,
      listing_title, variation, listing_type_raw, shipping_method,
      package_parent_sale_number, package_size, import_id
    )
    select
      rows.sale_number,
      rows.sale_date,
      rows.product_id,
      rows.listing_id,
      rows.sku_raw,
      rows.mlb_raw,
      rows.source_row_number,
      rows.source_row_hash,
      rows.record_type,
      rows.quantity,
      rows.unit_price,
      rows.gross_amount,
      rows.net_amount,
      rows.fees,
      coalesce(rows.cancelled, false),
      rows.ads_sale,
      rows.source_file,
      rows.sale_status,
      rows.status_description,
      rows.multi_product_package,
      rows.belongs_to_kit,
      rows.product_revenue,
      rows.additional_price_revenue,
      rows.installment_fee,
      rows.sale_fee_tax,
      rows.shipping_revenue,
      rows.shipping_fee,
      rows.exchange_shipping_cost,
      rows.declared_dimensions_shipping_cost,
      rows.dimensions_difference_cost,
      rows.discounts_bonuses,
      rows.cancellations_refunds,
      rows.billing_month,
      rows.official_store,
      rows.listing_title,
      rows.variation,
      rows.listing_type_raw,
      rows.shipping_method,
      rows.package_parent_sale_number,
      rows.package_size,
      rows.import_id
    from sales_import_batch_rows as rows
    where rows.record_type = 'sale_item'
      and rows.sale_number is not null
      and rows.sale_date is not null
      and rows.sku_raw is not null
      and rows.mlb_raw is not null
      and not exists (
        select 1
        from sales_import_batch_actions as actions
        where actions.import_id = rows.import_id
          and actions.source_row_number = rows.source_row_number
      )
      and not exists (
        select 1
        from public.sales as existing
        where existing.record_type = 'sale_item'
          and existing.sale_number = rows.sale_number
          and existing.sku_raw = rows.sku_raw
          and existing.mlb_raw = rows.mlb_raw
      )
      and not exists (
        select 1
        from public.sales as hash_owner
        where hash_owner.source_row_hash = rows.source_row_hash
      )
    returning import_id, source_row_number
  )
  insert into sales_import_batch_actions (import_id, source_row_number, action)
  select import_id, source_row_number, 'inserted'
  from inserted
  on conflict do nothing;

  -- Resumos de pacote/troca continuam idempotentes apenas pelo hash exato.
  with inserted as (
    insert into public.sales (
      sale_number, sale_date, product_id, listing_id, sku_raw, mlb_raw,
      source_row_number, source_row_hash, record_type, quantity, unit_price,
      gross_amount, net_amount, fees, cancelled, ads_sale, source_file,
      sale_status, status_description, multi_product_package, belongs_to_kit,
      product_revenue, additional_price_revenue, installment_fee, sale_fee_tax,
      shipping_revenue, shipping_fee, exchange_shipping_cost,
      declared_dimensions_shipping_cost, dimensions_difference_cost,
      discounts_bonuses, cancellations_refunds, billing_month, official_store,
      listing_title, variation, listing_type_raw, shipping_method,
      package_parent_sale_number, package_size, import_id
    )
    select
      rows.sale_number,
      rows.sale_date,
      rows.product_id,
      rows.listing_id,
      rows.sku_raw,
      rows.mlb_raw,
      rows.source_row_number,
      rows.source_row_hash,
      rows.record_type,
      rows.quantity,
      rows.unit_price,
      rows.gross_amount,
      rows.net_amount,
      rows.fees,
      coalesce(rows.cancelled, false),
      rows.ads_sale,
      rows.source_file,
      rows.sale_status,
      rows.status_description,
      rows.multi_product_package,
      rows.belongs_to_kit,
      rows.product_revenue,
      rows.additional_price_revenue,
      rows.installment_fee,
      rows.sale_fee_tax,
      rows.shipping_revenue,
      rows.shipping_fee,
      rows.exchange_shipping_cost,
      rows.declared_dimensions_shipping_cost,
      rows.dimensions_difference_cost,
      rows.discounts_bonuses,
      rows.cancellations_refunds,
      rows.billing_month,
      rows.official_store,
      rows.listing_title,
      rows.variation,
      rows.listing_type_raw,
      rows.shipping_method,
      rows.package_parent_sale_number,
      rows.package_size,
      rows.import_id
    from sales_import_batch_rows as rows
    where rows.record_type <> 'sale_item'
      and rows.sale_number is not null
      and rows.sale_date is not null
      and not exists (
        select 1
        from sales_import_batch_actions as actions
        where actions.import_id = rows.import_id
          and actions.source_row_number = rows.source_row_number
      )
      and not exists (
        select 1
        from public.sales as existing
        where existing.source_row_hash = rows.source_row_hash
      )
    returning import_id, source_row_number
  )
  insert into sales_import_batch_actions (import_id, source_row_number, action)
  select import_id, source_row_number, 'inserted'
  from inserted
  on conflict do nothing;

  select jsonb_build_object(
    'totals', jsonb_build_object(
      'inserted', count(*) filter (where action = 'inserted'),
      'updated', count(*) filter (where action = 'updated'),
      'duplicate_exact', count(*) filter (where action = 'duplicate_exact'),
      'old_ignored', count(*) filter (where action = 'old_ignored'),
      'conflicts', count(*) filter (where action = 'conflict')
    ),
    'by_import', coalesce((
      select jsonb_object_agg(grouped.import_id::text, grouped.stats)
      from (
        select
          import_id,
          jsonb_build_object(
            'inserted', count(*) filter (where action = 'inserted'),
            'updated', count(*) filter (where action = 'updated'),
            'duplicate_exact', count(*) filter (where action = 'duplicate_exact'),
            'old_ignored', count(*) filter (where action = 'old_ignored'),
            'conflicts', count(*) filter (where action = 'conflict')
          ) as stats
        from sales_import_batch_actions
        group by import_id
      ) as grouped
    ), '{}'::jsonb)
  )
  into result
  from sales_import_batch_actions;

  return result;
end;
$$;

revoke all on function public.process_sales_import_batch(jsonb) from public;
grant execute on function public.process_sales_import_batch(jsonb) to authenticated;
