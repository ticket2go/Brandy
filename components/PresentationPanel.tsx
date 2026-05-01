"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/auth/apiFetch";
import {
  IDML_PAGE_PRESETS_MM,
  buildPageSizeFromMm,
  generatePresentationIdmlPackage,
  suggestPresentationPackageFilename,
  type IdmlPageSize,
  type PresentationAsset,
  type PresentationFont,
} from "@/lib/generateIdml";

// =====================================================================
// Feinrot Brand-Assets
// Diese Defaults werden so lange genutzt, bis pro Brandcard eigene
// Assets hinterlegt werden koennen. Es sind 1:1 die URLs aus dem
// Anforderungs-Brief.
// =====================================================================
const FR_LOGO_URL =
  "https://cxymzwhucypdsqccfgtl.supabase.co/storage/v1/object/public/base/Feinrot-assets/Logo/Wortmarke/fr_logo_rechts_1c.eps";
const FR_BILDMARKE_URL =
  "https://cxymzwhucypdsqccfgtl.supabase.co/storage/v1/object/public/base/Feinrot-assets/Logo/Bildmarke/fr_bildmarke_rechts_4c.eps";
const FR_FONT_HEADLINE_URL =
  "https://cxymzwhucypdsqccfgtl.supabase.co/storage/v1/object/public/base/Feinrot-assets/Font/MiloSerifOT-Text.otf";
const FR_FONT_LABEL_URL =
  "https://cxymzwhucypdsqccfgtl.supabase.co/storage/v1/object/public/base/Feinrot-assets/Font/MiloOT-Bold.otf";
const FR_FONT_BODY_URL =
  "https://cxymzwhucypdsqccfgtl.supabase.co/storage/v1/object/public/base/Feinrot-assets/Font/MiloSerifOT.otf";

type PresetKey = "A4" | "A3" | "A5" | "Letter";
type Orientation = "portrait" | "landscape";

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "A4", label: "A4" },
  { key: "A3", label: "A3" },
  { key: "A5", label: "A5" },
  { key: "Letter", label: "Letter" },
];

type ManagerOption = {
  id: string;
  username: string | null;
  full_name: string | null;
};

type Props = {
  brandId: string;
  brandName: string;
  legalName: string | null;
  organizationId: string | null;
};

function fileNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").pop();
    return last || "file";
  } catch {
    const parts = url.split("/");
    return parts[parts.length - 1] || "file";
  }
}

function todayDe(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Asset konnte nicht geladen werden (${res.status}): ${url}`);
  }
  return res.arrayBuffer();
}

export default function PresentationPanel({
  brandName,
  legalName,
  organizationId,
}: Props) {
  const [headline, setHeadline] = useState<string>("");
  const [date, setDate] = useState<string>(todayDe());
  const [contactId, setContactId] = useState<string>("");
  const [contactName, setContactName] = useState<string>("");
  const [preset, setPreset] = useState<PresetKey>("A4");
  const [orientation, setOrientation] = useState<Orientation>("portrait");

  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [loadingManagers, setLoadingManagers] = useState(false);
  const [managersError, setManagersError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customer = legalName?.trim() || brandName;

  // Manager der zugehoerigen Organisation laden, damit der Kontakt
  // (= Projektmanager) gewaehlt werden kann.
  useEffect(() => {
    let cancelled = false;
    if (!organizationId) {
      setManagers([]);
      return () => {
        cancelled = true;
      };
    }
    setLoadingManagers(true);
    setManagersError(null);
    (async () => {
      try {
        const res = await apiFetch(
          `/api/organizations/${organizationId}/members`
        );
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setManagersError(json.error ?? "Mitglieder konnten nicht geladen werden.");
          setManagers([]);
          return;
        }
        type Row = {
          role: string;
          profile: ManagerOption | null;
        };
        const rows = (json.members ?? []) as Row[];
        // Wir akzeptieren als "Projektmanager" sowohl die Org-Verwalter
        // (role=manager) als auch Mitglieder mit role=projektmanagement,
        // damit die Auswahl in der Praxis nicht leer bleibt.
        const filtered = rows
          .filter(
            (r) => r.role === "manager" || r.role === "projektmanagement"
          )
          .map((r) => r.profile)
          .filter((p): p is ManagerOption => !!p);
        // Duplikate (z.B. wenn jemand sowohl manager als auch
        // projektmanagement ist) eindeutig machen.
        const dedup = new Map<string, ManagerOption>();
        for (const p of filtered) dedup.set(p.id, p);
        setManagers(Array.from(dedup.values()));
      } catch (err) {
        if (cancelled) return;
        setManagersError(
          err instanceof Error ? err.message : "Unbekannter Fehler."
        );
      } finally {
        if (!cancelled) setLoadingManagers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  // Default-Kontakt vorauswaehlen.
  useEffect(() => {
    if (managers.length === 0) return;
    if (contactId && managers.some((m) => m.id === contactId)) return;
    const first = managers[0];
    setContactId(first.id);
    setContactName(first.full_name || first.username || "");
  }, [managers, contactId]);

  const pageSize: IdmlPageSize = useMemo(() => {
    const dims = IDML_PAGE_PRESETS_MM[preset];
    return buildPageSizeFromMm(dims.widthMm, dims.heightMm, orientation);
  }, [preset, orientation]);

  const handleExport = useCallback(async () => {
    if (exporting) return;
    if (!headline.trim()) {
      setError("Bitte eine Headline eingeben.");
      return;
    }
    setError(null);
    setExporting(true);
    try {
      // Assets parallel laden.
      const [
        wordmarkBuf,
        picturemarkBuf,
        headlineFontBuf,
        labelFontBuf,
        bodyFontBuf,
      ] = await Promise.all([
        fetchBuffer(FR_LOGO_URL),
        fetchBuffer(FR_BILDMARKE_URL),
        fetchBuffer(FR_FONT_HEADLINE_URL),
        fetchBuffer(FR_FONT_LABEL_URL),
        fetchBuffer(FR_FONT_BODY_URL),
      ]);

      const wordmark: PresentationAsset = {
        name: fileNameFromUrl(FR_LOGO_URL),
        data: wordmarkBuf,
      };
      const picturemark: PresentationAsset = {
        name: fileNameFromUrl(FR_BILDMARKE_URL),
        data: picturemarkBuf,
      };

      const headlineFont: PresentationFont = {
        family: "MiloSerifOT",
        style: "Regular",
        fileName: fileNameFromUrl(FR_FONT_HEADLINE_URL),
        data: headlineFontBuf,
      };
      const labelFont: PresentationFont = {
        family: "MiloOT",
        style: "Bold",
        fileName: fileNameFromUrl(FR_FONT_LABEL_URL),
        data: labelFontBuf,
      };
      const bodyFont: PresentationFont = {
        family: "MiloSerifOT",
        style: "Regular",
        fileName: fileNameFromUrl(FR_FONT_BODY_URL),
        data: bodyFontBuf,
      };

      const blob = await generatePresentationIdmlPackage(brandName, {
        headline: headline.trim(),
        customer,
        date: date.trim() || todayDe(),
        contact: contactName.trim() || "—",
        headlineFont,
        labelFont,
        bodyFont,
        wordmark,
        picturemark,
        pageSize,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = suggestPresentationPackageFilename(brandName);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }, [
    exporting,
    headline,
    customer,
    date,
    contactName,
    pageSize,
    brandName,
  ]);

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-6">
      <header className="mb-5 flex flex-col gap-1">
        <h3 className="text-lg font-semibold text-black">Präsentation</h3>
        <p className="text-sm text-black/60">
          Erstellt eine InDesign-Vorlage (.idml) im Feinrot-Layout mit
          Wortmarke (oben rechts), Bildmarke (unten rechts), Headline und
          Kunde / Datum / Kontakt unten links. Schriften und Logos werden
          dem ZIP beigelegt.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="md:col-span-2 flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-black/50">
            Headline
          </span>
          <input
            type="text"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="z.B. Markenpräsentation 2026"
            disabled={exporting}
            className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10 disabled:opacity-60"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-black/50">
            Kunde (Firmierung der Brand)
          </span>
          <input
            type="text"
            value={customer}
            readOnly
            className="cursor-not-allowed rounded-lg border border-black/10 bg-black/5 px-3 py-2 text-sm text-black/70 outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-black/50">
            Datum
          </span>
          <input
            type="text"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={exporting}
            className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10 disabled:opacity-60"
          />
        </label>

        <label className="md:col-span-2 flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wider text-black/50">
            Kontakt (Projektmanager)
          </span>
          {organizationId == null ? (
            <input
              type="text"
              value={contactName}
              onChange={(e) => {
                setContactName(e.target.value);
                setContactId("");
              }}
              placeholder="Name eingeben"
              disabled={exporting}
              className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10 disabled:opacity-60"
            />
          ) : loadingManagers ? (
            <p className="text-sm text-black/50">Lade Mitglieder …</p>
          ) : managers.length === 0 ? (
            <input
              type="text"
              value={contactName}
              onChange={(e) => {
                setContactName(e.target.value);
                setContactId("");
              }}
              placeholder={
                managersError
                  ? "Mitglieder konnten nicht geladen werden – Name manuell eingeben"
                  : "Kein Manager hinterlegt – Name manuell eingeben"
              }
              disabled={exporting}
              className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10 disabled:opacity-60"
            />
          ) : (
            <select
              value={contactId}
              onChange={(e) => {
                const id = e.target.value;
                setContactId(id);
                const match = managers.find((m) => m.id === id);
                if (match) {
                  setContactName(match.full_name || match.username || "");
                }
              }}
              disabled={exporting}
              className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10 disabled:opacity-60"
            >
              {managers.map((m) => {
                const label =
                  m.full_name && m.username
                    ? `${m.full_name} (${m.username})`
                    : m.full_name || m.username || m.id;
                return (
                  <option key={m.id} value={m.id}>
                    {label}
                  </option>
                );
              })}
            </select>
          )}
          <span className="text-[11px] text-black/40">
            Eine Brand-spezifische Kontakt-Hinterlegung pro Brandcard
            folgt – aktuell wird auf die Manager:innen der zugehörigen
            Organisation zurückgegriffen.
          </span>
        </label>

        <div className="md:col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-black/50">
              Format
            </p>
            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map((opt) => {
                const active = preset === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setPreset(opt.key)}
                    disabled={exporting}
                    className={`rounded-xl border px-3 py-2 text-sm transition ${
                      active
                        ? "border-black bg-black text-white"
                        : "border-black/15 bg-white text-black hover:bg-black/5"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-black/50">
              Orientierung
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { key: "portrait", label: "Hochformat" },
                  { key: "landscape", label: "Querformat" },
                ] as const
              ).map((opt) => {
                const active = orientation === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setOrientation(opt.key)}
                    disabled={exporting}
                    className={`rounded-xl border px-3 py-2 text-sm transition ${
                      active
                        ? "border-black bg-black text-white"
                        : "border-black/15 bg-white text-black hover:bg-black/5"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || !headline.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {exporting ? (
            <>
              <span
                className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white"
                aria-hidden
              />
              Erstelle …
            </>
          ) : (
            "InDesign (.idml) exportieren"
          )}
        </button>
      </div>
    </div>
  );
}
