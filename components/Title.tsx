"use client";

import { useEffect, useRef } from "react";

type TitleProps = {
  text: string;
};

export default function Title({ text }: TitleProps) {
  const containerRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const gsap = (await import("gsap")).default;
      if (cancelled || !containerRef.current) return;

      gsap.from(containerRef.current.querySelectorAll(".letter"), {
        duration: 1.2,
        opacity: 0,
        y: 80,
        scale: 0.8,
        filter: "blur(12px)",
        ease: "power3.out",
        stagger: 0.06,
        delay: 0.2,
      });
    };

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <h1
      ref={containerRef}
      aria-label={text}
      className="m-0 flex whitespace-nowrap font-bold text-black"
      style={{
        fontSize: "clamp(3rem, 15vw, 12rem)",
        letterSpacing: "-0.02em",
      }}
    >
      {text.split("").map((char, index) => (
        <span
          key={`${char}-${index}`}
          className="letter inline-block will-change-transform"
          style={{ transformOrigin: "50% 100%" }}
        >
          {char === " " ? "\u00A0" : char}
        </span>
      ))}
    </h1>
  );
}
