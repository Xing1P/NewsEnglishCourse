import * as cheerio from "cheerio";

export type ArticleExtraction = {
  title: string;
  text: string;
};

export async function extractArticleFromUrl(url: string): Promise<ArticleExtraction | null> {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 NewsEnglishCourse/0.1",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9"
    },
    redirect: "follow"
  });
  if (!response.ok) {
    throw new Error(`Article request failed with ${response.status}.`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  $("script, style, nav, footer, aside, form, noscript, iframe, header").remove();

  const title =
    $("meta[property='og:title']").attr("content")?.trim() ||
    $("meta[name='twitter:title']").attr("content")?.trim() ||
    $("h1").first().text().trim() ||
    $("title").text().trim() ||
    "News article";

  const text = extractBestText($) || extractByLargestCluster($) || "";
  const dedup = dedupeParagraphs(text);
  if (dedup.length < 400) {
    return null;
  }
  return { title, text: dedup };
}

function extractBestText($: cheerio.CheerioAPI): string {
  const articleRoot = $("article").first().length ? $("article").first() : $("main").first();
  if (!articleRoot.length) return "";
  const paragraphs = articleRoot
    .find("p")
    .map((_, element) => $(element).text().replace(/\s+/g, " ").trim())
    .get()
    .filter((paragraph) => paragraph.length > 60);
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
    .filter((p) => p.length > 60)
    .join("\n\n")
    .trim();
}

function dedupeParagraphs(text: string): string {
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
