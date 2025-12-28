# AGENTS.md

This file contains guidelines and commands for agentic coding tools working in this repository.

## Project Overview

Revolution is a Node.js CLI tool that provides AI-powered capabilities through three main agents:
- **ChatAgent**: Conversational AI with credit tracking and logging
- **ToolsAgent**: Agentic tools mode (web search, scraping, computer use, MCP)
- **CodingAgent**: Agentic coding mode for app design and creation

The project uses ES modules (`"type": "module"`), LangChain for LLM integration, and GLM as the default model.

## Build/Test Commands

### Core Commands
```bash
# Run all tests
npm test

# Start the CLI application
npm start

# Run the CLI directly
node ./bin/cli.js
```

### Running Single Tests
```bash
# Run a specific test file
node --test tests/crewEngine.test.js

# Run tests with pattern matching
node --test --test-name-pattern "CrewEngine"
```

### Development Workflow
```bash
# Install dependencies
npm install

# Run in development mode
npm start

# Test specific functionality
node ./bin/cli.js chat
node ./bin/cli.js tools "search for something"
node ./bin/cli.js code "create a todo app"
```

## Code Style Guidelines

### Module System
- **ES Modules only**: Use `import/export` syntax
- **File extensions**: Always use `.js` extensions in imports
- **Default exports**: Use named exports for better tree-shaking

```javascript
// ✅ Good
import { ChatAgent } from "./agents/chatAgent.js";
export { ChatAgent };

// ❌ Bad
const ChatAgent = require("./chatAgent");
module.exports = ChatAgent;
```

### Import Organization
1. Node.js built-in modules
2. Third-party dependencies
3. Local modules (relative imports)

```javascript
import { promises as fs } from "fs";
import path from "path";

import { Command } from "commander";
import chalk from "chalk";

import { createLLM } from "./config/llm.js";
import { ChatAgent } from "./agents/chatAgent.js";
```

### Naming Conventions
- **Classes**: PascalCase (`ChatAgent`, `CrewEngine`)
- **Functions/Variables**: camelCase (`createLLM`, `creditManager`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_CONCURRENT_REQUESTS`, `DEFAULT_MODEL`)
- **Files**: camelCase with `.js` extension (`chatAgent.js`, `crewEngine.js`)

### Error Handling
- Use async/await consistently
- Wrap async operations in try/catch blocks
- Provide meaningful error messages

```javascript
// ✅ Good
async function generateFile(spec, filePath) {
  try {
    const code = await this.llm.invoke(messages);
    await fs.writeFile(filePath, code, "utf8");
    return filePath;
  } catch (error) {
    throw new Error(`Failed to generate file ${filePath}: ${error.message}`);
  }
}

// ❌ Bad
function generateFile(spec, filePath) {
  return this.llm.invoke(messages).then(code => {
    return fs.writeFile(filePath, code, "utf8");
  });
}
```

### Class Structure
- Use ES class syntax
- Constructor for dependency injection
- Private methods prefixed with underscore
- Export classes separately from instances

```javascript
export class ChatAgent {
  constructor(creditManager) {
    this.llm = createLLM();
    this.credits = creditManager;
    this.histories = new Map();
  }

  _getHistory(userId) {
    return this.histories.get(userId) || [];
  }

  async chatOnce(userId, userMessage, options = {}) {
    // Implementation
  }
}
```

### Configuration
- Environment variables through `.env` file
- Centralized configuration in `src/config/`
- Default values with env override capability

```javascript
// src/config/llm.js
const DEFAULT_MODEL = "GLM-4.5-Flash";
const DEFAULT_API_BASE = process.env.GLM_API_BASE || "https://api.z.ai/api/paas/v4/";
```

### Logging
- Use structured logging with context
- Separate loggers by domain
- Include relevant metadata

```javascript
// src/config/logging.js
export const chatLogger = {
  info: (...args) => console.log("[CHAT]", ...args),
};

// Usage
chatLogger.info(`user=${userId}`, { inputTokens, outputTokens, usage });
```

### LLM Integration
- Use the factory pattern for LLM creation
- Implement rate limiting and credit tracking
- Support both streaming and non-streaming responses

```javascript
import { createLLM } from "../config/llm.js";

export class ChatAgent {
  constructor(creditManager) {
    this.llm = createLLM({ 
      temperature: 0.6,
      creditManager,
      userId: "cli-user"
    });
  }
}
```

### File Operations
- Use `fs.promises` for async file operations
- Create directories recursively when needed
- Handle file paths with `path` module

```javascript
import { promises as fs } from "fs";
import { dirname } from "path";

await fs.mkdir(dirname(filePath), { recursive: true });
await fs.writeFile(filePath, content, "utf8");
```

### CLI Structure
- Use Commander.js for CLI framework
- Organize commands by functionality
- Provide clear help text and descriptions

```javascript
program
  .command("chat")
  .description("Start a chat with AI (with credits & logs)")
  .action(async () => {
    // Implementation
  });
```

## Testing Guidelines

### Test Structure
- Use Node.js built-in test runner (`node:test`)
- Place tests in `tests/` directory
- Name test files with `.test.js` suffix

### Test Patterns
- Use descriptive test names
- Mock external dependencies (LLM, file system)
- Test both success and error cases

```javascript
import { test } from "node:test";
import assert from "node:assert";

test("ChatAgent should record usage after chat", async () => {
  const fakeCredits = { recordUsage: () => {} };
  const agent = new ChatAgent(fakeCredits);
  // Test implementation
});
```

## Gang Workflow Framework

Revolution includes a JavaScript-based workflow framework called "Gang" that replaces the previous YAML-based Crew system. The Gang framework allows you to orchestrate multiple AI members (agents) working together in structured workflows.

### Gang Concepts

- **Members**: Individual AI agents with specific roles and tools
- **Squads**: Groups of members that can work in parallel or sequentially  
- **Workflows**: Directed graphs defining execution flow between members and squads
- **Memory**: Shared conversation history for context retention

### Creating Gang Configurations

**Using Factory Functions:**

```javascript
import { createGang, createMember, createWorkflow, createSquad } from "./src/workflows/gangEngine.js";

const researchGang = createGang({
  name: "research-gang",
  version: 1,
  llm: { model: "GLM-4.5-Flash", temperature: 0.4 },
  members: [
    createMember("researcher", "Find and analyze information", ["web_search", "scrape_url"]),
    createMember("writer", "Synthesize research into clear output", [])
  ],
  workflow: createWorkflow("researcher", [
    { from: "researcher", to: "writer", when: "data_found" }
  ]),
  observability: { enabled: true }
});
```

**Direct JavaScript Configuration:**

```javascript
export const gangConfig = {
  name: "my-gang",
  version: 1,
  llm: {
    model: "GLM-4.5-Flash",
    temperature: 0.3
  },
  members: [
    {
      name: "analyst",
      role: "Data analysis specialist",
      tools: ["read_file", "list_directory"],
      memoryId: "shared"
    },
    {
      name: "reporter", 
      role: "Report generation specialist",
      tools: [],
      memoryId: "shared"
    }
  ],
  squads: [
    {
      name: "analysis-squad",
      mode: "parallel",
      members: ["analyst", "reporter"]
    }
  ],
  workflow: {
    entry: "analyst",
    steps: [
      { from: "analyst", to: "reporter", when: "analysis_complete" }
    ]
  },
  observability: {
    enabled: true,
    logLevel: "info",
    markdownReport: { enabled: true }
  },
  tests: [
    {
      name: "basic-analysis",
      input: "Analyze the data file",
      asserts: [
        {
          type: "contains",
          target: "analyst", 
          value: "data"
        }
      ]
    }
  ]
};
```

### Running Gang Workflows

**From CLI:**

```bash
# Using predefined gang template
node ./bin/cli.js gang research --input "Research latest AI trends"

# Using JavaScript configuration file
node ./bin/cli.js gang ./my-gang-config.js --input "Analyze project data"

# Run gang tests
node ./bin/cli.js gang ./my-gang-config.js --tests
```

**Programmatically:**

```javascript
import { GangEngine } from "./src/workflows/gangEngine.js";

const engine = new GangEngine({ config: gangConfig });
const result = await engine.runOnce("Research Node.js best practices");

// Run tests
const testResults = await engine.runTests();
```

### Available Predefined Gangs

- **research**: Research and content synthesis team
- **analysis**: Data analysis and reporting team

### Gang Testing

Define tests in your gang configuration:

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
        value: "research"
      }
    ]
  }
]
```

Test reports are generated in `gang_reports/` directory in both JSON and Markdown formats.

## Environment Setup

### Required Environment Variables
```bash
GLM_API_KEY=your_api_key_here
GLM_API_BASE=https://api.z.ai/api/paas/v4/
LLM_MAX_CONCURRENCY=1
```

### Dependencies
- Node.js (ES modules support required)
- GLM API access
- No external build tools needed

## Agent-Specific Guidelines

### ChatAgent
- Maintain conversation history per user
- Track token usage and credits
- Support streaming responses
- Log interactions for observability

### ToolsAgent
- Integrate with external APIs (web search, scraping)
- Handle MCP (Model Context Protocol) if configured
- Provide tool descriptions and usage
- Timeout long-running operations

### CodingAgent
- Generate production-quality code
- Support both new file creation and editing
- Provide design reasoning before code generation
- Handle file system operations safely

## Security Considerations

- Never log API keys or sensitive data
- Validate file paths to prevent directory traversal
- Sanitize user inputs before processing
- Use environment variables for configuration