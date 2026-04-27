"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useSession } from "./SessionProvider";

function capitalize(input: string): string {
  if (!input) return input;
  return input.charAt(0).toUpperCase() + input.slice(1);
}

export default function Greeting() {
  const { user, profile, loading } = useSession();
  const [ready, setReady] = useState(false);
  const wrapperRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    setReady(true);
  }, []);

  const profileName = useMemo(() => {
    if (!user) return null;
    const candidate = profile?.full_name?.trim() || profile?.username?.trim();
    if (!candidate) return null;
    if (
      profile?.username &&
      candidate.toLowerCase() === profile.username.toLowerCase() &&
      candidate === candidate.toLowerCase()
    ) {
      return capitalize(candidate);
    }
    return candidate;
  }, [user, profile]);

  useEffect(() => {
    if (!ready || !wrapperRef.current) return;
    if (loading) return;
    let cancelled = false;

    (async () => {
      const gsap = (await import("gsap")).default;
      if (cancelled || !wrapperRef.current) return;
      gsap.fromTo(
        wrapperRef.current,
        { opacity: 0, filter: "blur(10px)" },
        {
          opacity: 1,
          filter: "blur(0px)",
          duration: 0.8,
          ease: "power2.out",
          delay: 0.15,
        }
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, loading, profileName]);

  return (
    <p
      ref={wrapperRef}
      className="m-0 text-lg text-black/70"
      style={{ opacity: 0 }}
    >
      {profileName ? (
        <>
          Hallo{" "}
          <span className="font-semibold text-black">{profileName}</span>,
          schön dass du da bist!
        </>
      ) : (
        <>Hallo, schön dass du da bist!</>
      )}
    </p>
  );
}
