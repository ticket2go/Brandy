export type IngestPhase =
  | "map"
  | "images"
  | "send"
  | "verify"
  | "done";

export type IngestProgress = {
  phase: IngestPhase;
  label: string;
  percent: number;
  done: number;
  total: number;
};

export type IngestOutcome = "success" | "partial" | "failed";

export function makeIngestProgress(
  phase: IngestPhase,
  done = 0,
  total = 0,
  label?: string
): IngestProgress {
  const percent = percentOf(phase, done, total);
  const progress = { phase, label: "", percent, done, total };
  return {
    ...progress,
    label: label ?? ingestProgressLabel(progress),
  };
}

export function ingestProgressLabel(progress: IngestProgress): string {
  switch (progress.phase) {
    case "map":
      return "Events werden geprüft …";
    case "images":
      return progress.total > 0
        ? `Bilder vorbereiten ${progress.done} / ${progress.total}`
        : "Bilder vorbereiten …";
    case "send":
      return progress.total > 0
        ? `An GetHyped senden ${progress.done} / ${progress.total}`
        : "An GetHyped senden …";
    case "verify":
      return progress.total > 0
        ? `Übertragung prüfen ${progress.done} / ${progress.total}`
        : "Übertragung prüfen …";
    case "done":
      return "Übertragung abgeschlossen";
  }
}

function percentOf(phase: IngestPhase, done: number, total: number): number {
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  const span =
    phase === "map"
      ? { from: 0, to: 8 }
      : phase === "images"
        ? { from: 8, to: 55 }
        : phase === "send"
          ? { from: 55, to: 82 }
          : phase === "verify"
            ? { from: 82, to: 99 }
            : { from: 100, to: 100 };
  return Math.min(
    100,
    Math.round(span.from + (span.to - span.from) * ratio)
  );
}

export function ingestOutcomeOf(input: {
  sent: number;
  accepted: number;
  rejected: number;
  withImage: number;
  imagesConfirmed: number | null;
  error: string | null;
}): IngestOutcome {
  if (input.error && input.accepted === 0) return "failed";
  const eventsOk =
    input.sent > 0 && input.accepted === input.sent && input.rejected === 0;
  const imagesOk =
    input.withImage > 0 &&
    input.imagesConfirmed != null &&
    input.imagesConfirmed === input.withImage;
  if (eventsOk && imagesOk && !input.error) return "success";
  if (input.accepted > 0) return "partial";
  return "failed";
}

export function ingestSummaryOf(input: {
  sent: number;
  accepted: number;
  rejected: number;
  skipped: number;
  withImage: number;
  imagesConfirmed: number | null;
  imagesMissing: number;
  error: string | null;
  outcome: IngestOutcome;
}): string {
  if (input.outcome === "success") {
    return `Alles erfolgreich übertragen: ${input.accepted} Events, ${input.imagesConfirmed} Bilder.`;
  }
  if (input.outcome === "failed") {
    return input.error ?? "Die Übertragung an GetHyped ist fehlgeschlagen.";
  }
  const images =
    input.imagesConfirmed == null
      ? input.withImage > 0
        ? `${input.withImage} Bilder mitgeschickt, Bestätigung durch GetHyped fehlt.`
        : "Keine Bilder mitgeschickt."
      : `${input.imagesConfirmed} von ${input.withImage} Bildern bestätigt.`;
  return `${input.accepted} von ${input.sent} Events übernommen. ${images}`;
}
