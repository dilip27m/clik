import { ComponentProps } from "react";

export function Card({ className = "", ...rest }: ComponentProps<"div">) {
  return <div className={`rounded-2xl border border-line bg-paper shadow-card ${className}`} {...rest} />;
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="font-display text-xl font-semibold text-ink">{children}</h2>
      {action}
    </div>
  );
}
