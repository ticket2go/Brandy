-- =====================================================================
-- Brandsystem – Firmierung (legal_name) auf brands
--
-- Modell:
--   brands.legal_name : Firmierung der Marke (z.B. "Max Mustermann GmbH").
--                       Wird in BrandCard und BrandDetail klein unter dem
--                       Brand-Namen angezeigt und ist dort über ein
--                       Stift-Icon editierbar.
--
-- Default für Bestand: "Max Mustermann GmbH" (Platzhalter-Wert), damit
-- die UI sofort etwas Sinnvolles anzeigt. Neue Brands bekommen den
-- gleichen Default automatisch.
-- =====================================================================

alter table public.brands
  add column if not exists legal_name text;

alter table public.brands
  alter column legal_name set default 'Max Mustermann GmbH';

update public.brands
  set legal_name = 'Max Mustermann GmbH'
  where legal_name is null;

-- =====================================================================
-- Fertig.
-- =====================================================================
