-- =====================================================================
-- Brandsystem – "Weitere" entfernen und Beispielfarben seeden
--
-- 1. Entfernt die Default-Kategorie "Weitere" (Print) aus der Seed-Funktion
-- 2. Loescht vorhandene "Weitere"-Kategorien (keine Werte vorhanden)
-- 3. Legt pro Brand 4 Beispielfarben mit CMYK/Pantone/HEX/RGB-Werten an,
--    sofern die Brand noch keine Farben hat.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Seed-Funktion aktualisieren (ohne "Weitere")
-- ---------------------------------------------------------------------
create or replace function public.seed_brand_color_categories()
returns trigger
language plpgsql
as $$
begin
  insert into public.brand_color_categories (brand_id, "group", key, label, position)
  values
    (new.id, 'print',   'cmyk',    'CMYK',    0),
    (new.id, 'print',   'pantone', 'Pantone', 1),
    (new.id, 'digital', 'hex',     'HEX',     0),
    (new.id, 'digital', 'rgb',     'RGB',     1)
  on conflict (brand_id, "group", key) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. "Weitere"-Kategorien entfernen (inkl. eventueller Werte via CASCADE)
-- ---------------------------------------------------------------------
delete from public.brand_color_categories
  where "group" = 'print' and key = 'weitere';

-- ---------------------------------------------------------------------
-- 3. Beispielfarben fuer Brands ohne Farben
-- ---------------------------------------------------------------------
do $$
declare
  brand_row record;
  ink_id       uuid;
  paper_id     uuid;
  signal_id    uuid;
  accent_id    uuid;
  cmyk_cat     uuid;
  pantone_cat  uuid;
  hex_cat      uuid;
  rgb_cat      uuid;
begin
  for brand_row in
    select b.id
    from public.brands b
    where not exists (
      select 1 from public.brand_colors bc where bc.brand_id = b.id
    )
  loop
    -- Kategorien ermitteln (falls aus irgendeinem Grund nicht vorhanden, anlegen)
    insert into public.brand_color_categories (brand_id, "group", key, label, position)
    values
      (brand_row.id, 'print',   'cmyk',    'CMYK',    0),
      (brand_row.id, 'print',   'pantone', 'Pantone', 1),
      (brand_row.id, 'digital', 'hex',     'HEX',     0),
      (brand_row.id, 'digital', 'rgb',     'RGB',     1)
    on conflict (brand_id, "group", key) do nothing;

    select id into cmyk_cat    from public.brand_color_categories
      where brand_id = brand_row.id and "group" = 'print'   and key = 'cmyk';
    select id into pantone_cat from public.brand_color_categories
      where brand_id = brand_row.id and "group" = 'print'   and key = 'pantone';
    select id into hex_cat     from public.brand_color_categories
      where brand_id = brand_row.id and "group" = 'digital' and key = 'hex';
    select id into rgb_cat     from public.brand_color_categories
      where brand_id = brand_row.id and "group" = 'digital' and key = 'rgb';

    -- Print-Farben
    insert into public.brand_colors (brand_id, "group", name, hex, position)
    values (brand_row.id, 'print', 'Ink', '#111111', 0)
    returning id into ink_id;

    insert into public.brand_colors (brand_id, "group", name, hex, position)
    values (brand_row.id, 'print', 'Signal', '#E4FF1A', 1)
    returning id into signal_id;

    -- Digital-Farben
    insert into public.brand_colors (brand_id, "group", name, hex, position)
    values (brand_row.id, 'digital', 'Paper', '#FAFAFA', 0)
    returning id into paper_id;

    insert into public.brand_colors (brand_id, "group", name, hex, position)
    values (brand_row.id, 'digital', 'Accent Blue', '#2563EB', 1)
    returning id into accent_id;

    -- Werte fuer Ink
    insert into public.brand_color_values (color_id, category_id, value) values
      (ink_id, cmyk_cat,    'C0 M0 Y0 K100'),
      (ink_id, pantone_cat, 'Pantone Black 6 C');

    -- Werte fuer Signal
    insert into public.brand_color_values (color_id, category_id, value) values
      (signal_id, cmyk_cat,    'C15 M0 Y95 K0'),
      (signal_id, pantone_cat, 'Pantone 388 C');

    -- Werte fuer Paper
    insert into public.brand_color_values (color_id, category_id, value) values
      (paper_id, hex_cat, '#FAFAFA'),
      (paper_id, rgb_cat, 'RGB 250, 250, 250');

    -- Werte fuer Accent Blue
    insert into public.brand_color_values (color_id, category_id, value) values
      (accent_id, hex_cat, '#2563EB'),
      (accent_id, rgb_cat, 'RGB 37, 99, 235');
  end loop;
end $$;
