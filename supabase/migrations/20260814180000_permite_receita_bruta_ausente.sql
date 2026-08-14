alter table public.sales
  alter column gross_amount drop not null;

comment on column public.sales.gross_amount is
  'Valor explicito da coluna de receita bruta; null quando ausente no relatorio.';
