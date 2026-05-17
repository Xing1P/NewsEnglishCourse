import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "node:path";
import log from "electron-log";
import { createDatabase } from "./database";
import { CourseRepository } from "./repository";
import { extractArticleFromUrl } from "./articleExtractor";
import { checkGemini, generateCourseWithGemini } from "./gemini";
import { GenerateCourseInputSchema } from "../shared/schemas";

let mainWindow: Electron.BrowserWindow | null = null;
const db = app.isReady() ? createDatabase() : null;
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
  repository = new CourseRepository(db ?? createDatabase());
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
