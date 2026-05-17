import { nanoid } from "nanoid";
import type { AppDatabase } from "./database";
import type {
  CourseSummary,
  GenerateCourseInput,
  GeneratedCourse,
  StoredCourse,
  StoredExercise,
  StoredSentence,
  StoredVocabulary,
  VocabularyListInput
} from "../shared/schemas";

type CourseRow = Omit<CourseSummary, "vocabularyCount"> & { vocabularyCount: number };

type SectionRow = {
  courseId: string;
  articleTitle: string;
  originalText: string;
  simplifiedSummary: string;
  keyIdeas: string;
  grammarFocus: string;
  tenseOverview: string;
};

type SentenceRow = {
  id: string;
  courseId: string;
  sentenceOrder: number;
  english: string;
  khmer: string;
  tense: string;
  grammarExplanationKm: string;
  vocabularyIds: string;
};

type VocabularyRow = {
  id: string;
  courseId: string;
  sentenceId: string | null;
  courseTitle: string;
  word: string;
  partOfSpeech: string;
  khmer: string;
  definitionEn: string;
  exampleEn: string;
  exampleKm: string;
  isBookmarked: number;
  createdAt: string;
};

type ExerciseRow = {
  id: string;
  courseId: string;
  type: "quiz" | "cloze";
  prompt: string;
  choicesJson: string;
  answer: string;
  explanationKm: string;
};

export class CourseRepository {
  constructor(private readonly db: AppDatabase) {}

  saveGeneratedCourse(input: GenerateCourseInput, originalText: string, course: GeneratedCourse): StoredCourse {
    const id = nanoid();
    const now = new Date().toISOString();
    const sourceType = input.url ? "url" : "text";
    const preview = (originalText || input.url || "").replace(/\s+/g, " ").slice(0, 240);

    const insert = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO courses
            (id, title, sourceType, sourceUrl, sourceTextPreview, level, summary, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id, course.title, sourceType, input.url ?? null, preview, input.level, course.summary, now, now);

      this.db
        .prepare(
          `INSERT INTO course_sections
            (courseId, articleTitle, originalText, simplifiedSummary, keyIdeas, grammarFocus, tenseOverview)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          course.articleTitle,
          originalText,
          course.simplifiedSummary,
          JSON.stringify(course.keyIdeas),
          course.grammarFocus,
          course.tenseOverview
        );

      const sentenceInsert = this.db.prepare(
        `INSERT INTO sentences
          (id, courseId, sentenceOrder, english, khmer, tense, grammarExplanationKm, vocabularyIds)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const vocabularyInsert = this.db.prepare(
        `INSERT INTO vocabulary
          (id, courseId, sentenceId, word, partOfSpeech, khmer, definitionEn, exampleEn, exampleKm, isBookmarked, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const sentenceVocabularyUpdate = this.db.prepare("UPDATE sentences SET vocabularyIds = ? WHERE id = ?");
      const exerciseInsert = this.db.prepare(
        `INSERT INTO exercises
          (id, courseId, type, prompt, choicesJson, answer, explanationKm)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );

      course.sentences.forEach((sentence, index) => {
        const sentenceId = nanoid();
        sentenceInsert.run(
          sentenceId,
          id,
          index,
          sentence.english,
          sentence.khmer,
          sentence.tense,
          sentence.grammarExplanationKm,
          "[]"
        );

        const vocabularyIds = sentence.vocabulary.map((item) => {
          const vocabularyId = nanoid();
          vocabularyInsert.run(
            vocabularyId,
            id,
            sentenceId,
            item.word,
            item.partOfSpeech,
            item.khmer,
            item.definitionEn,
            item.exampleEn,
            item.exampleKm,
            1,
            now
          );
          return vocabularyId;
        });
        sentenceVocabularyUpdate.run(JSON.stringify(vocabularyIds), sentenceId);
      });

      course.exercises.forEach((exercise) => {
        exerciseInsert.run(
          nanoid(),
          id,
          exercise.type,
          exercise.prompt,
          JSON.stringify(exercise.choices),
          exercise.answer,
          exercise.explanationKm
        );
      });
    });

    insert();
    const stored = this.getCourse(id);
    if (!stored) {
      throw new Error("Generated course could not be loaded after saving.");
    }
    return stored;
  }

  listCourses(): CourseSummary[] {
    const rows = this.db
      .prepare(
        `SELECT c.*, COUNT(v.id) AS vocabularyCount
         FROM courses c
         LEFT JOIN vocabulary v ON v.courseId = c.id
         GROUP BY c.id
         ORDER BY c.createdAt DESC`
      )
      .all() as CourseRow[];
    return rows.map((row) => ({ ...row, vocabularyCount: Number(row.vocabularyCount) }));
  }

  getCourse(id: string): StoredCourse | null {
    const course = this.db
      .prepare(
        `SELECT c.*, COUNT(v.id) AS vocabularyCount
         FROM courses c
         LEFT JOIN vocabulary v ON v.courseId = c.id
         WHERE c.id = ?
         GROUP BY c.id`
      )
      .get(id) as CourseRow | undefined;
    if (!course) return null;

    const section = this.db.prepare("SELECT * FROM course_sections WHERE courseId = ?").get(id) as SectionRow;
    const vocabulary = this.listVocabulary({}).filter((item) => item.courseId === id);
    const vocabularyBySentence = new Map<string, StoredVocabulary[]>();
    vocabulary.forEach((item) => {
      if (!item.sentenceId) return;
      vocabularyBySentence.set(item.sentenceId, [...(vocabularyBySentence.get(item.sentenceId) ?? []), item]);
    });

    const sentenceRows = this.db
      .prepare("SELECT * FROM sentences WHERE courseId = ? ORDER BY sentenceOrder ASC")
      .all(id) as SentenceRow[];
    const sentences: StoredSentence[] = sentenceRows.map((row) => ({
      id: row.id,
      courseId: row.courseId,
      order: row.sentenceOrder,
      english: row.english,
      khmer: row.khmer,
      tense: row.tense,
      grammarExplanationKm: row.grammarExplanationKm,
      vocabulary: vocabularyBySentence.get(row.id) ?? []
    }));

    const exerciseRows = this.db
      .prepare("SELECT * FROM exercises WHERE courseId = ? ORDER BY rowid ASC")
      .all(id) as ExerciseRow[];
    const exercises: StoredExercise[] = exerciseRows.map((row) => ({
      id: row.id,
      courseId: row.courseId,
      type: row.type,
      prompt: row.prompt,
      choices: parseJsonArray(row.choicesJson),
      answer: row.answer,
      explanationKm: row.explanationKm
    }));

    return {
      ...course,
      vocabularyCount: Number(course.vocabularyCount),
      articleTitle: section.articleTitle,
      originalText: section.originalText,
      simplifiedSummary: section.simplifiedSummary,
      keyIdeas: parseJsonArray(section.keyIdeas),
      grammarFocus: section.grammarFocus,
      tenseOverview: section.tenseOverview,
      sentences,
      exercises
    };
  }

  deleteCourse(id: string): void {
    this.db.prepare("DELETE FROM courses WHERE id = ?").run(id);
  }

  listVocabulary(input: VocabularyListInput = {}): StoredVocabulary[] {
    const filters: string[] = [];
    const params: unknown[] = [];
    if (input.bookmarkedOnly) {
      filters.push("v.isBookmarked = 1");
    }
    if (input.query?.trim()) {
      filters.push("(v.word LIKE ? OR v.khmer LIKE ? OR c.title LIKE ?)");
      const query = `%${input.query.trim()}%`;
      params.push(query, query, query);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const rows = this.db
      .prepare(
        `SELECT v.*, c.title AS courseTitle
         FROM vocabulary v
         JOIN courses c ON c.id = v.courseId
         ${where}
         ORDER BY v.createdAt DESC, lower(v.word) ASC`
      )
      .all(...params) as VocabularyRow[];
    return rows.map(toVocabulary);
  }

  setVocabularyBookmarked(id: string, value: boolean): void {
    this.db.prepare("UPDATE vocabulary SET isBookmarked = ? WHERE id = ?").run(value ? 1 : 0, id);
  }
}

function toVocabulary(row: VocabularyRow): StoredVocabulary {
  return {
    ...row,
    isBookmarked: Boolean(row.isBookmarked)
  };
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

