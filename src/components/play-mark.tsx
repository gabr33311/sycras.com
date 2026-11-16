/** The Google Play mark (the coloured triangle), drawn inline. */
export function PlayMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 26" className={className} aria-hidden>
      <path d="M1.2.6 13.6 13 1.2 25.4A2 2 0 0 1 .5 23.9V2.1A2 2 0 0 1 1.2.6Z" fill="#00d7fe" />
      <path d="m17.8 8.8-4.2 4.2 4.2 4.2 4.8-2.7c1.3-.8 1.3-2.2 0-3Z" fill="#ffce00" />
      <path d="M13.6 13 1.2 25.4c.5.5 1.3.5 2.1.1l14.5-8.3Z" fill="#ff3a44" />
      <path d="M13.6 13 17.8 8.8 3.3.5C2.5 0 1.7.1 1.2.6Z" fill="#00f076" />
    </svg>
  );
}
