import { beforeEach, describe, expect, it } from "vitest";
import { ChessPathDB, setDbForTests } from "@/lib/db/db";
import { completeLesson, dueReviews, exportAll, importAll, kvGet, kvSet, logActivity, recordAttempt, resetAllData, saveGame, saveProfile, startOrResumeLesson, updateLessonStep, getProfile } from "@/lib/db/repo";
import { DAY_MS } from "@/lib/learning/srs";

let n = 0;
beforeEach(async () => {
  const db = new ChessPathDB(`test-${n++}`);
  setDbForTests(db);
  await db.open();
});

describe("local persistence", () => {
  it("saves and updates the profile", async () => {
    await saveProfile({ skillLevel: "beginner", onboardingCompleted: true });
    await saveProfile({ dailyTargetMinutes: 30 });
    const p = await getProfile();
    expect(p).toMatchObject({ skillLevel: "beginner", onboardingCompleted: true, dailyTargetMinutes: 30 });
  });
  it("tracks lesson progress, resume position and completion", async () => {
    await startOrResumeLesson("forks");
    await updateLessonStep("forks", { currentStep: 3, completedStep: 2, hintsUsed: 1 });
    const resumed = await startOrResumeLesson("forks");
    expect(resumed.currentStep).toBe(3);
    expect(resumed.hintsUsed).toBe(1);
    await completeLesson("forks", 80);
    const again = await startOrResumeLesson("forks");
    expect(again.status).toBe("completed");
    expect(again.score).toBe(80);
    expect(again.currentStep).toBe(0);
  });
  it("creates review cards only for struggles, and reschedules them", async () => {
    const base = { kind: "puzzle" as const, skills: ["fork"], mistakes: 0, hintsUsed: 0, revealed: false, skipped: false, durationMs: 5000 };
    const clean = await recordAttempt({ ...base, refId: "p1", solved: true, review: { kind: "puzzle", reasonIfStruggled: "x" } });
    expect(clean.card).toBeUndefined();
    const hinted = await recordAttempt({ ...base, refId: "p2", solved: true, hintsUsed: 2, review: { kind: "puzzle", reasonIfStruggled: "You needed 2 hints" } });
    expect(hinted.card?.reason).toBe("You needed 2 hints");
    expect(hinted.attempt.clean).toBe(false);
    const due = await dueReviews(Date.now() + 2 * DAY_MS);
    expect(due.map((c) => c.refId)).toEqual(["p2"]);
    const again = await recordAttempt({ ...base, refId: "p2", solved: true, createdAt: Date.now() + 2 * DAY_MS, review: { kind: "puzzle", reasonIfStruggled: "x" } });
    expect(again.attempt.wasReview).toBe(true);
    expect(again.card!.reps).toBeGreaterThan(hinted.card!.reps);
  });
  it("logs training time per day and caps runaway sessions", async () => {
    await logActivity({ type: "puzzles", durationMs: 5 * 60000 }, 10);
    await logActivity({ type: "lesson", durationMs: 3 * 3600000 }, 10);
    const backup = await exportAll();
    const s = backup.tables.sessions[0] as { duration: number; completionStatus: string };
    expect(s.duration).toBe(35 * 60000);
    expect(s.completionStatus).toBe("target-met");
  });
  it("exports, resets and re-imports everything", async () => {
    await saveProfile({ displayName: "Ada" });
    await saveGame({ id: "g1", whitePlayer: "You", blackPlayer: "Stockfish", result: "1-0", status: "finished", pgn: "1. e4 *", startingFen: "startpos", moves: ["e2e4"], createdAt: 1, updatedAt: 1, source: "computer", analysisStatus: "none" });
    await kvSet("x", { a: 1 });
    const backup = await exportAll();
    await resetAllData();
    expect(await getProfile()).toBeUndefined();
    const r = await importAll(JSON.parse(JSON.stringify(backup)));
    expect(r.ok).toBe(true);
    expect((await getProfile())?.displayName).toBe("Ada");
    expect(await kvGet("x")).toEqual({ a: 1 });
  });
  it("rejects invalid backups without touching data", async () => {
    await saveProfile({ displayName: "Keep" });
    expect((await importAll({ foo: 1 })).ok).toBe(false);
    expect((await importAll({ app: "ChessPath", schemaVersion: 999, tables: {} })).ok).toBe(false);
    expect((await getProfile())?.displayName).toBe("Keep");
  });
  it("persists across database re-open (simulated browser restart)", async () => {
    const name = `restart-${n++}`;
    const db1 = new ChessPathDB(name);
    setDbForTests(db1);
    await saveProfile({ displayName: "Persist" });
    db1.close();
    const db2 = new ChessPathDB(name);
    setDbForTests(db2);
    expect((await getProfile())?.displayName).toBe("Persist");
  });
});
