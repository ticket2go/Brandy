"use client";

import { useState } from "react";

type Role = {
  key: string;
  label: string;
  people: string[];
};

const ROLES: Role[] = [
  { key: "projektmanagement", label: "Projektmanagement", people: ["Nicole Bärwinkel"] },
  { key: "grafik", label: "Grafik", people: ["Hannes Heuermann", "Marcel van Velzen"] },
  { key: "konzept", label: "Konzept", people: [] },
  { key: "programmierung", label: "Programmierung", people: ["Devin Landwehr"] },
];

export default function BrandRoles() {
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap gap-2">
      {ROLES.map((role) => {
        const isOpen = openKey === role.key;
        const hasPeople = role.people.length > 0;
        return (
          <div
            key={role.key}
            className="relative"
            onMouseEnter={() => setOpenKey(role.key)}
            onMouseLeave={() => setOpenKey((current) => (current === role.key ? null : current))}
            onFocus={() => setOpenKey(role.key)}
            onBlur={() => setOpenKey((current) => (current === role.key ? null : current))}
          >
            <button
              type="button"
              aria-expanded={isOpen}
              className="inline-flex items-center gap-2 rounded-full bg-black/5 px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-black/40 transition hover:bg-black/10 hover:text-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
            >
              <span>{role.label}</span>
              {hasPeople && (
                <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-black/10 px-1 text-[9px] font-semibold text-black/60">
                  {role.people.length}
                </span>
              )}
            </button>

            <div
              role="tooltip"
              aria-hidden={!isOpen}
              className={`absolute left-0 top-full z-20 mt-2 min-w-[180px] rounded-xl border border-black/10 bg-white p-3 shadow-lg transition-all duration-200 ${
                isOpen
                  ? "pointer-events-auto translate-y-0 opacity-100"
                  : "pointer-events-none -translate-y-1 opacity-0"
              }`}
            >
              <p className="text-[10px] font-medium uppercase tracking-widest text-black/40">
                {role.label}
              </p>
              {hasPeople ? (
                <ul className="mt-1 flex flex-col gap-0.5">
                  {role.people.map((person) => (
                    <li
                      key={person}
                      className="text-sm font-medium text-black"
                    >
                      {person}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-black/40">
                  Noch niemand zugewiesen.
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
