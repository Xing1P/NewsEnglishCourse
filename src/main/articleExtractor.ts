import * as cheerio from "cheerio";

export type ArticleExtraction = {
  title: string;
  text: string;
};

export async function extractArticleFromUrl(url: string): Promise<ArticleExtraction | null> {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 NewsEnglishCourse/0.1"
    },
    redirect: "follow"
  });
  if (!response.ok) {
    throw new Error(`Article request failed with ${response.status}.`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  $("script, style, nav, footer, aside, form, noscript").remove();

  const title =
    $("meta[property='og:title']").attr("content")?.trim() ||
    $("h1").first().text().trim() ||
    $("title").text().trim() ||
    "News article";
  const articleRoot = $("article").first().length ? $("article").first() : $("main").first();
  const root = articleRoot.length ? articleRoot : $("body");
  const paragraphs = root
    .find("p")
    .map((_, element) => $(element).text().replace(/\s+/g, " ").trim())
    .get()
    .filter((paragraph) => paragraph.length > 60);
  const text = paragraphs.join("\n\n").trim();

  if (text.length < 400) {
    return null;
  }
  return { title, text };
}

