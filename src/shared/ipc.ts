import type {
  ArticleExtraction,
  CourseLevel,
  CourseProgressEvent,
  CourseSummary,
  ExerciseType,
  GenerateCourseInput,
  GeminiStatus,
  ReviewCard,
  ReviewGrade,
  ReviewStats,
  StoredCourse,
  StoredSentence,
  StoredVocabulary,
  VocabularyListInput
} from "./schemas";

export type CourseApi = {
  generate(input: GenerateCourseInput): Promise<StoredCourse>;
  crawl(url: string): Promise<ArticleExtraction | null>;
  list(): Promise<CourseSummary[]>;
  get(id: string): Promise<StoredCourse | null>;
  delete(id: string): Promise<{ ok: true }>;
  regenerateExercises(
    courseId: string,
    type: ExerciseType,
    count: number,
    replace?: boolean
  ): Promise<StoredCourse>;
  exportAnki(courseId: string): Promise<{ ok: true; path: string } | { ok: false; cancelled: true }>;
  exportMarkdown(courseId: string): Promise<{ ok: true; path: string } | { ok: false; cancelled: true }>;
};

export type VocabularyApi = {
  list(input?: VocabularyListInput): Promise<StoredVocabulary[]>;
  setBookmarked(id: string, value: boolean): Promise<{ ok: true }>;
  deepen(id: string): Promise<StoredVocabulary>;
};

export type SentenceApi = {
  simplify(sentenceId: string, targetLevel: CourseLevel): Promise<{ simplifiedEnglish: string; khmer: string }>;
  explain(sentenceId: string, question: string): Promise<{ answerEn: string; answerKm: string }>;
  enrich(sentenceId: string): Promise<StoredSentence>;
};

export type ReviewApi = {
  due(): Promise<ReviewCard[]>;
  grade(vocabularyId: string, grade: ReviewGrade): Promise<{ ok: true }>;
  stats(): Promise<ReviewStats>;
};

export type SystemApi = {
  checkGemini(): Promise<GeminiStatus>;
  onCourseProgress(callback: (event: CourseProgressEvent) => void): () => void;
};

export type NewsEnglishApi = {
  course: CourseApi;
  vocabulary: VocabularyApi;
  sentence: SentenceApi;
  review: ReviewApi;
  system: SystemApi;
};

declare global {
  interface Window {
    newsEnglish: NewsEnglishApi;
  }
}
