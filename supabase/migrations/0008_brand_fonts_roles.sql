-- =====================================================================
-- Brandsystem – Rollen pro Schrift (Headline, Subline, Overline, Copy, ...)
--
-- Idempotente Migration. roles wird als text[] gespeichert, damit eine
-- Schrift mehrere Rollen uebernehmen kann (z.B. Headline + Subline).
-- =====================================================================

alter table public.brand_fonts
  add column if not exists roles text[] not null default '{}'::text[];

create index if not exists brand_fonts_roles_idx
  on public.brand_fonts using gin (roles);

-- =====================================================================
-- Fertig.
-- =====================================================================
