-- =====================================================================
-- Brandsystem – Initiales Datenbank-Schema für Supabase
-- Projekt: cxymzwhucypdsqccfgtl
--
-- Ausführen:
--   1. Supabase Dashboard öffnen
--      https://supabase.com/dashboard/project/cxymzwhucypdsqccfgtl/sql
--   2. Diese Datei vollständig in den SQL Editor einfügen
--   3. "Run" klicken
--
-- Das Skript ist idempotent (kann mehrfach ausgeführt werden).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 2. Enums
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'asset_type') then
    create type public.asset_type as enum (
      'logo',
      'image',
      'font',
      'document',
      'other'
    );
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 3. Hilfsfunktion: updated_at automatisch setzen
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Tabelle: profiles (1:1 zu auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique,
  full_name   text,
  avatar_url  text,
  website     text,
  created_at  timestamptz not null default timezone('utc', now()),
  updated_at  timestamptz not null default timezone('utc', now()),
  constraint username_length check (username is null or char_length(username) between 3 and 40)
);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Profil automatisch anlegen, wenn ein neuer auth.user entsteht
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 5. Tabelle: brands
-- ---------------------------------------------------------------------
create table if not exists public.brands (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles(id) on delete cascade,
  name             text not null,
  slug             text not null unique,
  description      text,
  primary_color    text,
  secondary_color  text,
  logo_url         text,
  created_at       timestamptz not null default timezone('utc', now()),
  updated_at       timestamptz not null default timezone('utc', now()),
  constraint brands_name_length check (char_length(name) between 1 and 120),
  constraint brands_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create index if not exists brands_owner_id_idx on public.brands (owner_id);

drop trigger if exists trg_brands_updated_at on public.brands;
create trigger trg_brands_updated_at
  before update on public.brands
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 6. Tabelle: assets
-- ---------------------------------------------------------------------
create table if not exists public.assets (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references public.brands(id) on delete cascade,
  title         text not null,
  type          public.asset_type not null default 'other',
  storage_path  text not null,
  mime_type     text,
  size_bytes    bigint check (size_bytes is null or size_bytes >= 0),
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default timezone('utc', now()),
  updated_at    timestamptz not null default timezone('utc', now())
);

create index if not exists assets_brand_id_idx on public.assets (brand_id);
create index if not exists assets_type_idx     on public.assets (type);

drop trigger if exists trg_assets_updated_at on public.assets;
create trigger trg_assets_updated_at
  before update on public.assets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 7. Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.brands   enable row level security;
alter table public.assets   enable row level security;

-- profiles -------------------------------------------------------------
drop policy if exists "profiles: read all"       on public.profiles;
drop policy if exists "profiles: update own"     on public.profiles;
drop policy if exists "profiles: insert own"     on public.profiles;

create policy "profiles: read all"
  on public.profiles for select
  using (true);

create policy "profiles: insert own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- brands ---------------------------------------------------------------
drop policy if exists "brands: read all"          on public.brands;
drop policy if exists "brands: insert own"        on public.brands;
drop policy if exists "brands: update own"        on public.brands;
drop policy if exists "brands: delete own"        on public.brands;

create policy "brands: read all"
  on public.brands for select
  using (true);

create policy "brands: insert own"
  on public.brands for insert
  with check (auth.uid() = owner_id);

create policy "brands: update own"
  on public.brands for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "brands: delete own"
  on public.brands for delete
  using (auth.uid() = owner_id);

-- assets ---------------------------------------------------------------
drop policy if exists "assets: read via brand"    on public.assets;
drop policy if exists "assets: insert via brand"  on public.assets;
drop policy if exists "assets: update via brand"  on public.assets;
drop policy if exists "assets: delete via brand"  on public.assets;

create policy "assets: read via brand"
  on public.assets for select
  using (
    exists (
      select 1 from public.brands b
      where b.id = assets.brand_id
    )
  );

create policy "assets: insert via brand"
  on public.assets for insert
  with check (
    exists (
      select 1 from public.brands b
      where b.id = assets.brand_id
        and b.owner_id = auth.uid()
    )
  );

create policy "assets: update via brand"
  on public.assets for update
  using (
    exists (
      select 1 from public.brands b
      where b.id = assets.brand_id
        and b.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.brands b
      where b.id = assets.brand_id
        and b.owner_id = auth.uid()
    )
  );

create policy "assets: delete via brand"
  on public.assets for delete
  using (
    exists (
      select 1 from public.brands b
      where b.id = assets.brand_id
        and b.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- 8. Storage Bucket für Brand-Assets (optional, aber empfohlen)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', true)
on conflict (id) do nothing;

drop policy if exists "brand-assets: public read"    on storage.objects;
drop policy if exists "brand-assets: owner write"    on storage.objects;
drop policy if exists "brand-assets: owner update"   on storage.objects;
drop policy if exists "brand-assets: owner delete"   on storage.objects;

create policy "brand-assets: public read"
  on storage.objects for select
  using (bucket_id = 'brand-assets');

create policy "brand-assets: owner write"
  on storage.objects for insert
  with check (
    bucket_id = 'brand-assets'
    and auth.uid() is not null
  );

create policy "brand-assets: owner update"
  on storage.objects for update
  using (
    bucket_id = 'brand-assets'
    and owner = auth.uid()
  );

create policy "brand-assets: owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'brand-assets'
    and owner = auth.uid()
  );

-- =====================================================================
-- Fertig. Prüfen mit:
--   select table_name from information_schema.tables
--   where table_schema = 'public';
-- =====================================================================
