-- =====================================================================
-- Eventscraper – persistente Scrapes und Events
--
-- Speichert Scraper-Metadaten und alle gefundenen Events in Postgres,
-- damit die Daten nach Reload und in jedem Browser verfügbar sind.
--
-- Prototyp: offene RLS für anon + authenticated (wie brands).
-- Rückbau, sobald Auth für den Eventscraper gilt.
-- Idempotent (kann mehrfach ausgeführt werden).
-- =====================================================================

create table if not exists public.scrapers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  url           text not null,
  entry_count   integer not null default 0,
  last_run_at   timestamptz,
  error         text,
  warning       text,
  follow_up     jsonb,
  last_update   jsonb,
  selection     jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default timezone('utc', now()),
  updated_at    timestamptz not null default timezone('utc', now()),
  constraint scrapers_name_length check (char_length(name) between 1 and 200),
  constraint scrapers_entry_count_nonneg check (entry_count >= 0)
);

create table if not exists public.scraper_events (
  id                uuid primary key default gen_random_uuid(),
  scraper_id        uuid not null references public.scrapers(id) on delete cascade,
  event_key         text not null,
  name              text not null,
  venue             text,
  city              text,
  location          text,
  date              text,
  time              text,
  starts_at         text,
  hero_image        text,
  ticket_url        text,
  price             text,
  product_group_id  text,
  position          integer not null default 0,
  created_at        timestamptz not null default timezone('utc', now()),
  updated_at        timestamptz not null default timezone('utc', now()),
  constraint scraper_events_scraper_id_event_key_key unique (scraper_id, event_key)
);

create index if not exists scrapers_created_at_idx
  on public.scrapers (created_at);

create index if not exists scraper_events_scraper_id_idx
  on public.scraper_events (scraper_id);

create index if not exists scraper_events_scraper_id_position_idx
  on public.scraper_events (scraper_id, position);

drop trigger if exists trg_scrapers_updated_at on public.scrapers;
create trigger trg_scrapers_updated_at
  before update on public.scrapers
  for each row execute function public.set_updated_at();

drop trigger if exists trg_scraper_events_updated_at on public.scraper_events;
create trigger trg_scraper_events_updated_at
  before update on public.scraper_events
  for each row execute function public.set_updated_at();

alter table public.scrapers enable row level security;
alter table public.scraper_events enable row level security;

drop policy if exists "scrapers: read all (anon ok)" on public.scrapers;
drop policy if exists "scrapers: insert any (anon ok)" on public.scrapers;
drop policy if exists "scrapers: update any (anon ok)" on public.scrapers;
drop policy if exists "scrapers: delete any (anon ok)" on public.scrapers;

create policy "scrapers: read all (anon ok)"
  on public.scrapers for select
  to anon, authenticated
  using (true);

create policy "scrapers: insert any (anon ok)"
  on public.scrapers for insert
  to anon, authenticated
  with check (true);

create policy "scrapers: update any (anon ok)"
  on public.scrapers for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "scrapers: delete any (anon ok)"
  on public.scrapers for delete
  to anon, authenticated
  using (true);

drop policy if exists "scraper_events: read all (anon ok)" on public.scraper_events;
drop policy if exists "scraper_events: insert any (anon ok)" on public.scraper_events;
drop policy if exists "scraper_events: update any (anon ok)" on public.scraper_events;
drop policy if exists "scraper_events: delete any (anon ok)" on public.scraper_events;

create policy "scraper_events: read all (anon ok)"
  on public.scraper_events for select
  to anon, authenticated
  using (true);

create policy "scraper_events: insert any (anon ok)"
  on public.scraper_events for insert
  to anon, authenticated
  with check (true);

create policy "scraper_events: update any (anon ok)"
  on public.scraper_events for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "scraper_events: delete any (anon ok)"
  on public.scraper_events for delete
  to anon, authenticated
  using (true);

grant select, insert, update, delete on table public.scrapers to anon, authenticated;
grant select, insert, update, delete on table public.scraper_events to anon, authenticated;
