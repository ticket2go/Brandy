"use client";

import { ingestProgressLabel, type IngestProgress } from "@/lib/ingest-progress";

export default function IngestLiveStatus({
  progress,
  tone = "light",
}: {
  progress: IngestProgress;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <p
          className={`text-[12px] ${dark ? "text-white/60" : "text-black/55"}`}
          aria-live="polite"
        >
          {progress.label || ingestProgressLabel(progress)}
        </p>
        <p
          className={`shrink-0 text-[12px] font-semibold tabular-nums ${
            dark ? "text-white" : "text-black"
          }`}
        >
          {progress.percent} %
        </p>
      </div>
      <div
        className={`h-1.5 overflow-hidden rounded-full ${
          dark ? "bg-white/15" : "bg-black/10"
        }`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${
            dark ? "bg-white" : "bg-black"
          }`}
          style={{ width: `${progress.percent}%` }}
        />
      </div>
    </div>
  );
}
