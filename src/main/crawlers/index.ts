import * as cheerio from "cheerio";
import { fetchHtml } from "./fetchHtml";
import { freshnewsasiaCrawler } from "./freshnewsasia";
import { genericCrawler } from "./generic";
import type { ArticleExtraction, SiteCrawler } from "./types";

export type { ArticleExtraction, SiteCrawler } from "./types";

const crawlers: SiteCrawler[] = [freshnewsasiaCrawler, genericCrawler];

export async function extractArticleFromUrl(rawUrl: string): Promise<ArticleExtraction | null> {
  const url = new URL(rawUrl);
  const html = await fetchHtml(rawUrl);
  const $ = cheerio.load(html);
  $("script, style, nav, footer, aside, form, noscript, iframe, header").remove();

  for (const crawler of crawlers) {
    if (!crawler.matches(url)) continue;
    const result = crawler.extract($, url);
    if (result) return result;
  }
  return null;
}
