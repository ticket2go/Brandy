-- =====================================================================
-- Brandsystem – Anonymer Zugriff auf brands (Prototyp-Phase)
--
-- Hebt die owner_id-Pflicht auf und erlaubt anonymen Insert/Select.
-- WICHTIG: Rückbau, sobald Supabase Auth integriert ist.
-- =====================================================================

-- 1. owner_id nullable machen, FK auf profiles belassen
alter table public.brands
  alter column owner_id drop not null;

-- 2. Alte Policies entfernen
drop policy if exists "brands: read all"   on public.brands;
drop policy if exists "brands: insert own" on public.brands;
drop policy if exists "brands: update own" on public.brands;
drop policy if exists "brands: delete own" on public.brands;

-- 3. Offene Policies für Prototyp
create policy "brands: read all (anon ok)"
  on public.brands for select
  to anon, authenticated
  using (true);

create policy "brands: insert any (anon ok)"
  on public.brands for insert
  to anon, authenticated
  with check (true);

create policy "brands: update any (anon ok)"
  on public.brands for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "brands: delete any (anon ok)"
  on public.brands for delete
  to anon, authenticated
  using (true);

-- 4. Assets-Policies mitziehen (sonst kein Zugriff auf Kind-Tabelle)
drop policy if exists "assets: read via brand"   on public.assets;
drop policy if exists "assets: insert via brand" on public.assets;
drop policy if exists "assets: update via brand" on public.assets;
drop policy if exists "assets: delete via brand" on public.assets;

create policy "assets: read all (anon ok)"
  on public.assets for select
  to anon, authenticated
  using (true);

create policy "assets: insert any (anon ok)"
  on public.assets for insert
  to anon, authenticated
  with check (true);

create policy "assets: update any (anon ok)"
  on public.assets for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "assets: delete any (anon ok)"
  on public.assets for delete
  to anon, authenticated
  using (true);
