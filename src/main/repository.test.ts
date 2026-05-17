import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase, migrate, type AppDatabase } from "./database";
import { CourseRepository } from "./repository";
import type { GeneratedCourse } from "../shared/schemas";

let folder: string | null = null;
let db: AppDatabase | null = null;

afterEach(() => {
  db?.close();
  db = null;
  if (folder) {
    rmSync(folder, { recursive: true, force: true });
    folder = null;
  }
});

function createRepo(): CourseRepository {
  folder = mkdtempSync(join(tmpdir(), "news-english-test-"));
  db = createDatabase(join(folder, "test.db"));
  return new CourseRepository(db);
}

const generated: GeneratedCourse = {
  title: "Market Course",
  articleTitle: "Markets move",
  summary: "Markets moved after a policy speech.",
  simplifiedSummary: "Markets changed after leaders spoke.",
  keyIdeas: ["Markets moved", "Leaders spoke", "Investors reacted"],
  grammarFocus: "Past simple verbs.",
  tenseOverview: "Mostly past simple.",
  sentences: [
    {
      english: "Markets moved quickly.",
      khmer: "ទីផ្សារបានផ្លាស់ទីយ៉ាងលឿន។",
      tense: "Past simple",
      grammarExplanationKm: "ប្រើ past simple ព្រោះសកម្មភាពកើតឡើងរួច។",
      vocabulary: [
        {
          word: "market",
          partOfSpeech: "noun",
          khmer: "ទីផ្សារ",
          definitionEn: "a place or system for buying and selling",
          exampleEn: "The market opened early.",
          exampleKm: "ទីផ្សារបានបើកពីព្រឹក។"
        }
      ]
    }
  ],
  exercises: [
    {
      type: "cloze",
      prompt: "Markets ____ quickly.",
      choices: ["moved", "move"],
      answer: "moved",
      explanationKm: "ត្រូវប្រើ past simple។"
    }
  ]
};

describe("CourseRepository", () => {
  it("saves and loads generated courses with vocabulary links", () => {
    const repo = createRepo();
    const course = repo.saveGeneratedCourse({ text: "Markets moved quickly.", level: "B1-B2" }, "Markets moved quickly.", generated);

    expect(repo.listCourses()).toHaveLength(1);
    expect(course.sentences[0].vocabulary[0].courseId).toBe(course.id);
    expect(course.exercises[0].answer).toBe("moved");
  });

  it("filters and toggles bookmarked vocabulary", () => {
    const repo = createRepo();
    const course = repo.saveGeneratedCourse({ text: "Markets moved quickly.", level: "B1-B2" }, "Markets moved quickly.", generated);
    const word = course.sentences[0].vocabulary[0];

    expect(repo.listVocabulary({ bookmarkedOnly: true })).toHaveLength(1);
    repo.setVocabularyBookmarked(word.id, false);
    expect(repo.listVocabulary({ bookmarkedOnly: true })).toHaveLength(0);
  });

  it("round-trips optional rich fields", () => {
    const repo = createRepo();
    const enriched: GeneratedCourse = {
      ...generated,
      discussionQuestions: ["Why?", "How?"],
      writingPrompt: "Write 100 words.",
      sentences: generated.sentences.map((s) => ({
        ...s,
        simplifiedEnglish: "Markets moved fast.",
        difficulty: "medium",
        pronunciationIpa: "/ˈmɑːrkɪts muːvd ˈkwɪkli/",
        collocations: ["market opened"],
        phrasalVerbs: [{ phrase: "pick up", meaningEn: "improve", khmer: "ប្រសើរ" }],
        idioms: [{ phrase: "in the red", meaningEn: "losing money", khmer: "ខាត" }],
        register: "journalistic",
        vocabulary: s.vocabulary.map((v) => ({
          ...v,
          ipa: "/ˈmɑːrkɪt/",
          cefrLevel: "A2",
          synonyms: ["marketplace"],
          antonyms: [],
          frequency: "high" as const,
          collocations: ["stock market"]
        }))
      })),
      exercises: [
        { type: "matching", prompt: "Match", choices: [], answer: "see pairs", explanationKm: "x",
          pairs: [{ left: "market", right: "ទីផ្សារ" }] },
        { type: "reorder", prompt: "Reorder", choices: [], answer: "Markets moved quickly.", explanationKm: "y",
          items: ["Markets", "moved", "quickly."] }
      ]
    };
    const course = repo.saveGeneratedCourse({ text: "x", level: "B1-B2" }, "Markets moved quickly.", enriched);
    const loaded = repo.getCourse(course.id);
    expect(loaded?.discussionQuestions).toEqual(["Why?", "How?"]);
    expect(loaded?.writingPrompt).toBe("Write 100 words.");
    expect(loaded?.sentences[0].pronunciationIpa).toContain("ˈmɑːrkɪts");
    expect(loaded?.sentences[0].phrasalVerbs?.[0].phrase).toBe("pick up");
    expect(loaded?.sentences[0].idioms?.[0].phrase).toBe("in the red");
    expect(loaded?.sentences[0].register).toBe("journalistic");
    expect(loaded?.sentences[0].vocabulary[0].ipa).toBe("/ˈmɑːrkɪt/");
    expect(loaded?.sentences[0].vocabulary[0].synonyms).toEqual(["marketplace"]);
    expect(loaded?.exercises.find((e) => e.type === "matching")?.pairs?.[0].left).toBe("market");
    expect(loaded?.exercises.find((e) => e.type === "reorder")?.items).toHaveLength(3);
  });

  it("migration is idempotent on replay", () => {
    const repo = createRepo();
    const before = db!.pragma("user_version", { simple: true }) as number;
    // Run again — should not throw and version unchanged.
    migrate(db!);
    const after = db!.pragma("user_version", { simple: true }) as number;
    expect(after).toBe(before);
    expect(repo.listCourses()).toHaveLength(0);
  });
});
