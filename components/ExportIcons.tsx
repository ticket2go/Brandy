type IconProps = {
  className?: string;
};

export function IndesignIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 240 234"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <title>Adobe InDesign</title>
      <path
        fill="#49021F"
        d="M42.5 0h155C221 0 240 19 240 42.5v149c0 23.5-19 42.5-42.5 42.5h-155C19 234 0 215 0 191.5v-149C0 19 19 0 42.5 0z"
      />
      <path
        fill="#FF3366"
        d="M87.2 61.2v103c0 1.1-.5 1.6-1.4 1.6H66.2c-.9 0-1.3-.5-1.3-1.6v-103c0-.9.5-1.3 1.4-1.3h19.5c.6-.1 1.2.3 1.3 1 .1.1.1.2.1.3z"
      />
      <path
        fill="#FF3366"
        d="M145 167c-7.4.1-14.8-1.4-21.5-4.5-6.3-2.9-11.5-7.7-15.1-13.6-3.7-6.1-5.5-13.7-5.5-22.8-.1-7.4 1.8-14.7 5.5-21.1 3.8-6.5 9.3-11.9 15.9-15.5 7-3.9 15.4-5.8 25.3-5.8.5 0 1.2 0 2.1.1s1.9.1 3.1.2V52.4c0-.7.3-1.1 1-1.1h20.3c.5-.1.9.3 1 .7v.2 95.2c0 1.8.1 3.8.2 6 .2 2.1.3 4.1.4 5.8 0 .7-.3 1.3-1 1.6-5.2 2.2-10.7 3.8-16.3 4.8-5 .9-10.2 1.4-15.4 1.4zm9.8-20v-44c-.9-.2-1.8-.4-2.7-.5-1.1-.1-2.2-.2-3.3-.2-3.9 0-7.8.8-11.3 2.6-3.4 1.7-6.3 4.2-8.5 7.4s-3.3 7.5-3.3 12.7c-.1 3.5.5 7 1.7 10.3 1 2.7 2.5 5.1 4.5 7.1 1.9 1.8 4.2 3.2 6.8 4 2.7.9 5.5 1.3 8.3 1.3 1.5 0 2.9-.1 4.2-.2 1.3.1 2.5-.1 3.6-.5z"
      />
    </svg>
  );
}

export function CreativeCloudIcon({ className }: IconProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/creative-cloud.svg"
      alt="Adobe Creative Cloud"
      aria-hidden="true"
      className={className}
    />
  );
}

export function FigmaIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 240 234"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <title>Figma</title>
      <path
        fill="#1d1d1b"
        d="M42.5 0h155c23.5 0 42.5 19 42.5 42.5v149c0 23.5-19 42.5-42.5 42.5H42.5C19 234 0 215 0 191.5V42.5C0 19 19 0 42.5 0z"
      />
      <path
        fill="#0acf83"
        d="M97.8 197.2c14.8 0 26.8-12 26.8-26.8v-26.8H97.8c-14.8 0-26.8 12-26.8 26.8s12 26.8 26.8 26.8z"
      />
      <path
        fill="#a259ff"
        d="M71 117c0-14.8 12-26.8 26.8-26.8h26.8v53.5H97.8c-14.8 0-26.8-12-26.8-26.8z"
      />
      <path
        fill="#f24e1e"
        d="M71 63.5c0-14.8 12-26.8 26.8-26.8h26.8v53.5H97.8c-14.8 0-26.8-12-26.8-26.8z"
      />
      <path
        fill="#ff7262"
        d="M124.5 36.8h26.8c14.8 0 26.8 12 26.8 26.8s-12 26.8-26.8 26.8h-26.8V36.8z"
      />
      <path
        fill="#1abcfe"
        d="M178 117c0 14.8-12 26.8-26.8 26.8s-26.8-12-26.8-26.8 12-26.8 26.8-26.8 26.8 12 26.8 26.8z"
      />
    </svg>
  );
}
