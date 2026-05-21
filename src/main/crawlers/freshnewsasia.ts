import type * as cheerio from "cheerio";
import { dedupeParagraphs, MIN_ARTICLE_CHARS } from "./generic";
import type { ArticleExtraction, SiteCrawler } from "./types";

export const freshnewsasiaCrawler: SiteCrawler = {
  name: "freshnewsasia",
  matches(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    return host === "freshnewsasia.com" || host.endsWith(".freshnewsasia.com");
  },
  extract($: cheerio.CheerioAPI): ArticleExtraction | null {
    const title =
      $("meta[property='og:title']").attr("content")?.trim() ||
      $("h2[itemprop='headline']").text().replace(/\s+/g, " ").trim() ||
      $("h1").first().text().trim() ||
      $("title").text().trim() ||
      "News article";

    const body = $("div[itemprop='articleBody']").first();
    if (!body.length) return null;

    const paragraphs = body
      .find("p")
      .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
      .get()
      .filter((p) => p.length > 20);

    const dedup = dedupeParagraphs(paragraphs.join("\n\n"));
    if (dedup.length < MIN_ARTICLE_CHARS) return null;

    return { title, text: dedup };
  }
};
