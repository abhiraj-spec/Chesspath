"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { cn } from "@/lib/util";

// ---------- Card ----------

export function Card({ className, children, as: As = "div", ...rest }: { className?: string; children: ReactNode; as?: "div" | "section" | "article" | "li" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <As className={cn("rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-card)]", className)} {...rest}>
      {children}
    </As>
  );
}

export function CardHeader({ title, description, action, className, titleAs: T = "h2" }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string; titleAs?: "h2" | "h3" }) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <T className="t-card text-fg">{title}</T>
        {description && <p className="t-small mt-0.5 text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

// ---------- Badge ----------

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-border",
  accent: "bg-accent-soft text-accent-soft-fg border-transparent",
  success: "bg-success-soft text-success border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  info: "bg-info-soft text-info border-transparent",
};

export function Badge({ tone = "neutral", children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.75rem] font-medium leading-5", tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

/** Difficulty label: dots + text so meaning never depends on colour alone. */
export function DifficultyBadge({ level, max = 5, label }: { level: number; max?: number; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.75rem] font-medium text-muted" aria-label={`Difficulty ${level} of ${max}${label ? `: ${label}` : ""}`}>
      <span className="flex gap-0.5" aria-hidden>
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={cn("h-1.5 w-1.5 rounded-full", i < level ? "bg-accent" : "bg-border-strong")} />
        ))}
      </span>
      {label ?? `Level ${level}`}
    </span>
  );
}

// ---------- Progress ----------

export function ProgressBar({ value, max = 100, label, className, tone = "accent", showValue }: { value: number; max?: number; label: string; className?: string; tone?: "accent" | "success" | "warning"; showValue?: boolean }) {
  const pctValue = max === 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const color = tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-accent";
  return (
    <div className={cn("w-full", className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.round(value)}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-3"
      >
        <div className={cn("h-full rounded-full transition-[width] duration-300", color)} style={{ width: `${pctValue}%` }} />
      </div>
      {showValue && <p className="t-small mt-1 text-muted tabular">{Math.round(pctValue)}%</p>}
    </div>
  );
}

export function ProgressRing({ value, size = 44, label }: { value: number; size?: number; label: string }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <svg width={size} height={size} role="img" aria-label={label} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={5} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={5}
        strokeDasharray={c}
        strokeDashoffset={c - (v / 100) * c}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size / 4} fontWeight={600} fill="var(--text)">
        {Math.round(v)}%
      </text>
    </svg>
  );
}

// ---------- Skeleton / empty / error ----------

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse-soft rounded-[var(--radius-sm)] bg-surface-3", className)} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center rounded-[var(--radius-lg)] border border-dashed border-border-strong px-6 py-10 text-center", className)}>
      {icon && <div className="mb-3 text-subtle">{icon}</div>}
      <p className="t-card text-fg">{title}</p>
      {description && <p className="t-small mt-1 max-w-md text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description, action }: { title?: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-soft px-4 py-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden />
        <div>
          <p className="t-card text-fg">{title}</p>
          {description && <p className="t-small mt-1 text-muted">{description}</p>}
          {action && <div className="mt-3">{action}</div>}
        </div>
      </div>
    </div>
  );
}

// ---------- Callout (feedback) ----------

export function Callout({ tone = "info", title, children, icon, className, live }: { tone?: Tone; title?: ReactNode; children?: ReactNode; icon?: ReactNode; className?: string; live?: boolean }) {
  const border: Record<Tone, string> = {
    neutral: "border-border bg-surface-2",
    accent: "border-accent/25 bg-accent-soft",
    success: "border-success/30 bg-success-soft",
    warning: "border-warning/30 bg-warning-soft",
    danger: "border-danger/30 bg-danger-soft",
    info: "border-info/25 bg-info-soft",
  };
  return (
    <div className={cn("rounded-[var(--radius-md)] border px-3.5 py-3", border[tone], className)} role={live ? "status" : undefined}>
      <div className="flex gap-2.5">
        {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
        <div className="min-w-0 flex-1">
          {title && <p className="t-card text-fg">{title}</p>}
          {children && <div className={cn("t-body text-fg/90", title ? "mt-0.5" : undefined)}>{children}</div>}
        </div>
      </div>
    </div>
  );
}

// ---------- Switch ----------

export function Switch({ checked, onChange, label, description, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; id?: string }) {
  const autoId = useId();
  const sid = id ?? autoId;
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <label htmlFor={sid} className="t-body font-medium text-fg">
          {label}
        </label>
        {description && (
          <p className="t-small text-muted" id={`${sid}-desc`}>
            {description}
          </p>
        )}
      </div>
      <button
        id={sid}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${sid}-desc` : undefined}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
          checked ? "border-accent bg-accent" : "border-border-strong bg-surface-3",
        )}
      >
        <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-5" : "translate-x-0.5")} />
        <span className="sr-only">{checked ? "On" : "Off"}</span>
      </button>
    </div>
  );
}

// ---------- Segmented control (radio group) ----------

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; description?: string }[];
  label: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = options.findIndex((o) => o.value === value);
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex flex-wrap gap-1 rounded-[var(--radius-md)] bg-surface-2 p-1", className)}>
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active || (idx === -1 && i === 0) ? 0 : -1}
            title={o.description}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
                const next = (i + dir + options.length) % options.length;
                onChange(options[next].value);
                refs.current[next]?.focus();
              }
            }}
            className={cn(
              "rounded-[var(--radius-sm)] font-medium transition-colors",
              size === "sm" ? "px-2.5 py-1 text-[0.8125rem]" : "px-3 py-1.5 text-[0.875rem]",
              active ? "bg-surface text-fg shadow-[var(--shadow-card)]" : "text-muted hover:text-fg",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Select ----------

export function Select({ label, value, onChange, options, id, hideLabel }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; id?: string; hideLabel?: boolean }) {
  const autoId = useId();
  const sid = id ?? autoId;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={sid} className={cn("t-small font-medium text-muted", hideLabel && "sr-only")}>
        {label}
      </label>
      <select
        id={sid}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-[var(--radius-md)] border border-border-strong bg-surface px-3 text-[0.9rem] text-fg"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------- Dialog (native <dialog>: focus trap + Escape built in) ----------

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const lastFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      lastFocus.current = document.activeElement as HTMLElement | null;
      d.showModal();
    } else if (!open && d.open) {
      d.close();
      lastFocus.current?.focus?.();
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[min(92vw,30rem)] rounded-[var(--radius-xl)] border border-border bg-surface p-0 text-fg shadow-[var(--shadow-overlay)]",
        className,
      )}
    >
      {open && (
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <h2 id={titleId} className="t-section">
              {title}
            </h2>
            <button type="button" onClick={onClose} className="-mr-1 -mt-1 rounded-[var(--radius-sm)] p-1.5 text-muted hover:bg-surface-2" aria-label="Close dialog">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          {description && <div className="t-body mt-1 text-muted">{description}</div>}
          {children && <div className="mt-4">{children}</div>}
          {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

// ---------- Page header ----------

export function PageHeader({ title, description, actions, eyebrow, compactOnMobile }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; compactOnMobile?: boolean }) {
  return (
    <header className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", compactOnMobile ? "mb-4 sm:mb-6" : "mb-6")}>
      <div className="min-w-0">
        {eyebrow && <div className="t-label mb-1.5 text-accent">{eyebrow}</div>}
        <h1 className="t-page text-fg">{title}</h1>
        {description && <p className={cn("t-body mt-1.5 max-w-2xl text-muted", compactOnMobile && "hidden sm:block")}>{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? <Check className="h-4 w-4 text-success" aria-label="Correct" /> : <X className="h-4 w-4 text-danger" aria-label="Incorrect" />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-border-strong bg-surface-2 px-1.5 py-0.5 font-mono text-[0.75rem] text-fg">{children}</kbd>;
}
