import { describe, expect, it } from "vitest";
import { chunkArticle, parseGeneratedCourse } from "./gemini";

const validCourse = {
  title: "Energy Prices Explained",
  articleTitle: "Energy prices rise",
  summary: "A short summary about energy prices.",
  simplifiedSummary: "Energy prices are higher.",
  keyIdeas: ["Prices increased", "Families may pay more", "Officials are watching"],
  grammarFocus: "Past simple and modal verbs.",
  tenseOverview: "The article mostly uses present simple and past simple.",
  sentences: [
    {
      english: "Energy prices increased this week.",
      khmer: "តម្លៃថាមពលបានកើនឡើងនៅសប្តាហ៍នេះ។",
      tense: "Past simple",
      grammarExplanationKm: "ប្រយោគនេះប្រើ past simple ដើម្បីនិយាយពីសកម្មភាពដែលកើតឡើងរួចហើយ។",
      vocabulary: [
        {
          word: "increase",
          partOfSpeech: "verb",
          khmer: "កើនឡើង",
          definitionEn: "to become larger",
          exampleEn: "The cost increased.",
          exampleKm: "តម្លៃបានកើនឡើង។"
        }
      ]
    }
  ],
  exercises: [
    {
      type: "quiz",
      prompt: "What happened to energy prices?",
      choices: ["They rose", "They disappeared"],
      answer: "They rose",
      explanationKm: "អត្ថបទនិយាយថាតម្លៃបានកើនឡើង។"
    }
  ]
};

describe("parseGeneratedCourse", () => {
  it("parses strict JSON", () => {
    const result = parseGeneratedCourse(JSON.stringify(validCourse));
    expect(result.ok).toBe(true);
  });

  it("extracts JSON from fenced output", () => {
    const result = parseGeneratedCourse(`Here is JSON:\n\`\`\`json\n${JSON.stringify(validCourse)}\n\`\`\``);
    expect(result.ok).toBe(true);
  });

  it("rejects malformed course data", () => {
    const result = parseGeneratedCourse(JSON.stringify({ title: "Missing fields" }));
    expect(result.ok).toBe(false);
  });
});

describe("chunkArticle", () => {
  it("keeps a short article in a single chunk", () => {
    const text = "First sentence here. Second sentence here. Third one too.";
    expect(chunkArticle(text, 4000)).toEqual([text]);
  });

  it("packs sentences greedily and starts a new chunk before exceeding maxChars", () => {
    const sentence = `${"word ".repeat(8).trim()}.`; // 41 chars incl. period
    const article = Array.from({ length: 6 }, () => sentence).join(" ");
    const chunks = chunkArticle(article, 90);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(90);
    }
    // No content lost: rejoining yields the same sentences.
    expect(chunks.join(" ")).toBe(article);
  });

  it("puts an oversized single sentence in its own chunk", () => {
    const huge = `${"verylongtoken ".repeat(20).trim()}.`;
    const article = `Short start. ${huge} Short end.`;
    const chunks = chunkArticle(article, 100);
    expect(chunks).toContain(huge);
  });

  it("returns an empty array for blank input", () => {
    expect(chunkArticle("   ", 4000)).toEqual([]);
  });
});

