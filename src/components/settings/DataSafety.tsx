"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { useKv } from "@/hooks/data";
import { requestStorageProtection, storageProtection, type StorageProtection } from "@/lib/storage";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/util";

/** Explains how safe the locally stored progress is, and what to do about it. */
export function DataSafety() {
  const [status, setStatus] = useState<StorageProtection | null>(null);
  const lastBackupAt = useKv<number>("lastBackupAt");
  useEffect(() => {
    let alive = true;
    void storageProtection().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);

  if (status === null) return null;
  const isProtected = status === "protected";
  return (
    <div className="mt-4 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3" data-testid="data-safety">
      <p className="t-small flex items-start gap-2 font-medium text-fg">
        {isProtected ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />}
        {isProtected
          ? "This browser has agreed to keep your progress: it won't delete it to free up space."
          : status === "unsupported"
            ? "This browser can't confirm whether it will keep your progress."
            : "This browser may delete your progress if space runs low. On iPhone, Safari can clear it after about 7 days without a visit unless ChessPath is added to the Home Screen."}
      </p>
      <p className="t-small mt-1 text-muted">
        Progress is kept separately in each browser and for each web address, and clearing browsing data deletes it.{" "}
        {lastBackupAt ? `Last backup: ${formatDate(lastBackupAt)}.` : "You haven't exported a backup yet."} A backup file can be restored on any device.
      </p>
      {status === "not-protected" && (
        <Button size="sm" variant="secondary" className="mt-2" onClick={async () => setStatus(await requestStorageProtection())}>
          Ask the browser to keep my progress
        </Button>
      )}
    </div>
  );
}
