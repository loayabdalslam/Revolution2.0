import { tool } from "@langchain/core/tools";
import fetch from "node-fetch";
import chalk from "chalk";

// Free search using DuckDuckGo Instant Answer API.
// This does not require an API key but only returns summary/instant answers,
// not full web result lists.
export const webSearch = tool(
  async (query) => {
    console.log(chalk.cyan(`[TOOL web_search] Searching DuckDuckGo for: "${query}"`));
    const url =
      "https://api.duckduckgo.com/?q=" +
      encodeURIComponent(query) +
      "&format=json&no_redirect=1&no_html=1";

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`DuckDuckGo API error ${res.status}`);
    }

    const data = await res.json();

    const parts = [];
    if (data.AbstractText) {
      parts.push(data.AbstractText);
    }
    if (Array.isArray(data.RelatedTopics)) {
      const related = data.RelatedTopics
        .slice(0, 3)
        .map((t) => (t.Text ? `- ${t.Text}` : null))
        .filter(Boolean);
      if (related.length) {
        parts.push("Related topics:\n" + related.join("\n"));
      }
    }

    if (!parts.length) {
      const msg = `No instant answer, but I looked up: ${query}`;
      console.log(chalk.gray(`[TOOL web_search] ${msg}`));
      return msg;
    }

    const summary = parts.join("\n\n");
    console.log(
      chalk.gray(
        `[TOOL web_search] Result preview: ${summary.slice(0, 160).replace(/\s+/g, " ")}...`,
      ),
    );
    return summary;
  },
  {
    name: "web_search",
    description:
      "Search the web for free via DuckDuckGo Instant Answer API and return a short summary.",
  }
);
