"use client";

import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/util";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "subtle" | "gold";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 select-none max-w-full text-center leading-tight";
const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-contrast hover:bg-accent-hover active:translate-y-px shadow-[var(--shadow-card)]",
  secondary: "border border-border-strong bg-surface text-fg hover:bg-surface-2 active:bg-surface-3",
  ghost: "text-fg hover:bg-surface-2 active:bg-surface-3",
  subtle: "bg-surface-2 text-fg hover:bg-surface-3",
  danger: "bg-danger text-white hover:opacity-90 active:translate-y-px",
  // For use on navy surfaces (navy text on gold: 7.5:1).
  gold: "bg-gold text-[#141c2b] hover:bg-gold-hover active:translate-y-px shadow-[var(--shadow-card)]",
};
const sizes: Record<ButtonSize, string> = {
  // min-height (not a fixed height) so a long label can wrap onto a second line on narrow screens.
  sm: "min-h-8 px-3 py-1 text-[0.8125rem]",
  md: "min-h-10 px-4 py-1.5 text-[0.9rem]",
  lg: "min-h-12 px-5 py-2 text-[0.975rem]",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  icon,
  children,
  ...rest
}: { href: string; variant?: ButtonVariant; size?: ButtonSize; className?: string; icon?: ReactNode; children: ReactNode } & Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
>) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  pressed?: boolean;
}

/** Icon-only button. Always has an accessible name and a tooltip-style title. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = "ghost", size = "md", className, children, pressed, type = "button", ...rest },
  ref,
) {
  const dim = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-12 w-12" : "h-10 w-10";
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(base, variants[variant], dim, "px-0", pressed && "bg-accent-soft text-accent-soft-fg", className)}
      {...rest}
    >
      {children}
    </button>
  );
});
