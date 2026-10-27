import Dexie, { type Table } from "dexie";
import type {
  AppEvent,
  Attempt,
  ChessGameRecord,
  GameAnalysis,
  KvRecord,
  LessonProgress,
  OpeningProgress,
  ReviewCard,
  TrainingSession,
  UserProfile,
} from "./types";

/**
 * ChessPath local database (IndexedDB via Dexie).
 *
 * Schema versions are append-only: add a new `this.version(n)` block with an
 * `upgrade()` function for any change. Never edit an existing version in place.
 */
export const DB_NAME = "chesspath";
export const SCHEMA_VERSION = 1;

export class ChessPathDB extends Dexie {
  profile!: Table<UserProfile, string>;
  lessonProgress!: Table<LessonProgress, string>;
  attempts!: Table<Attempt, number>;
  reviews!: Table<ReviewCard, string>;
  games!: Table<ChessGameRecord, string>;
  analyses!: Table<GameAnalysis, string>;
  openingProgress!: Table<OpeningProgress, string>;
  sessions!: Table<TrainingSession, string>;
  events!: Table<AppEvent, number>;
  kv!: Table<KvRecord, string>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({
      profile: "id",
      lessonProgress: "lessonId, status, updatedAt",
      attempts: "++id, kind, refId, createdAt, *skills",
      reviews: "id, kind, refId, dueAt",
      games: "id, createdAt, updatedAt, status, source",
      analyses: "gameId, createdAt",
      openingProgress: "id, openingId, nextReviewAt",
      sessions: "id",
      events: "++id, type, at",
      kv: "key",
    });
    // Example for future migrations:
    // this.version(2).stores({ ... }).upgrade(async (tx) => { ... });
  }
}

let instance: ChessPathDB | null = null;

export function getDb(): ChessPathDB {
  if (!instance) instance = new ChessPathDB();
  return instance;
}

/** Test helper: use a fresh database. */
export function setDbForTests(db: ChessPathDB) {
  instance = db;
}

export const ALL_TABLES = [
  "profile",
  "lessonProgress",
  "attempts",
  "reviews",
  "games",
  "analyses",
  "openingProgress",
  "sessions",
  "events",
  "kv",
] as const;
export type TableName = (typeof ALL_TABLES)[number];
