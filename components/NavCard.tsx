"use client";

import { useState } from "react";

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

  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed right-6 top-6 z-50 w-[200px] select-none rounded-2xl bg-neutral-950 p-5 text-neutral-200 shadow-2xl shadow-black/20 ring-1 ring-white/5"
    >
      <div className="mb-4 flex items-center justify-between">
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

      {open && (
        <>
          <ul className="space-y-[2px] text-[15px] font-medium tracking-tight">
            {primaryItems.map((item) => (
              <li key={item.label}>
                <a
                  href={item.href}
                  className="block rounded-sm py-[1px] text-white transition-colors hover:text-neutral-400"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="my-4 h-px w-full bg-white/10" />

          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-500">
            Resources
          </p>
          <ul className="space-y-[2px] text-[13px]">
            {resourceItems.map((item) => (
              <li key={item.label}>
                <a
                  href={item.href}
                  className="block rounded-sm py-[1px] text-neutral-300 transition-colors hover:text-white"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </nav>
  );
}
