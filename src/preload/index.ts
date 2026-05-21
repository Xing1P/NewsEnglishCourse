import { contextBridge, ipcRenderer } from "electron";
import type {
  CourseLevel,
  ExerciseType,
  GenerateCourseInput,
  ReviewGrade,
  VocabularyListInput
} from "../shared/schemas";
import type { NewsEnglishApi } from "../shared/ipc";

const api: NewsEnglishApi = {
  course: {
    generate: (input: GenerateCourseInput) => ipcRenderer.invoke("course:generate", input),
    crawl: (url: string) => ipcRenderer.invoke("course:crawl", url),
    list: () => ipcRenderer.invoke("course:list"),
    get: (id: string) => ipcRenderer.invoke("course:get", id),
    delete: (id: string) => ipcRenderer.invoke("course:delete", id),
    regenerateExercises: (courseId: string, type: ExerciseType, count: number, replace?: boolean) =>
      ipcRenderer.invoke("course:regenerateExercises", { courseId, type, count, replace: Boolean(replace) }),
    exportAnki: (courseId: string) => ipcRenderer.invoke("course:exportAnki", courseId),
    exportMarkdown: (courseId: string) => ipcRenderer.invoke("course:exportMarkdown", courseId)
  },
  vocabulary: {
    list: (input?: VocabularyListInput) => ipcRenderer.invoke("vocabulary:list", input ?? {}),
    setBookmarked: (id: string, value: boolean) => ipcRenderer.invoke("vocabulary:setBookmarked", id, value),
    deepen: (id: string) => ipcRenderer.invoke("vocabulary:deepen", id)
  },
  sentence: {
    simplify: (sentenceId: string, targetLevel: CourseLevel) =>
      ipcRenderer.invoke("sentence:simplify", { sentenceId, targetLevel }),
    explain: (sentenceId: string, question: string) =>
      ipcRenderer.invoke("sentence:explain", { sentenceId, question })
  },
  review: {
    due: () => ipcRenderer.invoke("review:due"),
    grade: (vocabularyId: string, grade: ReviewGrade) =>
      ipcRenderer.invoke("review:grade", { vocabularyId, grade }),
    stats: () => ipcRenderer.invoke("review:stats")
  },
  system: {
    checkGemini: () => ipcRenderer.invoke("system:checkGemini")
  }
};

contextBridge.exposeInMainWorld("newsEnglish", api);
