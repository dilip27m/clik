import Link from "next/link";
import { ComponentProps, ReactNode } from "react";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg" | "xl";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-clay text-white shadow-lift hover:bg-clay-dark active:bg-clay-dark disabled:bg-ink-faint disabled:shadow-none",
  secondary: "bg-paper text-ink border border-line-strong shadow-card hover:border-clay/40 hover:text-clay-dark",
  ghost: "text-ink-soft hover:bg-clay-soft/60 hover:text-clay-dark",
  danger: "bg-paper text-rust border border-rust/30 hover:bg-rust-soft",
};

const SIZES: Record<Size, string> = {
  md: "h-11 px-4 text-[0.95rem] rounded-xl gap-2",
  lg: "h-14 px-6 text-lg rounded-2xl gap-2.5",
  xl: "h-16 px-7 text-xl rounded-2xl gap-3",
};

function classes(variant: Variant, size: Size, full?: boolean, extra = "") {
  return [
    "inline-flex items-center justify-center font-semibold transition-colors select-none disabled:cursor-not-allowed",
    VARIANTS[variant],
    SIZES[size],
    full ? "w-full" : "",
    extra,
  ].join(" ");
}

interface Common {
  variant?: Variant;
  size?: Size;
  full?: boolean;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  full,
  icon,
  loading,
  className,
  children,
  ...rest
}: Common & { loading?: boolean } & ComponentProps<"button">) {
  return (
    <button className={classes(variant, size, full, className)} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Spinner className="size-5" /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({ variant = "primary", size = "md", full, icon, className, children, ...rest }: Common & ComponentProps<typeof Link>) {
  return (
    <Link className={classes(variant, size, full, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
