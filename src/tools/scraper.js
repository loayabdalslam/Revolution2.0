import { tool } from "@langchain/core/tools";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import chalk from "chalk";

export const scrapeUrl = tool(
  async (url) => {
    console.log(chalk.cyan(`[TOOL scrape_url] Fetching and scraping: ${url}`));
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}: ${res.status}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // Get visible text and compress whitespace
    const text = $("body")
      .text()
      .replace(/\s+/g, " ")
      .trim();

    const snippet = text.slice(0, 4000) || "No text content found.";
    console.log(
      chalk.gray(
        `[TOOL scrape_url] Text preview: ${snippet.slice(0, 160).replace(/\s+/g, " ")}...`,
      ),
    );

    // Limit length so the tool output is manageable
    return snippet;
  },
  {
    name: "scrape_url",
    description:
      "Fetch a web page and return the cleaned visible text content for analysis.",
  }
);
