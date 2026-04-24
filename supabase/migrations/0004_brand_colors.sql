-- =====================================================================
-- Brandsystem – Farben pro Brand (Prototyp-Phase)
--
-- Modell:
--   brand_color_categories : Kategorien pro Brand und Gruppe
--                            (z.B. Print/CMYK, Print/Pantone, Digital/HEX, Digital/RGB)
--   brand_colors           : eine Farbe (Name + HEX + Gruppe)
--   brand_color_values     : Wert einer Farbe in einer Kategorie (z.B. "C0 M100 Y85 K10")
--
-- RLS: anonymer Zugriff wie fuer brands (Prototyp). Nach Auth-Integration schliessen.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabellen
-- ---------------------------------------------------------------------

create table if not exists public.brand_color_categories (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references public.brands(id) on delete cascade,
  "group"     text not null check ("group" in ('print', 'digital')),
  key         text not null,
  label       text not null,
  position    integer not null default 0,
  created_at  timestamptz not null default timezone('utc', now()),
  updated_at  timestamptz not null default timezone('utc', now()),
  unique (brand_id, "group", key)
);

create index if not exists brand_color_categories_brand_idx
  on public.brand_color_categories (brand_id, "group", position);

drop trigger if exists trg_brand_color_categories_updated_at
  on public.brand_color_categories;
create trigger trg_brand_color_categories_updated_at
  before update on public.brand_color_categories
  for each row execute function public.set_updated_at();

create table if not exists public.brand_colors (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references public.brands(id) on delete cascade,
  "group"     text not null check ("group" in ('print', 'digital')),
  name        text not null,
  hex         text not null check (hex ~ '^#[0-9A-Fa-f]{6}$'),
  position    integer not null default 0,
  created_at  timestamptz not null default timezone('utc', now()),
  updated_at  timestamptz not null default timezone('utc', now())
);

create index if not exists brand_colors_brand_idx
  on public.brand_colors (brand_id, "group", position);

drop trigger if exists trg_brand_colors_updated_at on public.brand_colors;
create trigger trg_brand_colors_updated_at
  before update on public.brand_colors
  for each row execute function public.set_updated_at();

create table if not exists public.brand_color_values (
  id           uuid primary key default gen_random_uuid(),
  color_id     uuid not null references public.brand_colors(id) on delete cascade,
  category_id  uuid not null references public.brand_color_categories(id) on delete cascade,
  value        text not null,
  created_at   timestamptz not null default timezone('utc', now()),
  updated_at   timestamptz not null default timezone('utc', now()),
  unique (color_id, category_id)
);

create index if not exists brand_color_values_color_idx
  on public.brand_color_values (color_id);
create index if not exists brand_color_values_category_idx
  on public.brand_color_values (category_id);

drop trigger if exists trg_brand_color_values_updated_at
  on public.brand_color_values;
create trigger trg_brand_color_values_updated_at
  before update on public.brand_color_values
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 2. Default-Kategorien fuer neue Brands
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
    (new.id, 'print',   'weitere', 'Weitere', 2),
    (new.id, 'digital', 'hex',     'HEX',     0),
    (new.id, 'digital', 'rgb',     'RGB',     1)
  on conflict (brand_id, "group", key) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_seed_brand_color_categories on public.brands;
create trigger trg_seed_brand_color_categories
  after insert on public.brands
  for each row execute function public.seed_brand_color_categories();

-- Backfill fuer bereits existierende Brands
insert into public.brand_color_categories (brand_id, "group", key, label, position)
select b.id, v."group", v.key, v.label, v.position
  from public.brands b
  cross join (values
    ('print'::text,   'cmyk'::text,    'CMYK'::text,    0),
    ('print',         'pantone',       'Pantone',       1),
    ('print',         'weitere',       'Weitere',       2),
    ('digital',       'hex',           'HEX',           0),
    ('digital',       'rgb',           'RGB',           1)
  ) as v("group", key, label, position)
on conflict (brand_id, "group", key) do nothing;

-- ---------------------------------------------------------------------
-- 3. Row Level Security (Prototyp: anonym)
-- ---------------------------------------------------------------------

alter table public.brand_color_categories enable row level security;
alter table public.brand_colors           enable row level security;
alter table public.brand_color_values     enable row level security;

drop policy if exists "brand_color_categories: read"   on public.brand_color_categories;
drop policy if exists "brand_color_categories: insert" on public.brand_color_categories;
drop policy if exists "brand_color_categories: update" on public.brand_color_categories;
drop policy if exists "brand_color_categories: delete" on public.brand_color_categories;

create policy "brand_color_categories: read"
  on public.brand_color_categories for select
  to anon, authenticated using (true);
create policy "brand_color_categories: insert"
  on public.brand_color_categories for insert
  to anon, authenticated with check (true);
create policy "brand_color_categories: update"
  on public.brand_color_categories for update
  to anon, authenticated using (true) with check (true);
create policy "brand_color_categories: delete"
  on public.brand_color_categories for delete
  to anon, authenticated using (true);

drop policy if exists "brand_colors: read"   on public.brand_colors;
drop policy if exists "brand_colors: insert" on public.brand_colors;
drop policy if exists "brand_colors: update" on public.brand_colors;
drop policy if exists "brand_colors: delete" on public.brand_colors;

create policy "brand_colors: read"
  on public.brand_colors for select
  to anon, authenticated using (true);
create policy "brand_colors: insert"
  on public.brand_colors for insert
  to anon, authenticated with check (true);
create policy "brand_colors: update"
  on public.brand_colors for update
  to anon, authenticated using (true) with check (true);
create policy "brand_colors: delete"
  on public.brand_colors for delete
  to anon, authenticated using (true);

drop policy if exists "brand_color_values: read"   on public.brand_color_values;
drop policy if exists "brand_color_values: insert" on public.brand_color_values;
drop policy if exists "brand_color_values: update" on public.brand_color_values;
drop policy if exists "brand_color_values: delete" on public.brand_color_values;

create policy "brand_color_values: read"
  on public.brand_color_values for select
  to anon, authenticated using (true);
create policy "brand_color_values: insert"
  on public.brand_color_values for insert
  to anon, authenticated with check (true);
create policy "brand_color_values: update"
  on public.brand_color_values for update
  to anon, authenticated using (true) with check (true);
create policy "brand_color_values: delete"
  on public.brand_color_values for delete
  to anon, authenticated using (true);

-- =====================================================================
-- Fertig.
-- =====================================================================
