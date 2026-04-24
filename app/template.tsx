"use client";

import { useEffect, useRef } from "react";

export default function Template({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const gsap = (await import("gsap")).default;
      if (cancelled || !ref.current) return;
      gsap.fromTo(
        ref.current,
        { opacity: 0, filter: "blur(6px)", y: 8 },
        {
          opacity: 1,
          filter: "blur(0px)",
          y: 0,
          duration: 0.5,
          ease: "power2.out",
          // filter/transform auf Ancestor-Elementen koppeln position: fixed an
          // diesen Container (statt an den Viewport). Nach dem Intro deshalb
          // komplett zurücksetzen, damit Modals wieder mittig im Viewport
          // liegen und nicht beim Scrollen mitwandern.
          clearProps: "filter,transform,opacity",
        }
      );
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div ref={ref} style={{ opacity: 0 }}>
      {children}
    </div>
  );
}
