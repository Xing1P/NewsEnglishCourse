import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";
import { freshnewsasiaCrawler } from "./freshnewsasia";

const fixturePath = join(__dirname, "__fixtures__", "freshnewsasia-sample.html");
const sampleHtml = readFileSync(fixturePath, "utf-8");
const sampleUrl = new URL(
  "https://en.freshnewsasia.com/index.php/en/internationalnews/69984-2026-05-21-09-01-25.html"
);

describe("freshnewsasiaCrawler.matches", () => {
  it("matches en.freshnewsasia.com", () => {
    expect(freshnewsasiaCrawler.matches(new URL("https://en.freshnewsasia.com/foo"))).toBe(true);
  });

  it("matches apex freshnewsasia.com", () => {
    expect(freshnewsasiaCrawler.matches(new URL("https://freshnewsasia.com/bar"))).toBe(true);
  });

  it("does not match other hosts", () => {
    expect(freshnewsasiaCrawler.matches(new URL("https://cnn.com/article"))).toBe(false);
    expect(freshnewsasiaCrawler.matches(new URL("https://notfreshnewsasia.com/x"))).toBe(false);
  });
});

describe("freshnewsasiaCrawler.extract", () => {
  it("extracts title and article body from the sample fixture", () => {
    const $ = cheerio.load(sampleHtml);
    const result = freshnewsasiaCrawler.extract($, sampleUrl);
    expect(result).not.toBeNull();
    expect(result!.title).toBe(
      "Sri Lanka launches digital seed certification, traceability system"
    );
    expect(result!.text).toContain("COLOMBO, May 20 (Xinhua):");
    expect(result!.text).toContain("Sri Lanka has launched");
    expect(result!.text.length).toBeGreaterThanOrEqual(400);
  });

  it("returns null when articleBody is missing", () => {
    const $ = cheerio.load("<html><body><h1>Empty</h1></body></html>");
    expect(freshnewsasiaCrawler.extract($, sampleUrl)).toBeNull();
  });

  it("returns null when articleBody is too short", () => {
    const $ = cheerio.load(
      `<html><body><div itemprop="articleBody"><p>Short paragraph here.</p></div></body></html>`
    );
    expect(freshnewsasiaCrawler.extract($, sampleUrl)).toBeNull();
  });
});
