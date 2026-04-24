"use client";

import { useCallback, useRef, useState } from "react";

type DropZoneProps = {
  accept?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  title?: string;
  description?: string;
  buttonLabel?: string;
  className?: string;
  disabled?: boolean;
};

export default function DropZone({
  accept,
  multiple = true,
  onFiles,
  title = "Dateien hierher ziehen",
  description = "oder klicke, um Dateien auszuwaehlen",
  buttonLabel = "Dateien auswaehlen",
  className,
  disabled = false,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFileList = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return;
      const files: File[] = [];
      for (let i = 0; i < fileList.length; i += 1) {
        const file = fileList.item(i);
        if (file) files.push(file);
      }
      if (files.length > 0) onFiles(files);
    },
    [onFiles]
  );

  const openPicker = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      onClick={openPicker}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openPicker();
        }
      }}
      onDragOver={(event) => {
        if (disabled) return;
        event.preventDefault();
        event.stopPropagation();
        if (!dragOver) setDragOver(true);
      }}
      onDragEnter={(event) => {
        if (disabled) return;
        event.preventDefault();
        event.stopPropagation();
        setDragOver(true);
      }}
      onDragLeave={(event) => {
        if (disabled) return;
        event.preventDefault();
        event.stopPropagation();
        setDragOver(false);
      }}
      onDrop={(event) => {
        if (disabled) return;
        event.preventDefault();
        event.stopPropagation();
        setDragOver(false);
        handleFileList(event.dataTransfer.files);
      }}
      className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-black/20 ${
        dragOver
          ? "border-black bg-black/[0.04]"
          : "border-black/20 bg-black/[0.015] hover:border-black/40 hover:bg-black/[0.03]"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""} ${className ?? ""}`}
    >
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="text-black/40"
      >
        <path
          d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium text-black">{title}</p>
        <p className="text-xs text-black/50">{description}</p>
      </div>
      <span
        className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-black/15 bg-white px-3 py-1 text-xs font-medium text-black/80"
        onClick={(event) => {
          event.stopPropagation();
          openPicker();
        }}
      >
        {buttonLabel}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(event) => {
          handleFileList(event.target.files);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
    </div>
  );
}
