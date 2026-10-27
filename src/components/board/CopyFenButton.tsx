"use client";

import { ClipboardCopy } from "lucide-react";
import { IconButton } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

/** Copies the FEN of the displayed position to the clipboard. */
export function CopyFenButton({ fen, variant }: { fen: string; variant?: "secondary" | "ghost" }) {
  const toast = useToast();
  return (
    <IconButton
      label="Copy FEN of this position"
      size="sm"
      variant={variant}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(fen);
          toast("FEN copied to the clipboard.", { tone: "success" });
        } catch {
          toast(`Copying is not available here. FEN: ${fen}`, { tone: "error" });
        }
      }}
    >
      <ClipboardCopy className="h-4 w-4" aria-hidden />
    </IconButton>
  );
}
