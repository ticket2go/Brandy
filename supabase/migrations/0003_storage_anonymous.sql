-- =====================================================================
-- Brandsystem – Anonymer Zugriff auf Storage-Bucket "brand-assets"
--
-- Prototyp-Phase: Erlaubt anonymen Upload/Update/Delete, damit Logos
-- ohne Auth über den Browser hochgeladen werden können.
-- WICHTIG: Rückbau, sobald Supabase Auth integriert ist.
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', true)
on conflict (id) do nothing;

drop policy if exists "brand-assets: public read"   on storage.objects;
drop policy if exists "brand-assets: owner write"   on storage.objects;
drop policy if exists "brand-assets: owner update"  on storage.objects;
drop policy if exists "brand-assets: owner delete"  on storage.objects;
drop policy if exists "brand-assets: anon read"     on storage.objects;
drop policy if exists "brand-assets: anon write"    on storage.objects;
drop policy if exists "brand-assets: anon update"   on storage.objects;
drop policy if exists "brand-assets: anon delete"   on storage.objects;

create policy "brand-assets: anon read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'brand-assets');

create policy "brand-assets: anon write"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'brand-assets');

create policy "brand-assets: anon update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'brand-assets')
  with check (bucket_id = 'brand-assets');

create policy "brand-assets: anon delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'brand-assets');
