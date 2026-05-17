import type {
  CourseSummary,
  GenerateCourseInput,
  GeminiStatus,
  StoredCourse,
  StoredVocabulary,
  VocabularyListInput
} from "./schemas";

export type CourseApi = {
  generate(input: GenerateCourseInput): Promise<StoredCourse>;
  list(): Promise<CourseSummary[]>;
  get(id: string): Promise<StoredCourse | null>;
  delete(id: string): Promise<{ ok: true }>;
};

export type VocabularyApi = {
  list(input?: VocabularyListInput): Promise<StoredVocabulary[]>;
  setBookmarked(id: string, value: boolean): Promise<{ ok: true }>;
};

export type SystemApi = {
  checkGemini(): Promise<GeminiStatus>;
};

export type NewsEnglishApi = {
  course: CourseApi;
  vocabulary: VocabularyApi;
  system: SystemApi;
};

declare global {
  interface Window {
    newsEnglish: NewsEnglishApi;
  }
}

