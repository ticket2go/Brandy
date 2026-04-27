-- =====================================================================
-- Brandsystem – Organisationen, Rollen, Admin-Flag und Brand-Zuordnung
--
-- Modell:
--   profiles.is_admin           : globaler Admin (kann Organisationen anlegen)
--   profiles.username            : Login-Name (eindeutig, lowercase)
--   organizations                : Organisations-Stammdaten
--     - name        : Anzeige-Name der Organisation
--     - legal_name  : Firmierung
--     - slug        : eindeutiger Slug
--     - logo_url    : Pfad im Storage-Bucket "org-assets"
--     - manager_id  : Verwalter der Organisation (auth.users.id)
--   organization_members         : Zuordnung User <-> Organisation + Rolle
--     - role : "manager", "grafik", "projektmanagement",
--              "marketing", "geschaeftsfuehrung", "mitglied"
--   brands.organization_id       : Brand gehört zu einer Organisation
--
-- Storage:
--   "org-assets" Bucket (public) für Organisations-Logos
--
-- Idempotent (kann mehrfach ausgeführt werden).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. profiles erweitern
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

create index if not exists profiles_is_admin_idx
  on public.profiles (is_admin)
  where is_admin = true;

create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username))
  where username is not null;

-- ---------------------------------------------------------------------
-- 2. organizations
-- ---------------------------------------------------------------------
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  legal_name  text not null,
  slug        text not null unique,
  logo_url    text,
  manager_id  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default timezone('utc', now()),
  updated_at  timestamptz not null default timezone('utc', now()),
  constraint organizations_name_length check (char_length(name) between 1 and 200),
  constraint organizations_legal_name_length check (char_length(legal_name) between 1 and 200),
  constraint organizations_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create index if not exists organizations_manager_id_idx
  on public.organizations (manager_id);

drop trigger if exists trg_organizations_updated_at on public.organizations;
create trigger trg_organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 3. organization_members
-- ---------------------------------------------------------------------
create table if not exists public.organization_members (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  role             text not null default 'mitglied'
                     check (role in (
                       'manager',
                       'grafik',
                       'projektmanagement',
                       'marketing',
                       'geschaeftsfuehrung',
                       'mitglied'
                     )),
  created_at       timestamptz not null default timezone('utc', now()),
  updated_at       timestamptz not null default timezone('utc', now()),
  unique (organization_id, user_id)
);

create index if not exists organization_members_user_id_idx
  on public.organization_members (user_id);
create index if not exists organization_members_organization_id_idx
  on public.organization_members (organization_id);

drop trigger if exists trg_organization_members_updated_at on public.organization_members;
create trigger trg_organization_members_updated_at
  before update on public.organization_members
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. Manager automatisch in organization_members spiegeln
-- ---------------------------------------------------------------------
create or replace function public.sync_organization_manager_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.manager_id is not null then
    insert into public.organization_members (organization_id, user_id, role)
    values (new.id, new.manager_id, 'manager')
    on conflict (organization_id, user_id)
      do update set role = 'manager';
  end if;

  if tg_op = 'UPDATE'
     and old.manager_id is not null
     and old.manager_id is distinct from new.manager_id then
    update public.organization_members
       set role = 'mitglied'
     where organization_id = new.id
       and user_id = old.manager_id
       and role = 'manager';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_organizations_sync_manager on public.organizations;
create trigger trg_organizations_sync_manager
  after insert or update of manager_id on public.organizations
  for each row execute function public.sync_organization_manager_member();

-- ---------------------------------------------------------------------
-- 5. brands.organization_id
-- ---------------------------------------------------------------------
alter table public.brands
  add column if not exists organization_id uuid
    references public.organizations(id) on delete set null;

create index if not exists brands_organization_id_idx
  on public.brands (organization_id);

-- ---------------------------------------------------------------------
-- 6. RLS für neue Tabellen
-- ---------------------------------------------------------------------
alter table public.organizations         enable row level security;
alter table public.organization_members  enable row level security;

-- organizations -------------------------------------------------------
drop policy if exists "orgs: read members + admin"     on public.organizations;
drop policy if exists "orgs: read all"                 on public.organizations;
drop policy if exists "orgs: insert admin"             on public.organizations;
drop policy if exists "orgs: update admin or manager"  on public.organizations;
drop policy if exists "orgs: delete admin"             on public.organizations;

-- Lesezugriff: angemeldete User dürfen alle Organisationen sehen.
-- Das ist für Brand-Auswahl, Member-Auflistung im Admin-Panel und
-- die NavCard-Darstellung notwendig. Editierende Aktionen werden
-- weiter unten beschränkt.
create policy "orgs: read all"
  on public.organizations for select
  to authenticated
  using (true);

create policy "orgs: insert admin"
  on public.organizations for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

create policy "orgs: update admin or manager"
  on public.organizations for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
    or manager_id = auth.uid()
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
    or manager_id = auth.uid()
  );

create policy "orgs: delete admin"
  on public.organizations for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- organization_members ------------------------------------------------
drop policy if exists "members: read own org"          on public.organization_members;
drop policy if exists "members: insert admin/manager"  on public.organization_members;
drop policy if exists "members: update admin/manager"  on public.organization_members;
drop policy if exists "members: delete admin/manager"  on public.organization_members;

create policy "members: read own org"
  on public.organization_members for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
    or exists (
      select 1 from public.organizations o
      where o.id = organization_id and o.manager_id = auth.uid()
    )
    or exists (
      select 1 from public.organization_members m2
      where m2.organization_id = organization_members.organization_id
        and m2.user_id = auth.uid()
    )
  );

create policy "members: insert admin/manager"
  on public.organization_members for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
    or exists (
      select 1 from public.organizations o
      where o.id = organization_id and o.manager_id = auth.uid()
    )
  );

create policy "members: update admin/manager"
  on public.organization_members for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
    or exists (
      select 1 from public.organizations o
      where o.id = organization_id and o.manager_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
    or exists (
      select 1 from public.organizations o
      where o.id = organization_id and o.manager_id = auth.uid()
    )
  );

create policy "members: delete admin/manager"
  on public.organization_members for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
    or exists (
      select 1 from public.organizations o
      where o.id = organization_id and o.manager_id = auth.uid()
    )
  );

-- profiles: zusätzlich für authenticated lesbar (war schon "true")
-- bleibt unverändert. Update bleibt ebenfalls auf eigenen User beschränkt.

-- ---------------------------------------------------------------------
-- 7. Storage-Bucket "org-assets"
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('org-assets', 'org-assets', true)
on conflict (id) do nothing;

drop policy if exists "org-assets: public read"   on storage.objects;
drop policy if exists "org-assets: auth write"    on storage.objects;
drop policy if exists "org-assets: auth update"   on storage.objects;
drop policy if exists "org-assets: auth delete"   on storage.objects;

create policy "org-assets: public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'org-assets');

create policy "org-assets: auth write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'org-assets');

create policy "org-assets: auth update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'org-assets')
  with check (bucket_id = 'org-assets');

create policy "org-assets: auth delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'org-assets');

-- =====================================================================
-- Fertig. Hinweis:
--   In dieser Phase bleibt der bestehende anonyme Zugriff auf brands
--   (Migration 0002) erhalten, damit alte Prototyp-Funktionen weiter
--   funktionieren. Neue Brands werden über Auth-User angelegt und mit
--   einer organization_id verknüpft.
-- =====================================================================
