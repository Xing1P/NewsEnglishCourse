import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { NewsEnglishApi } from "../../shared/ipc";
import type { StoredCourse } from "../../shared/schemas";

const storedCourse: StoredCourse = {
  id: "course-1",
  title: "Climate Course",
  sourceType: "text",
  sourceUrl: null,
  sourceTextPreview: "Climate article",
  level: "B1-B2",
  summary: "A course about climate news.",
  createdAt: new Date("2026-05-17T00:00:00Z").toISOString(),
  updatedAt: new Date("2026-05-17T00:00:00Z").toISOString(),
  vocabularyCount: 1,
  articleTitle: "Climate news",
  originalText: "Climate changed policy discussions.",
  simplifiedSummary: "Leaders talked about climate.",
  keyIdeas: ["Leaders talked", "Climate policy changed"],
  grammarFocus: "Past simple",
  tenseOverview: "Mostly past simple",
  sentences: [
    {
      id: "sentence-1",
      courseId: "course-1",
      order: 0,
      english: "Leaders discussed climate policy.",
      khmer: "មេដឹកនាំបានពិភាក្សាអំពីគោលនយោបាយអាកាសធាតុ។",
      tense: "Past simple",
      grammarExplanationKm: "ប្រើ past simple សម្រាប់សកម្មភាពដែលបានកើតឡើង។",
      vocabulary: [
        {
          id: "word-1",
          courseId: "course-1",
          sentenceId: "sentence-1",
          courseTitle: "Climate Course",
          word: "policy",
          partOfSpeech: "noun",
          khmer: "គោលនយោបាយ",
          definitionEn: "a plan or rule",
          exampleEn: "The policy changed.",
          exampleKm: "គោលនយោបាយបានផ្លាស់ប្តូរ។",
          isBookmarked: true,
          createdAt: new Date("2026-05-17T00:00:00Z").toISOString()
        }
      ]
    }
  ],
  exercises: [
    {
      id: "exercise-1",
      courseId: "course-1",
      type: "quiz",
      prompt: "What did leaders discuss?",
      choices: ["Climate policy", "Sports"],
      answer: "Climate policy",
      explanationKm: "អត្ថបទនិយាយអំពីគោលនយោបាយអាកាសធាតុ។"
    }
  ]
};

function mockApi(overrides: Partial<NewsEnglishApi> = {}): void {
  window.newsEnglish = {
    course: {
      generate: vi.fn().mockResolvedValue(storedCourse),
      list: vi.fn().mockResolvedValue([storedCourse]),
      get: vi.fn().mockResolvedValue(storedCourse),
      delete: vi.fn().mockResolvedValue({ ok: true }),
      regenerateExercises: vi.fn().mockResolvedValue(storedCourse),
      exportAnki: vi.fn().mockResolvedValue({ ok: true, path: "/tmp/x.txt" }),
      exportMarkdown: vi.fn().mockResolvedValue({ ok: true, path: "/tmp/x.md" })
    },
    vocabulary: {
      list: vi.fn().mockResolvedValue(storedCourse.sentences[0].vocabulary),
      setBookmarked: vi.fn().mockResolvedValue({ ok: true }),
      deepen: vi.fn().mockResolvedValue(storedCourse.sentences[0].vocabulary[0])
    },
    sentence: {
      simplify: vi.fn().mockResolvedValue({ simplifiedEnglish: "Leaders talked.", khmer: "មេដឹកនាំបាននិយាយ។" }),
      explain: vi.fn().mockResolvedValue({ answerEn: "ok", answerKm: "ok" })
    },
    review: {
      due: vi.fn().mockResolvedValue([]),
      grade: vi.fn().mockResolvedValue({ ok: true }),
      stats: vi.fn().mockResolvedValue({ dueCount: 0, reviewedToday: 0, streakDays: 0 })
    },
    system: {
      checkGemini: vi.fn().mockResolvedValue({ installed: true, path: "gemini", version: "1.0.0", error: null })
    },
    ...overrides
  } as NewsEnglishApi;
}

beforeEach(() => {
  mockApi();
});

describe("App", () => {
  it("renders the home generator", async () => {
    render(<App />);
    expect(await screen.findByText("Course Generator")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate/i })).toBeDisabled();
    expect(screen.getByTestId("app-shell")).toHaveClass("h-screen", "overflow-hidden");
    expect(screen.getByTestId("content-scroll")).toHaveClass("h-screen", "overflow-y-auto");
  });

  it("generates a course from text", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText(/news article or url/i), "This is a long enough article about a policy update.");
    await user.click(screen.getByRole("button", { name: /^generate$/i }));

    await waitFor(() => expect(window.newsEnglish.course.generate).toHaveBeenCalled());
    expect(await screen.findByText("Sentence study")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Vocabulary" })).toBeInTheDocument();
    expect(screen.getAllByText("policy").length).toBeGreaterThan(0);
    expect(screen.getAllByText("គោលនយោបាយ").length).toBeGreaterThan(0);
    expect(screen.getByText("a plan or rule")).toBeInTheDocument();
    expect(screen.getByText("The policy changed.")).toBeInTheDocument();
    expect(screen.getByText("គោលនយោបាយបានផ្លាស់ប្តូរ។")).toBeInTheDocument();
  });

  it("jumps from course vocabulary to its source sentence", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText(/news article or url/i), "This is a long enough article about a policy update.");
    await user.click(screen.getByRole("button", { name: /^generate$/i }));

    await screen.findByRole("heading", { name: "Vocabulary" });
    await user.click(screen.getByRole("button", { name: /Sentence 1/i }));

    expect(document.getElementById("sentence-sentence-1")).toHaveClass("bg-gold/10");
  });

  it("opens vocabulary and links back to the source course", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Vocabulary" }));
    expect(await screen.findByText("policy")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Climate Course/i }));

    expect(await screen.findByText("Sentence study")).toBeInTheDocument();
  });
});
