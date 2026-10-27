import { Chess, type Move, type Square } from "chess.js";
import type { Lesson, LessonStep, MoveMatcher, PlayStep } from "@/content/types";
import { fenError } from "@/lib/chess/core";

const stripSuffix = (san: string) => san.replace(/[+#!?]+$/g, "");

/** Does a played move satisfy the matcher? */
export function matchMove(move: Move, m: MoveMatcher): boolean {
  if (m.san && !m.san.map(stripSuffix).includes(stripSuffix(move.san))) return false;
  if (m.mate !== undefined && move.san.includes("#") !== m.mate) return false;
  if (m.check !== undefined && (move.san.includes("+") || move.san.includes("#")) !== m.check) return false;
  if (m.capture !== undefined && Boolean(move.captured) !== m.capture) return false;
  if (m.from && move.from !== m.from) return false;
  if (m.to && !m.to.includes(move.to)) return false;
  if (m.piece && move.piece !== m.piece) return false;
  if (m.castle !== undefined && (move.isKingsideCastle() || move.isQueensideCastle()) !== m.castle) return false;
  return true;
}

/** All legal moves in `fen` that satisfy the matcher. */
export function matchingMoves(fen: string, m: MoveMatcher): Move[] {
  return new Chess(fen).moves({ verbose: true }).filter((mv) => matchMove(mv, m));
}

/**
 * Applies a move for a "pass turn" drill: the same side keeps moving.
 * Returns the FEN with the turn handed back to the mover (en passant cleared).
 */
export function passTurnFen(fenAfter: string): string {
  const parts = fenAfter.split(" ");
  parts[1] = parts[1] === "w" ? "b" : "w";
  parts[3] = "-";
  return parts.join(" ");
}

export function resolveTargets(fen: string, targets: Square[] | { legalFrom: Square }): Square[] {
  if (Array.isArray(targets)) return [...targets].sort();
  const moves = new Chess(fen).moves({ square: targets.legalFrom, verbose: true });
  return [...new Set(moves.map((m) => m.to))].sort();
}

/** Wrong-move feedback that applies to move `i` of a play step. */
export function wrongFor(step: PlayStep, i: number): { san: string; text: string }[] {
  return step.moves[i]?.wrong ?? (i === 0 ? (step.wrong ?? []) : []);
}

export function isInteractive(step: LessonStep): boolean {
  return step.kind !== "explain";
}

export interface StepResult {
  stepId: string;
  solved: boolean;
  mistakes: number;
  hintsUsed: number;
  revealed: boolean;
}

/** Steps that count towards the score: assessment steps, or all interactive steps if none are marked. */
export function scoredSteps(lesson: Lesson): LessonStep[] {
  const assessed = lesson.steps.filter((s) => s.assessment);
  return assessed.length ? assessed : lesson.steps.filter(isInteractive);
}

/**
 * Score 0-100: share of scored steps solved first time without hints.
 * Steps solved after mistakes or hints earn half credit; revealed steps earn none.
 */
export function scoreLesson(lesson: Lesson, results: Record<string, StepResult>): number {
  const steps = scoredSteps(lesson);
  if (steps.length === 0) return 100;
  let total = 0;
  for (const s of steps) {
    const r = results[s.id];
    if (!r || !r.solved || r.revealed) continue;
    total += r.mistakes === 0 && r.hintsUsed === 0 ? 1 : 0.5;
  }
  return Math.round((total / steps.length) * 100);
}

// ---------------------------------------------------------------------------------------------
// Content validation (used by unit tests and at development time)
// ---------------------------------------------------------------------------------------------

function validatePlayStep(step: PlayStep, errors: string[], where: string) {
  let fen = step.fen;
  for (let i = 0; i < step.moves.length; i++) {
    const pm = step.moves[i];
    const ok = matchingMoves(fen, pm.accept);
    if (ok.length === 0) {
      errors.push(`${where}: move ${i + 1} has no legal move matching ${JSON.stringify(pm.accept)} in ${fen}`);
      return;
    }
    if (pm.accept.san) {
      for (const san of pm.accept.san) {
        if (!ok.some((m) => stripSuffix(m.san) === stripSuffix(san))) errors.push(`${where}: accepted move ${san} is illegal or does not match the other constraints`);
      }
    }
    for (const w of wrongFor(step, i)) {
      const legal = new Chess(fen).moves().map(stripSuffix);
      if (!legal.includes(stripSuffix(w.san))) errors.push(`${where}: wrong-move feedback for ${w.san} refers to an illegal move`);
      if (ok.some((m) => stripSuffix(m.san) === stripSuffix(w.san))) errors.push(`${where}: ${w.san} is listed as both correct and wrong`);
    }
    // Continue along the first accepted move (multiple accepted moves must all allow the reply).
    const continuations = pm.accept.san ? ok.filter((m) => pm.accept.san!.map(stripSuffix).includes(stripSuffix(m.san))) : ok;
    if (pm.reply) {
      for (const m of continuations) {
        const c = new Chess(fen);
        c.move(m.san);
        try {
          c.move(pm.reply);
        } catch {
          errors.push(`${where}: reply ${pm.reply} is illegal after ${m.san}`);
        }
      }
    } else if (i < step.moves.length - 1 && !step.passTurn) {
      errors.push(`${where}: move ${i + 1} needs a reply because more moves follow`);
    }
    const c = new Chess(fen);
    c.move(continuations[0].san);
    if (pm.reply) c.move(pm.reply);
    fen = step.passTurn && !pm.reply ? passTurnFen(c.fen()) : c.fen();
    if (step.passTurn && fenError(fen)) {
      errors.push(`${where}: pass-turn position after move ${i + 1} is invalid (${fenError(fen)})`);
      return;
    }
  }
}

export function validateLesson(lesson: Lesson): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  if (!lesson.objective || !lesson.intro.length || !lesson.recap.length) errors.push(`${lesson.id}: missing objective, intro or recap`);
  if (!lesson.steps.some(isInteractive)) errors.push(`${lesson.id}: has no interactive exercise`);
  if (!lesson.steps.some((s) => s.assessment)) errors.push(`${lesson.id}: has no assessment step`);
  for (const step of lesson.steps) {
    const where = `${lesson.id}/${step.id}`;
    if (ids.has(step.id)) errors.push(`${where}: duplicate step id`);
    ids.add(step.id);
    const fen = "fen" in step ? step.fen : undefined;
    if (fen) {
      const err = fenError(fen);
      if (err) {
        errors.push(`${where}: invalid FEN (${err})`);
        continue;
      }
    }
    switch (step.kind) {
      case "explain":
        if (step.demo) {
          if (!step.fen) errors.push(`${where}: demo without fen`);
          else {
            const c = new Chess(step.fen);
            for (const m of step.demo.moves) {
              try {
                c.move(m);
              } catch {
                errors.push(`${where}: demo move ${m} is illegal`);
                break;
              }
            }
          }
        }
        break;
      case "play":
        if (!step.hints.length) errors.push(`${where}: needs at least one hint`);
        if (new Chess(step.fen).isGameOver()) errors.push(`${where}: position is already over`);
        validatePlayStep(step, errors, where);
        break;
      case "squares": {
        const t = resolveTargets(step.fen, step.targets);
        if (t.length === 0) errors.push(`${where}: no target squares`);
        if (!Array.isArray(step.targets) && !new Chess(step.fen).get(step.targets.legalFrom)) errors.push(`${where}: no piece on ${step.targets.legalFrom}`);
        break;
      }
      case "choice":
        if (!step.options.some((o) => o.correct)) errors.push(`${where}: no correct option`);
        if (step.options.length < 2) errors.push(`${where}: needs at least two options`);
        break;
      case "goal": {
        const c = new Chess(step.fen);
        if (c.isGameOver()) errors.push(`${where}: goal position is already over`);
        if (step.maxMoves < 1) errors.push(`${where}: maxMoves must be positive`);
        break;
      }
    }
  }
  return errors;
}
