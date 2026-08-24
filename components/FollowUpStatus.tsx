"use client";

import type { FollowUpGroup, FollowUpProgress } from "@/lib/follow-up";

type FollowUpStatusProps = {
  progress: FollowUpProgress;
  onStop?: () => void;
};

export default function FollowUpStatus({
  progress,
  onStop,
}: FollowUpStatusProps) {
  const percent =
    progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-black" aria-live="polite">
            {progress.running
              ? "Unterseiten"
              : progress.groups.some((group) => group.status === "paused")
                ? "Angehalten"
                : "Unterseiten fertig"}
            {": "}
            {progress.done} / {progress.total}
          </p>
          <p className="text-sm text-black/50">
            {progress.eventCount === 1
              ? "1 Eintrag bisher"
              : `${progress.eventCount} Einträge bisher`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-black/40">{percent} %</p>
          {progress.running && onStop ? (
            <button
              type="button"
              onClick={onStop}
              className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-black/5"
            >
              Anhalten
            </button>
          ) : null}
        </div>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-black/10"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.done}
      >
        <div
          className="h-full rounded-full bg-black transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {progress.groups.map((group) => (
          <FollowUpBadge
            key={group.id}
            group={group}
            onClick={() => {
              document
                .getElementById(sectionId(group.id))
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function FollowUpBadge({
  group,
  onClick,
}: {
  group: FollowUpGroup;
  onClick?: () => void;
}) {
  const count =
    group.status === "pending" ? group.listingCount : group.eventCount;
  const className =
    group.status === "running"
      ? "bg-black text-white animate-pulse"
      : group.status === "done"
        ? "bg-black text-white"
        : group.status === "error"
          ? "bg-red-100 text-red-700"
          : group.status === "paused"
            ? "bg-amber-100 text-amber-900"
            : "bg-black/5 text-black/55";

  const content = (
    <>
      <span className="truncate">{group.title}</span>
      <span className="shrink-0 opacity-80">
        {group.status === "running"
          ? "…"
          : group.status === "error"
            ? "!"
            : group.status === "paused"
              ? "❚❚"
              : count}
      </span>
    </>
  );
  const shared =
    `inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-left text-xs font-medium ${className}`;

  if (!onClick) {
    return (
      <span title={group.error ?? group.title} className={shared}>
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={group.error ?? group.title}
      className={`${shared} transition`}
    >
      {content}
    </button>
  );
}

export function sectionId(groupId: string): string {
  return `follow-up-${groupId}`;
}
