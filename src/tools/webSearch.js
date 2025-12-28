import { tool } from "@langchain/core/tools";
import fetch from "node-fetch";
import chalk from "chalk";

// DuckDuckGo search tool (using DuckDuckGo instant answer API for better results)
export const duckDuckGoSearch = tool(
  async (query) => {
    console.log(chalk.cyan(`[TOOL duckduckgo_search] Searching DuckDuckGo for: "${query}"`));
    try {
      // Use DuckDuckGo instant answer API (more reliable than scraping)
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (!res.ok) {
        throw new Error(`DuckDuckGo API error: ${res.status}`);
      }
      
      const data = await res.json();
      const results = [];
      
      // Extract abstract information
      if (data.AbstractText) {
        results.push(`Summary: ${data.AbstractText}`);
        if (data.AbstractSource) {
          results.push(`Source: ${data.AbstractSource}`);
        }
      }
      
      // Extract related topics
      if (data.RelatedTopics && data.RelatedTopics.length > 0) {
        const related = data.RelatedTopics
          .slice(0, 3)
          .filter(topic => topic.Text && !topic.Text.startsWith('Related:'))
          .map(topic => {
            const cleanText = topic.Text.replace(/^[\w\s-]+\s-\s/, '');
            return `• ${cleanText}`;
          })
          .filter(Boolean);
        
        if (related.length > 0) {
          results.push(`Related information:\n${related.join('\n')}`);
        }
      }
      
      // Extract results if available
      if (data.Results && data.Results.length > 0) {
        const searchResults = data.Results
          .slice(0, 3)
          .map(result => `• ${result.Text} - ${result.FirstURL}`)
          .join('\n');
        results.push(`Search results:\n${searchResults}`);
      }
      
      if (results.length === 0) {
        // Try a fallback search using instant answer API
        const fallbackUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&pretty=1`;
        const fallbackRes = await fetch(fallbackUrl);
        
        if (fallbackRes.ok) {
          return `DuckDuckGo search for "${query}" was processed but no detailed information was found. The person or topic may not be widely documented in DuckDuckGo's database.`;
        }
        
        return `DuckDuckGo search for "${query}" found no results.`;
      }
      
      const resultText = `DuckDuckGo Search Results for "${query}":\n\n${results.join('\n\n')}`;
      console.log(chalk.gray(`[TOOL duckduckgo_search] Search completed successfully`));
      return resultText;
      
    } catch (error) {
      console.log(chalk.yellow(`[TOOL duckduckgo_search] Error: ${error.message}`));
      return `DuckDuckGo search failed for "${query}": ${error.message}`;
    }
  },
  {
    name: "duckduckgo_search",
    description: "Search DuckDuckGo for current information about any topic. Useful for finding recent news, current events, and general web content.",
  }
);

// Wikipedia search tool (custom implementation)
export const wikipediaQuery = tool(
  async (query) => {
    console.log(chalk.cyan(`[TOOL wikipedia_search] Searching Wikipedia for: "${query}"`));
    try {
      // First try to get summary directly
      const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
      const res = await fetch(summaryUrl);
      
      if (res.ok) {
        const data = await res.json();
        const result = `Wikipedia Results for "${query}":\n\n${data.extract || 'No summary available'}\n\nFull article: ${data.content_urls?.desktop?.page || 'N/A'}`;
        console.log(chalk.gray(`[TOOL wikipedia_search] Found direct Wikipedia page`));
        return result;
      }
      
      // If direct page not found, search for it
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=&srlimit=3`;
      const searchRes = await fetch(searchUrl);
      
      if (!searchRes.ok) {
        throw new Error(`Wikipedia search error: ${searchRes.status}`);
      }
      
      const searchData = await searchRes.json();
      const searchResults = searchData.query?.search || [];
      
      if (searchResults.length === 0) {
        return `Wikipedia search for "${query}" found no results.`;
      }
      
      const results = searchResults.map(item => 
        `• ${item.title}: ${item.snippet.replace(/<[^>]*>/g, '')}`
      ).join('\n');
      
      const resultText = `Wikipedia Search Results for "${query}":\n\n${results}`;
      console.log(chalk.gray(`[TOOL wikipedia_search] Found ${searchResults.length} search results`));
      return resultText;
      
    } catch (error) {
      console.log(chalk.yellow(`[TOOL wikipedia_search] Error: ${error.message}`));
      return `Wikipedia search failed for "${query}": ${error.message}`;
    }
  },
  {
    name: "wikipedia_search",
    description: "Search Wikipedia for encyclopedic information about topics, people, places, and concepts. Provides detailed, well-sourced information.",
  }
);

// Comprehensive web search tool that tries both sources
export const webSearch = tool(
  async (query) => {
    console.log(chalk.cyan(`[TOOL web_search] Comprehensive search for: "${query}"`));
    
    const results = [];
    
    // Try DuckDuckGo first
    try {
      const ddgResult = await duckDuckGoSearch.invoke(query);
      results.push(ddgResult);
    } catch (err) {
      console.log(chalk.yellow(`[TOOL web_search] DuckDuckGo failed: ${err.message}`));
    }

    // Then try Wikipedia
    try {
      const wikiResult = await wikipediaQuery.invoke(query);
      results.push(wikiResult);
    } catch (err) {
      console.log(chalk.yellow(`[TOOL web_search] Wikipedia failed: ${err.message}`));
    }

    if (results.length === 0) {
      return `I searched for "${query}" but couldn't find information from available sources.`;
    }

    const summary = results.join('\n\n---\n\n');
    console.log(chalk.gray(`[TOOL web_search] Combined search completed for: ${query}`));
    return summary;
  },
  {
    name: "web_search",
    description: "Search multiple sources (DuckDuckGo and Wikipedia) for comprehensive information about any topic.",
  }
);

async function searchDuckDuckGo(query) {
  const url =
    "https://api.duckduckgo.com/?q=" +
    encodeURIComponent(query) +
    "&format=json&no_redirect=1&no_html=1&skip_disambig=1";

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  
  if (!res.ok) {
    throw new Error(`DuckDuckGo API error ${res.status}`);
  }

  const data = await res.json();

  const parts = [];
  
  // Add abstract if available
  if (data.AbstractText) {
    parts.push(data.AbstractText);
    if (data.AbstractSource) {
      parts.push(`Source: ${data.AbstractSource}`);
    }
  }

  // Add related topics
  if (Array.isArray(data.RelatedTopics) && data.RelatedTopics.length > 0) {
    const related = data.RelatedTopics
      .slice(0, 5)
      .map((t) => {
        if (t.Text) {
          const cleanText = t.Text.replace(/^[\w\s-]+\s-\s/, '');
          return `• ${cleanText}`;
        }
        return null;
      })
      .filter(Boolean);
    
    if (related.length) {
      parts.push("\nRelated information:\n" + related.join("\n"));
    }
  }

  // Add official results
  if (data.Results && data.Results.length > 0) {
    const official = data.Results
      .slice(0, 3)
      .map(r => `• ${r.Text} (${r.FirstURL})`)
      .join("\n");
    parts.push("\nOfficial sources:\n" + official);
  }

  if (!parts.length) {
    return null;
  }

  const summary = parts.join("\n\n");
  console.log(
    chalk.gray(
      `[TOOL web_search] DuckDuckGo result: ${summary.slice(0, 160).replace(/\s+/g, " ")}...`,
    ),
  );
  return summary;
}

async function searchWikipedia(query) {
  // First, search for the page
  const searchUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
  
  const res = await fetch(searchUrl, {
    headers: {
      'User-Agent': 'Revulation-AI/2.0'
    }
  });

  if (!res.ok) {
    // Try alternative search
    const searchQuery = await searchWikipediaTitles(query);
    if (searchQuery) {
      return searchQuery;
    }
    throw new Error(`Wikipedia API error ${res.status}`);
  }

  const data = await res.json();
  
  const parts = [];
  
  if (data.extract) {
    parts.push(data.extract);
  }
  
  if (data.description) {
    parts.push(`Description: ${data.description}`);
  }
  
  if (data.content_urls && data.content_urls.desktop) {
    parts.push(`Full article: ${data.content_urls.desktop.page}`);
  }

  return parts.join("\n\n");
}

async function searchWikipediaTitles(query) {
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=&srlimit=3`;
  
  const res = await fetch(searchUrl);
  
  if (!res.ok) {
    throw new Error(`Wikipedia search API error ${res.status}`);
  }

  const data = await res.json();
  
  if (data.query && data.query.search && data.query.search.length > 0) {
    const results = data.query.search.map(item => 
      `• ${item.title}: ${item.snippet.replace(/<[^>]*>/g, '')}`
    ).join("\n");
    
    return `Wikipedia search results for "${query}":\n\n${results}`;
  }
  
  return null;
}
