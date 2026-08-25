"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Rendert Children in document.body, damit position:fixed am Viewport
 * hängt – nicht am GSAP-animierten Template-Wrapper (transform/filter
 * erzeugen sonst einen neuen Containing Block).
 */
export default function FixedPortal({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setTarget(document.body);
  }, []);

  if (!target) return null;
  return createPortal(children, target);
}
