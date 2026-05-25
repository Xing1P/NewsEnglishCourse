import { nanoid } from "nanoid";
import type { AppDatabase } from "./database";
import type {
  CourseSummary,
  ExerciseType,
  Frequency,
  GenerateCourseInput,
  GeneratedCourse,
  PartialVocabularyEnrichment,
  Register,
  ReviewCard,
  SentenceDifficulty,
  SentenceEnrichment,
  StoredCourse,
  StoredExercise,
  StoredSentence,
  StoredVocabulary,
  StructuralBreakdownPart,
  VerbForms,
  VocabularyListInput
} from "../shared/schemas";

type Idiom = { phrase: string; meaningEn: string; khmer: string };
type PhrasalVerb = { phrase: string; meaningEn: string; khmer: string };
type MatchingPair = { left: string; right: string };

type CourseRow = Omit<CourseSummary, "vocabularyCount"> & { vocabularyCount: number };

type SectionRow = {
  courseId: string;
  articleTitle: string;
  originalText: string;
  simplifiedSummary: string;
  keyIdeas: string;
  grammarFocus: string;
  tenseOverview: string;
  discussionQuestionsJson: string | null;
  writingPrompt: string | null;
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
  simplifiedEnglish: string | null;
  difficulty: string | null;
  pronunciationIpa: string | null;
  collocationsJson: string | null;
  phrasalVerbsJson: string | null;
  idiomsJson: string | null;
  registerCode: string | null;
  tenseFormula: string | null;
  structuralBreakdownJson: string | null;
  khmerSpeakerPitfallsKm: string | null;
  enrichmentFailed: number | null;
  verbFormsJson: string | null;
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
  ipa: string | null;
  cefrLevel: string | null;
  synonymsJson: string | null;
  antonymsJson: string | null;
  frequency: string | null;
  collocationsJson: string | null;
};

type ExerciseRow = {
  id: string;
  courseId: string;
  type: string;
  prompt: string;
  choicesJson: string;
  answer: string;
  explanationKm: string;
  pairsJson: string | null;
  itemsJson: string | null;
};

type ReviewRow = {
  vocabularyId: string;
  easeFactor: number;
  intervalDays: number;
  dueAt: string;
  lastReviewedAt: string | null;
  streak: number;
  repetitions: number;
};

export type ReviewState = {
  vocabularyId: string;
  easeFactor: number;
  intervalDays: number;
  dueAt: string;
  lastReviewedAt: string | null;
  streak: number;
  repetitions: number;
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
            (courseId, articleTitle, originalText, simplifiedSummary, keyIdeas, grammarFocus, tenseOverview,
             discussionQuestionsJson, writingPrompt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          course.articleTitle,
          originalText,
          course.simplifiedSummary,
          JSON.stringify(course.keyIdeas),
          course.grammarFocus,
          course.tenseOverview,
          course.discussionQuestions ? JSON.stringify(course.discussionQuestions) : null,
          course.writingPrompt ?? null
        );

      const sentenceInsert = this.db.prepare(
        `INSERT INTO sentences
          (id, courseId, sentenceOrder, english, khmer, tense, grammarExplanationKm, vocabularyIds,
           simplifiedEnglish, difficulty, pronunciationIpa, collocationsJson, phrasalVerbsJson, idiomsJson, registerCode,
           tenseFormula, structuralBreakdownJson, khmerSpeakerPitfallsKm, enrichmentFailed, verbFormsJson)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const vocabularyInsert = this.db.prepare(
        `INSERT INTO vocabulary
          (id, courseId, sentenceId, word, partOfSpeech, khmer, definitionEn, exampleEn, exampleKm,
           isBookmarked, createdAt, ipa, cefrLevel, synonymsJson, antonymsJson, frequency, collocationsJson)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const sentenceVocabularyUpdate = this.db.prepare("UPDATE sentences SET vocabularyIds = ? WHERE id = ?");
      const exerciseInsert = this.db.prepare(
        `INSERT INTO exercises
          (id, courseId, type, prompt, choicesJson, answer, explanationKm, pairsJson, itemsJson)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
          "[]",
          sentence.simplifiedEnglish ?? null,
          sentence.difficulty ?? null,
          sentence.pronunciationIpa ?? null,
          sentence.collocations ? JSON.stringify(sentence.collocations) : null,
          sentence.phrasalVerbs ? JSON.stringify(sentence.phrasalVerbs) : null,
          sentence.idioms ? JSON.stringify(sentence.idioms) : null,
          sentence.register ?? null,
          sentence.tenseFormula ?? null,
          sentence.structuralBreakdown ? JSON.stringify(sentence.structuralBreakdown) : null,
          sentence.khmerSpeakerPitfallsKm ?? null,
          sentence.enrichmentFailed ? 1 : 0,
          sentence.verbForms ? JSON.stringify(sentence.verbForms) : null
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
            now,
            item.ipa ?? null,
            item.cefrLevel ?? null,
            item.synonyms ? JSON.stringify(item.synonyms) : null,
            item.antonyms ? JSON.stringify(item.antonyms) : null,
            item.frequency ?? null,
            item.collocations ? JSON.stringify(item.collocations) : null
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
          exercise.explanationKm,
          exercise.pairs ? JSON.stringify(exercise.pairs) : null,
          exercise.items ? JSON.stringify(exercise.items) : null
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

    const section = this.db
      .prepare("SELECT * FROM course_sections WHERE courseId = ?")
      .get(id) as SectionRow;

    const vocabRows = this.db
      .prepare(
        `SELECT v.*, c.title AS courseTitle
         FROM vocabulary v
         JOIN courses c ON c.id = v.courseId
         WHERE v.courseId = ?
         ORDER BY v.createdAt ASC, lower(v.word) ASC`
      )
      .all(id) as VocabularyRow[];
    const vocabulary = vocabRows.map(toVocabulary);

    const vocabularyBySentence = new Map<string, StoredVocabulary[]>();
    vocabulary.forEach((item) => {
      if (!item.sentenceId) return;
      vocabularyBySentence.set(item.sentenceId, [...(vocabularyBySentence.get(item.sentenceId) ?? []), item]);
    });

    const sentenceRows = this.db
      .prepare("SELECT * FROM sentences WHERE courseId = ? ORDER BY sentenceOrder ASC")
      .all(id) as SentenceRow[];
    const sentences: StoredSentence[] = sentenceRows.map((row) => sentenceRowToStored(row, vocabularyBySentence.get(row.id) ?? []));

    const exerciseRows = this.db
      .prepare("SELECT * FROM exercises WHERE courseId = ? ORDER BY rowid ASC")
      .all(id) as ExerciseRow[];
    const exercises: StoredExercise[] = exerciseRows.map((row) => ({
      id: row.id,
      courseId: row.courseId,
      type: row.type as ExerciseType,
      prompt: row.prompt,
      choices: parseJsonArray(row.choicesJson),
      answer: row.answer,
      explanationKm: row.explanationKm,
      pairs: parseJsonOrUndefined<MatchingPair[]>(row.pairsJson),
      items: parseJsonOrUndefined<string[]>(row.itemsJson)
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
      exercises,
      discussionQuestions: parseStringArrayOrUndefined(section.discussionQuestionsJson),
      writingPrompt: section.writingPrompt ?? undefined
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

  getVocabulary(id: string): StoredVocabulary | null {
    const row = this.db
      .prepare(
        `SELECT v.*, c.title AS courseTitle
         FROM vocabulary v
         JOIN courses c ON c.id = v.courseId
         WHERE v.id = ?`
      )
      .get(id) as VocabularyRow | undefined;
    return row ? toVocabulary(row) : null;
  }

  setVocabularyBookmarked(id: string, value: boolean): void {
    this.db.prepare("UPDATE vocabulary SET isBookmarked = ? WHERE id = ?").run(value ? 1 : 0, id);
  }

  mergeVocabularyEnrichment(id: string, enrichment: PartialVocabularyEnrichment): void {
    const current = this.getVocabulary(id);
    if (!current) return;
    const merged = {
      ipa: enrichment.ipa ?? current.ipa ?? null,
      cefrLevel: enrichment.cefrLevel ?? current.cefrLevel ?? null,
      synonymsJson: enrichment.synonyms
        ? JSON.stringify(mergeUnique(current.synonyms, enrichment.synonyms))
        : current.synonyms
          ? JSON.stringify(current.synonyms)
          : null,
      antonymsJson: enrichment.antonyms
        ? JSON.stringify(mergeUnique(current.antonyms, enrichment.antonyms))
        : current.antonyms
          ? JSON.stringify(current.antonyms)
          : null,
      frequency: enrichment.frequency ?? current.frequency ?? null,
      collocationsJson: enrichment.collocations
        ? JSON.stringify(mergeUnique(current.collocations, enrichment.collocations))
        : current.collocations
          ? JSON.stringify(current.collocations)
          : null
    };
    this.db
      .prepare(
        `UPDATE vocabulary
         SET ipa = ?, cefrLevel = ?, synonymsJson = ?, antonymsJson = ?, frequency = ?, collocationsJson = ?
         WHERE id = ?`
      )
      .run(
        merged.ipa,
        merged.cefrLevel,
        merged.synonymsJson,
        merged.antonymsJson,
        merged.frequency,
        merged.collocationsJson,
        id
      );
  }

  setSentenceSimplified(sentenceId: string, simplifiedEnglish: string): void {
    this.db
      .prepare("UPDATE sentences SET simplifiedEnglish = ? WHERE id = ?")
      .run(simplifiedEnglish, sentenceId);
  }

  getSentence(sentenceId: string): StoredSentence | null {
    const row = this.db
      .prepare("SELECT * FROM sentences WHERE id = ?")
      .get(sentenceId) as SentenceRow | undefined;
    if (!row) return null;
    const vocab = this.db
      .prepare(
        `SELECT v.*, c.title AS courseTitle
         FROM vocabulary v
         JOIN courses c ON c.id = v.courseId
         WHERE v.sentenceId = ?`
      )
      .all(sentenceId) as VocabularyRow[];
    return sentenceRowToStored(row, vocab.map(toVocabulary));
  }

  mergeSentenceEnrichment(sentenceId: string, enrichment: SentenceEnrichment): StoredSentence | null {
    const sentence = this.db
      .prepare("SELECT * FROM sentences WHERE id = ?")
      .get(sentenceId) as SentenceRow | undefined;
    if (!sentence) return null;

    const now = new Date().toISOString();
    const newVocabularyIds: string[] = [];

    const insertVocab = this.db.prepare(
      `INSERT INTO vocabulary
        (id, courseId, sentenceId, word, partOfSpeech, khmer, definitionEn, exampleEn, exampleKm,
         isBookmarked, createdAt, ipa, cefrLevel, synonymsJson, antonymsJson, frequency, collocationsJson)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const deleteVocab = this.db.prepare("DELETE FROM vocabulary WHERE sentenceId = ?");
    const updateSentence = this.db.prepare(
      `UPDATE sentences
       SET khmer = ?, tense = ?, grammarExplanationKm = ?, vocabularyIds = ?,
           simplifiedEnglish = ?, difficulty = ?, pronunciationIpa = ?, collocationsJson = ?,
           phrasalVerbsJson = ?, idiomsJson = ?, registerCode = ?,
           tenseFormula = ?, structuralBreakdownJson = ?, khmerSpeakerPitfallsKm = ?,
           verbFormsJson = ?,
           enrichmentFailed = 0
       WHERE id = ?`
    );

    const txn = this.db.transaction(() => {
      deleteVocab.run(sentenceId);
      for (const item of enrichment.vocabulary) {
        const vocabId = nanoid();
        insertVocab.run(
          vocabId,
          sentence.courseId,
          sentenceId,
          item.word,
          item.partOfSpeech,
          item.khmer,
          item.definitionEn,
          item.exampleEn,
          item.exampleKm,
          1,
          now,
          item.ipa ?? null,
          item.cefrLevel ?? null,
          item.synonyms ? JSON.stringify(item.synonyms) : null,
          item.antonyms ? JSON.stringify(item.antonyms) : null,
          item.frequency ?? null,
          item.collocations ? JSON.stringify(item.collocations) : null
        );
        newVocabularyIds.push(vocabId);
      }
      updateSentence.run(
        enrichment.khmer,
        enrichment.tense,
        enrichment.grammarExplanationKm,
        JSON.stringify(newVocabularyIds),
        enrichment.simplifiedEnglish ?? null,
        enrichment.difficulty ?? null,
        enrichment.pronunciationIpa ?? null,
        enrichment.collocations ? JSON.stringify(enrichment.collocations) : null,
        enrichment.phrasalVerbs ? JSON.stringify(enrichment.phrasalVerbs) : null,
        enrichment.idioms ? JSON.stringify(enrichment.idioms) : null,
        enrichment.register ?? null,
        enrichment.tenseFormula ?? null,
        enrichment.structuralBreakdown ? JSON.stringify(enrichment.structuralBreakdown) : null,
        enrichment.khmerSpeakerPitfallsKm ?? null,
        enrichment.verbForms ? JSON.stringify(enrichment.verbForms) : null,
        sentenceId
      );
    });
    txn();
    return this.getSentence(sentenceId);
  }

  appendExercises(
    courseId: string,
    exercises: Array<{
      type: ExerciseType;
      prompt: string;
      choices: string[];
      answer: string;
      explanationKm: string;
      pairs?: MatchingPair[];
      items?: string[];
    }>,
    replaceType?: ExerciseType
  ): void {
    const insert = this.db.prepare(
      `INSERT INTO exercises
        (id, courseId, type, prompt, choicesJson, answer, explanationKm, pairsJson, itemsJson)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const remove = replaceType
      ? this.db.prepare("DELETE FROM exercises WHERE courseId = ? AND type = ?")
      : null;
    const txn = this.db.transaction(() => {
      if (remove && replaceType) remove.run(courseId, replaceType);
      for (const e of exercises) {
        insert.run(
          nanoid(),
          courseId,
          e.type,
          e.prompt,
          JSON.stringify(e.choices),
          e.answer,
          e.explanationKm,
          e.pairs ? JSON.stringify(e.pairs) : null,
          e.items ? JSON.stringify(e.items) : null
        );
      }
    });
    txn();
  }

  upsertReview(state: ReviewState): void {
    this.db
      .prepare(
        `INSERT INTO vocabulary_reviews
          (vocabularyId, easeFactor, intervalDays, dueAt, lastReviewedAt, streak, repetitions)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(vocabularyId) DO UPDATE SET
           easeFactor = excluded.easeFactor,
           intervalDays = excluded.intervalDays,
           dueAt = excluded.dueAt,
           lastReviewedAt = excluded.lastReviewedAt,
           streak = excluded.streak,
           repetitions = excluded.repetitions`
      )
      .run(
        state.vocabularyId,
        state.easeFactor,
        state.intervalDays,
        state.dueAt,
        state.lastReviewedAt,
        state.streak,
        state.repetitions
      );
  }

  getReview(vocabularyId: string): ReviewState | null {
    const row = this.db
      .prepare("SELECT * FROM vocabulary_reviews WHERE vocabularyId = ?")
      .get(vocabularyId) as ReviewRow | undefined;
    return row ?? null;
  }

  listDueReviews(nowIso: string, limit = 50): ReviewCard[] {
    const rows = this.db
      .prepare(
        `SELECT v.*, c.title AS courseTitle,
                r.dueAt AS r_dueAt, r.intervalDays AS r_interval, r.easeFactor AS r_ease
         FROM vocabulary v
         JOIN courses c ON c.id = v.courseId
         LEFT JOIN vocabulary_reviews r ON r.vocabularyId = v.id
         WHERE v.isBookmarked = 1
           AND (r.dueAt IS NULL OR r.dueAt <= ?)
         ORDER BY (r.dueAt IS NULL) DESC, r.dueAt ASC, v.createdAt ASC
         LIMIT ?`
      )
      .all(nowIso, limit) as Array<VocabularyRow & { r_dueAt: string | null; r_interval: number | null; r_ease: number | null }>;
    return rows.map((row) => ({
      ...toVocabulary(row),
      dueAt: row.r_dueAt,
      intervalDays: row.r_interval ?? 0,
      easeFactor: row.r_ease ?? 2.5
    }));
  }

  reviewStats(nowIso: string, startOfTodayIso: string): {
    dueCount: number;
    reviewedToday: number;
  } {
    const due = this.db
      .prepare(
        `SELECT COUNT(*) AS n
         FROM vocabulary v
         LEFT JOIN vocabulary_reviews r ON r.vocabularyId = v.id
         WHERE v.isBookmarked = 1 AND (r.dueAt IS NULL OR r.dueAt <= ?)`
      )
      .get(nowIso) as { n: number };
    const reviewedToday = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM vocabulary_reviews WHERE lastReviewedAt >= ?`
      )
      .get(startOfTodayIso) as { n: number };
    return { dueCount: Number(due.n), reviewedToday: Number(reviewedToday.n) };
  }

  reviewedDaysDesc(limitDays = 365): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT substr(lastReviewedAt, 1, 10) AS day
         FROM vocabulary_reviews
         WHERE lastReviewedAt IS NOT NULL
         ORDER BY day DESC
         LIMIT ?`
      )
      .all(limitDays) as Array<{ day: string }>;
    return rows.map((r) => r.day);
  }
}

function mergeUnique(existing: string[] | undefined, additions: string[]): string[] {
  const out = new Set<string>(existing ?? []);
  additions.forEach((value) => out.add(value));
  return Array.from(out);
}

function toVocabulary(row: VocabularyRow): StoredVocabulary {
  return {
    id: row.id,
    courseId: row.courseId,
    sentenceId: row.sentenceId,
    courseTitle: row.courseTitle,
    word: row.word,
    partOfSpeech: row.partOfSpeech,
    khmer: row.khmer,
    definitionEn: row.definitionEn,
    exampleEn: row.exampleEn,
    exampleKm: row.exampleKm,
    isBookmarked: Boolean(row.isBookmarked),
    createdAt: row.createdAt,
    ipa: row.ipa ?? undefined,
    cefrLevel: row.cefrLevel ?? undefined,
    synonyms: parseStringArrayOrUndefined(row.synonymsJson),
    antonyms: parseStringArrayOrUndefined(row.antonymsJson),
    frequency: (row.frequency as Frequency | null) ?? undefined,
    collocations: parseStringArrayOrUndefined(row.collocationsJson)
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

function parseStringArrayOrUndefined(value: string | null): string[] | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : undefined;
  } catch {
    return undefined;
  }
}

function parseJsonOrUndefined<T>(value: string | null): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function sentenceRowToStored(row: SentenceRow, vocabulary: StoredVocabulary[]): StoredSentence {
  return {
    id: row.id,
    courseId: row.courseId,
    order: row.sentenceOrder,
    english: row.english,
    khmer: row.khmer,
    tense: row.tense,
    grammarExplanationKm: row.grammarExplanationKm,
    vocabulary,
    simplifiedEnglish: row.simplifiedEnglish ?? undefined,
    difficulty: (row.difficulty as SentenceDifficulty | null) ?? undefined,
    pronunciationIpa: row.pronunciationIpa ?? undefined,
    collocations: parseStringArrayOrUndefined(row.collocationsJson),
    phrasalVerbs: parseJsonOrUndefined<PhrasalVerb[]>(row.phrasalVerbsJson),
    idioms: parseJsonOrUndefined<Idiom[]>(row.idiomsJson),
    register: (row.registerCode as Register | null) ?? undefined,
    tenseFormula: row.tenseFormula ?? undefined,
    structuralBreakdown: parseJsonOrUndefined<StructuralBreakdownPart[]>(row.structuralBreakdownJson),
    khmerSpeakerPitfallsKm: row.khmerSpeakerPitfallsKm ?? undefined,
    verbForms: parseJsonOrUndefined<VerbForms>(row.verbFormsJson),
    enrichmentFailed: row.enrichmentFailed ? true : undefined
  };
}
