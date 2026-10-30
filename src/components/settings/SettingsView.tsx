"use client";

import { useRef, useState } from "react";
import { Download, FileUp, RotateCcw, Trash2 } from "lucide-react";
import { useGames, useProfile } from "@/hooks/data";
import { exportAll, importAll, kvSet, resetAllData, saveProfile } from "@/lib/db/repo";
import { DataSafety } from "./DataSafety";
import { InstallSection } from "@/components/layout/InstallApp";
import { resetSettings, updateSettings, useSettings, type Settings } from "@/lib/settings";
import { Card, CardHeader, Dialog, Kbd, PageHeader, Segmented, Select, Switch } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { downloadText } from "@/lib/util";
import { LEVELS } from "@/lib/engine/strength";
import type { LearningGoal, SkillLevel, UserProfile } from "@/lib/db/types";
import { MiniBoard } from "@/components/board/MiniBoard";
import { ENGINE_NAME } from "@/lib/engine/client";
import { SCHEMA_VERSION } from "@/lib/db/db";

export function SettingsView() {
  const s = useSettings();
  const profile = useProfile();
  const games = useGames();
  const toast = useToast();
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Settings>) => updateSettings(patch);
  const setProfile = (patch: Partial<UserProfile>) => void saveProfile(patch).then(() => toast("Saved.", { tone: "success" }));

  const exportProgress = async () => {
    const data = await exportAll();
    downloadText(`chesspath-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ ...data, settings: s }, null, 2), "application/json");
    await kvSet("lastBackupAt", Date.now()).catch(() => {});
  };
  const exportPgn = () => {
    if (!games?.length) {
      toast("There are no saved games to export yet.");
      return;
    }
    downloadText(`chesspath-games-${new Date().toISOString().slice(0, 10)}.pgn`, games.map((g) => g.pgn).join("\n\n"), "application/x-chess-pgn");
  };
  const importBackup = async (f?: File) => {
    if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      const r = await importAll(json);
      if (r.ok) {
        if (json.settings) updateSettings(json.settings);
        toast("Backup restored.", { tone: "success" });
      } else toast(r.error, { tone: "error" });
    } catch {
      toast("That file could not be read as a ChessPath backup.", { tone: "error" });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="Settings" title="Settings" description="Preferences are saved on this device and apply immediately." />

      <Card className="p-5">
        <CardHeader title="Appearance" />
        <div className="mt-4 space-y-4">
          <div>
            <p className="t-small mb-1.5 font-medium text-muted">Theme</p>
            <Segmented label="Theme" value={s.theme} onChange={(v) => set({ theme: v })} options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
          </div>
          <div>
            <p className="t-small mb-1.5 font-medium text-muted">Board colours</p>
            <div className="flex flex-wrap items-center gap-4">
              <Segmented label="Board colours" value={s.boardTheme} onChange={(v) => set({ boardTheme: v, boardThemeChosen: true })} options={[{ value: "green", label: "Green" }, { value: "brown", label: "Wood" }, { value: "blue", label: "Blue" }]} />
              <div className="w-20" aria-hidden>
                <MiniBoard fen="r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3" />
              </div>
            </div>
          </div>
          <div>
            <p className="t-small mb-1.5 font-medium text-muted">Motion</p>
            <Segmented label="Motion" value={s.motion} onChange={(v) => set({ motion: v })} options={[{ value: "system", label: "Follow system" }, { value: "reduce", label: "Reduce motion" }, { value: "full", label: "Full" }]} />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <CardHeader title="Board" />
        <div className="mt-2 divide-y divide-border">
          <Switch label="Show coordinates" description="Letters and numbers on the board edges." checked={s.coordinates} onChange={(v) => set({ coordinates: v })} />
          <Switch label="Highlight legal moves" description="Dots show where the selected piece can go." checked={s.showLegalMoves} onChange={(v) => set({ showLegalMoves: v })} />
          <Switch label="Highlight the last move" checked={s.showLastMove} onChange={(v) => set({ showLastMove: v })} />
          <Switch label="Drag pieces" description="When off, move by clicking (or tapping) a piece and then its destination." checked={s.dragToMove} onChange={(v) => set({ dragToMove: v })} />
          <Switch label="Type moves" description="Show a text box in games where you can type moves like Nf3." checked={s.moveTextInput} onChange={(v) => set({ moveTextInput: v })} />
          <Switch label="Evaluation bar in analysis" checked={s.showEvalBar} onChange={(v) => set({ showEvalBar: v })} />
          <Switch label="Sound effects" checked={s.sound} onChange={(v) => set({ sound: v })} />
          <div className="py-3">
            <p className="t-body font-medium">Board orientation in games</p>
            <p className="t-small mb-2 text-muted">Puzzles and lessons always start from the side to move.</p>
            <Segmented label="Board orientation" value={s.orientation} onChange={(v) => set({ orientation: v })} options={[{ value: "auto", label: "My side at the bottom" }, { value: "white", label: "Always White at the bottom" }]} />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <CardHeader title="Training" />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Daily practice target"
            value={String(profile?.dailyTargetMinutes ?? 15)}
            onChange={(v) => setProfile({ dailyTargetMinutes: Number(v) as UserProfile["dailyTargetMinutes"] })}
            options={[10, 15, 30, 60].map((m) => ({ value: String(m), label: `${m} minutes` }))}
          />
          <Select
            label="Learning level"
            value={profile?.skillLevel ?? "complete-beginner"}
            onChange={(v) => setProfile({ skillLevel: v as SkillLevel })}
            options={[
              { value: "complete-beginner", label: "Complete beginner" },
              { value: "beginner", label: "Beginner" },
              { value: "intermediate", label: "Intermediate" },
              { value: "advanced", label: "Advanced learner" },
            ]}
          />
          <Select
            label="Main goal"
            value={profile?.learningGoals?.[0] ?? "from-scratch"}
            onChange={(v) => setProfile({ learningGoals: [v as LearningGoal] })}
            options={[
              { value: "from-scratch", label: "Learn chess from scratch" },
              { value: "tactics", label: "Improve tactical calculation" },
              { value: "rapid-classical", label: "Play better rapid/classical games" },
              { value: "openings", label: "Improve opening knowledge" },
              { value: "positional", label: "Develop positional understanding" },
              { value: "endgames", label: "Improve endgame technique" },
              { value: "tournaments", label: "Prepare for tournaments" },
              { value: "overall", label: "Improve overall performance" },
            ]}
          />
          <Select label="Default computer difficulty" value={String(s.defaultDifficulty)} onChange={(v) => set({ defaultDifficulty: Number(v) as Settings["defaultDifficulty"] })} options={LEVELS.map((l) => ({ value: String(l.level), label: l.name }))} />
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label htmlFor="display-name" className="t-small font-medium text-muted">
              Name for greetings (optional)
            </label>
            <input
              id="display-name"
              defaultValue={profile?.displayName ?? ""}
              key={profile?.displayName ?? "none"}
              maxLength={40}
              onBlur={(e) => e.target.value !== (profile?.displayName ?? "") && setProfile({ displayName: e.target.value.trim() })}
              className="h-10 rounded-[var(--radius-md)] border border-border-strong bg-surface px-3 text-fg sm:w-72"
            />
          </div>
        </div>
        {!profile?.onboardingCompleted && (
          <p className="t-small mt-3 text-muted">
            Tip: the <a href="/onboarding/" className="underline">1-minute setup</a> can suggest a starting point.
          </p>
        )}
      </Card>

      <Card className="p-5">
        <CardHeader title="Install the app" />
        <InstallSection />
      </Card>

      <Card className="p-5">
        <CardHeader title="Your data" description="Everything is stored only in this browser. Nothing is uploaded." />
        <DataSafety />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportProgress} icon={<Download className="h-4 w-4" aria-hidden />}>
            Export progress (JSON)
          </Button>
          <Button variant="secondary" onClick={exportPgn} icon={<Download className="h-4 w-4" aria-hidden />}>
            Export all games (PGN)
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()} icon={<FileUp className="h-4 w-4" aria-hidden />}>
            Restore a backup
          </Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Choose a ChessPath backup file" onChange={(e) => importBackup(e.target.files?.[0])} />
        </div>
        <div className="mt-5 rounded-[var(--radius-md)] border border-danger/30 bg-danger-soft/50 p-4">
          <p className="t-card">Reset all data</p>
          <p className="t-small mt-1 text-muted">Deletes your profile, lesson progress, puzzle history, games and analyses from this browser. Export a backup first if you might want them back.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="danger" onClick={() => setResetOpen(true)} icon={<Trash2 className="h-4 w-4" aria-hidden />}>
              Reset all data
            </Button>
            <Button variant="ghost" onClick={() => { resetSettings(); toast("Preferences restored to defaults."); }} icon={<RotateCcw className="h-4 w-4" aria-hidden />}>
              Reset preferences only
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <CardHeader title="Keyboard shortcuts" />
        <dl className="t-small mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {[
            ["Tab to the board, then arrow keys", "Move the square cursor"],
            ["Enter / Space on the board", "Select a piece, then a destination"],
            ["Esc on the board", "Clear the selection"],
            ["← / → (game, analysis, openings)", "Previous / next move"],
            ["Home / End (game, analysis)", "First / last position"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-border py-1.5">
              <dt>
                <Kbd>{k}</Kbd>
              </dt>
              <dd className="text-right text-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="p-5">
        <CardHeader title="About ChessPath" />
        <ul className="t-small mt-3 space-y-1.5 text-muted">
          <li>Engine: {ENGINE_NAME}, running locally in your browser (GPL-3.0).</li>
          <li>Puzzles: Lichess puzzle database (CC0), re-verified with Stockfish. Opening names: Lichess chess-openings (CC0).</li>
          <li>Piece set: “cburnett” by Colin M.L. Burnett (GPLv2+). Fonts: Inter, Source Serif 4, JetBrains Mono (OFL).</li>
          <li>
            Privacy: no account, no tracking, no analytics leave this device (<a href="/privacy/" className="underline">privacy policy</a>). Data schema version {SCHEMA_VERSION}.
          </li>
          <li>
            Free software (GPL-3.0). Source code:{" "}
            <a href="https://github.com/abhiraj-spec/Chesspath" className="underline" rel="noopener noreferrer" target="_blank">
              github.com/abhiraj-spec/Chesspath
            </a>
          </li>
          <li>ChessPath does not award official ratings; level labels are descriptive.</li>
        </ul>
      </Card>

      <Dialog
        open={resetOpen}
        onClose={() => {
          setResetOpen(false);
          setConfirmText("");
        }}
        title="Delete all ChessPath data?"
        description="This permanently removes everything stored in this browser. Type RESET to confirm."
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={confirmText !== "RESET"}
              onClick={async () => {
                await resetAllData();
                resetSettings();
                setResetOpen(false);
                setConfirmText("");
                toast("All data deleted.", { tone: "success" });
              }}
            >
              Delete everything
            </Button>
          </>
        }
      >
        <label htmlFor="reset-confirm" className="t-small font-medium text-muted">
          Confirmation
        </label>
        <input id="reset-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" className="mt-1 h-10 w-full rounded-[var(--radius-md)] border border-border-strong bg-surface px-3" placeholder="RESET" />
      </Dialog>
    </div>
  );
}
