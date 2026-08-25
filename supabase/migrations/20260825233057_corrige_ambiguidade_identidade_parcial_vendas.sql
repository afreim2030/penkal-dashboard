-- Consolida as correções de integridade da importação histórica de vendas.
-- 1. Usa o timestamp oficial gravado em imports para ordenar versões.
-- 2. Avança a proveniência de duplicatas exatas vindas de relatórios mais novos.
-- 3. Preserva vendas com apenas SKU ou MLB ausente, sem inventar identidade.
-- 4. Permite que uma linha completa posterior resolva uma identidade parcial.

alter table public.sales_import_conflicts
  add column if not exists resolved_at timestamptz;

alter table public.sales_import_conflicts
  drop constraint if exists sales_import_conflicts_type_valid;

alter table public.sales_import_conflicts
  add constraint sales_import_conflicts_type_valid check (
    conflict_type in (
      'missing_timestamp',
      'same_timestamp_different_content',
      'natural_identity_missing',
      'natural_identity_partial',
      'hash_collision'
    )
  );

update public.sales_import_conflicts
set conflict_type = 'natural_identity_partial'
where conflict_type = 'natural_identity_missing'
  and sale_number is not null
  and ((sku_raw is null and mlb_raw is not null) or (sku_raw is not null and mlb_raw is null));

create or replace function public.merge_sales_batch_results(p_left jsonb, p_right jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
with result_rows as (
  select coalesce(p_left, '{}'::jsonb) as result
  union all
  select coalesce(p_right, '{}'::jsonb)
), totals as (
  select jsonb_build_object(
    'inserted', coalesce(sum(coalesce((result -> 'totals' ->> 'inserted')::integer, 0)), 0),
    'updated', coalesce(sum(coalesce((result -> 'totals' ->> 'updated')::integer, 0)), 0),
    'duplicate_exact', coalesce(sum(coalesce((result -> 'totals' ->> 'duplicate_exact')::integer, 0)), 0),
    'old_ignored', coalesce(sum(coalesce((result -> 'totals' ->> 'old_ignored')::integer, 0)), 0),
    'conflicts', coalesce(sum(coalesce((result -> 'totals' ->> 'conflicts')::integer, 0)), 0)
  ) as stats
  from result_rows
), import_rows as (
  select entry.key as import_id, entry.value as stats
  from result_rows
  cross join lateral jsonb_each(coalesce(result -> 'by_import', '{}'::jsonb)) as entry
), by_import as (
  select coalesce(jsonb_object_agg(import_id, stats), '{}'::jsonb) as value
  from (
    select
      import_id,
      jsonb_build_object(
        'inserted', coalesce(sum(coalesce((stats ->> 'inserted')::integer, 0)), 0),
        'updated', coalesce(sum(coalesce((stats ->> 'updated')::integer, 0)), 0),
        'duplicate_exact', coalesce(sum(coalesce((stats ->> 'duplicate_exact')::integer, 0)), 0),
        'old_ignored', coalesce(sum(coalesce((stats ->> 'old_ignored')::integer, 0)), 0),
        'conflicts', coalesce(sum(coalesce((stats ->> 'conflicts')::integer, 0)), 0)
      ) as stats
    from import_rows
    group by import_id
  ) grouped
)
select jsonb_build_object(
  'totals', (select stats from totals),
  'by_import', (select value from by_import)
);
$$;

revoke all on function public.merge_sales_batch_results(jsonb, jsonb) from public;
grant execute on function public.merge_sales_batch_results(jsonb, jsonb) to authenticated;

create or replace function public.process_sales_flexible_identity_batch(p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
set statement_timeout = '60s'
as $$
declare
  item jsonb;
  incoming public.sales%rowtype;
  existing public.sales%rowtype;
  hash_owner public.sales%rowtype;
  source_timestamp timestamptz;
  existing_timestamp timestamptz;
  listing_product_id uuid;
  action_name text;
  row_is_partial boolean;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  create temp table flexible_sales_actions (
    import_id uuid not null,
    source_row_number integer not null,
    action text not null,
    is_partial boolean not null,
    primary key (import_id, source_row_number)
  ) on commit drop;

  lock table public.sales in share row exclusive mode;

  for item in
    select value
    from jsonb_array_elements(p_rows)
  loop
    incoming := jsonb_populate_record(
      null::public.sales,
      item || jsonb_build_object('id', gen_random_uuid(), 'created_at', now())
    );
    source_timestamp := nullif(item ->> 'source_exported_at', '')::timestamptz;
    row_is_partial := (incoming.sku_raw is null and incoming.mlb_raw is not null)
      or (incoming.sku_raw is not null and incoming.mlb_raw is null);

    if incoming.record_type <> 'sale_item'
      or incoming.import_id is null
      or incoming.sale_number is null
      or incoming.sale_date is null
      or incoming.source_row_number is null
      or incoming.source_row_hash is null
      or (incoming.sku_raw is null and incoming.mlb_raw is null)
    then
      continue;
    end if;

    incoming.cancelled := coalesce(incoming.cancelled, false);

    listing_product_id := null;
    if incoming.listing_id is not null then
      select listings.product_id
      into listing_product_id
      from public.listings
      where listings.id = incoming.listing_id;
    elsif incoming.mlb_raw is not null then
      select listings.id, listings.product_id
      into incoming.listing_id, listing_product_id
      from public.listings
      where listings.mlb = incoming.mlb_raw;
    end if;

    if incoming.product_id is null then
      incoming.product_id := listing_product_id;
    end if;
    if incoming.product_id is null and incoming.sku_raw is not null then
      select products.id
      into incoming.product_id
      from public.products
      where products.sku = incoming.sku_raw;
    end if;

    if row_is_partial then
      insert into public.sales_import_conflicts (
        import_id, sale_number, sku_raw, mlb_raw, record_type,
        incoming_source_row_hash, incoming_source_exported_at,
        conflict_type, details, resolved_at
      ) values (
        incoming.import_id,
        incoming.sale_number,
        incoming.sku_raw,
        incoming.mlb_raw,
        'sale_item',
        incoming.source_row_hash,
        source_timestamp,
        'natural_identity_partial',
        jsonb_build_object(
          'missing_sku', incoming.sku_raw is null,
          'missing_mlb', incoming.mlb_raw is null,
          'product_link_resolved', incoming.product_id is not null,
          'listing_link_resolved', incoming.listing_id is not null
        ),
        null
      )
      on conflict do nothing;
    end if;

    select sales.*
    into hash_owner
    from public.sales
    where sales.source_row_hash = incoming.source_row_hash
    limit 1;

    if found then
      if hash_owner.record_type = 'sale_item'
        and hash_owner.sale_number = incoming.sale_number
        and (
          (incoming.mlb_raw is not null and hash_owner.mlb_raw = incoming.mlb_raw)
          or (incoming.mlb_raw is null and incoming.sku_raw is not null and hash_owner.sku_raw = incoming.sku_raw)
        )
      then
        select imports.source_exported_at
        into existing_timestamp
        from public.imports
        where imports.id = hash_owner.import_id;

        if source_timestamp is not null
          and (hash_owner.import_id is null or existing_timestamp is null or source_timestamp > existing_timestamp)
        then
          update public.sales
          set
            import_id = incoming.import_id,
            source_row_number = incoming.source_row_number,
            source_file = incoming.source_file,
            product_id = coalesce(incoming.product_id, hash_owner.product_id),
            listing_id = coalesce(incoming.listing_id, hash_owner.listing_id)
          where id = hash_owner.id;
        end if;
        action_name := 'duplicate_exact';
      else
        insert into public.sales_import_conflicts (
          import_id, existing_sale_id, existing_import_id,
          sale_number, sku_raw, mlb_raw, record_type,
          incoming_source_row_hash, existing_source_row_hash,
          incoming_source_exported_at, existing_source_exported_at,
          conflict_type, details
        ) values (
          incoming.import_id,
          hash_owner.id,
          hash_owner.import_id,
          incoming.sale_number,
          incoming.sku_raw,
          incoming.mlb_raw,
          incoming.record_type,
          incoming.source_row_hash,
          hash_owner.source_row_hash,
          source_timestamp,
          (select imports.source_exported_at from public.imports where imports.id = hash_owner.import_id),
          'hash_collision',
          jsonb_build_object('reason', 'source_row_hash belongs to another sale identity')
        )
        on conflict do nothing;
        action_name := 'conflict';
      end if;

      insert into flexible_sales_actions values (
        incoming.import_id, incoming.source_row_number, action_name, row_is_partial
      ) on conflict do nothing;
      continue;
    end if;

    select sales.*
    into existing
    from public.sales
    where sales.record_type = 'sale_item'
      and sales.sale_number = incoming.sale_number
      and (
        (incoming.mlb_raw is not null and sales.mlb_raw = incoming.mlb_raw)
        or (incoming.mlb_raw is null and incoming.sku_raw is not null and sales.sku_raw = incoming.sku_raw)
      )
    order by
      (sales.sku_raw is not null and sales.mlb_raw is not null) desc,
      sales.created_at desc
    limit 1;

    if found then
      select imports.source_exported_at
      into existing_timestamp
      from public.imports
      where imports.id = existing.import_id;

      if source_timestamp is null or existing_timestamp is null or source_timestamp = existing_timestamp then
        insert into public.sales_import_conflicts (
          import_id, existing_sale_id, existing_import_id,
          sale_number, sku_raw, mlb_raw, record_type,
          incoming_source_row_hash, existing_source_row_hash,
          incoming_source_exported_at, existing_source_exported_at,
          conflict_type, details
        ) values (
          incoming.import_id,
          existing.id,
          existing.import_id,
          incoming.sale_number,
          incoming.sku_raw,
          incoming.mlb_raw,
          incoming.record_type,
          incoming.source_row_hash,
          existing.source_row_hash,
          source_timestamp,
          existing_timestamp,
          case
            when source_timestamp is null or existing_timestamp is null then 'missing_timestamp'
            else 'same_timestamp_different_content'
          end,
          jsonb_build_object('reason', 'version cannot be ordered safely for flexible sale identity')
        )
        on conflict do nothing;
        action_name := 'conflict';
      elsif source_timestamp < existing_timestamp then
        action_name := 'old_ignored';
      else
        update public.sales
        set
          sale_date = incoming.sale_date,
          product_id = coalesce(incoming.product_id, existing.product_id),
          listing_id = coalesce(incoming.listing_id, existing.listing_id),
          sku_raw = incoming.sku_raw,
          mlb_raw = incoming.mlb_raw,
          source_row_number = incoming.source_row_number,
          source_row_hash = incoming.source_row_hash,
          quantity = incoming.quantity,
          unit_price = incoming.unit_price,
          gross_amount = incoming.gross_amount,
          net_amount = incoming.net_amount,
          fees = incoming.fees,
          cancelled = incoming.cancelled,
          ads_sale = incoming.ads_sale,
          source_file = incoming.source_file,
          sale_status = incoming.sale_status,
          status_description = incoming.status_description,
          multi_product_package = incoming.multi_product_package,
          belongs_to_kit = incoming.belongs_to_kit,
          product_revenue = incoming.product_revenue,
          additional_price_revenue = incoming.additional_price_revenue,
          installment_fee = incoming.installment_fee,
          sale_fee_tax = incoming.sale_fee_tax,
          shipping_revenue = incoming.shipping_revenue,
          shipping_fee = incoming.shipping_fee,
          exchange_shipping_cost = incoming.exchange_shipping_cost,
          declared_dimensions_shipping_cost = incoming.declared_dimensions_shipping_cost,
          dimensions_difference_cost = incoming.dimensions_difference_cost,
          discounts_bonuses = incoming.discounts_bonuses,
          cancellations_refunds = incoming.cancellations_refunds,
          billing_month = incoming.billing_month,
          official_store = incoming.official_store,
          listing_title = incoming.listing_title,
          variation = incoming.variation,
          listing_type_raw = incoming.listing_type_raw,
          shipping_method = incoming.shipping_method,
          package_parent_sale_number = incoming.package_parent_sale_number,
          package_size = incoming.package_size,
          import_id = incoming.import_id
        where id = existing.id;
        action_name := 'updated';
      end if;
    else
      insert into public.sales
      select (incoming).*;
      action_name := 'inserted';
    end if;

    if not row_is_partial and action_name in ('inserted', 'updated', 'duplicate_exact') then
      update public.sales_import_conflicts
      set resolved_at = now()
      where resolved_at is null
        and conflict_type in ('natural_identity_missing', 'natural_identity_partial')
        and sale_number = incoming.sale_number
        and (
          (incoming.mlb_raw is not null and mlb_raw = incoming.mlb_raw)
          or (incoming.sku_raw is not null and sku_raw = incoming.sku_raw)
        );
    end if;

    insert into flexible_sales_actions values (
      incoming.import_id, incoming.source_row_number, action_name, row_is_partial
    ) on conflict do nothing;
  end loop;

  return (
    select jsonb_build_object(
      'totals', jsonb_build_object(
        'inserted', count(*) filter (where action = 'inserted'),
        'updated', count(*) filter (where action = 'updated'),
        'duplicate_exact', count(*) filter (where action = 'duplicate_exact'),
        'old_ignored', count(*) filter (where action = 'old_ignored'),
        'conflicts',
          count(*) filter (where is_partial)
          + count(*) filter (where not is_partial and action = 'conflict')
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
              'conflicts',
                count(*) filter (where is_partial)
                + count(*) filter (where not is_partial and action = 'conflict')
            ) as stats
          from flexible_sales_actions
          group by import_id
        ) grouped
      ), '{}'::jsonb)
    )
    from flexible_sales_actions
  );
end;
$$;

revoke all on function public.process_sales_flexible_identity_batch(jsonb) from public;
grant execute on function public.process_sales_flexible_identity_batch(jsonb) to authenticated;

create or replace function public.process_sales_import_batch(p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
set statement_timeout = '60s'
as $$
declare
  resolved_rows jsonb;
  flexible_rows jsonb;
  core_rows jsonb;
  flexible_result jsonb;
  core_result jsonb;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  select coalesce(
    jsonb_agg(
      case
        when source_import.source_exported_at is not null then
          jsonb_set(entries.item, '{source_exported_at}', to_jsonb(source_import.source_exported_at), true)
        else entries.item
      end
      order by entries.ordinality
    ),
    '[]'::jsonb
  )
  into resolved_rows
  from jsonb_array_elements(p_rows) with ordinality as entries(item, ordinality)
  left join public.imports as source_import
    on source_import.id = nullif(entries.item ->> 'import_id', '')::uuid;

  with incoming as (
    select
      nullif(item ->> 'import_id', '')::uuid as import_id,
      nullif(item ->> 'source_exported_at', '')::timestamptz as source_exported_at,
      nullif(item ->> 'sale_number', '') as sale_number,
      nullif(item ->> 'sku_raw', '') as sku_raw,
      nullif(item ->> 'mlb_raw', '') as mlb_raw,
      nullif(item ->> 'source_row_hash', '') as source_row_hash,
      nullif(item ->> 'source_row_number', '')::integer as source_row_number,
      nullif(item ->> 'source_file', '') as source_file,
      nullif(item ->> 'product_id', '')::uuid as product_id,
      nullif(item ->> 'listing_id', '')::uuid as listing_id,
      item ->> 'record_type' as record_type
    from jsonb_array_elements(resolved_rows) as rows(item)
  )
  update public.sales as existing
  set
    import_id = incoming.import_id,
    source_row_number = coalesce(incoming.source_row_number, existing.source_row_number),
    source_file = coalesce(incoming.source_file, existing.source_file),
    product_id = coalesce(incoming.product_id, existing.product_id),
    listing_id = coalesce(incoming.listing_id, existing.listing_id)
  from incoming
  where incoming.record_type = 'sale_item'
    and incoming.import_id is not null
    and incoming.source_exported_at is not null
    and incoming.sale_number is not null
    and incoming.sku_raw is not null
    and incoming.mlb_raw is not null
    and incoming.source_row_hash is not null
    and existing.record_type = 'sale_item'
    and existing.sale_number = incoming.sale_number
    and existing.sku_raw = incoming.sku_raw
    and existing.mlb_raw = incoming.mlb_raw
    and existing.source_row_hash = incoming.source_row_hash
    and (
      existing.import_id is null
      or (select i.source_exported_at from public.imports i where i.id = existing.import_id) is null
      or incoming.source_exported_at > (
        select i.source_exported_at from public.imports i where i.id = existing.import_id
      )
    );

  select coalesce(jsonb_agg(item order by ordinality), '[]'::jsonb)
  into flexible_rows
  from jsonb_array_elements(resolved_rows) with ordinality as entries(item, ordinality)
  where item ->> 'record_type' = 'sale_item'
    and nullif(item ->> 'sale_number', '') is not null
    and nullif(item ->> 'sale_date', '') is not null
    and (
      (
        (nullif(item ->> 'sku_raw', '') is null) <>
        (nullif(item ->> 'mlb_raw', '') is null)
      )
      or (
        nullif(item ->> 'sku_raw', '') is not null
        and nullif(item ->> 'mlb_raw', '') is not null
        and exists (
          select 1
          from public.sales existing
          where existing.record_type = 'sale_item'
            and existing.sale_number = nullif(item ->> 'sale_number', '')
            and (
              (existing.sku_raw is null and existing.mlb_raw = nullif(item ->> 'mlb_raw', ''))
              or (existing.mlb_raw is null and existing.sku_raw = nullif(item ->> 'sku_raw', ''))
            )
        )
      )
    );

  select coalesce(jsonb_agg(item order by ordinality), '[]'::jsonb)
  into core_rows
  from jsonb_array_elements(resolved_rows) with ordinality as entries(item, ordinality)
  where not (
    item ->> 'record_type' = 'sale_item'
    and nullif(item ->> 'sale_number', '') is not null
    and nullif(item ->> 'sale_date', '') is not null
    and (
      (
        (nullif(item ->> 'sku_raw', '') is null) <>
        (nullif(item ->> 'mlb_raw', '') is null)
      )
      or (
        nullif(item ->> 'sku_raw', '') is not null
        and nullif(item ->> 'mlb_raw', '') is not null
        and exists (
          select 1
          from public.sales existing
          where existing.record_type = 'sale_item'
            and existing.sale_number = nullif(item ->> 'sale_number', '')
            and (
              (existing.sku_raw is null and existing.mlb_raw = nullif(item ->> 'mlb_raw', ''))
              or (existing.mlb_raw is null and existing.sku_raw = nullif(item ->> 'sku_raw', ''))
            )
        )
      )
    )
  );

  flexible_result := public.process_sales_flexible_identity_batch(flexible_rows);
  core_result := public.process_sales_import_batch_core(core_rows);

  return public.merge_sales_batch_results(core_result, flexible_result);
end;
$$;

revoke all on function public.process_sales_import_batch(jsonb) from public;
grant execute on function public.process_sales_import_batch(jsonb) to authenticated;
