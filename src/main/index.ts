import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import log from "electron-log";
import { createDatabase } from "./database";
import { CourseRepository } from "./repository";
import { extractArticleFromUrl } from "./articleExtractor";
import {
  checkGemini,
  deepenVocabulary,
  explainSentence,
  generateCourseWithGemini,
  requestAdditionalExercises,
  simplifySentence
} from "./gemini";
import { applyGrade, DEFAULT_STATE, nextDueIso, streakFromDays } from "./spacedRepetition";
import { toAnkiTsv, toMarkdown } from "./export";
import {
  CourseLevelSchema,
  ExerciseTypeSchema,
  GenerateCourseInputSchema,
  ReviewGradeSchema,
  type ReviewStats
} from "../shared/schemas";

let mainWindow: Electron.BrowserWindow | null = null;
let repository: CourseRepository;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    show: false,
    title: "News English Course",
    backgroundColor: "#F7F6F1",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function registerIpc(): void {
  ipcMain.handle("system:checkGemini", () => checkGemini());

  ipcMain.handle("course:list", () => repository.listCourses());
  ipcMain.handle("course:get", (_event, id: unknown) => {
    if (typeof id !== "string") throw new Error("Invalid course id.");
    return repository.getCourse(id);
  });
  ipcMain.handle("course:delete", (_event, id: unknown) => {
    if (typeof id !== "string") throw new Error("Invalid course id.");
    repository.deleteCourse(id);
    return { ok: true };
  });
  ipcMain.handle("course:generate", async (_event, rawInput: unknown) => {
    const input = GenerateCourseInputSchema.parse(rawInput);
    const gemini = await checkGemini();
    if (!gemini.installed) {
      throw new Error(gemini.error ?? "Gemini CLI is not installed.");
    }

    let originalText = input.text?.trim() ?? "";
    if (input.url) {
      try {
        const extracted = await extractArticleFromUrl(input.url);
        originalText = extracted ? `${extracted.title}\n\n${extracted.text}` : input.url;
      } catch (error) {
        log.warn("Article extraction failed; falling back to Gemini URL analysis.", error);
        originalText = input.url;
      }
    }

    const generated = await generateCourseWithGemini(input, originalText);
    return repository.saveGeneratedCourse(input, originalText, generated);
  });

  ipcMain.handle("course:regenerateExercises", async (_event, raw: unknown) => {
    const payload = raw as { courseId?: string; type?: string; count?: number; replace?: boolean };
    if (!payload || typeof payload.courseId !== "string") throw new Error("Invalid course id.");
    const type = ExerciseTypeSchema.parse(payload.type);
    const count = Math.min(Math.max(1, Math.floor(payload.count ?? 3)), 10);
    const course = repository.getCourse(payload.courseId);
    if (!course) throw new Error("Course not found.");
    const extras = await requestAdditionalExercises({
      level: course.level,
      summary: course.summary,
      sentences: course.sentences.slice(0, 6).map((s) => s.english),
      types: [type],
      count
    });
    repository.appendExercises(course.id, extras.map((e) => ({ ...e, type })), payload.replace ? type : undefined);
    return repository.getCourse(course.id);
  });

  ipcMain.handle("course:exportAnki", async (_event, id: unknown) => {
    if (typeof id !== "string") throw new Error("Invalid course id.");
    const course = repository.getCourse(id);
    if (!course) throw new Error("Course not found.");
    const result = await dialog.showSaveDialog(mainWindow ?? undefined!, {
      title: "Export to Anki (TSV)",
      defaultPath: `${safeFilename(course.title)}.anki.txt`,
      filters: [{ name: "Anki / TSV", extensions: ["txt"] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, cancelled: true };
    writeFileSync(result.filePath, toAnkiTsv(course), "utf8");
    return { ok: true, path: result.filePath };
  });

  ipcMain.handle("course:exportMarkdown", async (_event, id: unknown) => {
    if (typeof id !== "string") throw new Error("Invalid course id.");
    const course = repository.getCourse(id);
    if (!course) throw new Error("Course not found.");
    const result = await dialog.showSaveDialog(mainWindow ?? undefined!, {
      title: "Export to Markdown",
      defaultPath: `${safeFilename(course.title)}.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, cancelled: true };
    writeFileSync(result.filePath, toMarkdown(course), "utf8");
    return { ok: true, path: result.filePath };
  });

  ipcMain.handle("vocabulary:list", (_event, input: unknown) => {
    const query =
      typeof input === "object" && input !== null && "query" in input && typeof input.query === "string"
        ? input.query
        : undefined;
    const bookmarkedOnly =
      typeof input === "object" && input !== null && "bookmarkedOnly" in input
        ? Boolean(input.bookmarkedOnly)
        : undefined;
    return repository.listVocabulary({ query, bookmarkedOnly });
  });
  ipcMain.handle("vocabulary:setBookmarked", (_event, id: unknown, value: unknown) => {
    if (typeof id !== "string") throw new Error("Invalid vocabulary id.");
    repository.setVocabularyBookmarked(id, Boolean(value));
    return { ok: true };
  });
  ipcMain.handle("vocabulary:deepen", async (_event, id: unknown) => {
    if (typeof id !== "string") throw new Error("Invalid vocabulary id.");
    const word = repository.getVocabulary(id);
    if (!word) throw new Error("Vocabulary not found.");
    const enrichment = await deepenVocabulary(word);
    repository.mergeVocabularyEnrichment(id, enrichment);
    return repository.getVocabulary(id);
  });

  ipcMain.handle("sentence:simplify", async (_event, raw: unknown) => {
    const payload = raw as { sentenceId?: string; targetLevel?: string };
    if (!payload || typeof payload.sentenceId !== "string") throw new Error("Invalid sentence id.");
    const targetLevel = CourseLevelSchema.parse(payload.targetLevel);
    const sentence = repository.getSentence(payload.sentenceId);
    if (!sentence) throw new Error("Sentence not found.");
    const result = await simplifySentence(sentence, targetLevel);
    repository.setSentenceSimplified(payload.sentenceId, result.simplifiedEnglish);
    return result;
  });

  ipcMain.handle("sentence:explain", async (_event, raw: unknown) => {
    const payload = raw as { sentenceId?: string; question?: string };
    if (!payload || typeof payload.sentenceId !== "string") throw new Error("Invalid sentence id.");
    const question = typeof payload.question === "string" ? payload.question.trim() : "";
    if (!question) throw new Error("Question is required.");
    const sentence = repository.getSentence(payload.sentenceId);
    if (!sentence) throw new Error("Sentence not found.");
    const course = repository.getCourse(sentence.courseId);
    return explainSentence(sentence, course?.summary ?? "", question);
  });

  ipcMain.handle("review:due", () => repository.listDueReviews(new Date().toISOString()));
  ipcMain.handle("review:grade", (_event, raw: unknown) => {
    const payload = raw as { vocabularyId?: string; grade?: string };
    if (!payload || typeof payload.vocabularyId !== "string") throw new Error("Invalid vocabulary id.");
    const grade = ReviewGradeSchema.parse(payload.grade);
    const now = new Date();
    const prev = repository.getReview(payload.vocabularyId) ?? {
      vocabularyId: payload.vocabularyId,
      ...DEFAULT_STATE,
      dueAt: now.toISOString(),
      lastReviewedAt: null
    };
    const nextSrs = applyGrade(prev, grade);
    repository.upsertReview({
      vocabularyId: payload.vocabularyId,
      easeFactor: nextSrs.easeFactor,
      intervalDays: nextSrs.intervalDays,
      dueAt: nextDueIso(now, nextSrs.intervalDays),
      lastReviewedAt: now.toISOString(),
      streak: nextSrs.streak,
      repetitions: nextSrs.repetitions
    });
    return { ok: true };
  });
  ipcMain.handle("review:stats", (): ReviewStats => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const stats = repository.reviewStats(now.toISOString(), startOfToday.toISOString());
    const days = repository.reviewedDaysDesc();
    const today = now.toISOString().slice(0, 10);
    return {
      dueCount: stats.dueCount,
      reviewedToday: stats.reviewedToday,
      streakDays: streakFromDays(days, today)
    };
  });
}

function safeFilename(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80) || "course";
}

app.whenReady().then(() => {
  app.on("browser-window-created", (_, window) => {
    window.webContents.on("before-input-event", (event, input) => {
      if (input.control && input.key.toLowerCase() === "r") {
        event.preventDefault();
        window.webContents.reloadIgnoringCache();
      }
    });
  });

  app.setAppUserModelId("com.newsenglishcourse.app");
  repository = new CourseRepository(createDatabase());
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
