"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Info, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/util";

type ToastTone = "success" | "info" | "error";
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  action?: { label: string; onClick: () => void };
}

const ToastCtx = createContext<{ toast: (message: string, opts?: { tone?: ToastTone; action?: ToastItem["action"] }) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((t) => t.id !== id)), []);
  const toast = useCallback((message: string, opts?: { tone?: ToastTone; action?: ToastItem["action"] }) => {
    const id = next.current++;
    setItems((xs) => [...xs.slice(-2), { id, message, tone: opts?.tone ?? "info", action: opts?.action }]);
  }, []);
  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <ToastView key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, item.action ? 7000 : 4000);
    return () => clearTimeout(t);
  }, [item, onDismiss]);
  const Icon = item.tone === "success" ? CheckCircle2 : item.tone === "error" ? AlertTriangle : Info;
  return (
    <div
      role={item.tone === "error" ? "alert" : "status"}
      className="animate-fade-in pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3 shadow-[var(--shadow-overlay)]"
    >
      <Icon className={cn("h-5 w-5 shrink-0", item.tone === "success" ? "text-success" : item.tone === "error" ? "text-danger" : "text-info")} aria-hidden />
      <p className="t-small flex-1 text-fg">{item.message}</p>
      {item.action && (
        <button
          type="button"
          className="t-small font-semibold text-accent hover:underline"
          onClick={() => {
            item.action!.onClick();
            onDismiss();
          }}
        >
          {item.action.label}
        </button>
      )}
      <button type="button" onClick={onDismiss} className="rounded p-1 text-muted hover:bg-surface-2" aria-label="Dismiss notification">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx.toast;
}
