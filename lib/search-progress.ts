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
  if (phase === "heroes") {
    const percent =
      heroTotal <= 0
        ? 100
        : Math.min(100, Math.round((heroDone / heroTotal) * 100));
    return {
      phase,
      loaded: heroDone,
      total: heroTotal,
      percent,
    };
  }
  const percent =
    total && total > 0
      ? Math.min(100, Math.max(1, Math.round((loaded / total) * 100)))
      : Math.min(95, Math.max(1, 4 + Math.round(Math.log2(loaded + 1) * 12)));
  return { phase, loaded, total, percent };
}

export function searchProgressLabel(progress: SearchProgress): string {
  if (progress.phase === "heroes") {
    if (progress.total != null && progress.total > 0) {
      return `${progress.percent} % · Bilder ${progress.loaded} / ${progress.total}`;
    }
    return `${progress.percent} % · Bilder`;
  }
  if (progress.total != null && progress.total > 0) {
    return `${progress.percent} % · ${progress.loaded} / ${progress.total}`;
  }
  return `${progress.percent} % · ${progress.loaded} Einträge`;
}
