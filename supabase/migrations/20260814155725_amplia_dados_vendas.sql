alter table public.sales
  add column if not exists sale_status text,
  add column if not exists status_description text,
  add column if not exists multi_product_package boolean,
  add column if not exists belongs_to_kit boolean,
  add column if not exists product_revenue numeric(14, 2),
  add column if not exists additional_price_revenue numeric(14, 2),
  add column if not exists installment_fee numeric(14, 2),
  add column if not exists sale_fee_tax numeric(14, 2),
  add column if not exists shipping_revenue numeric(14, 2),
  add column if not exists shipping_fee numeric(14, 2),
  add column if not exists exchange_shipping_cost numeric(14, 2),
  add column if not exists declared_dimensions_shipping_cost numeric(14, 2),
  add column if not exists dimensions_difference_cost numeric(14, 2),
  add column if not exists discounts_bonuses numeric(14, 2),
  add column if not exists cancellations_refunds numeric(14, 2),
  add column if not exists billing_month text,
  add column if not exists official_store text,
  add column if not exists listing_title text,
  add column if not exists variation text,
  add column if not exists listing_type_raw text,
  add column if not exists shipping_method text,
  add column if not exists package_parent_sale_number text,
  add column if not exists package_size integer;

alter table public.sales
  alter column quantity drop not null,
  drop constraint if exists sales_quantity_positive,
  add constraint sales_sale_item_quantity_positive check (
    record_type <> 'sale_item' or (quantity is not null and quantity > 0)
  );

comment on column public.sales.gross_amount is
  'Receita bruta do produto, quando aplicavel.';

comment on column public.sales.net_amount is
  'Valor da coluna "Total (BRL)" do relatorio de vendas, quando aplicavel.';

create index if not exists sales_sale_status_idx on public.sales (sale_status);
create index if not exists sales_record_type_idx on public.sales (record_type);
create index if not exists sales_package_parent_sale_number_idx on public.sales (package_parent_sale_number);
create index if not exists sales_ads_sale_idx on public.sales (ads_sale);
