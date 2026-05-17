import { contextBridge, ipcRenderer } from "electron";
import type { GenerateCourseInput, VocabularyListInput } from "../shared/schemas";
import type { NewsEnglishApi } from "../shared/ipc";

const api: NewsEnglishApi = {
  course: {
    generate: (input: GenerateCourseInput) => ipcRenderer.invoke("course:generate", input),
    list: () => ipcRenderer.invoke("course:list"),
    get: (id: string) => ipcRenderer.invoke("course:get", id),
    delete: (id: string) => ipcRenderer.invoke("course:delete", id)
  },
  vocabulary: {
    list: (input?: VocabularyListInput) => ipcRenderer.invoke("vocabulary:list", input ?? {}),
    setBookmarked: (id: string, value: boolean) => ipcRenderer.invoke("vocabulary:setBookmarked", id, value)
  },
  system: {
    checkGemini: () => ipcRenderer.invoke("system:checkGemini")
  }
};

contextBridge.exposeInMainWorld("newsEnglish", api);
