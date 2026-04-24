"use client";

import { useEffect, useRef, useState } from "react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  widthClassName?: string;
};

export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  widthClassName = "max-w-md",
}: ModalProps) {
  const [rendered, setRendered] = useState(open);
  const [visible, setVisible] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setRendered(true);
      const frame = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }
    setVisible(false);
    const timeout = window.setTimeout(() => setRendered(false), 300);
    return () => window.clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!rendered) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [rendered, onClose]);

  if (!rendered) return null;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[70] flex items-center justify-center px-4 transition-all duration-300 ease-out"
      style={{
        backgroundColor: visible ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0)",
        backdropFilter: visible ? "blur(18px)" : "blur(0px)",
        WebkitBackdropFilter: visible ? "blur(18px)" : "blur(0px)",
        opacity: visible ? 1 : 0,
      }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className={`w-full ${widthClassName} rounded-2xl bg-white p-6 transition-all duration-300 ease-out`}
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0) scale(1)" : "translateY(8px) scale(0.98)",
          filter: visible ? "blur(0px)" : "blur(6px)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-lg font-semibold tracking-tight text-black">
          {title}
        </h3>
        {description && (
          <p className="mt-1 text-sm text-black/60">{description}</p>
        )}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
