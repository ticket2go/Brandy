export type SearchPhase = "search" | "heroes";

export type SearchProgress = {
  phase: SearchPhase;
  loaded: number;
  total: number | null;
  percent: number;
};

export function makeSearchProgress(
  phase: SearchPhase,
  loaded: number,
  total: number | null,
  heroDone = 0,
  heroTotal = 0
): SearchProgress {
  const percent =
    phase === "heroes"
      ? heroTotal <= 0
        ? 95
        : Math.min(99, 80 + Math.round((heroDone / heroTotal) * 20))
      : total && total > 0
        ? Math.min(80, Math.max(1, Math.round((loaded / total) * 80)))
        : Math.min(70, Math.max(1, 4 + Math.round(Math.log2(loaded + 1) * 10)));
  return { phase, loaded, total, percent };
}

export function searchProgressLabel(progress: SearchProgress): string {
  if (progress.phase === "heroes") {
    return `${progress.percent} % · Bilder`;
  }
  if (progress.total != null && progress.total > 0) {
    return `${progress.percent} % · ${progress.loaded} / ${progress.total}`;
  }
  return `${progress.percent} % · ${progress.loaded} Einträge`;
}
