import { describe, expect, it } from "vitest";
import { toAnkiTsv, toMarkdown } from "./export";
import type { StoredCourse } from "../shared/schemas";

const course: StoredCourse = {
  id: "c1",
  title: "Markets",
  sourceType: "text",
  sourceUrl: null,
  sourceTextPreview: "preview",
  level: "B1-B2",
  summary: "Markets summary.",
  createdAt: "2026-05-17T00:00:00Z",
  updatedAt: "2026-05-17T00:00:00Z",
  vocabularyCount: 1,
  articleTitle: "Markets",
  originalText: "...",
  simplifiedSummary: "Markets changed.",
  keyIdeas: ["Idea 1"],
  grammarFocus: "Past simple",
  tenseOverview: "Past simple",
  sentences: [
    {
      id: "s1",
      courseId: "c1",
      order: 0,
      english: "Markets moved.",
      khmer: "ទីផ្សារបានផ្លាស់ទី។",
      tense: "Past simple",
      grammarExplanationKm: "ប្រើ past simple",
      vocabulary: [
        {
          id: "v1",
          courseId: "c1",
          sentenceId: "s1",
          courseTitle: "Markets",
          word: "market",
          partOfSpeech: "noun",
          khmer: "ទីផ្សារ",
          definitionEn: "a place for buying",
          exampleEn: "The market opened.",
          exampleKm: "ទីផ្សារបានបើក។",
          isBookmarked: true,
          createdAt: "2026-05-17T00:00:00Z",
          ipa: "/ˈmɑːrkɪt/"
        }
      ]
    }
  ],
  exercises: [
    {
      id: "e1",
      courseId: "c1",
      type: "matching",
      prompt: "Match the words.",
      choices: [],
      answer: "see pairs",
      explanationKm: "ផ្គូផ្គង",
      pairs: [{ left: "market", right: "place for buying" }]
    }
  ]
};

describe("toAnkiTsv", () => {
  it("produces tab-separated front/back lines", () => {
    const tsv = toAnkiTsv(course);
    expect(tsv).toContain("market\t");
    expect(tsv).toContain("ទីផ្សារ");
    expect(tsv).toContain("/ˈmɑːrkɪt/");
    // exactly one line per vocab item, two fields
    expect(tsv.split("\n")).toHaveLength(1);
    expect(tsv.split("\t")).toHaveLength(2);
  });
});

describe("toMarkdown", () => {
  it("includes title, sentence, vocabulary table, and matching pairs", () => {
    const md = toMarkdown(course);
    expect(md).toContain("# Markets");
    expect(md).toContain("Markets moved.");
    expect(md).toContain("| Word | POS | Khmer | Definition |");
    expect(md).toContain("market → place for buying");
  });
});
