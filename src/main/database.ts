import { app } from "electron";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export type AppDatabase = Database.Database;

export function getDatabasePath(): string {
  return join(app.getPath("userData"), "news-english-course.db");
}

export function createDatabase(filePath = getDatabasePath()): AppDatabase {
  mkdirSync(dirname(filePath), { recursive: true });
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

type Migration = {
  version: number;
  up: (db: AppDatabase) => void;
};

const migrations: Migration[] = [
  {
    version: 1,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS courses (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          sourceType TEXT NOT NULL CHECK (sourceType IN ('text', 'url')),
          sourceUrl TEXT,
          sourceTextPreview TEXT NOT NULL,
          level TEXT NOT NULL,
          summary TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS course_sections (
          courseId TEXT PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
          articleTitle TEXT NOT NULL,
          originalText TEXT NOT NULL,
          simplifiedSummary TEXT NOT NULL,
          keyIdeas TEXT NOT NULL,
          grammarFocus TEXT NOT NULL,
          tenseOverview TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sentences (
          id TEXT PRIMARY KEY,
          courseId TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          sentenceOrder INTEGER NOT NULL,
          english TEXT NOT NULL,
          khmer TEXT NOT NULL,
          tense TEXT NOT NULL,
          grammarExplanationKm TEXT NOT NULL,
          vocabularyIds TEXT NOT NULL DEFAULT '[]'
        );

        CREATE TABLE IF NOT EXISTS vocabulary (
          id TEXT PRIMARY KEY,
          courseId TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          sentenceId TEXT REFERENCES sentences(id) ON DELETE SET NULL,
          word TEXT NOT NULL,
          partOfSpeech TEXT NOT NULL,
          khmer TEXT NOT NULL,
          definitionEn TEXT NOT NULL,
          exampleEn TEXT NOT NULL,
          exampleKm TEXT NOT NULL,
          isBookmarked INTEGER NOT NULL DEFAULT 1,
          createdAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS exercises (
          id TEXT PRIMARY KEY,
          courseId TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK (type IN ('quiz', 'cloze')),
          prompt TEXT NOT NULL,
          choicesJson TEXT NOT NULL,
          answer TEXT NOT NULL,
          explanationKm TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sentences_course ON sentences(courseId, sentenceOrder);
        CREATE INDEX IF NOT EXISTS idx_vocabulary_course ON vocabulary(courseId);
        CREATE INDEX IF NOT EXISTS idx_vocabulary_word ON vocabulary(word);
        CREATE INDEX IF NOT EXISTS idx_exercises_course ON exercises(courseId);
      `);
    }
  },
  {
    version: 2,
    up: (db) => {
      addColumnIfMissing(db, "sentences", "simplifiedEnglish", "TEXT");
      addColumnIfMissing(db, "sentences", "difficulty", "TEXT");
      addColumnIfMissing(db, "sentences", "pronunciationIpa", "TEXT");
      addColumnIfMissing(db, "sentences", "collocationsJson", "TEXT");
      addColumnIfMissing(db, "sentences", "phrasalVerbsJson", "TEXT");
      addColumnIfMissing(db, "sentences", "idiomsJson", "TEXT");
      addColumnIfMissing(db, "sentences", "registerCode", "TEXT");

      addColumnIfMissing(db, "vocabulary", "ipa", "TEXT");
      addColumnIfMissing(db, "vocabulary", "cefrLevel", "TEXT");
      addColumnIfMissing(db, "vocabulary", "synonymsJson", "TEXT");
      addColumnIfMissing(db, "vocabulary", "antonymsJson", "TEXT");
      addColumnIfMissing(db, "vocabulary", "frequency", "TEXT");
      addColumnIfMissing(db, "vocabulary", "collocationsJson", "TEXT");

      addColumnIfMissing(db, "exercises", "pairsJson", "TEXT");
      addColumnIfMissing(db, "exercises", "itemsJson", "TEXT");

      addColumnIfMissing(db, "course_sections", "discussionQuestionsJson", "TEXT");
      addColumnIfMissing(db, "course_sections", "writingPrompt", "TEXT");
    }
  },
  {
    version: 3,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS vocabulary_reviews (
          vocabularyId TEXT PRIMARY KEY REFERENCES vocabulary(id) ON DELETE CASCADE,
          easeFactor REAL NOT NULL DEFAULT 2.5,
          intervalDays INTEGER NOT NULL DEFAULT 0,
          dueAt TEXT NOT NULL,
          lastReviewedAt TEXT,
          streak INTEGER NOT NULL DEFAULT 0,
          repetitions INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_reviews_due ON vocabulary_reviews(dueAt);
      `);
    }
  },
  {
    version: 4,
    up: (db) => {
      // Relax the CHECK constraint on exercises.type to allow new types.
      // SQLite can't drop CHECKs in place — rebuild the table.
      const hasOldCheck = db
        .prepare(
          `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'exercises'`
        )
        .get() as { sql?: string } | undefined;
      if (!hasOldCheck?.sql || !hasOldCheck.sql.includes("'quiz', 'cloze'")) return;

      db.exec(`
        CREATE TABLE exercises_new (
          id TEXT PRIMARY KEY,
          courseId TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          prompt TEXT NOT NULL,
          choicesJson TEXT NOT NULL,
          answer TEXT NOT NULL,
          explanationKm TEXT NOT NULL,
          pairsJson TEXT,
          itemsJson TEXT
        );
        INSERT INTO exercises_new (id, courseId, type, prompt, choicesJson, answer, explanationKm, pairsJson, itemsJson)
        SELECT id, courseId, type, prompt, choicesJson, answer, explanationKm, pairsJson, itemsJson FROM exercises;
        DROP TABLE exercises;
        ALTER TABLE exercises_new RENAME TO exercises;
        CREATE INDEX IF NOT EXISTS idx_exercises_course ON exercises(courseId);
      `);
    }
  },
  {
    version: 5,
    up: (db) => {
      addColumnIfMissing(db, "sentences", "tenseFormula", "TEXT");
      addColumnIfMissing(db, "sentences", "structuralBreakdownJson", "TEXT");
      addColumnIfMissing(db, "sentences", "khmerSpeakerPitfallsKm", "TEXT");
      addColumnIfMissing(db, "sentences", "enrichmentFailed", "INTEGER NOT NULL DEFAULT 0");
    }
  },
  {
    version: 6,
    up: (db) => {
      addColumnIfMissing(db, "sentences", "verbFormsJson", "TEXT");
    }
  }
];

export function migrate(db: AppDatabase): void {
  const current = (db.pragma("user_version", { simple: true }) as number) ?? 0;
  for (const migration of migrations) {
    if (migration.version <= current) continue;
    const run = db.transaction(() => {
      migration.up(db);
      db.pragma(`user_version = ${migration.version}`);
    });
    run();
  }
}

function addColumnIfMissing(db: AppDatabase, table: string, column: string, type: string): void {
  const cols = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}
