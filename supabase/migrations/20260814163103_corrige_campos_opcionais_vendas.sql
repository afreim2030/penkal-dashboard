alter table public.sales
  alter column ads_sale drop not null,
  alter column ads_sale drop default,
  alter column unit_price drop not null,
  alter column unit_price drop default;

comment on column public.sales.ads_sale is
  'True ou false somente quando o relatorio informa explicitamente; null quando desconhecido.';

comment on column public.sales.unit_price is
  'Preco unitario explicito do relatorio; null quando a coluna nao estiver disponivel.';
