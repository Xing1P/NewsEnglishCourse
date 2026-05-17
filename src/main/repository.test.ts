import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase, type AppDatabase } from "./database";
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
});
