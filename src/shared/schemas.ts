import { z } from "zod";

export const CourseLevelSchema = z.enum(["A2-B1", "B1-B2", "B2-C1"]);
export type CourseLevel = z.infer<typeof CourseLevelSchema>;

export type ArticleExtraction = {
  title: string;
  text: string;
};

export const SentenceDifficultySchema = z.enum(["easy", "medium", "hard"]);
export type SentenceDifficulty = z.infer<typeof SentenceDifficultySchema>;

export const RegisterSchema = z.enum(["formal", "neutral", "informal", "journalistic"]);
export type Register = z.infer<typeof RegisterSchema>;

export const FrequencySchema = z.enum(["high", "mid", "low"]);
export type Frequency = z.infer<typeof FrequencySchema>;

export const ExerciseTypeSchema = z.enum([
  "quiz",
  "cloze",
  "matching",
  "true_false",
  "reorder",
  "translation"
]);
export type ExerciseType = z.infer<typeof ExerciseTypeSchema>;

export const ReviewGradeSchema = z.enum(["again", "hard", "good", "easy"]);
export type ReviewGrade = z.infer<typeof ReviewGradeSchema>;

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

export const PhrasalVerbSchema = z.object({
  phrase: z.string().min(1),
  meaningEn: z.string().min(1),
  khmer: z.string().min(1)
});

export const IdiomSchema = z.object({
  phrase: z.string().min(1),
  meaningEn: z.string().min(1),
  khmer: z.string().min(1)
});

export const VocabularyItemSchema = z.object({
  word: z.string().min(1),
  partOfSpeech: z.string().min(1),
  khmer: z.string().min(1),
  definitionEn: z.string().min(1),
  exampleEn: z.string().min(1),
  exampleKm: z.string().min(1),
  ipa: z.string().optional(),
  cefrLevel: z.string().optional(),
  synonyms: z.array(z.string()).optional(),
  antonyms: z.array(z.string()).optional(),
  frequency: FrequencySchema.optional(),
  collocations: z.array(z.string()).optional()
});

export const StructuralBreakdownPartSchema = z.object({
  part: z.string().min(1),
  english: z.string().min(1),
  khmer: z.string().min(1)
});
export type StructuralBreakdownPart = z.infer<typeof StructuralBreakdownPartSchema>;

export const VerbFormsSchema = z.object({
  base: z.string().min(1),
  pastSimple: z.string().min(1),
  pastParticiple: z.string().min(1),
  usedAs: z.enum(["v1", "v2", "v3"]),
  khmer: z.string().optional(),
  isIrregular: z.boolean().optional()
});
export type VerbForms = z.infer<typeof VerbFormsSchema>;

export const SentenceSchema = z.object({
  english: z.string().min(1),
  khmer: z.string().min(1),
  tense: z.string().min(1),
  grammarExplanationKm: z.string().min(1),
  vocabulary: z.array(VocabularyItemSchema).default([]),
  simplifiedEnglish: z.string().optional(),
  difficulty: SentenceDifficultySchema.optional(),
  pronunciationIpa: z.string().optional(),
  collocations: z.array(z.string()).optional(),
  phrasalVerbs: z.array(PhrasalVerbSchema).optional(),
  idioms: z.array(IdiomSchema).optional(),
  register: RegisterSchema.optional(),
  tenseFormula: z.string().optional(),
  structuralBreakdown: z.array(StructuralBreakdownPartSchema).optional(),
  khmerSpeakerPitfallsKm: z.string().optional(),
  verbForms: VerbFormsSchema.optional(),
  enrichmentFailed: z.boolean().optional()
});

export const MatchingPairSchema = z.object({
  left: z.string().min(1),
  right: z.string().min(1)
});

export const ExerciseSchema = z.object({
  type: ExerciseTypeSchema,
  prompt: z.string().min(1),
  choices: z.array(z.string()).default([]),
  answer: z.string().min(1),
  explanationKm: z.string().min(1),
  pairs: z.array(MatchingPairSchema).optional(),
  items: z.array(z.string()).optional()
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
  exercises: z.array(ExerciseSchema).default([]),
  discussionQuestions: z.array(z.string()).optional(),
  writingPrompt: z.string().optional()
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
  createdAt: z.string(),
  ipa: z.string().optional(),
  cefrLevel: z.string().optional(),
  synonyms: z.array(z.string()).optional(),
  antonyms: z.array(z.string()).optional(),
  frequency: FrequencySchema.optional(),
  collocations: z.array(z.string()).optional()
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
  vocabulary: z.array(StoredVocabularySchema),
  simplifiedEnglish: z.string().optional(),
  difficulty: SentenceDifficultySchema.optional(),
  pronunciationIpa: z.string().optional(),
  collocations: z.array(z.string()).optional(),
  phrasalVerbs: z.array(PhrasalVerbSchema).optional(),
  idioms: z.array(IdiomSchema).optional(),
  register: RegisterSchema.optional(),
  tenseFormula: z.string().optional(),
  structuralBreakdown: z.array(StructuralBreakdownPartSchema).optional(),
  khmerSpeakerPitfallsKm: z.string().optional(),
  verbForms: VerbFormsSchema.optional(),
  enrichmentFailed: z.boolean().optional()
});
export type StoredSentence = z.infer<typeof StoredSentenceSchema>;

export const StoredExerciseSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  type: ExerciseTypeSchema,
  prompt: z.string(),
  choices: z.array(z.string()),
  answer: z.string(),
  explanationKm: z.string(),
  pairs: z.array(MatchingPairSchema).optional(),
  items: z.array(z.string()).optional()
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
  exercises: z.array(StoredExerciseSchema),
  discussionQuestions: z.array(z.string()).optional(),
  writingPrompt: z.string().optional()
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

export type ReviewStats = {
  dueCount: number;
  reviewedToday: number;
  streakDays: number;
};

export type ReviewCard = StoredVocabulary & {
  dueAt: string | null;
  intervalDays: number;
  easeFactor: number;
};

export const PartialVocabularyEnrichmentSchema = z.object({
  ipa: z.string().optional(),
  cefrLevel: z.string().optional(),
  synonyms: z.array(z.string()).optional(),
  antonyms: z.array(z.string()).optional(),
  frequency: FrequencySchema.optional(),
  collocations: z.array(z.string()).optional(),
  usageNotesEn: z.string().optional(),
  usageNotesKm: z.string().optional()
});
export type PartialVocabularyEnrichment = z.infer<typeof PartialVocabularyEnrichmentSchema>;

export const SimplifiedSentenceSchema = z.object({
  simplifiedEnglish: z.string().min(1),
  khmer: z.string().min(1)
});
export type SimplifiedSentence = z.infer<typeof SimplifiedSentenceSchema>;

export const SentenceExplanationSchema = z.object({
  answerEn: z.string().min(1),
  answerKm: z.string().min(1)
});
export type SentenceExplanation = z.infer<typeof SentenceExplanationSchema>;

export const CourseMetaSchema = z.object({
  title: z.string().min(1),
  articleTitle: z.string().min(1),
  summary: z.string().min(1),
  simplifiedSummary: z.string().min(1),
  keyIdeas: z.array(z.string()).min(1),
  grammarFocus: z.string().min(1),
  tenseOverview: z.string().min(1),
  discussionQuestions: z.array(z.string()).optional(),
  writingPrompt: z.string().optional()
});
export type CourseMeta = z.infer<typeof CourseMetaSchema>;

export const SentenceEnrichmentSchema = z.object({
  khmer: z.string().min(1),
  tense: z.string().min(1),
  grammarExplanationKm: z.string().min(1),
  vocabulary: z.array(VocabularyItemSchema).default([]),
  simplifiedEnglish: z.string().optional(),
  difficulty: SentenceDifficultySchema.optional(),
  pronunciationIpa: z.string().optional(),
  collocations: z.array(z.string()).optional(),
  phrasalVerbs: z.array(PhrasalVerbSchema).optional(),
  idioms: z.array(IdiomSchema).optional(),
  register: RegisterSchema.optional(),
  tenseFormula: z.string().optional(),
  structuralBreakdown: z.array(StructuralBreakdownPartSchema).optional(),
  khmerSpeakerPitfallsKm: z.string().optional(),
  verbForms: VerbFormsSchema.optional()
});
export type SentenceEnrichment = z.infer<typeof SentenceEnrichmentSchema>;

export type CourseProgressEvent =
  | { step: "meta"; state: "active" | "done" }
  | { step: "sentences"; index: number; total: number; failed: number }
  | { step: "exercises"; state: "active" | "done" }
  | { step: "done" }
  | { step: "error"; message: string };
