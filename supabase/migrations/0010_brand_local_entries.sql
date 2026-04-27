-- =====================================================================
-- Brandsystem – Lokal (brand_local_entries)
--
-- Modell:
--   brand_local_entries : Einfache Text-Einträge je Brand für den
--                         Tab "Lokal". Pro Eintrag wird ein freier
--                         Text gespeichert (z.B. Adresse, Notizen,
--                         lokale Hinweise).
--
-- RLS: anonymer Zugriff wie bei den anderen Prototyp-Tabellen.
-- WICHTIG: Rueckbau, sobald Supabase Auth integriert ist.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabelle
-- ---------------------------------------------------------------------

create table if not exists public.brand_local_entries (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references public.brands(id) on delete cascade,
  content     text not null check (char_length(content) > 0),
  position    integer not null default 0,
  created_at  timestamptz not null default timezone('utc', now()),
  updated_at  timestamptz not null default timezone('utc', now())
);

create index if not exists brand_local_entries_brand_idx
  on public.brand_local_entries (brand_id, position);

drop trigger if exists trg_brand_local_entries_updated_at
  on public.brand_local_entries;
create trigger trg_brand_local_entries_updated_at
  before update on public.brand_local_entries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 2. Row Level Security (Prototyp: anonym)
-- ---------------------------------------------------------------------

alter table public.brand_local_entries enable row level security;

drop policy if exists "brand_local_entries: read"   on public.brand_local_entries;
drop policy if exists "brand_local_entries: insert" on public.brand_local_entries;
drop policy if exists "brand_local_entries: update" on public.brand_local_entries;
drop policy if exists "brand_local_entries: delete" on public.brand_local_entries;

create policy "brand_local_entries: read"
  on public.brand_local_entries for select
  to anon, authenticated using (true);
create policy "brand_local_entries: insert"
  on public.brand_local_entries for insert
  to anon, authenticated with check (true);
create policy "brand_local_entries: update"
  on public.brand_local_entries for update
  to anon, authenticated using (true) with check (true);
create policy "brand_local_entries: delete"
  on public.brand_local_entries for delete
  to anon, authenticated using (true);

-- =====================================================================
-- Fertig.
-- =====================================================================
