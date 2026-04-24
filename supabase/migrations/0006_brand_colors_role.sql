-- =====================================================================
-- Brandsystem – Rolle fuer Farben (primary / secondary)
--
-- Fuer spaetere Web/CSS-Exports wollen wir Farben eindeutig als primary
-- oder secondary markieren koennen. Eine Farbe ohne Rolle bleibt
-- weiterhin moeglich (NULL).
-- =====================================================================

alter table public.brand_colors
  add column if not exists role text
    check (role is null or role in ('primary', 'secondary'));

create index if not exists brand_colors_role_idx
  on public.brand_colors (brand_id, role);

-- Pro Brand und Gruppe darf es maximal eine primary und eine secondary Farbe geben.
create unique index if not exists brand_colors_role_unique_per_group
  on public.brand_colors (brand_id, "group", role)
  where role is not null;
