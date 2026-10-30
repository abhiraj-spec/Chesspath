import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Card } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Privacy" };

const SOURCE_URL = "https://github.com/abhiraj-spec/Chesspath";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="ChessPath" title="Privacy policy" description="Short version: ChessPath collects nothing. Your progress stays on your device." />
      <Card className="space-y-4 p-5">
        <section>
          <h2 className="t-card">What is stored, and where</h2>
          <p className="t-small mt-1 text-muted">
            Your profile, lesson progress, puzzle history, games, analyses and settings are saved only in your browser&apos;s storage on this device (IndexedDB and localStorage). They are never uploaded. There is no account, no sign-in and no cloud sync.
          </p>
        </section>
        <section>
          <h2 className="t-card">What is sent over the internet</h2>
          <p className="t-small mt-1 text-muted">
            Nothing about you or your play. The app does not use analytics, advertising, tracking or cookies. The chess engine (Stockfish) runs on your device. The only network traffic is downloading the app itself from the website that hosts it; like any website, that host may keep standard technical logs (such as IP addresses) for security and operation. Links such as &quot;View on Lichess&quot; open another website only when you tap them.
          </p>
        </section>
        <section>
          <h2 className="t-card">Your control</h2>
          <p className="t-small mt-1 text-muted">
            In <Link href="/settings/" className="underline">Settings</Link> you can export all your data as a file, restore it, or delete everything. Uninstalling the app or clearing your browser&apos;s site data also deletes it.
          </p>
        </section>
        <section>
          <h2 className="t-card">Children</h2>
          <p className="t-small mt-1 text-muted">Because no personal data is collected, ChessPath is suitable for learners of any age.</p>
        </section>
        <section>
          <h2 className="t-card">Source code and licence</h2>
          <p className="t-small mt-1 text-muted">
            ChessPath is free software under the GNU GPL version 3 (it includes Stockfish, also GPL). The complete source code is available at{" "}
            <a href={SOURCE_URL} className="underline" rel="noopener noreferrer" target="_blank">
              {SOURCE_URL.replace("https://", "")}
            </a>
            .
          </p>
        </section>
        <p className="t-small text-subtle">Last updated: 30 October 2026.</p>
      </Card>
    </div>
  );
}
