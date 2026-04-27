"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { useSession } from "./SessionProvider";

type NavItem = {
  label: string;
  href: string;
};

const primaryItems: NavItem[] = [
  { label: "Brands", href: "/#brands" },
  { label: "Design Manuals", href: "/design-manuals" },
  { label: "Ecosystem", href: "/ecosystem" },
];

export default function NavCard() {
  const pathname = usePathname();
  const router = useRouter();
  const isHome = pathname === "/";
  const [open, setOpen] = useState(isHome);
  const {
    user,
    profile,
    activeOrg,
    memberships,
    setActiveOrg,
    signOut,
  } = useSession();

  useEffect(() => {
    setOpen(isHome);
  }, [isHome]);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);
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
        if (labelRef.current) {
          gsap.to(labelRef.current, {
            opacity: 0,
            x: -4,
            filter: "blur(8px)",
            duration: 0.3,
            ease: "power2.in",
            pointerEvents: "none",
          });
        }
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
        if (labelRef.current) {
          gsap.to(labelRef.current, {
            opacity: 1,
            x: 0,
            filter: "blur(0px)",
            duration: 0.45,
            ease: "power3.out",
            delay: 0.25,
            pointerEvents: "auto",
          });
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const orgLabel = useMemo(() => {
    if (activeOrg) return `B. ${activeOrg.name}`;
    if (profile?.is_admin) return "B. Admin";
    return "B. Feinrot";
  }, [activeOrg, profile]);

  const resourceItems: NavItem[] = useMemo(() => {
    const items: NavItem[] = [{ label: "Account", href: "/account" }];
    if (profile?.is_admin) {
      items.push({ label: "Admin-Panel", href: "/admin" });
    }
    return items;
  }, [profile]);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[NavCard] signOut failed", err);
    }
    // Harter Reload nach /login – das ist robust gegen festgefahrene
    // Router-States und stellt sicher, dass auch der Server-Side-State
    // (Caches, RSC) nach dem Logout neu aufgebaut wird.
    if (typeof window !== "undefined") {
      window.location.assign("/login");
    } else {
      router.replace("/login");
    }
  };

  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed right-6 top-6 z-50 w-[220px] select-none rounded-2xl bg-neutral-950 p-5 text-neutral-200 shadow-2xl shadow-black/20 ring-1 ring-white/5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full bg-white"
            title="Verfügbar"
          />
          <span
            ref={labelRef}
            className="truncate text-[11px] font-medium tracking-tight text-white/80"
            style={{ opacity: open ? 0 : 1 }}
            title={orgLabel}
          >
            {orgLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Menü schließen" : "Menü öffnen"}
          aria-expanded={open}
          className="grid shrink-0 grid-cols-2 gap-[3px] rounded-md p-1 transition-opacity hover:opacity-70"
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
          {user && activeOrg && (
            <div data-nav-item className="mb-3 rounded-lg bg-white/5 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                Aktive Orga
              </p>
              <p
                className="mt-0.5 truncate text-[13px] font-semibold text-white"
                title={activeOrg.name}
              >
                B. {activeOrg.name}
              </p>
              {memberships.length > 1 && (
                <select
                  value={activeOrg.id}
                  onChange={(e) => setActiveOrg(e.target.value)}
                  className="mt-2 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white outline-none focus:border-white/30"
                >
                  {memberships.map((m) => (
                    <option
                      key={m.organization_id}
                      value={m.organization_id}
                      className="bg-neutral-950"
                    >
                      {m.organization.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <ul className="space-y-[2px] text-[15px] font-medium tracking-tight">
            {primaryItems.map((item) => (
              <li key={item.label} data-nav-item>
                <Link
                  href={item.href}
                  className="block rounded-sm py-[1px] text-white transition-colors hover:text-neutral-400"
                >
                  {item.label}
                </Link>
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
                <Link
                  href={item.href}
                  className="block rounded-sm py-[1px] text-neutral-300 transition-colors hover:text-white"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            {user ? (
              <>
                <li data-nav-item className="mt-2 text-[11px] text-neutral-500">
                  Eingeloggt als{" "}
                  <span className="text-white/80">
                    {profile?.username ?? profile?.full_name ?? "User"}
                  </span>
                </li>
                <li data-nav-item>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="block rounded-sm py-[1px] text-left text-neutral-300 transition-colors hover:text-white"
                  >
                    Logout
                  </button>
                </li>
              </>
            ) : (
              <>
                <li data-nav-item>
                  <Link
                    href="/login"
                    className="block rounded-sm py-[1px] text-neutral-300 transition-colors hover:text-white"
                  >
                    Login
                  </Link>
                </li>
                <li data-nav-item>
                  <Link
                    href="/register"
                    className="block rounded-sm py-[1px] text-neutral-300 transition-colors hover:text-white"
                  >
                    Registrieren
                  </Link>
                </li>
              </>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}
