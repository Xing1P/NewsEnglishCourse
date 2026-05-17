import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GeneratedCourseSchema, type GenerateCourseInput, type GeneratedCourse, type GeminiStatus } from "../shared/schemas";

type GeminiJsonResult = {
  response?: string;
  error?: { message?: string };
};

type GeminiCommand = {
  command: string;
  argsPrefix: string[];
  displayPath: string;
};

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

export async function generateCourseWithGemini(input: GenerateCourseInput, articleText: string): Promise<GeneratedCourse> {
  const firstPrompt = buildCoursePrompt(input, articleText);
  const first = await runGeminiJson(firstPrompt, articleText);
  const parsed = parseGeneratedCourse(first.response ?? "");
  if (parsed.ok) return parsed.course;

  const repairPrompt = buildRepairPrompt(first.response ?? "", parsed.error);
  const repaired = await runGeminiJson(repairPrompt);
  const repairedParsed = parseGeneratedCourse(repaired.response ?? "");
  if (repairedParsed.ok) return repairedParsed.course;
  throw new Error(`Gemini returned invalid course JSON: ${repairedParsed.error}`);
}

export function parseGeneratedCourse(raw: string): { ok: true; course: GeneratedCourse } | { ok: false; error: string } {
  try {
    const jsonText = extractJson(raw);
    const parsed = JSON.parse(jsonText);
    const course = GeneratedCourseSchema.parse(parsed);
    return { ok: true, course };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown parse error" };
  }
}

function buildCoursePrompt(input: GenerateCourseInput, articleText: string): string {
  const sourceLine = input.url ? `Source URL: ${input.url}` : "Source: pasted article text";
  return `
You are an expert English teacher for Khmer-speaking learners.
Create a complete English course from this news article for level ${input.level}.
${sourceLine}

Return ONLY valid JSON. No markdown, no code fence, no commentary.
Use this exact JSON shape:
{
  "title": "short course title",
  "articleTitle": "original or inferred article title",
  "summary": "2-3 sentence English overview",
  "simplifiedSummary": "short simpler English summary for learners",
  "keyIdeas": ["3-5 concise English key ideas"],
  "grammarFocus": "English grammar focus overview",
  "tenseOverview": "English overview of main tenses used",
  "sentences": [
    {
      "english": "article sentence or lightly simplified sentence",
      "khmer": "Khmer translation",
      "tense": "tense name",
      "grammarExplanationKm": "grammar and tense explanation in Khmer",
      "vocabulary": [
        {
          "word": "important word",
          "partOfSpeech": "noun/verb/adjective/etc",
          "khmer": "Khmer translation",
          "definitionEn": "simple English definition",
          "exampleEn": "example sentence",
          "exampleKm": "Khmer translation of example"
        }
      ]
    }
  ],
  "exercises": [
    {
      "type": "quiz",
      "prompt": "comprehension question",
      "choices": ["A", "B", "C", "D"],
      "answer": "correct answer text",
      "explanationKm": "answer explanation in Khmer"
    },
    {
      "type": "cloze",
      "prompt": "fill-in-the-blank sentence",
      "choices": ["A", "B", "C", "D"],
      "answer": "correct answer text",
      "explanationKm": "grammar explanation in Khmer"
    }
  ]
}

Requirements:
- Include 8-14 useful sentences unless the article is short.
- Translate every sentence to natural Khmer.
- Explain grammar and tense in Khmer for every sentence.
- Extract 2-5 vocabulary items per sentence.
- Include at least 3 quiz exercises and 3 cloze exercises.
- Keep JSON strings escaped correctly.

Article:
${articleText}
`.trim();
}

function buildRepairPrompt(raw: string, error: string): string {
  return `
The previous response was invalid for this app.
Validation error: ${error}

Convert the content below into ONLY valid JSON matching the required course schema.
No markdown. No code fence. Preserve the learning content as much as possible.

Previous response:
${raw}
`.trim();
}

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

function extractJson(raw: string): string {
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
