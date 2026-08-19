import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-rose-600 text-white shadow-sm shadow-rose-600/20 hover:bg-rose-500 focus-visible:outline-rose-600 dark:hover:bg-rose-500",
  secondary:
    "bg-stone-900 text-white hover:bg-stone-700 focus-visible:outline-stone-900 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200",
  outline:
    "border border-stone-300 bg-white text-stone-800 hover:border-stone-400 hover:bg-stone-50 focus-visible:outline-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-stone-600 dark:hover:bg-stone-800",
  ghost:
    "text-stone-700 hover:bg-stone-200/60 focus-visible:outline-stone-400 dark:text-stone-300 dark:hover:bg-stone-800",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-6 text-sm",
  lg: "h-13 px-8 text-base",
};

interface ButtonProps {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  href,
  onClick,
  type = "button",
  disabled,
}: ButtonProps) {
  const classes = cn(
    "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    className,
  );

  if (href) {
    return (
      <Link href={href} className={classes} onClick={onClick}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} className={classes} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
