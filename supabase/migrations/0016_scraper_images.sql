-- =====================================================================
-- Eventscraper – öffentliche Ablage für GetHyped-Eventbilder
--
-- GetHyped lädt image_url selbst herunter. Eventim-URLs werden dort oft
-- nicht gespeichert (kleines 222er-Teaser oder blockierter Download).
-- Deshalb legt der Ingest eine Kopie ins öffentliche Storage.
-- Idempotent.
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('scraper-images', 'scraper-images', true)
on conflict (id) do nothing;

drop policy if exists "scraper-images: public read" on storage.objects;
drop policy if exists "scraper-images: anon write" on storage.objects;
drop policy if exists "scraper-images: anon update" on storage.objects;
drop policy if exists "scraper-images: anon delete" on storage.objects;

create policy "scraper-images: public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'scraper-images');

create policy "scraper-images: anon write"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'scraper-images');

create policy "scraper-images: anon update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'scraper-images')
  with check (bucket_id = 'scraper-images');

create policy "scraper-images: anon delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'scraper-images');
