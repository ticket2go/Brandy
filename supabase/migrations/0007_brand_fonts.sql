-- =====================================================================
-- Brandsystem – Typografie (brand_fonts + brand_font_files)
--
-- Modell:
--   brand_fonts       : eine Schriftfamilie pro Brand (z.B. "Roboto")
--   brand_font_files  : die einzelnen Schriftschnitte pro Familie
--                       (z.B. Regular, Bold, Italic) als Dateien im Storage
--
-- RLS: anonymer Zugriff wie bei den anderen Prototyp-Tabellen.
-- WICHTIG: Rueckbau, sobald Supabase Auth integriert ist.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabellen
-- ---------------------------------------------------------------------

create table if not exists public.brand_fonts (
  id                 uuid primary key default gen_random_uuid(),
  brand_id           uuid not null references public.brands(id) on delete cascade,
  family             text not null,
  source             text not null check (source in ('google', 'custom')),
  license_confirmed  boolean not null default false,
  google_category    text,
  position           integer not null default 0,
  created_at         timestamptz not null default timezone('utc', now()),
  updated_at         timestamptz not null default timezone('utc', now())
);

create index if not exists brand_fonts_brand_idx
  on public.brand_fonts (brand_id, position);

drop trigger if exists trg_brand_fonts_updated_at on public.brand_fonts;
create trigger trg_brand_fonts_updated_at
  before update on public.brand_fonts
  for each row execute function public.set_updated_at();

create table if not exists public.brand_font_files (
  id            uuid primary key default gen_random_uuid(),
  font_id       uuid not null references public.brand_fonts(id) on delete cascade,
  variant       text not null,
  style_label   text not null,
  weight        integer not null default 400,
  italic        boolean not null default false,
  format        text not null,
  storage_path  text not null,
  size_bytes    bigint check (size_bytes is null or size_bytes >= 0),
  created_at    timestamptz not null default timezone('utc', now()),
  updated_at    timestamptz not null default timezone('utc', now()),
  unique (font_id, variant, format)
);

create index if not exists brand_font_files_font_idx
  on public.brand_font_files (font_id, weight, italic);

drop trigger if exists trg_brand_font_files_updated_at on public.brand_font_files;
create trigger trg_brand_font_files_updated_at
  before update on public.brand_font_files
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 2. Row Level Security (Prototyp: anonym)
-- ---------------------------------------------------------------------

alter table public.brand_fonts      enable row level security;
alter table public.brand_font_files enable row level security;

drop policy if exists "brand_fonts: read"   on public.brand_fonts;
drop policy if exists "brand_fonts: insert" on public.brand_fonts;
drop policy if exists "brand_fonts: update" on public.brand_fonts;
drop policy if exists "brand_fonts: delete" on public.brand_fonts;

create policy "brand_fonts: read"
  on public.brand_fonts for select
  to anon, authenticated using (true);
create policy "brand_fonts: insert"
  on public.brand_fonts for insert
  to anon, authenticated with check (true);
create policy "brand_fonts: update"
  on public.brand_fonts for update
  to anon, authenticated using (true) with check (true);
create policy "brand_fonts: delete"
  on public.brand_fonts for delete
  to anon, authenticated using (true);

drop policy if exists "brand_font_files: read"   on public.brand_font_files;
drop policy if exists "brand_font_files: insert" on public.brand_font_files;
drop policy if exists "brand_font_files: update" on public.brand_font_files;
drop policy if exists "brand_font_files: delete" on public.brand_font_files;

create policy "brand_font_files: read"
  on public.brand_font_files for select
  to anon, authenticated using (true);
create policy "brand_font_files: insert"
  on public.brand_font_files for insert
  to anon, authenticated with check (true);
create policy "brand_font_files: update"
  on public.brand_font_files for update
  to anon, authenticated using (true) with check (true);
create policy "brand_font_files: delete"
  on public.brand_font_files for delete
  to anon, authenticated using (true);

-- =====================================================================
-- Fertig.
-- =====================================================================
