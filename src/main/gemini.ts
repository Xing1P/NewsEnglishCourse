import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
  CourseLevelSchema,
  ExerciseSchema,
  ExerciseTypeSchema,
  GeneratedCourseSchema,
  PartialVocabularyEnrichmentSchema,
  SentenceExplanationSchema,
  SimplifiedSentenceSchema,
  type CourseLevel,
  type ExerciseType,
  type GenerateCourseInput,
  type GeneratedCourse,
  type GeminiStatus,
  type PartialVocabularyEnrichment,
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

const CHUNK_TARGET_CHARS = 6000;
const SINGLE_SHOT_LIMIT = 14000;

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

export async function generateCourseWithGemini(
  input: GenerateCourseInput,
  articleText: string
): Promise<GeneratedCourse> {
  if (articleText.length > SINGLE_SHOT_LIMIT) {
    return generateChunkedCourse(input, articleText);
  }
  return generateSingleShotCourse(input, articleText);
}

async function generateSingleShotCourse(
  input: GenerateCourseInput,
  articleText: string
): Promise<GeneratedCourse> {
  const firstPrompt = buildCoursePrompt(input, articleText);
  const first = await runGeminiJson(firstPrompt, articleText);
  const parsed = parseGeneratedCourse(first.response ?? "");
  if (parsed.ok) return await maybeBackfillExercises(parsed.course, input);

  const repairPrompt = buildRepairPrompt(first.response ?? "", parsed.error);
  const repaired = await runGeminiJson(repairPrompt);
  const repairedParsed = parseGeneratedCourse(repaired.response ?? "");
  if (repairedParsed.ok) return await maybeBackfillExercises(repairedParsed.course, input);
  throw new Error(`Gemini returned invalid course JSON: ${repairedParsed.error}`);
}

async function generateChunkedCourse(input: GenerateCourseInput, articleText: string): Promise<GeneratedCourse> {
  const chunks = chunkArticle(articleText, CHUNK_TARGET_CHARS);
  const chunkCourses: GeneratedCourse[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunkInput = { ...input };
    const chunkText = chunks[i];
    const isFirst = i === 0;
    const prompt = buildCoursePrompt(chunkInput, chunkText, {
      chunkInfo: { index: i + 1, total: chunks.length },
      requireMetaFields: isFirst
    });
    const result = await runGeminiJson(prompt, chunkText);
    const parsed = parseGeneratedCourse(result.response ?? "");
    if (!parsed.ok) {
      const repair = await runGeminiJson(buildRepairPrompt(result.response ?? "", parsed.error));
      const repaired = parseGeneratedCourse(repair.response ?? "");
      if (!repaired.ok) {
        throw new Error(`Gemini returned invalid JSON for chunk ${i + 1}: ${repaired.error}`);
      }
      chunkCourses.push(repaired.course);
    } else {
      chunkCourses.push(parsed.course);
    }
  }
  return mergeChunkCourses(chunkCourses, input);
}

function mergeChunkCourses(chunks: GeneratedCourse[], input: GenerateCourseInput): GeneratedCourse {
  const head = chunks[0];
  const sentences = chunks.flatMap((c) => c.sentences);
  const exercises = chunks.flatMap((c) => c.exercises);
  const keyIdeas = dedupe(chunks.flatMap((c) => c.keyIdeas)).slice(0, 6);
  const discussionQuestions = dedupe(chunks.flatMap((c) => c.discussionQuestions ?? [])).slice(0, 5);

  const merged: GeneratedCourse = {
    title: head.title,
    articleTitle: head.articleTitle,
    summary: head.summary,
    simplifiedSummary: head.simplifiedSummary,
    keyIdeas,
    grammarFocus: head.grammarFocus,
    tenseOverview: head.tenseOverview,
    sentences,
    exercises,
    discussionQuestions: discussionQuestions.length ? discussionQuestions : undefined,
    writingPrompt: head.writingPrompt
  };
  return maybeBackfillExercisesSync(merged, input);
}

function chunkArticle(text: string, target: number): string[] {
  if (text.length <= target) return [text];
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";
  for (const para of paragraphs) {
    if ((current + "\n\n" + para).length > target && current.length > 0) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [text];
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v.trim());
  }
  return out;
}

async function maybeBackfillExercises(
  course: GeneratedCourse,
  input: GenerateCourseInput
): Promise<GeneratedCourse> {
  const requiredTypes: ExerciseType[] = ["quiz", "cloze", "matching", "true_false"];
  const missing = requiredTypes.filter((t) => !course.exercises.some((e) => e.type === t));
  if (!missing.length) return course;
  try {
    const extras = await requestAdditionalExercises({
      level: input.level,
      summary: course.summary,
      sentences: course.sentences.slice(0, 6).map((s) => s.english),
      types: missing,
      count: missing.length
    });
    return { ...course, exercises: [...course.exercises, ...extras] };
  } catch {
    return course;
  }
}

function maybeBackfillExercisesSync(course: GeneratedCourse, _input: GenerateCourseInput): GeneratedCourse {
  return course;
}

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
      "- Simplify each sentence to short clauses (max ~14 words) while keeping the news meaning.",
      "- Prefer top-3000 frequency vocabulary; explain anything rarer in the vocabulary list.",
      "- Use mostly present simple, past simple, and 'going to' / 'will' for futures.",
      "- Mark sentence difficulty conservatively (most should be 'easy' or 'medium')."
    ].join("\n");
  }
  if (level === "B1-B2") {
    return [
      "- Keep the journalistic phrasing but rewrite sentences over ~24 words for clarity.",
      "- Surface useful collocations and 1-2 phrasal verbs when they appear naturally.",
      "- Cover present perfect, past continuous, conditionals, and passive voice when present.",
      "- Difficulty mix: roughly 1 easy : 2 medium : 1 hard."
    ].join("\n");
  }
  return [
    "- Preserve journalistic register including hedges, nominalisations, and reporting verbs.",
    "- Surface collocations, idioms, register notes (formal/journalistic/informal), and connotation.",
    "- Cover advanced tense use (perfect aspects, mixed conditionals, passive reporting structures).",
    "- Difficulty mix: roughly 1 easy : 2 medium : 2 hard."
  ].join("\n");
}

export function buildCoursePrompt(
  input: GenerateCourseInput,
  articleText: string,
  options: { chunkInfo?: { index: number; total: number }; requireMetaFields?: boolean } = {}
): string {
  const sourceLine = input.url ? `Source URL: ${input.url}` : "Source: pasted article text";
  const chunkLine = options.chunkInfo
    ? `This is chunk ${options.chunkInfo.index} of ${options.chunkInfo.total} of one article. Only produce sentence/vocab/exercise items for THIS chunk's text; still fill in summary/keyIdeas based on this chunk.`
    : "";
  return `
You are an expert English teacher for Khmer-speaking learners.
Create a complete English lesson from this news article for CEFR level ${input.level}.
${sourceLine}
${chunkLine}

Return ONLY valid JSON. No markdown, no code fence, no commentary, no trailing commas.
Match this exact JSON shape (omit OPTIONAL keys only if they don't apply; do not invent idioms/phrasal verbs that aren't really in the sentence):
{
  "title": "short course title",
  "articleTitle": "original or inferred article title",
  "summary": "2-3 sentence English overview",
  "simplifiedSummary": "shorter, easier English summary for learners",
  "keyIdeas": ["3-5 concise English key ideas"],
  "grammarFocus": "1-2 sentence English overview of grammar focus",
  "tenseOverview": "English overview of main tenses used",
  "discussionQuestions": ["3-5 open-ended discussion questions in English"],   // OPTIONAL but recommended
  "writingPrompt": "one short writing prompt connected to the article",         // OPTIONAL but recommended
  "sentences": [
    {
      "english": "article sentence or lightly edited sentence",
      "simplifiedEnglish": "easier rewrite for the learner",                   // OPTIONAL
      "khmer": "Khmer translation",
      "tense": "tense name (e.g. Past simple, Present perfect)",
      "grammarExplanationKm": "grammar and tense explanation in Khmer",
      "difficulty": "easy|medium|hard",                                          // OPTIONAL
      "pronunciationIpa": "/general American IPA of the whole sentence/",       // OPTIONAL
      "collocations": ["natural collocations found in this sentence"],          // OPTIONAL
      "phrasalVerbs": [                                                          // OPTIONAL, only if truly present
        { "phrase": "look into", "meaningEn": "investigate", "khmer": "ស្រាវជ្រាវ" }
      ],
      "idioms": [                                                                // OPTIONAL, only if truly present
        { "phrase": "in hot water", "meaningEn": "in trouble", "khmer": "ក្នុងបញ្ហា" }
      ],
      "register": "formal|neutral|informal|journalistic",                       // OPTIONAL
      "vocabulary": [
        {
          "word": "important word",
          "partOfSpeech": "noun/verb/adjective/etc",
          "khmer": "Khmer translation",
          "definitionEn": "simple English definition",
          "exampleEn": "example sentence using the word",
          "exampleKm": "Khmer translation of that example",
          "ipa": "/general American IPA/",                                       // OPTIONAL
          "cefrLevel": "A2|B1|B2|C1",                                            // OPTIONAL
          "synonyms": ["..."],                                                    // OPTIONAL
          "antonyms": ["..."],                                                    // OPTIONAL
          "frequency": "high|mid|low",                                            // OPTIONAL
          "collocations": ["common collocations"]                                 // OPTIONAL
        }
      ]
    }
  ],
  "exercises": [
    { "type": "quiz",        "prompt": "comprehension question", "choices": ["A","B","C","D"], "answer": "A", "explanationKm": "..." },
    { "type": "cloze",       "prompt": "Fill: She ____ early.",  "choices": ["leaves","left","leave"], "answer": "left", "explanationKm": "..." },
    { "type": "matching",    "prompt": "Match the words to their meanings.", "choices": [], "answer": "see pairs",
      "pairs": [{"left":"increase","right":"go up"}], "explanationKm": "..." },
    { "type": "true_false",  "prompt": "Prices fell this week.", "choices": ["True","False"], "answer": "False", "explanationKm": "..." },
    { "type": "reorder",     "prompt": "Reorder the words into a sentence.", "choices": [], "answer": "She left the office early.",
      "items": ["She","left","the","office","early."], "explanationKm": "..." },
    { "type": "translation", "prompt": "Translate: Markets moved quickly.", "choices": [], "answer": "ទីផ្សារបានផ្លាស់ប្តូរយ៉ាងលឿន។", "explanationKm": "..." }
  ]
}

Level guidance (CEFR ${input.level}):
${levelGuidance(input.level)}

Requirements:
- Include 8-14 useful sentences unless the article is short.
- Translate every sentence to natural Khmer.
- Explain grammar and tense in Khmer for every sentence.
- Extract 2-5 vocabulary items per sentence.
- Include at least ONE of each exercise type: quiz, cloze, matching, true_false. Add reorder and translation when they fit.
- Pronunciation strings MUST be wrapped in /…/ slashes.
- Keep JSON strings escaped correctly. No trailing commas.
${options.requireMetaFields === false ? "- Title/summary/keyIdeas will be merged across chunks; still provide them for this chunk." : ""}

Article:
${articleText}
`.trim();
}

function buildRepairPrompt(raw: string, error: string): string {
  return `
The previous response was invalid for this app.
Validation error: ${error}

Convert the content below into ONLY valid JSON matching the required course schema.
No markdown. No code fence. No trailing commas. Preserve the learning content as much as possible.

Previous response:
${raw}
`.trim();
}

// ---------- On-demand helpers ----------

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
You are creating extra exercises for an English-from-news lesson at CEFR ${args.level}.

Course summary: ${args.summary}
Sample sentences:
${args.sentences.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Generate exactly ${args.count} new exercises with these types: ${args.types.join(", ")}.
Reply ONLY with JSON of the shape:
{ "exercises": [ { "type": "...", "prompt": "...", "choices": ["..."], "answer": "...", "explanationKm": "...", "pairs": [...], "items": [...] } ] }
- Use the same exercise schema as the main course (matching has "pairs", reorder has "items").
- explanationKm must be in Khmer.
- No markdown, no commentary, no trailing commas.
`.trim();
  const result = await runGeminiJson(prompt);
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
  const result = await runGeminiJson(prompt);
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
  const result = await runGeminiJson(prompt);
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
  const result = await runGeminiJson(prompt);
  const json = JSON.parse(lenientCleanup(extractJson(result.response ?? "")));
  return SentenceExplanationSchema.parse(json);
}

// ---------- Gemini CLI plumbing (unchanged behaviour) ----------

async function runGeminiJson(prompt: string, articleText?: string): Promise<GeminiJsonResult> {
  const { promptArg, cleanup } = createPromptArg(prompt, articleText);
  try {
    const command = await resolveGeminiCommand();
    const result = await runGeminiCommand(["-p", promptArg, "--output-format", "json"], command, 600000);
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
