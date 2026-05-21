import type * as cheerio from "cheerio";
import type { ArticleExtraction } from "../../shared/schemas";

export type { ArticleExtraction };

export interface SiteCrawler {
  name: string;
  matches(url: URL): boolean;
  extract($: cheerio.CheerioAPI, url: URL): ArticleExtraction | null;
}
