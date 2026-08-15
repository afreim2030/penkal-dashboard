alter table public.full_inbounds
  add column status_raw text,
  add column mlb_raw text,
  add column listing_id uuid references public.listings (id) on delete set null,
  add column units_difference integer,
  add column units_unidentified integer,
  add constraint full_inbounds_units_unidentified_nonnegative check (
    units_unidentified is null or units_unidentified >= 0
  );

create index full_inbounds_listing_id_idx on public.full_inbounds (listing_id);
