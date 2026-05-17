import type { StoredCourse } from "../shared/schemas";

export function toAnkiTsv(course: StoredCourse): string {
  const lines: string[] = [];
  for (const sentence of course.sentences) {
    for (const v of sentence.vocabulary) {
      const front = v.word;
      const backParts = [
        v.khmer,
        `(${v.partOfSpeech}) ${v.definitionEn}`,
        `e.g. ${v.exampleEn} — ${v.exampleKm}`
      ];
      if (v.ipa) backParts.unshift(v.ipa);
      const back = backParts.join("<br>");
      lines.push(`${escape(front)}\t${escape(back)}`);
    }
  }
  return lines.join("\n");
}

export function toMarkdown(course: StoredCourse): string {
  const out: string[] = [];
  out.push(`# ${course.title}`);
  out.push("");
  out.push(`_${course.level} · ${new Date(course.createdAt).toLocaleDateString()}_`);
  out.push("");
  out.push(`**Article:** ${course.articleTitle}`);
  if (course.sourceUrl) out.push(`**Source:** ${course.sourceUrl}`);
  out.push("");
  out.push("## Summary");
  out.push(course.summary);
  out.push("");
  if (course.simplifiedSummary) {
    out.push("### Simplified summary");
    out.push(course.simplifiedSummary);
    out.push("");
  }
  if (course.keyIdeas.length) {
    out.push("## Key ideas");
    for (const idea of course.keyIdeas) out.push(`- ${idea}`);
    out.push("");
  }
  out.push("## Grammar focus");
  out.push(course.grammarFocus);
  out.push("");
  out.push("## Tense overview");
  out.push(course.tenseOverview);
  out.push("");
  out.push("## Sentences");
  course.sentences.forEach((s, i) => {
    out.push(`### ${i + 1}. ${s.english}`);
    if (s.simplifiedEnglish) out.push(`> Simplified: ${s.simplifiedEnglish}`);
    if (s.pronunciationIpa) out.push(`> Pronunciation: ${s.pronunciationIpa}`);
    out.push(`_${s.khmer}_`);
    out.push(`**Tense:** ${s.tense}${s.register ? ` · ${s.register}` : ""}${s.difficulty ? ` · ${s.difficulty}` : ""}`);
    out.push(`*${s.grammarExplanationKm}*`);
    if (s.collocations?.length) out.push(`**Collocations:** ${s.collocations.join(", ")}`);
    if (s.phrasalVerbs?.length) {
      out.push("**Phrasal verbs:**");
      for (const p of s.phrasalVerbs) out.push(`- ${p.phrase} — ${p.meaningEn} (${p.khmer})`);
    }
    if (s.idioms?.length) {
      out.push("**Idioms:**");
      for (const idiom of s.idioms) out.push(`- ${idiom.phrase} — ${idiom.meaningEn} (${idiom.khmer})`);
    }
    if (s.vocabulary.length) {
      out.push("");
      out.push("| Word | POS | Khmer | Definition |");
      out.push("|------|-----|-------|------------|");
      for (const v of s.vocabulary) {
        out.push(`| ${v.word}${v.ipa ? ` ${v.ipa}` : ""} | ${v.partOfSpeech} | ${v.khmer} | ${v.definitionEn} |`);
      }
    }
    out.push("");
  });
  if (course.exercises.length) {
    out.push("## Exercises");
    course.exercises.forEach((e, i) => {
      out.push(`### ${i + 1}. (${e.type}) ${e.prompt}`);
      if (e.choices.length) {
        for (const choice of e.choices) out.push(`- ${choice === e.answer ? "**" : ""}${choice}${choice === e.answer ? "**" : ""}`);
      }
      if (e.pairs?.length) {
        for (const pair of e.pairs) out.push(`- ${pair.left} → ${pair.right}`);
      }
      if (e.items?.length) {
        out.push(`Items: ${e.items.join(" / ")}`);
      }
      out.push(`**Answer:** ${e.answer}`);
      out.push(`*${e.explanationKm}*`);
      out.push("");
    });
  }
  if (course.discussionQuestions?.length) {
    out.push("## Discussion");
    for (const q of course.discussionQuestions) out.push(`- ${q}`);
    out.push("");
  }
  if (course.writingPrompt) {
    out.push("## Writing prompt");
    out.push(course.writingPrompt);
    out.push("");
  }
  return out.join("\n");
}

function escape(value: string): string {
  return value.replace(/\t/g, " ").replace(/\r?\n/g, " ");
}
