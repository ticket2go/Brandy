"use client";

import {
  searchProgressLabel,
  type SearchProgress,
} from "@/lib/search-progress";

export default function SearchStatus({
  progress,
  tone = "light",
}: {
  progress: SearchProgress;
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
          {searchProgressLabel(progress)}
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
