"use client";

import { getSettings } from "./settings";

/**
 * Small synthesized sound effects (Web Audio, no audio files to download).
 * Respects the "Sound effects" setting.
 */
type SoundKind = "move" | "capture" | "check" | "success" | "error" | "end";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number) {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = a.currentTime + start;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export function playSound(kind: SoundKind) {
  if (!getSettings().sound) return;
  try {
    switch (kind) {
      case "move":
        tone(420, 0, 0.07, "triangle", 0.12);
        break;
      case "capture":
        tone(300, 0, 0.06, "square", 0.06);
        tone(220, 0.03, 0.08, "triangle", 0.1);
        break;
      case "check":
        tone(660, 0, 0.09, "triangle", 0.1);
        break;
      case "success":
        tone(523, 0, 0.1, "sine", 0.1);
        tone(784, 0.08, 0.16, "sine", 0.1);
        break;
      case "error":
        tone(196, 0, 0.14, "sine", 0.1);
        break;
      case "end":
        tone(392, 0, 0.12, "sine", 0.1);
        tone(523, 0.1, 0.12, "sine", 0.1);
        tone(659, 0.2, 0.2, "sine", 0.1);
        break;
    }
  } catch {
    /* audio is optional */
  }
}

export function playMoveSound(san: string) {
  if (san.includes("#")) playSound("end");
  else if (san.includes("+")) playSound("check");
  else if (san.includes("x")) playSound("capture");
  else playSound("move");
}
