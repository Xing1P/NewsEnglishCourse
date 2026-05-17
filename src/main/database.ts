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

export function migrate(db: AppDatabase): void {
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
