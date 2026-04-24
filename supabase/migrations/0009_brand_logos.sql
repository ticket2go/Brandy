-- =====================================================================
-- Brandsystem – Logokit (brand_logos)
--
-- Modell:
--   brand_logos : Logodateien pro Brand. Eine Datei kann nach Markenart
--                 (Bildmarke / Wortmarke / Wort-Bildmarke), Polaritaet
--                 (positiv / negativ) und Farbraum (CMYK / RGB) gefiltert
--                 werden. Unterstuetzte Formate: EPS, JPG, PNG, SVG, PDF.
--
-- RLS: anonymer Zugriff wie bei den anderen Prototyp-Tabellen.
-- WICHTIG: Rueckbau, sobald Supabase Auth integriert ist.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabelle
-- ---------------------------------------------------------------------

create table if not exists public.brand_logos (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references public.brands(id) on delete cascade,
  file_name     text not null,
  format        text not null check (format in ('eps', 'jpg', 'png', 'svg', 'pdf')),
  variant       text check (variant in ('bildmarke', 'wortmarke', 'wort-bildmarke')),
  polarity      text check (polarity in ('positiv', 'negativ')),
  color_space   text check (color_space in ('cmyk', 'rgb')),
  storage_path  text not null,
  mime_type     text,
  size_bytes    bigint check (size_bytes is null or size_bytes >= 0),
  position      integer not null default 0,
  created_at    timestamptz not null default timezone('utc', now()),
  updated_at    timestamptz not null default timezone('utc', now())
);

create index if not exists brand_logos_brand_idx
  on public.brand_logos (brand_id, position);

create index if not exists brand_logos_variant_idx
  on public.brand_logos (brand_id, variant);

create index if not exists brand_logos_polarity_idx
  on public.brand_logos (brand_id, polarity);

create index if not exists brand_logos_color_space_idx
  on public.brand_logos (brand_id, color_space);

drop trigger if exists trg_brand_logos_updated_at on public.brand_logos;
create trigger trg_brand_logos_updated_at
  before update on public.brand_logos
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 2. Row Level Security (Prototyp: anonym)
-- ---------------------------------------------------------------------

alter table public.brand_logos enable row level security;

drop policy if exists "brand_logos: read"   on public.brand_logos;
drop policy if exists "brand_logos: insert" on public.brand_logos;
drop policy if exists "brand_logos: update" on public.brand_logos;
drop policy if exists "brand_logos: delete" on public.brand_logos;

create policy "brand_logos: read"
  on public.brand_logos for select
  to anon, authenticated using (true);
create policy "brand_logos: insert"
  on public.brand_logos for insert
  to anon, authenticated with check (true);
create policy "brand_logos: update"
  on public.brand_logos for update
  to anon, authenticated using (true) with check (true);
create policy "brand_logos: delete"
  on public.brand_logos for delete
  to anon, authenticated using (true);

-- =====================================================================
-- Fertig.
-- =====================================================================
