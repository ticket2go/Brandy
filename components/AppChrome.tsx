"use client";

import { usePathname } from "next/navigation";

import NavCard from "./NavCard";

function showDock(pathname: string) {
  if (pathname === "/") return false;
  if (pathname === "/eventscraper" || pathname.startsWith("/eventscraper/")) {
    return false;
  }
  return true;
}

/** Persistentes Chrome außerhalb von template.tsx (kein Seitenwechsel-Zucken). */
export default function AppChrome() {
  const pathname = usePathname();
  if (!showDock(pathname)) return null;
  return <NavCard />;
}
