import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { ALL_LESSONS, MODULES, getLesson } from "@/content/lessons";
import { matchMove, matchingMoves, passTurnFen, resolveTargets, scoreLesson, validateLesson } from "@/lib/lessons/engine";
import { setup } from "@/lib/chess/setup";

describe("curriculum content", () => {
  it("has at least 30 complete lessons across all modules", () => {
    expect(ALL_LESSONS.length).toBeGreaterThanOrEqual(30);
    for (const m of MODULES) expect(ALL_LESSONS.some((l) => l.module === m.id), m.id).toBe(true);
  });
  it("has unique lesson ids and valid prerequisites/follow-ups", () => {
    const ids = ALL_LESSONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of ALL_LESSONS) {
      for (const p of l.prerequisites ?? []) expect(getLesson(p), `${l.id} prereq ${p}`).toBeDefined();
      if (l.followUp.kind === "lesson") expect(getLesson(l.followUp.ref!), `${l.id} follow-up`).toBeDefined();
    }
  });
  for (const lesson of ALL_LESSONS) {
    it(`lesson ${lesson.id} is valid (FENs, legal solutions, replies, hints, assessment)`, () => {
      expect(validateLesson(lesson)).toEqual([]);
    });
  }
});

describe("lesson engine", () => {
  const fen = setup({ white: "Kf7 Qg5", black: "Kh8" });
  const move = (san: string) => new Chess(fen).moves({ verbose: true }).find((m) => m.san === san)!;
  it("accepts every checkmate for a {mate:true} matcher (multiple solutions)", () => {
    const mates = matchingMoves(fen, { mate: true }).map((m) => m.san).sort();
    expect(mates).toEqual(["Qg7#", "Qg8#", "Qh4#", "Qh5#", "Qh6#"].sort());
    expect(matchMove(move("Qg6"), { mate: true })).toBe(false);
  });
  it("matches SAN ignoring check suffixes", () => {
    expect(matchMove(move("Qg7#"), { san: ["Qg7"] })).toBe(true);
  });
  it("matches piece/destination families", () => {
    const f = setup({ white: "Kh1 Nb1", black: "Kh8" });
    const ok = matchingMoves(f, { piece: "n", to: ["c3", "d2"] }).map((m) => m.san).sort();
    expect(ok).toEqual(["Nc3", "Nd2"]);
  });
  it("pass-turn drills hand the move back to the same side", () => {
    const f = setup({ white: "Kc3 Ra1", black: "Ke5" });
    const c = new Chess(f);
    c.move("Ra8");
    expect(passTurnFen(c.fen()).split(" ")[1]).toBe("w");
  });
  it("resolves legal-destination targets", () => {
    expect(resolveTargets("4k3/8/8/8/8/8/8/R3K3 w - - 0 1", { legalFrom: "a1" }).length).toBe(10);
  });
  it("scores only clean first-try answers fully", () => {
    const lesson = getLesson("the-rook")!;
    const scored = lesson.steps.filter((s) => s.assessment);
    expect(scored.length).toBeGreaterThan(0);
    const perfect = Object.fromEntries(scored.map((s) => [s.id, { stepId: s.id, solved: true, mistakes: 0, hintsUsed: 0, revealed: false }]));
    expect(scoreLesson(lesson, perfect)).toBe(100);
    const hinted = Object.fromEntries(scored.map((s) => [s.id, { stepId: s.id, solved: true, mistakes: 0, hintsUsed: 1, revealed: false }]));
    expect(scoreLesson(lesson, hinted)).toBe(50);
    const revealed = Object.fromEntries(scored.map((s) => [s.id, { stepId: s.id, solved: true, mistakes: 0, hintsUsed: 0, revealed: true }]));
    expect(scoreLesson(lesson, revealed)).toBe(0);
  });
});

import { GLOSSARY } from "@/content/glossary";
import { DIAGNOSTIC, diagnose } from "@/content/diagnostic";
import { DRILLS } from "@/content/drills";
import { SKILLS } from "@/content/skills";
import type { Lesson as LessonT } from "@/content/types";

describe("supporting content", () => {
  it("every lesson term has a glossary entry", () => {
    const terms = new Set(GLOSSARY.map((g) => g.term.toLowerCase()));
    for (const l of ALL_LESSONS) for (const t of l.terms ?? []) expect(terms.has(t.toLowerCase()), `${l.id}: ${t}`).toBe(true);
    for (const g of GLOSSARY) if (g.lesson) expect(getLesson(g.lesson), g.term).toBeDefined();
  });
  it("skills reference real lessons", () => {
    for (const s of SKILLS) if (s.lesson) expect(getLesson(s.lesson), s.id).toBeDefined();
    for (const l of ALL_LESSONS) for (const sk of l.skills) expect(SKILLS.some((s) => s.id === sk), `${l.id}: ${sk}`).toBe(true);
  });
  it("diagnostic items and drills are valid exercises", () => {
    const asLesson = (id: string, steps: LessonT["steps"]): LessonT => ({ id, module: "fundamentals", title: id, difficulty: 1, objective: "x", summary: "x", estimatedMinutes: 1, skills: [], intro: ["x"], steps: steps.map((s) => ({ ...s, assessment: true })), recap: ["x"], followUp: { kind: "play", label: "x" } });
    expect(validateLesson(asLesson("diagnostic", DIAGNOSTIC.map((d) => d.step)))).toEqual([]);
    expect(validateLesson(asLesson("drills", DRILLS.map((d, i) => ({ ...d.step, id: `drill-${i}` }))))).toEqual([]);
    for (const d of DIAGNOSTIC) expect(getLesson(d.lessonIfMissed), d.id).toBeDefined();
  });
  it("diagnostic recommendations are grounded in the answers", () => {
    const all = DIAGNOSTIC.map((d) => ({ id: d.id, skill: d.skill, correct: true }));
    expect(diagnose(all).lessonId).toBe("discovered-attacks");
    const missFork = all.map((a) => (a.id === "fork" ? { ...a, correct: false } : a));
    const r = diagnose(missFork);
    expect(r.lessonId).toBe("forks");
    expect(r.summary).toMatch(/knight fork/);
    expect(r.summary).toMatch(/5 of 6/);
    const missBasics = all.map((a) => (a.id === "knight" ? { ...a, correct: false } : a));
    expect(diagnose(missBasics).lessonId).toBe("the-rook");
  });
});
