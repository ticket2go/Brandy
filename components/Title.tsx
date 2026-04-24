"use client";

import { useEffect, useRef } from "react";

type TitleProps = {
  text: string;
};

export default function Title({ text }: TitleProps) {
  const ref = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const gsap = (await import("gsap")).default;
      if (cancelled || !ref.current) return;

      gsap.fromTo(
        ref.current,
        { opacity: 0, filter: "blur(12px)" },
        {
          opacity: 1,
          filter: "blur(0px)",
          duration: 0.9,
          ease: "power2.out",
        }
      );
    };

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <h1
      ref={ref}
      className="m-0 font-bold tracking-tight text-black"
      style={{
        fontSize: "clamp(1.5rem, 5vw, 3.5rem)",
        letterSpacing: "-0.02em",
        opacity: 0,
        filter: "blur(12px)",
      }}
    >
      {text}
    </h1>
  );
}
