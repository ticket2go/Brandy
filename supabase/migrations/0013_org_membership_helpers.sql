-- =====================================================================
-- Brandsystem – Fix für RLS-Recursion in organization_members
--
-- Die Policy "members: read own org" hatte eine Selbstreferenz auf
-- public.organization_members. Postgres meldet das als
--   "infinite recursion detected in policy for relation organization_members"
-- und in seltenen Fällen propagiert sich der Fehler bis in die Auth-
-- Antwort als "Database error querying schema".
--
-- Lösung: Mitgliedschaft in einer Organisation wird in einer
-- SECURITY DEFINER-Funktion geprüft. Diese läuft als Funktions-Owner
-- (i.d.R. postgres) und damit ohne RLS – die Selbstreferenz ist weg.
--
-- Idempotent.
-- =====================================================================

create or replace function public.is_member_of(org_id uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.organization_members m
     where m.organization_id = org_id
       and m.user_id = uid
  );
$$;

create or replace function public.is_admin_user(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = uid),
    false
  );
$$;

create or replace function public.is_org_manager(org_id uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.organizations o
     where o.id = org_id
       and o.manager_id = uid
  );
$$;

grant execute on function public.is_member_of(uuid, uuid)   to anon, authenticated;
grant execute on function public.is_admin_user(uuid)        to anon, authenticated;
grant execute on function public.is_org_manager(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- organization_members: Policies komplett neu aufsetzen
-- ---------------------------------------------------------------------
drop policy if exists "members: read own org"          on public.organization_members;
drop policy if exists "members: insert admin/manager"  on public.organization_members;
drop policy if exists "members: update admin/manager"  on public.organization_members;
drop policy if exists "members: delete admin/manager"  on public.organization_members;

create policy "members: read own org"
  on public.organization_members for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin_user(auth.uid())
    or public.is_org_manager(organization_id, auth.uid())
    or public.is_member_of(organization_id, auth.uid())
  );

create policy "members: insert admin/manager"
  on public.organization_members for insert
  to authenticated
  with check (
    public.is_admin_user(auth.uid())
    or public.is_org_manager(organization_id, auth.uid())
  );

create policy "members: update admin/manager"
  on public.organization_members for update
  to authenticated
  using (
    public.is_admin_user(auth.uid())
    or public.is_org_manager(organization_id, auth.uid())
  )
  with check (
    public.is_admin_user(auth.uid())
    or public.is_org_manager(organization_id, auth.uid())
  );

create policy "members: delete admin/manager"
  on public.organization_members for delete
  to authenticated
  using (
    public.is_admin_user(auth.uid())
    or public.is_org_manager(organization_id, auth.uid())
  );

-- ---------------------------------------------------------------------
-- organizations: Policies auf die Helper umstellen
-- ---------------------------------------------------------------------
drop policy if exists "orgs: read all"                 on public.organizations;
drop policy if exists "orgs: insert admin"             on public.organizations;
drop policy if exists "orgs: update admin or manager"  on public.organizations;
drop policy if exists "orgs: delete admin"             on public.organizations;

create policy "orgs: read all"
  on public.organizations for select
  to authenticated
  using (true);

create policy "orgs: insert admin"
  on public.organizations for insert
  to authenticated
  with check (public.is_admin_user(auth.uid()));

create policy "orgs: update admin or manager"
  on public.organizations for update
  to authenticated
  using (
    public.is_admin_user(auth.uid())
    or manager_id = auth.uid()
  )
  with check (
    public.is_admin_user(auth.uid())
    or manager_id = auth.uid()
  );

create policy "orgs: delete admin"
  on public.organizations for delete
  to authenticated
  using (public.is_admin_user(auth.uid()));

-- =====================================================================
-- Fertig.
-- =====================================================================
