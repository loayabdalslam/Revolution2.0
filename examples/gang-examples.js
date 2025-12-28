import { createMember, createWorkflow, createSquad } from "./src/workflows/gangEngine.js";

// Research Gang Example
// This gang demonstrates a simple research and writing workflow
export const researchGang = {
  name: "research-gang",
  version: 1,
  
  llm: {
    model: "GLM-4.5-Flash",
    temperature: 0.4
  },
  
  members: [
    createMember("researcher", "Research specialist who finds and analyzes information using web search and scraping", [
      "web_search", 
      "scrape_url"
    ], "shared"),
    
    createMember("writer", "Content creator who synthesizes research into clear, well-structured output", [], "shared")
  ],
  
  workflow: createWorkflow("researcher", [
    { from: "researcher", to: "writer", when: "data_ready" }
  ]),
  
  observability: {
    enabled: true,
    logLevel: "info",
    markdownReport: { enabled: true }
  },
  
  tests: [
    {
      name: "basic-research",
      input: "Research the latest developments in quantum computing",
      asserts: [
        {
          type: "contains",
          target: "researcher",
          value: "quantum"
        },
        {
          type: "contains",
          target: "writer", 
          value: "research"
        }
      ]
    }
  ]
};

// Complex Example with Squads
export const analysisGang = {
  name: "analysis-gang",
  version: 1,
  
  llm: {
    model: "GLM-4.5-Flash",
    temperature: 0.3
  },
  
  members: [
    createMember("collector", "Data collector who gathers information from various sources", ["web_search", "read_file"], "shared"),
    createMember("analyst", "Data analyst who examines collected information", ["list_directory"], "shared"),
    createMember("reporter", "Report generator who creates structured output", [], "shared"),
    createMember("reviewer", "Quality reviewer who validates outputs", [], "shared")
  ],
  
  squads: [
    createSquad("analysis_squad", ["collector", "analyst"], "parallel"),
    createSquad("production_squad", ["reporter", "reviewer"], "sequential")
  ],
  
  workflow: {
    entry: "analysis_squad",
    steps: [
      { from: "analysis_squad", to: "production_squad", when: "data_analyzed" },
      { from: "analysis_squad", to: "reviewer", when: "no_data_needed" },
      { from: "production_squad", to: null, when: "always" }
    ]
  },
  
  observability: {
    enabled: true,
    logLevel: "debug",
    markdownReport: { enabled: true, file: "./analysis-gang-report.md" }
  },
  
  tests: [
    {
      name: "complete-workflow",
      input: "Analyze market trends for electric vehicles",
      asserts: [
        {
          type: "contains",
          target: "collector",
          value: "electric"
        },
        {
          type: "contains",
          target: "analyst",
          value: "market"
        },
        {
          type: "contains",
          target: "reporter",
          value: "analysis"
        }
      ]
    }
  ]
};