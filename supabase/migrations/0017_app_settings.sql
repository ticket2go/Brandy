-- =====================================================================
-- App-Einstellungen – z. B. der GetHyped-Crawler-Token
--
-- Der Token lag bisher nur im localStorage und musste in jedem Browser
-- neu eingetragen werden. Jetzt liegt er in der DB.
--
-- Prototyp: offene RLS für anon + authenticated (wie scrapers).
-- Rückbau, sobald Auth für den Eventscraper gilt.
-- Idempotent.
-- =====================================================================

create table if not exists public.app_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint app_settings_key_length check (char_length(key) between 1 and 120)
);

drop trigger if exists trg_app_settings_updated_at on public.app_settings;
create trigger trg_app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;

drop policy if exists "app_settings: read all (anon ok)" on public.app_settings;
drop policy if exists "app_settings: insert any (anon ok)" on public.app_settings;
drop policy if exists "app_settings: update any (anon ok)" on public.app_settings;
drop policy if exists "app_settings: delete any (anon ok)" on public.app_settings;

create policy "app_settings: read all (anon ok)"
  on public.app_settings for select
  to anon, authenticated
  using (true);

create policy "app_settings: insert any (anon ok)"
  on public.app_settings for insert
  to anon, authenticated
  with check (true);

create policy "app_settings: update any (anon ok)"
  on public.app_settings for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "app_settings: delete any (anon ok)"
  on public.app_settings for delete
  to anon, authenticated
  using (true);

grant select, insert, update, delete on table public.app_settings to anon, authenticated;
