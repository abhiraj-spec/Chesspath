"use client";

import { useState } from "react";
import { Download, Share, SquarePlus, X, MoreVertical, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { promptInstall, useInstall, type InstallPlatform } from "@/lib/install";

/** Step-by-step instructions for browsers without a one-tap install dialog. */
function ManualSteps({ platform }: { platform: InstallPlatform }) {
  if (platform === "ios") {
    return (
      <ol className="t-small mt-2 list-decimal space-y-1 pl-5 text-muted">
        <li>
          Tap the <strong className="text-fg">Share</strong> button <Share className="inline h-4 w-4 align-[-3px]" aria-label="(the square with an arrow)" /> in Safari (on newer iPhones it may be inside the <strong className="text-fg">•••</strong> menu).
        </li>
        <li>
          Scroll down and tap <strong className="text-fg">Add to Home Screen</strong> <SquarePlus className="inline h-4 w-4 align-[-3px]" aria-hidden />.
        </li>
        <li>
          Tap <strong className="text-fg">Add</strong>. ChessPath appears on your Home Screen and opens full screen.
        </li>
      </ol>
    );
  }
  return (
    <p className="t-small mt-2 text-muted">
      Open the browser menu <MoreVertical className="inline h-4 w-4 align-[-3px]" aria-hidden /> and choose <strong className="text-fg">Install app</strong> or{" "}
      <strong className="text-fg">Add to Home screen</strong>. This works in Chrome, Edge and Samsung Internet; Firefox on computers cannot install apps.
    </p>
  );
}

/** Full install section for Settings: always explains the current state. */
export function InstallSection() {
  const { installed, canPrompt, platform } = useInstall();
  const [busy, setBusy] = useState(false);
  if (installed) {
    return (
      <p className="t-small mt-3 flex items-center gap-2 text-fg" data-testid="install-state">
        <CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> You are using the installed app.
      </p>
    );
  }
  return (
    <div className="mt-3" data-testid="install-state">
      <p className="t-small text-muted">Install ChessPath to open it from your home screen or desktop like any other app, full screen and offline. It is free and needs no app store.</p>
      {canPrompt ? (
        <Button
          className="mt-3"
          loading={busy}
          icon={<Download className="h-4 w-4" aria-hidden />}
          onClick={async () => {
            setBusy(true);
            await promptInstall().catch(() => false);
            setBusy(false);
          }}
        >
          Install ChessPath
        </Button>
      ) : (
        <ManualSteps platform={platform} />
      )}
    </div>
  );
}

const DISMISS_KEY = "chesspath.installBannerDismissed";

/** Small dismissible suggestion on the dashboard, only where installing is actually possible. */
export function InstallBanner() {
  const { installed, canPrompt, platform } = useInstall();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return typeof localStorage !== "undefined" && localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  if (installed || dismissed || !(canPrompt || platform === "ios")) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* not remembered: fine */
    }
  };
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-accent/30 bg-accent-soft/50 p-4" data-testid="install-banner">
      <Download className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="t-body font-medium text-fg">Install ChessPath as an app</p>
        {canPrompt ? (
          <>
            <p className="t-small mt-0.5 text-muted">Open it from your home screen, full screen and offline.</p>
            <Button size="sm" className="mt-2" onClick={() => void promptInstall().catch(() => false)}>
              Install
            </Button>
          </>
        ) : (
          <ManualSteps platform={platform} />
        )}
      </div>
      <button type="button" onClick={dismiss} className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] text-muted hover:bg-surface-2 hover:text-fg" aria-label="Dismiss the install suggestion">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
