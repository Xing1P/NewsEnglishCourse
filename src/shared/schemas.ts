import { z } from "zod";

export const CourseLevelSchema = z.enum(["A2-B1", "B1-B2", "B2-C1"]);
export type CourseLevel = z.infer<typeof CourseLevelSchema>;

export const GenerateCourseInputSchema = z
  .object({
    text: z.string().trim().optional(),
    url: z.string().trim().url().optional(),
    level: CourseLevelSchema
  })
  .refine((value) => Boolean(value.text || value.url), {
    message: "Provide either article text or a URL."
  });
export type GenerateCourseInput = z.infer<typeof GenerateCourseInputSchema>;

export const VocabularyItemSchema = z.object({
  word: z.string().min(1),
  partOfSpeech: z.string().min(1),
  khmer: z.string().min(1),
  definitionEn: z.string().min(1),
  exampleEn: z.string().min(1),
  exampleKm: z.string().min(1)
});

export const SentenceSchema = z.object({
  english: z.string().min(1),
  khmer: z.string().min(1),
  tense: z.string().min(1),
  grammarExplanationKm: z.string().min(1),
  vocabulary: z.array(VocabularyItemSchema).default([])
});

export const ExerciseSchema = z.object({
  type: z.enum(["quiz", "cloze"]),
  prompt: z.string().min(1),
  choices: z.array(z.string()).default([]),
  answer: z.string().min(1),
  explanationKm: z.string().min(1)
});

export const GeneratedCourseSchema = z.object({
  title: z.string().min(1),
  articleTitle: z.string().min(1),
  summary: z.string().min(1),
  simplifiedSummary: z.string().min(1),
  keyIdeas: z.array(z.string()).min(1),
  grammarFocus: z.string().min(1),
  tenseOverview: z.string().min(1),
  sentences: z.array(SentenceSchema).min(1),
  exercises: z.array(ExerciseSchema).default([])
});
export type GeneratedCourse = z.infer<typeof GeneratedCourseSchema>;

export const CourseSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  sourceType: z.enum(["text", "url"]),
  sourceUrl: z.string().nullable(),
  sourceTextPreview: z.string(),
  level: CourseLevelSchema,
  summary: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  vocabularyCount: z.number()
});
export type CourseSummary = z.infer<typeof CourseSummarySchema>;

export const StoredVocabularySchema = z.object({
  id: z.string(),
  courseId: z.string(),
  sentenceId: z.string().nullable(),
  courseTitle: z.string(),
  word: z.string(),
  partOfSpeech: z.string(),
  khmer: z.string(),
  definitionEn: z.string(),
  exampleEn: z.string(),
  exampleKm: z.string(),
  isBookmarked: z.boolean(),
  createdAt: z.string()
});
export type StoredVocabulary = z.infer<typeof StoredVocabularySchema>;

export const StoredSentenceSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  order: z.number(),
  english: z.string(),
  khmer: z.string(),
  tense: z.string(),
  grammarExplanationKm: z.string(),
  vocabulary: z.array(StoredVocabularySchema)
});
export type StoredSentence = z.infer<typeof StoredSentenceSchema>;

export const StoredExerciseSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  type: z.enum(["quiz", "cloze"]),
  prompt: z.string(),
  choices: z.array(z.string()),
  answer: z.string(),
  explanationKm: z.string()
});
export type StoredExercise = z.infer<typeof StoredExerciseSchema>;

export const StoredCourseSchema = CourseSummarySchema.extend({
  articleTitle: z.string(),
  originalText: z.string(),
  simplifiedSummary: z.string(),
  keyIdeas: z.array(z.string()),
  grammarFocus: z.string(),
  tenseOverview: z.string(),
  sentences: z.array(StoredSentenceSchema),
  exercises: z.array(StoredExerciseSchema)
});
export type StoredCourse = z.infer<typeof StoredCourseSchema>;

export const GeminiStatusSchema = z.object({
  installed: z.boolean(),
  path: z.string().nullable(),
  version: z.string().nullable(),
  error: z.string().nullable()
});
export type GeminiStatus = z.infer<typeof GeminiStatusSchema>;

export type VocabularyListInput = {
  bookmarkedOnly?: boolean;
  query?: string;
};

