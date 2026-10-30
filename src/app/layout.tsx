import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/source-serif-4";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { ToastProvider } from "@/components/ui/Toast";
import { THEME_BOOTSTRAP } from "@/lib/settings";
import { INSTALL_BOOTSTRAP } from "@/lib/install-bootstrap";
import { ServiceWorkerRegistrar } from "@/components/layout/ServiceWorkerRegistrar";
import { StorageGuard } from "@/components/layout/StorageGuard";

export const metadata: Metadata = {
  title: { default: "ChessPath: learn chess step by step", template: "%s · ChessPath" },
  description:
    "Learn chess from zero: interactive lessons, tactics puzzles, games against Stockfish, opening practice and game analysis. Works offline, no account needed.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
  applicationName: "ChessPath",
  // Installed on an iPhone/iPad Home Screen: open full screen, named "ChessPath".
  appleWebApp: { capable: true, title: "ChessPath", statusBarStyle: "black" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    // Matches the navy app bar, so the phone's status bar blends into it.
    { media: "(prefers-color-scheme: light)", color: "#1b2a41" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1829" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <script dangerouslySetInnerHTML={{ __html: INSTALL_BOOTSTRAP }} />
      </head>
      <body>
        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
        <ServiceWorkerRegistrar />
        <StorageGuard />
      </body>
    </html>
  );
}
