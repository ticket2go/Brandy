"use client";

import { useEffect, useRef, useState } from "react";

type NavItem = {
  label: string;
  href: string;
};

const primaryItems: NavItem[] = [
  { label: "Work", href: "#work" },
  { label: "Services", href: "#services" },
  { label: "Pricing", href: "#pricing" },
  { label: "Approach", href: "#approach" },
  { label: "Book a Call", href: "#book" },
];

const resourceItems: NavItem[] = [
  { label: "Writing", href: "#writing" },
  { label: "Twitter / X", href: "https://x.com" },
  { label: "LinkedIn", href: "https://linkedin.com" },
  { label: "Terms of Service", href: "#terms" },
];

export default function NavCard() {
  const [open, setOpen] = useState(true);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const gsap = (await import("gsap")).default;
      if (cancelled || !contentRef.current || !innerRef.current) return;

      const items = innerRef.current.querySelectorAll<HTMLElement>(
        "[data-nav-item]"
      );

      if (open) {
        gsap.to(contentRef.current, {
          height: "auto",
          duration: 0.45,
          ease: "power3.out",
        });
        gsap.fromTo(
          items,
          {
            opacity: 0,
            y: 8,
            filter: "blur(10px)",
          },
          {
            opacity: 1,
            y: 0,
            filter: "blur(0px)",
            duration: 0.6,
            ease: "power3.out",
            stagger: 0.035,
            delay: isFirstRender.current ? 0.1 : 0.08,
          }
        );
        isFirstRender.current = false;
      } else {
        isFirstRender.current = false;
        gsap.to(items, {
          opacity: 0,
          y: -6,
          filter: "blur(10px)",
          duration: 0.3,
          ease: "power2.in",
          stagger: 0.02,
        });
        gsap.to(contentRef.current, {
          height: 0,
          duration: 0.4,
          ease: "power3.inOut",
          delay: 0.15,
        });
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed right-6 top-6 z-50 w-[200px] select-none rounded-2xl bg-neutral-950 p-5 text-neutral-200 shadow-2xl shadow-black/20 ring-1 ring-white/5"
    >
      <div className="flex items-center justify-between">
        <span
          aria-hidden
          className="h-2 w-2 rounded-full bg-white"
          title="Verfügbar"
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Menü schließen" : "Menü öffnen"}
          aria-expanded={open}
          className="grid grid-cols-2 gap-[3px] rounded-md p-1 transition-opacity hover:opacity-70"
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <span
              key={i}
              className="h-[3px] w-[3px] rounded-full bg-white"
            />
          ))}
        </button>
      </div>

      <div ref={contentRef} className="overflow-hidden" style={{ height: 0 }}>
        <div ref={innerRef} className="pt-4">
          <ul className="space-y-[2px] text-[15px] font-medium tracking-tight">
            {primaryItems.map((item) => (
              <li key={item.label} data-nav-item>
                <a
                  href={item.href}
                  className="block rounded-sm py-[1px] text-white transition-colors hover:text-neutral-400"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>

          <div
            className="my-4 h-px w-full bg-white/10"
            data-nav-item
            aria-hidden
          />

          <p
            className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-500"
            data-nav-item
          >
            Resources
          </p>
          <ul className="space-y-[2px] text-[13px]">
            {resourceItems.map((item) => (
              <li key={item.label} data-nav-item>
                <a
                  href={item.href}
                  className="block rounded-sm py-[1px] text-neutral-300 transition-colors hover:text-white"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </nav>
  );
}
