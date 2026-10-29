import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/source-serif-4";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { ToastProvider } from "@/components/ui/Toast";
import { THEME_BOOTSTRAP } from "@/lib/settings";
import { ServiceWorkerRegistrar } from "@/components/layout/ServiceWorkerRegistrar";
import { StorageGuard } from "@/components/layout/StorageGuard";

export const metadata: Metadata = {
  title: { default: "ChessPath: learn chess step by step", template: "%s · ChessPath" },
  description:
    "Learn chess from zero: interactive lessons, tactics puzzles, games against Stockfish, opening practice and game analysis. Works offline, no account needed.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  applicationName: "ChessPath",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#111412" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
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
