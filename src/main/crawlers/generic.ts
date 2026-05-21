import type * as cheerio from "cheerio";
import type { ArticleExtraction, SiteCrawler } from "./types";

export const MIN_ARTICLE_CHARS = 400;

export function dedupeParagraphs(text: string): string {
  const seen = new Set<string>();
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => {
      if (!p) return false;
      const key = p.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join("\n\n");
}

function extractBestText($: cheerio.CheerioAPI): string {
  const articleRoot = $("article").first().length ? $("article").first() : $("main").first();
  if (!articleRoot.length) return "";
  const paragraphs = articleRoot
    .find("p")
    .map((_, element) => $(element).text().replace(/\s+/g, " ").trim())
    .get()
    .filter((paragraph) => paragraph.length > 25);
  return paragraphs.join("\n\n").trim();
}

function extractByLargestCluster($: cheerio.CheerioAPI): string {
  let bestEl: unknown = null;
  let bestChars = 0;
  $("div, section").each((_, el) => {
    const chars = $(el)
      .find("> p, > div > p")
      .map((__, p) => $(p).text().trim().length)
      .get()
      .reduce((sum, n) => sum + n, 0);
    if (chars > 600 && chars > bestChars) {
      bestChars = chars;
      bestEl = el;
    }
  });
  if (!bestEl) return "";
  return $(bestEl as never)
    .find("p")
    .map((_, p) => $(p).text().replace(/\s+/g, " ").trim())
    .get()
    .filter((p) => p.length > 25)
    .join("\n\n")
    .trim();
}

export const genericCrawler: SiteCrawler = {
  name: "generic",
  matches: () => true,
  extract($): ArticleExtraction | null {
    const title =
      $("meta[property='og:title']").attr("content")?.trim() ||
      $("meta[name='twitter:title']").attr("content")?.trim() ||
      $("h1").first().text().trim() ||
      $("title").text().trim() ||
      "News article";

    const text = extractBestText($) || extractByLargestCluster($) || "";
    const dedup = dedupeParagraphs(text);
    if (dedup.length < MIN_ARTICLE_CHARS) {
      return null;
    }
    return { title, text: dedup };
  }
};
