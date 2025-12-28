# Revulation CLI 2.0

Revulation is an AI-powered CLI for:

- **Chat** with a GLM / OpenAI-compatible model with credit tracking
- **Agentic tools** (web search, scraping, local file tools)
- **Agentic coding** (design and generate/edit code)
- **Gang workflow framework** (JavaScript-based team orchestration with members, squads, tests, observability)

This README explains how to install, configure, and use all modes, including the new Gang workflow framework.

---

## 1. Installation

### 1.1. Requirements

- Node.js 18+ (for native ESM and the built-in `node:test` framework)
- A GLM-compatible API key in the environment (`GLM_API_KEY`)

### 1.2. Install dependencies

From the project root:

```bash
npm install
```

### 1.3. Add your API key

Create a `.env` file in the project root:

```bash
GLM_API_KEY=your_api_key_here
GLM_API_BASE=https://api.z.ai/api/paas/v4/
```

`GLM_API_BASE` is optional and defaults to the GLM endpoint shown above.

---

## 2. Running the CLI

The CLI entry point is `bin/cli.js`. After installing dependencies you can run:

```bash
npm start
```

or directly:

```bash
node ./bin/cli.js
```

If you install it globally (optional):

```bash
npm install -g .
revulation
```

Running without arguments shows the main interactive menu. You can also call subcommands directly:

- `revulation chat`
- `revulation tools [task...]`
- `revulation agentic-chat`
- `revulation code [spec...]`
- `revulation gang <config.js|name> [options]`

---

## 3. Chat modes

There are two chat modes.

### 3.1. Pure LLM chat

Start an interactive chat session:

```bash
revulation chat
```

Features:

- Streaming responses
- Simple per-user memory in the CLI session
- Credit tracking via `CreditManager`

Exit by typing `exit` or cancelling the prompt.

### 3.2. Agentic chat (with tools + MCP)

Start an interactive agentic chat session:

```bash
revulation agentic-chat
```

This uses the same tools agent as the `tools` command (web search, scraping, files, and `mcp_call` if configured) but in a conversational loop, so you can iteratively refine tasks.

---

## 4. Tools mode (agentic tools and MCP)

Run the tools agent (web search, scraping, local files, optional MCP server) for a one-shot task:

```bash
revulation tools "Find the latest docs for Node.js LTS and summarize changes."
```

If you omit the task, the CLI will prompt you.

Available tools:

- `web_search`: DuckDuckGo Instant Answer API
- `scrape_url`: scrape visible text from a web page
- `list_directory`: list files/folders in a directory
- `read_file`: read a local text file (snippet)
- `mcp_call`: call a configured MCP JSON-RPC server method

The tools agent uses LangChain's tool-calling agent under the hood.

---

## 5. Code mode (agentic coding)

Let the coding agent design or generate code:

```bash
revulation code "Create a simple todo CLI in Node.js"
```

or choose **Code** from the main menu.

Features:

- **Reasoning panel**: stream-of-consciousness design output
- **File actions**:
  - Create new `index.js` under a folder
  - Generate or overwrite a specific file
  - Edit an existing file (with diff preview and confirmation)
  - Experimental multi-file edit in a folder

This mode is powered by `src/agents/codingAgent.js`.

---

## 6. Crew-style YAML workflows
## 6. Gang Workflow Framework

The Gang framework lets you describe teams of AI members, tools, workflows, tests, and observability using JavaScript objects instead of YAML files. This provides better IDE support, type checking, and dynamic configuration capabilities.

### 6.1. Basic CLI usage

```bash
# Run a single workflow instance using predefined gang template
revulation gang research --input "Research latest AI trends"

# Run using JavaScript configuration file
revulation gang ./my-gang-config.js --input "Analyze project requirements"

# Run all tests defined in configuration
revulation gang ./my-gang-config.js --tests
```

If you omit `--input`, CLI will prompt you for an input task.

### 6.2. JavaScript configuration overview

#### 6.2.1. Basic structure

```javascript
import { createMember, createWorkflow, createSquad } from "./src/workflows/gangEngine.js";

export const gangConfig = {
  name: "research-gang",
  version: 1,
  
  llm: {
    model: "GLM-4.5-Flash",
    temperature: 0.4
  },
  
  members: [
    createMember("researcher", "Research topic using tools and summarize", [
      "web_search", 
      "scrape_url"
    ], "shared"),
    
    createMember("writer", "Design solution based on research", [], "shared")
  ],
  
  workflow: createWorkflow("researcher", [
    { from: "researcher", to: "writer", when: "data_ready" }
  ]),
  
  observability: {
    enabled: true,
    logLevel: "info",
    markdownReport: { enabled: true }
  }
};
```

#### 6.2.2. Available tools

Built-in tools (no import needed):
- `web_search`: Search web via DuckDuckGo Instant Answer API
- `scrape_url`: Scrape visible text from web pages
- `list_directory`: List files and folders in local directories
- `read_file`: Read contents of local text files
- `mcp_call`: Call MCP server (if `MCP_SERVER_URL` is configured)

#### 6.2.3. Members configuration

```javascript
members: [
  {
    name: "analyst",
    role: "Data analysis specialist who examines information and extracts insights",
    tools: ["web_search", "read_file"],
    memoryId: "shared"  // Optional: defaults to "shared"
  },
  {
    name: "designer", 
    role: "Solution designer who creates structured outputs",
    tools: [],
    memoryId: "shared"
  }
]
```

#### 6.2.4. Squads configuration

Squads are groups of members that can work together:

```javascript
squads: [
  {
    name: "research_squad",
    mode: "parallel",  // "parallel" or "sequential"
    members: ["researcher", "analyst"]
  },
  {
    name: "production_squad",
    mode: "sequential",
    members: ["writer", "reviewer"]
  }
]
```

#### 6.2.5. Workflow configuration

Define execution flow between members and squads:

```javascript
workflow: {
  entry: "researcher",  // Starting member/squad
  
  steps: [
    { from: "researcher", to: "analyst", when: "data_found" },
    { from: "analyst", to: "writer", when: "analysis_complete" },
    { from: "researcher", to: "writer", when: "no_data_needed" },
    { from: "writer", to: "reviewer", when: "always" }
  ]
}
```

#### 6.2.6. Testing framework

Define tests for your gang workflows:

```javascript
tests: [
  {
    name: "research-completes",
    input: "Find information about quantum computing",
    asserts: [
      {
        type: "contains",
        target: "researcher",
        value: "quantum"
      },
      {
        type: "contains",
        target: "writer", 
        value: "summary"
      }
    ]
  },
  {
    name: "error-handling",
    input: "invalid input that should trigger error",
    asserts: [
      {
        type: "contains",
        target: "researcher",
        value: "error"
      }
    ]
  }
]
```

### 6.3. Available predefined gangs

The CLI includes several predefined gang templates:

#### Research Gang
```bash
revulation gang research --input "Your research topic"
```
- Members: researcher (with web search/scraping), writer (synthesis)
- Use case: Research tasks and content creation

#### Analysis Gang  
```bash
revulation gang analysis --input "Your analysis request"
```
- Members: analyst (with file tools), reporter (output generation)
- Use case: Data analysis and reporting

### 6.4. Running programmatically

```javascript
import { GangEngine, createGang } from "./src/workflows/gangEngine.js";

// Using factory function
const gang = createGang(gangConfig);
const result = await gang.runOnce("Analyze market trends");

// Direct instantiation
const engine = new GangEngine({ config: gangConfig });
const results = await engine.runTests();
```

### 6.5. Reports and observability

Gang workflows generate reports in `gang_reports/` directory:

- **JSON reports**: Machine-readable test results with detailed metrics
- **Markdown reports**: Human-readable summaries and analysis

```javascript
observability: {
  enabled: true,
  logLevel: "info", 
  markdownReport: {
    enabled: true,
    file: "./custom-report.md"  // Optional custom file
  }
}
```

### 6.6. Advanced features

#### Dynamic configuration
```javascript
// Modify gang at runtime
engine.addMember(createMember("reviewer", "Final review specialist"));
engine.updateWorkflow({ entry: "researcher", steps: [...] });
```

#### Custom tools
```javascript
// In your gang config
tools: {
  custom: [
    {
      name: "database_query",
      module: "./tools/database.js", 
      export: "queryDatabase"
    }
  ]
}
```## 7. Library usage (as a module)

You can use Revulation programmatically from JS/TS.

### 7.1. Importing core components

```js
import { createLLM, CreditManager, ChatAgent, ToolsAgent, CodingAgent } from "revulation-cli";
```

From this repo (without publishing), you can import directly from `src`:

```js
import { createLLM } from "./src/config/llm.js";
import { CreditManager } from "./src/config/credits.js";
import { ChatAgent } from "./src/agents/chatAgent.js";
import { ToolsAgent } from "./src/agents/toolsAgent.js";
import { CodingAgent } from "./src/agents/codingAgent.js";
import { GangEngine, createGang, createMember, createWorkflow } from "./src/workflows/gangEngine.js";
```

### 7.2. Using `GangEngine` directly

```js
import { GangEngine, createGang } from "./src/workflows/gangEngine.js";

const gangConfig = {
  name: "my-gang",
  version: 1,
  llm: { model: "GLM-4.5-Flash", temperature: 0.4 },
  members: [
    { name: "worker", role: "Simple worker", tools: [], memoryId: "shared" }
  ],
  workflow: { entry: "worker" }
};

const engine = new GangEngine({ config: gangConfig });

const run = await engine.runOnce("Design a note-taking app and generate tests.");
console.log(run.final);
```

For tests or custom setups you can inject a fake or custom LLM:

```js
const engine = new CrewEngine({
  yamlPath: "./workflows/my_workflow.yaml",
  llmFactory: (opts) => myCustomLlmInstance,
});
```

---

## 8. Running unit tests

Unit tests use Node's built-in `node:test` framework.

### 8.1. Running all tests

```bash
npm test
```

This runs everything under `tests/`, including:

- `tests/crewEngine.test.js`: basic coverage of `CrewEngine` (backward compatibility maintained)
- `tests/gangEngine.test.js`: coverage of new `GangEngine` JavaScript-based workflow framework:
  - `runOnce` with a simple agent and fake LLM
  - `evaluateTestAssertions` with `contains` assertions
  - `runTests` end-to-end, including JSON + Markdown report generation

### 8.2. What the tests mock

To avoid calling the real LLM and external tools, tests inject a **fake LLM** using `llmFactory`:

- The fake LLM implements `invoke(messages)` and returns a fixed JSON payload.
- This keeps tests deterministic and fast, and they do not require `GLM_API_KEY`.

---

## 9. Typical scenarios

### 9.1. Product/design workflow

1. Create `workflows/product.yaml` describing a `researcher`, `architect`, and `tester` team.
2. Run:

```bash
revulation crew workflows/product.yaml -i "Design a habit-tracking mobile app."
```

3. Inspect the final node and (if enabled) the observability report under `workflows/reports/`.

### 9.2. Regression test a workflow

1. Add `tests:` to your workflow YAML with several `input` + `asserts`.
2. Run:

```bash
revulation crew workflows/product.yaml --tests
```

3. Check `workflows/crew_reports/product_tests.json` and `.md` for pass/fail status.

### 9.3. Extend with custom tools

1. Implement a LangChain `tool` in `myTools/runShell.js`.
2. Register it in the YAML under `tools.custom`.
3. Add it to an agent's `tools` list.
4. The agent can now call this tool in multi-step workflows.

---

## 10. Notes and limitations

- The workflow engine currently assumes a single shared LLM instance per workflow file.
- Agent JSON outputs must be reasonably small; extremely large responses may slow down routing and reports.
- Only one assertion type (`contains`) is implemented initially; you can extend `evaluateTestAssertions` to support more.
- Tool usage in workflows currently relies on models following the JSON-only instruction; in practice you may want to harden the prompts or add a JSON repair step.

Contributions and improvements (more assertion types, richer graphs, better error handling) can be layered on top of this foundation.
