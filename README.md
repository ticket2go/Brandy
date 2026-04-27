# Brandsystem

Ein Next.js 14 Projekt mit TypeScript, Tailwind CSS und App Router.

## Voraussetzungen

- Node.js 18.17+ (empfohlen: 20 oder 22)
- npm 10+

## Erste Schritte

```bash
npm install
npm run dev
```

Danach ist die App unter [http://localhost:3000](http://localhost:3000) erreichbar.

## Skripte

- `npm run dev` – Entwicklungsserver starten
- `npm run build` – Produktions-Build erstellen
- `npm run start` – Produktions-Build ausführen
- `npm run lint` – ESLint ausführen

## Projektstruktur

```
app/
  layout.tsx      Root-Layout (App Router)
  page.tsx        Startseite
  globals.css     Globale Styles inkl. Tailwind-Direktiven
components/
  Title.tsx       Animierter Titel (GSAP)
tailwind.config.ts
postcss.config.mjs
next.config.mjs
tsconfig.json
```

## Stack

- [Next.js 14](https://nextjs.org/) mit App Router
- [React 18](https://react.dev/)
- [TypeScript 5](https://www.typescriptlang.org/)
- [Tailwind CSS 3](https://tailwindcss.com/)
- [GSAP](https://gsap.com/) für die Titel-Animation
- [Supabase](https://supabase.com/) (Postgres, Auth, Storage)

## Supabase einrichten

Projekt-URL: `https://cxymzwhucypdsqccfgtl.supabase.co`

1. Kopiere `.env.local.example` nach `.env.local` und trage die Keys aus
   dem Supabase-Dashboard → *Project Settings → API* ein:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://cxymzwhucypdsqccfgtl.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```

2. Datenbank-Schema anlegen: Inhalt von
   [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql)
   im [SQL Editor](https://supabase.com/dashboard/project/cxymzwhucypdsqccfgtl/sql)
   einfügen und ausführen. Das Skript ist idempotent.

3. Client im Code verwenden:

   ```ts
   import { supabase } from "@/lib/supabase/client";

   const { data, error } = await supabase.from("brands").select("*");
   ```

## Auth, Organisationen & Admin-Panel

Mit Migration `0012_organizations.sql` wird das System um Auth-basierte
Organisationen erweitert:

- **Login/Registrierung**: `/login` und `/register`. User registrieren sich
  mit Benutzernamen + Passwort; intern wird daraus eine Pseudo-E-Mail
  `<username>@brandsystem.local` gebildet.
- **Bootstrap-Admin**: Beim ersten Aufruf der Login-Seite wird per Service
  Role automatisch der Account `admin` / `admin` mit
  `profiles.is_admin = true` angelegt, falls er noch nicht existiert.
- **Admin-Panel** (`/admin`): Sichtbar nur für Admins. Über das `+` lassen
  sich Organisationen mit *Name*, *Firmierung* und einem oder mehreren
  *Verwalter:innen* anlegen sowie Logos hochladen (`org-assets` Storage-
  Bucket). Die Verwalter-Auswahl bietet eine dynamische Username-Suche.
- **Mitglieder & Rollen**: `/admin/organizations/[id]` (auch für die
  Verwalter:innen sichtbar) ermöglicht das Hinzufügen von Mitgliedern und
  Rollenpflege (`grafik`, `projektmanagement`, `marketing`,
  `geschaeftsfuehrung`, `mitglied`, `manager`). Verwalter:innen können
  hier auch **Name**, **Firmierung** und **Logo** der Organisation
  anpassen (Migration `0014_org_multi_manager.sql`). Schriften und
  weitere Logos für die kommenden Präsentations-Vorlagen folgen separat.
- **Brand → Organisation**: Brands werden mit der gerade aktiven Organisation
  verknüpft (`brands.organization_id`). Die NavCard rechts oben zeigt
  „B. <Org-Name>“ und – bei mehreren Mitgliedschaften – einen Wechsler.

Voraussetzung: `SUPABASE_SERVICE_ROLE_KEY` muss serverseitig gesetzt sein
(z.B. in `.env.local`), damit Auth-User per `supabase.auth.admin` angelegt
und Admin-Aktionen RLS-frei ausgeführt werden können.
