-- =====================================================================
-- Brandsystem – Multi-Manager pro Organisation
--
-- Modell-Erweiterung:
--   * Eine Organisation kann mehrere Verwalter (manager) haben.
--   * Quelle der Wahrheit: organization_members.role = 'manager'.
--   * organizations.manager_id bleibt aus Kompatibilitätsgründen erhalten,
--     wird aber als optionaler "Haupt-Verwalter" interpretiert.
--   * Verwalter dürfen wie Admins die Stammdaten der Organisation
--     ändern (Name, Firmierung, Logo).
--   * Mitglieder dürfen ihre Org weiterhin LESEN.
--
-- Idempotent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Helper: ist <uid> Manager (per manager_id ODER per role='manager')?
-- ---------------------------------------------------------------------
create or replace function public.is_org_manager(org_id uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(
      (
        select true
          from public.organizations o
         where o.id = org_id
           and o.manager_id = uid
      ),
      false
    )
    or exists (
      select 1
        from public.organization_members m
       where m.organization_id = org_id
         and m.user_id = uid
         and m.role = 'manager'
    );
$$;

grant execute on function public.is_org_manager(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. organizations: Update-Policy auf neuen Helper umstellen
--    (Admins ODER alle Verwalter dürfen ändern)
-- ---------------------------------------------------------------------
drop policy if exists "orgs: update admin or manager" on public.organizations;

create policy "orgs: update admin or manager"
  on public.organizations for update
  to authenticated
  using (
    public.is_admin_user(auth.uid())
    or public.is_org_manager(id, auth.uid())
  )
  with check (
    public.is_admin_user(auth.uid())
    or public.is_org_manager(id, auth.uid())
  );

-- =====================================================================
-- Fertig.
-- =====================================================================
