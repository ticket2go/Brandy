"use client";

import { useState } from "react";

type Person = {
  name: string;
  email: string;
};

type Role = {
  key: string;
  label: string;
  people: Person[];
};

const ROLES: Role[] = [
  {
    key: "projektmanagement",
    label: "Projektmanagement",
    people: [
      { name: "Nicole Bärwinkel", email: "nicole.baerwinkel@example.com" },
    ],
  },
  {
    key: "grafik",
    label: "Grafik",
    people: [
      { name: "Hannes Heuermann", email: "hannes.heuermann@example.com" },
      { name: "Marcel van Velzen", email: "marcel.vanvelzen@example.com" },
    ],
  },
  { key: "konzept", label: "Konzept", people: [] },
  {
    key: "programmierung",
    label: "Programmierung",
    people: [{ name: "Devin Landwehr", email: "devin.landwehr@example.com" }],
  },
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
            onMouseLeave={() =>
              setOpenKey((current) => (current === role.key ? null : current))
            }
            onFocus={() => setOpenKey(role.key)}
            onBlur={() =>
              setOpenKey((current) => (current === role.key ? null : current))
            }
          >
            <button
              type="button"
              aria-expanded={isOpen}
              className="inline-flex items-center gap-2 rounded-full bg-black/5 px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-black/40 transition hover:bg-black/10 hover:text-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
            >
              <span>{role.label}</span>
              {hasPeople && (
                <span className="ml-auto text-[11px] font-semibold text-white">
                  {role.people.length}
                </span>
              )}
            </button>

            <div
              role="tooltip"
              aria-hidden={!isOpen}
              className={`absolute left-0 top-full z-20 mt-2 min-w-[220px] rounded-xl bg-white p-3 shadow-lg transition-all duration-200 ${
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
                      key={person.email}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="text-sm font-medium text-black">
                        {person.name}
                      </span>
                      <a
                        href={`mailto:${person.email}`}
                        aria-label={`E-Mail an ${person.name}`}
                        title={person.email}
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-black/40 transition hover:bg-black/5 hover:text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="none"
                          aria-hidden="true"
                        >
                          <rect
                            x="1.75"
                            y="3.75"
                            width="12.5"
                            height="8.5"
                            rx="1.25"
                            stroke="currentColor"
                            strokeWidth="1.25"
                          />
                          <path
                            d="M2.5 4.5L8 9L13.5 4.5"
                            stroke="currentColor"
                            strokeWidth="1.25"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </a>
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
