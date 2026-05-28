import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
  CourseLevelSchema,
  CourseMetaSchema,
  ExerciseSchema,
  ExerciseTypeSchema,
  GeneratedCourseSchema,
  PartialVocabularyEnrichmentSchema,
  SentenceEnrichmentSchema,
  SentenceExplanationSchema,
  SimplifiedSentenceSchema,
  type CourseLevel,
  type CourseMeta,
  type CourseProgressEvent,
  type ExerciseType,
  type GenerateCourseInput,
  type GeneratedCourse,
  type GeminiStatus,
  type PartialVocabularyEnrichment,
  type SentenceEnrichment,
  type SentenceExplanation,
  type SimplifiedSentence,
  type StoredSentence,
  type StoredVocabulary
} from "../shared/schemas";

type GeminiJsonResult = {
  response?: string;
  error?: { message?: string };
};

type GeminiCommand = {
  command: string;
  argsPrefix: string[];
  displayPath: string;
};

const META_TIMEOUT_MS = 120_000;
const META_CHUNK_CHARS = 4000;
const META_SINGLE_CALL_MAX_CHARS = 8000;
const META_CHUNK_CONCURRENCY = 3;
const META_CHUNK_TIMEOUT_MS = 60_000;
const META_CHUNK_FALLBACK_CHARS = 800;
const SENTENCE_TIMEOUT_MS = 90_000;
const EXERCISES_TIMEOUT_MS = 120_000;
const HELPER_TIMEOUT_MS = 90_000;
const SENTENCE_CONCURRENCY = 3;

export type ProgressReporter = (event: CourseProgressEvent) => void;

export async function checkGemini(): Promise<GeminiStatus> {
  try {
    const command = await resolveGeminiCommand();
    const version = await runGeminiCommand(["--version"], command, 15000).catch(() => null);
    return {
      installed: Boolean(command.displayPath),
      path: command.displayPath,
      version: version?.stdout.trim() || null,
      error: null
    };
  } catch (error) {
    return {
      installed: false,
      path: null,
      version: null,
      error: error instanceof Error ? error.message : "Gemini CLI is not available."
    };
  }
}

export async function generateCourseInTasks(
  input: GenerateCourseInput,
  articleText: string,
  onProgress: ProgressReporter = () => undefined
): Promise<GeneratedCourse> {
  onProgress({ step: "meta", state: "active" });
  const meta = await generateCourseMeta(input, articleText, onProgress);
  onProgress({ step: "meta", state: "done" });

  const sentences = splitArticleSentences(articleText);
  const total = sentences.length;
  let completed = 0;
  let failed = 0;
  onProgress({ step: "sentences", index: 0, total, failed: 0 });

  const enrichments = new Array<SentenceEnrichment | null>(total);
  const enrichmentFailed = new Array<boolean>(total);
  await runConcurrent(SENTENCE_CONCURRENCY, sentences, async (text, index) => {
    try {
      enrichments[index] = await enrichSentenceWithRetry(text, input.level, meta.summary);
      enrichmentFailed[index] = false;
    } catch {
      enrichments[index] = null;
      enrichmentFailed[index] = true;
      failed += 1;
    } finally {
      completed += 1;
      onProgress({ step: "sentences", index: completed, total, failed });
    }
  });

  onProgress({ step: "exercises", state: "active" });
  let exercises: Array<z.infer<typeof ExerciseSchema>> = [];
  try {
    exercises = await requestAdditionalExercises({
      level: input.level,
      summary: meta.summary,
      sentences: sentences.slice(0, 6),
      types: ["quiz", "cloze", "matching", "true_false", "reorder", "translation"],
      count: 6
    });
  } catch {
    exercises = [];
  }
  onProgress({ step: "exercises", state: "done" });
  onProgress({ step: "done" });

  const courseSentences = sentences.map((english, index) => {
    const enrichment = enrichments[index];
    if (enrichment && !enrichmentFailed[index]) {
      return {
        english,
        khmer: enrichment.khmer,
        tense: enrichment.tense,
        grammarExplanationKm: enrichment.grammarExplanationKm,
        vocabulary: enrichment.vocabulary,
        simplifiedEnglish: enrichment.simplifiedEnglish,
        difficulty: enrichment.difficulty,
        pronunciationIpa: enrichment.pronunciationIpa,
        collocations: enrichment.collocations,
        phrasalVerbs: enrichment.phrasalVerbs,
        idioms: enrichment.idioms,
        register: enrichment.register,
        tenseFormula: enrichment.tenseFormula,
        structuralBreakdown: enrichment.structuralBreakdown,
        khmerSpeakerPitfallsKm: enrichment.khmerSpeakerPitfallsKm,
        verbForms: enrichment.verbForms,
        enrichmentFailed: false
      };
    }
    return {
      english,
      khmer: "—",
      tense: "Unknown",
      grammarExplanationKm: "—",
      vocabulary: [],
      enrichmentFailed: true
    };
  });

  const draft: GeneratedCourse = {
    title: meta.title,
    articleTitle: meta.articleTitle,
    summary: meta.summary,
    simplifiedSummary: meta.simplifiedSummary,
    keyIdeas: meta.keyIdeas,
    grammarFocus: meta.grammarFocus,
    tenseOverview: meta.tenseOverview,
    discussionQuestions: meta.discussionQuestions,
    writingPrompt: meta.writingPrompt,
    sentences: courseSentences,
    exercises
  };
  return GeneratedCourseSchema.parse(draft);
}

// ---------- Task A: meta ----------

export async function generateCourseMeta(
  input: GenerateCourseInput,
  articleText: string,
  onProgress: ProgressReporter = () => undefined
): Promise<CourseMeta> {
  if (articleText.length <= META_SINGLE_CALL_MAX_CHARS) {
    return generateMetaSingleCall(input, articleText);
  }
  const condensed = await buildCondensedArticle(input, articleText, onProgress);
  return generateMetaSingleCall(input, condensed);
}

async function generateMetaSingleCall(
  input: GenerateCourseInput,
  articleText: string
): Promise<CourseMeta> {
  const prompt = buildMetaPrompt(input, articleText);
  const result = await runGeminiJson(prompt, articleText, { timeoutMs: META_TIMEOUT_MS });
  return parseMeta(result.response ?? "");
}

export function chunkArticle(text: string, maxChars = META_CHUNK_CHARS): string[] {
  const sentences = splitArticleSentences(text);
  const chunks: string[] = [];
  let buffer = "";
  for (const sentence of sentences) {
    if (buffer && buffer.length + 1 + sentence.length > maxChars) {
      chunks.push(buffer);
      buffer = sentence;
    } else {
      buffer = buffer ? `${buffer} ${sentence}` : sentence;
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}

async function buildCondensedArticle(
  input: GenerateCourseInput,
  articleText: string,
  onProgress: ProgressReporter
): Promise<string> {
  const chunks = chunkArticle(articleText);
  const total = chunks.length;
  const summaries = new Array<ChunkSummary | null>(total);
  let completed = 0;
  await runConcurrent(META_CHUNK_CONCURRENCY, chunks, async (chunk, index) => {
    try {
      summaries[index] = await summarizeChunkWithRetry(chunk, input.level);
    } catch {
      summaries[index] = null;
    } finally {
      completed += 1;
      onProgress({ step: "meta", state: "active", index: completed, total });
    }
  });

  const parts = chunks.map((chunk, index) => {
    const summary = summaries[index];
    if (summary) {
      const lead = splitArticleSentences(chunk)[0] ?? "";
      const keyPoints = summary.keyPoints.length > 0 ? `\nKey points: ${summary.keyPoints.join("; ")}` : "";
      return `${lead}\n${summary.summary}${keyPoints}`.trim();
    }
    return chunk.slice(0, META_CHUNK_FALLBACK_CHARS);
  });
  return parts.join("\n\n");
}

async function summarizeChunkWithRetry(chunkText: string, level: CourseLevel): Promise<ChunkSummary> {
  try {
    return await summarizeChunk(chunkText, level);
  } catch {
    return await summarizeChunk(chunkText, level);
  }
}

async function summarizeChunk(chunkText: string, level: CourseLevel): Promise<ChunkSummary> {
  const prompt = buildChunkSummaryPrompt(chunkText, level);
  const result = await runGeminiJson(prompt, undefined, { timeoutMs: META_CHUNK_TIMEOUT_MS });
  const cleaned = lenientCleanup(extractJson(result.response ?? ""));
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    throw new Error(`Chunk summary JSON parse failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return ChunkSummarySchema.parse(parsed);
}

function buildChunkSummaryPrompt(chunkText: string, level: CourseLevel): string {
  return `
You are summarizing one section of a news article for a CEFR ${level} English lesson.
Return ONLY valid JSON. No markdown, no code fence, no commentary, no trailing commas.
Match this exact shape:
{
  "summary": "1-2 sentence English summary of this section",
  "keyPoints": ["2-4 short English key points from this section"]
}

Section:
${chunkText}
`.trim();
}

function buildMetaPrompt(input: GenerateCourseInput, articleText: string): string {
  const sourceLine = input.url ? `Source URL: ${input.url}` : "Source: pasted article text";
  return `
You are an expert English teacher for Khmer-speaking learners.
Produce ONLY the high-level metadata for a CEFR ${input.level} lesson built from this news article.
${sourceLine}

Return ONLY valid JSON. No markdown, no code fence, no commentary, no trailing commas.
Match this shape exactly (omit OPTIONAL keys only if they don't apply):
{
  "title": "short course title",
  "articleTitle": "original or inferred article title",
  "summary": "2-3 sentence English overview",
  "simplifiedSummary": "shorter, easier English summary for learners",
  "keyIdeas": ["3-5 concise English key ideas"],
  "grammarFocus": "1-2 sentence English overview of grammar focus",
  "tenseOverview": "English overview of main tenses used",
  "discussionQuestions": ["3-5 open-ended discussion questions in English"],
  "writingPrompt": "one short writing prompt connected to the article"
}

Do NOT include sentences, vocabulary, or exercises — those are handled in later tasks.

Article:
${articleText}
`.trim();
}

function parseMeta(raw: string): CourseMeta {
  const cleaned = lenientCleanup(extractJson(raw));
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    throw new Error(`Gemini meta JSON parse failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return CourseMetaSchema.parse(parsed);
}

// ---------- Task B: per-sentence enrichment ----------

async function enrichSentenceWithRetry(
  sentenceText: string,
  level: CourseLevel,
  courseSummary: string
): Promise<SentenceEnrichment> {
  try {
    return await enrichSentence(sentenceText, level, courseSummary);
  } catch {
    return await enrichSentence(sentenceText, level, courseSummary);
  }
}

export async function enrichSentence(
  sentenceText: string,
  level: CourseLevel,
  courseSummary: string
): Promise<SentenceEnrichment> {
  const prompt = buildSentenceEnrichmentPrompt(sentenceText, level, courseSummary);
  const result = await runGeminiJson(prompt, undefined, { timeoutMs: SENTENCE_TIMEOUT_MS });
  const cleaned = lenientCleanup(extractJson(result.response ?? ""));
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    throw new Error(`Sentence enrichment JSON parse failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return SentenceEnrichmentSchema.parse(parsed);
}

function buildSentenceEnrichmentPrompt(
  sentenceText: string,
  level: CourseLevel,
  courseSummary: string
): string {
  return `
You are an expert English teacher for Khmer-speaking learners working on a CEFR ${level} lesson.
Course summary: ${courseSummary}

Enrich ONE English sentence with translation, grammar, and vocabulary for the learner.
Return ONLY valid JSON. No markdown, no code fence, no commentary, no trailing commas.

Match this exact shape (omit OPTIONAL keys only when truly not applicable):
{
  "khmer": "natural Khmer translation",
  "tense": "tense name (e.g. Past simple, Present perfect)",
  "grammarExplanationKm": "Khmer explanation of grammar and tense",
  "tenseFormula": "subject + had + past participle",                            // OPTIONAL but recommended
  "structuralBreakdown": [                                                       // OPTIONAL but recommended, 3-6 parts
    { "part": "Subject", "english": "She", "khmer": "នាង" },
    { "part": "Verb",    "english": "had finished", "khmer": "បានបញ្ចប់" }
  ],
  "khmerSpeakerPitfallsKm": "1-2 sentence Khmer note on common Khmer-speaker pitfalls (articles, verb agreement, tense markers, etc.)", // OPTIONAL but recommended
  "verbForms": {                                                                 // ALWAYS include for the main verb
    "base": "finish",
    "pastSimple": "finished",
    "pastParticiple": "finished",
    "usedAs": "v3",
    "khmer": "បញ្ចប់",
    "isIrregular": false
  },
  "simplifiedEnglish": "easier rewrite for the learner",                         // OPTIONAL
  "difficulty": "easy|medium|hard",                                              // OPTIONAL
  "pronunciationIpa": "/general American IPA of the whole sentence/",           // OPTIONAL
  "collocations": ["natural collocations found in this sentence"],              // OPTIONAL
  "phrasalVerbs": [                                                              // OPTIONAL, only if truly present
    { "phrase": "look into", "meaningEn": "investigate", "khmer": "ស្រាវជ្រាវ" }
  ],
  "idioms": [                                                                    // OPTIONAL, only if truly present
    { "phrase": "in hot water", "meaningEn": "in trouble", "khmer": "ក្នុងបញ្ហា" }
  ],
  "register": "formal|neutral|informal|journalistic",                           // OPTIONAL
  "vocabulary": [
    {
      "word": "important word",
      "partOfSpeech": "noun/verb/adjective/etc",
      "khmer": "Khmer translation",
      "definitionEn": "simple English definition",
      "exampleEn": "example sentence using the word",
      "exampleKm": "Khmer translation of that example",
      "ipa": "/general American IPA/",                                           // OPTIONAL
      "cefrLevel": "A2|B1|B2|C1",                                                // OPTIONAL
      "synonyms": ["..."],                                                        // OPTIONAL
      "antonyms": ["..."],                                                        // OPTIONAL
      "frequency": "high|mid|low",                                                // OPTIONAL
      "collocations": ["common collocations"]                                     // OPTIONAL
    }
  ]
}

Level guidance (CEFR ${level}):
${levelGuidance(level)}

Requirements:
- Translate the English sentence into natural Khmer.
- Identify the dominant tense and explain it in Khmer.
- Extract 2-5 useful vocabulary items actually present in the sentence.
- Pronunciation strings MUST be wrapped in /…/ slashes.
- Do not invent idioms or phrasal verbs that aren't really in the sentence.
- Always include "verbForms" for the MAIN VERB of the sentence (the head verb of the main clause; for compound tenses pick the lexical verb, not the auxiliary). Provide v1 (base), v2 (past simple), v3 (past participle), and which one is actually used ("v1" | "v2" | "v3"). Set "isIrregular": true for irregular verbs (e.g. go/went/gone). Include "verbForms" even for present-simple sentences.
- Keep JSON strings escaped correctly. No trailing commas.

Sentence:
${sentenceText}
`.trim();
}

// ---------- Sentence splitter (no Gemini) ----------

const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "st", "jr", "sr", "vs", "etc", "inc", "co", "ltd", "no",
  "u.s", "u.k", "e.g", "i.e", "a.m", "p.m"
]);

export function splitArticleSentences(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const out: string[] = [];
  const paragraphs = normalized.split(/\n{2,}/);
  for (const paragraph of paragraphs) {
    const collapsed = paragraph.replace(/\s+/g, " ").trim();
    if (!collapsed) continue;
    out.push(...splitParagraph(collapsed));
  }
  return out.filter((s) => s.length > 0);
}

function splitParagraph(paragraph: string): string[] {
  const sentences: string[] = [];
  let buffer = "";
  for (let i = 0; i < paragraph.length; i++) {
    const char = paragraph[i];
    buffer += char;
    if (char !== "." && char !== "?" && char !== "!") continue;
    const next = paragraph[i + 1];
    if (next && next !== " " && next !== '"' && next !== "'" && next !== "\n") continue;
    const trimmed = buffer.trim();
    if (!trimmed) continue;
    const lastWord = trimmed.split(/\s+/).pop() ?? "";
    const word = lastWord.replace(/[".)\]]+$/g, "").toLowerCase();
    const withoutDot = word.endsWith(".") ? word.slice(0, -1) : word;
    if (ABBREVIATIONS.has(withoutDot)) continue;
    sentences.push(trimmed);
    buffer = "";
  }
  const tail = buffer.trim();
  if (tail) sentences.push(tail);
  return sentences;
}

// ---------- Concurrency helper ----------

async function runConcurrent<T>(
  limit: number,
  items: T[],
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const runners: Promise<void>[] = [];
  const launch = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  };
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    runners.push(launch());
  }
  await Promise.all(runners);
}

// ---------- Backwards-compatible parse helper (still used by tests) ----------

export function parseGeneratedCourse(raw: string):
  | { ok: true; course: GeneratedCourse }
  | { ok: false; error: string } {
  try {
    const jsonText = extractJson(raw);
    const cleaned = lenientCleanup(jsonText);
    const parsed = JSON.parse(cleaned);
    const course = GeneratedCourseSchema.parse(parsed);
    return { ok: true, course };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown parse error" };
  }
}

function lenientCleanup(jsonText: string): string {
  // Remove trailing commas before } or ] which Gemini occasionally emits.
  return jsonText.replace(/,(\s*[}\]])/g, "$1");
}

function levelGuidance(level: CourseLevel): string {
  if (level === "A2-B1") {
    return [
      "- Simplify the sentence to short clauses (max ~14 words) while keeping the news meaning.",
      "- Prefer top-3000 frequency vocabulary; explain anything rarer in the vocabulary list.",
      "- Use mostly present simple, past simple, and 'going to' / 'will' for futures.",
      "- Mark sentence difficulty conservatively (usually 'easy' or 'medium')."
    ].join("\n");
  }
  if (level === "B1-B2") {
    return [
      "- Keep journalistic phrasing but rewrite sentences over ~24 words for clarity.",
      "- Surface useful collocations and 1-2 phrasal verbs when they appear naturally.",
      "- Cover present perfect, past continuous, conditionals, and passive voice when present."
    ].join("\n");
  }
  return [
    "- Preserve journalistic register including hedges, nominalisations, and reporting verbs.",
    "- Surface collocations, idioms, register notes (formal/journalistic/informal), and connotation.",
    "- Cover advanced tense use (perfect aspects, mixed conditionals, passive reporting structures)."
  ].join("\n");
}

// ---------- On-demand helpers ----------

const ChunkSummarySchema = z.object({
  summary: z.string().min(1),
  keyPoints: z.array(z.string()).default([])
});
type ChunkSummary = z.infer<typeof ChunkSummarySchema>;

const ExerciseListSchema = z.object({ exercises: z.array(ExerciseSchema).min(1) });

export async function requestAdditionalExercises(args: {
  level: CourseLevel;
  summary: string;
  sentences: string[];
  types: ExerciseType[];
  count: number;
}): Promise<Array<z.infer<typeof ExerciseSchema>>> {
  CourseLevelSchema.parse(args.level);
  args.types.forEach((t) => ExerciseTypeSchema.parse(t));
  const prompt = `
You are creating exercises for an English-from-news lesson at CEFR ${args.level}.

Course summary: ${args.summary}
Sample sentences:
${args.sentences.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Generate exactly ${args.count} new exercises covering these types: ${args.types.join(", ")}.
Include at least one of each requested type when possible.
Reply ONLY with JSON of the shape:
{ "exercises": [ { "type": "...", "prompt": "...", "choices": ["..."], "answer": "...", "explanationKm": "...", "pairs": [...], "items": [...] } ] }
- Use the same exercise schema as the main course (matching has "pairs", reorder has "items").
- explanationKm must be in Khmer.
- No markdown, no commentary, no trailing commas.
`.trim();
  const result = await runGeminiJson(prompt, undefined, { timeoutMs: EXERCISES_TIMEOUT_MS });
  const json = JSON.parse(lenientCleanup(extractJson(result.response ?? "")));
  const parsed = ExerciseListSchema.parse(json);
  return parsed.exercises.slice(0, args.count);
}

export async function deepenVocabulary(
  word: StoredVocabulary
): Promise<PartialVocabularyEnrichment> {
  const prompt = `
You are enriching a vocabulary entry for a Khmer-speaking English learner.

Word: ${word.word}
Part of speech: ${word.partOfSpeech}
Existing definition: ${word.definitionEn}
Example in context: ${word.exampleEn}

Reply ONLY with JSON matching:
{
  "ipa": "/general American IPA/",
  "cefrLevel": "A2|B1|B2|C1",
  "synonyms": ["..."],
  "antonyms": ["..."],
  "frequency": "high|mid|low",
  "collocations": ["..."],
  "usageNotesEn": "1-2 sentences on usage",
  "usageNotesKm": "Khmer version"
}
All keys are optional but include as many as you confidently can. No markdown. No commentary.
`.trim();
  const result = await runGeminiJson(prompt, undefined, { timeoutMs: HELPER_TIMEOUT_MS });
  const json = JSON.parse(lenientCleanup(extractJson(result.response ?? "")));
  return PartialVocabularyEnrichmentSchema.parse(json);
}

export async function simplifySentence(
  sentence: Pick<StoredSentence, "english" | "tense">,
  targetLevel: CourseLevel
): Promise<SimplifiedSentence> {
  const prompt = `
Rewrite this English news sentence at CEFR ${targetLevel}, then translate to Khmer.

Original: ${sentence.english}
Tense: ${sentence.tense}

Reply ONLY with JSON:
{ "simplifiedEnglish": "shorter, easier English (keep meaning)", "khmer": "Khmer translation" }
No markdown. No commentary.
`.trim();
  const result = await runGeminiJson(prompt, undefined, { timeoutMs: HELPER_TIMEOUT_MS });
  const json = JSON.parse(lenientCleanup(extractJson(result.response ?? "")));
  return SimplifiedSentenceSchema.parse(json);
}

export async function explainSentence(
  sentence: Pick<StoredSentence, "english" | "tense" | "grammarExplanationKm">,
  courseSummary: string,
  question: string
): Promise<SentenceExplanation> {
  const prompt = `
A Khmer-speaking English learner is studying this news sentence.

Course summary: ${courseSummary}
Sentence: ${sentence.english}
Tense: ${sentence.tense}
Existing Khmer note: ${sentence.grammarExplanationKm}

The learner asks: ${question}

Reply ONLY with JSON:
{ "answerEn": "English answer, plain language", "answerKm": "Khmer answer" }
No markdown. No commentary.
`.trim();
  const result = await runGeminiJson(prompt, undefined, { timeoutMs: HELPER_TIMEOUT_MS });
  const json = JSON.parse(lenientCleanup(extractJson(result.response ?? "")));
  return SentenceExplanationSchema.parse(json);
}

// ---------- Gemini CLI plumbing ----------

async function runGeminiJson(
  prompt: string,
  articleText?: string,
  options: { timeoutMs?: number } = {}
): Promise<GeminiJsonResult> {
  const { promptArg, cleanup } = createPromptArg(prompt, articleText);
  try {
    const command = await resolveGeminiCommand();
    const result = await runGeminiCommand(
      ["-p", promptArg, "--output-format", "json"],
      command,
      options.timeoutMs ?? HELPER_TIMEOUT_MS
    );
    const parsed = JSON.parse(result.stdout) as GeminiJsonResult;
    if (parsed.error?.message) {
      throw new Error(parsed.error.message);
    }
    return parsed;
  } finally {
    cleanup();
  }
}

function createPromptArg(prompt: string, articleText?: string): { promptArg: string; cleanup: () => void } {
  if (!articleText || prompt.length < 7000) {
    return { promptArg: prompt, cleanup: () => undefined };
  }

  const folder = mkdtempSync(join(tmpdir(), "news-english-course-"));
  const articlePath = join(folder, "article.txt");
  writeFileSync(articlePath, articleText, "utf8");
  const promptPath = join(folder, "prompt.txt");
  writeFileSync(promptPath, prompt.replace(articleText, `Read the article text from this file: ${articlePath}`), "utf8");
  return {
    promptArg: `Read and follow the instructions in this file: ${promptPath}`,
    cleanup: () => rmSync(folder, { recursive: true, force: true })
  };
}

export function extractJson(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

async function resolveGeminiCommand(): Promise<GeminiCommand> {
  if (process.platform === "win32") {
    const command = resolveWindowsGeminiCommand();
    if (command) return command;

    const lookup = await runCommand("where.exe", ["gemini.cmd"], { timeoutMs: 7000 }).catch(() => null);
    const cmdPath = lookup?.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    if (cmdPath) {
      return { command: "cmd.exe", argsPrefix: ["/d", "/s", "/c", cmdPath], displayPath: cmdPath };
    }
    throw new Error("Gemini CLI was not found. Install it with npm or make gemini.cmd available on PATH.");
  }

  const lookup = await runCommand("which", ["gemini"], { timeoutMs: 7000 });
  const path = lookup.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!path) throw new Error("Gemini CLI was not found on PATH.");
  return { command: path, argsPrefix: [], displayPath: path };
}

function runGeminiCommand(
  args: string[],
  gemini: GeminiCommand,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string }> {
  return runCommand(gemini.command, [...gemini.argsPrefix, ...args], { timeoutMs });
}

function resolveWindowsGeminiCommand(): GeminiCommand | null {
  const npmRoots = [
    process.env.APPDATA ? join(process.env.APPDATA, "npm") : null,
    process.env.npm_config_prefix ?? null
  ].filter((value): value is string => Boolean(value));

  for (const root of npmRoots) {
    const bundlePath = join(root, "node_modules", "@google", "gemini-cli", "bundle", "gemini.js");
    if (existsSync(bundlePath)) {
      const localNode = join(root, "node.exe");
      return {
        command: existsSync(localNode) ? localNode : "node.exe",
        argsPrefix: [bundlePath],
        displayPath: bundlePath
      };
    }

    const cmdPath = join(root, "gemini.cmd");
    if (existsSync(cmdPath)) {
      return { command: "cmd.exe", argsPrefix: ["/d", "/s", "/c", cmdPath], displayPath: cmdPath };
    }
  }

  return null;
}

function runCommand(
  command: string,
  args: string[],
  options: { timeoutMs: number }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      env: {
        ...process.env,
        GEMINI_CLI_TRUST_WORKSPACE: "true"
      }
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} timed out.`));
    }, options.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr.trim() || `${command} exited with code ${code}.`));
      }
    });
  });
}
