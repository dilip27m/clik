/* eslint-disable @next/next/no-img-element -- small static SVG */

// The Bill Book mark (public/logo.svg).
export function Logo({ className = "size-10" }: { className?: string }) {
  return <img src="/logo.svg" alt="Bill Book" className={`shrink-0 drop-shadow-sm ${className}`} />;
}
