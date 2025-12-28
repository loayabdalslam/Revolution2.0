#!/usr/bin/env node

import dotenv from "dotenv";
dotenv.config(); // Load environment variables

import { Command } from "commander";
import * as p from "@clack/prompts";
import chalk from "chalk";
import figlet from "figlet";
import { promises as fs } from "fs";
import path from "path";

import { ChatAgent, ToolsAgent, CodingAgent, GaiaAgent, CreditManager, createLLM } from "../src/index.js";
import { GangEngine, createGang, createMember, createWorkflow, createSquad } from "../src/workflows/gangEngine.js";
import { chatLogger, toolsLogger, codingLogger } from "../src/config/logging.js";
import { ResponseFormatter } from "../src/utils/responseFormatter.js";
import { theme, ui } from "../src/config/theme.js";

const program = new Command();

// Predefined gang templates
async function loadPredefinedGang(name) {
  if (name === "research") {
    return {
      name: "research-gang",
      version: 1,
      llm: { model: "openai/gpt-oss-120b", temperature: 0.4 },
      members: [
        { name: "researcher", role: "Research specialist who finds and analyzes information", tools: [], memoryId: "shared" },
        { name: "writer", role: "Content creator who synthesizes research into clear output", tools: [], memoryId: "shared" }
      ],
      workflow: { entry: "researcher", steps: [] },  // Simple workflow for testing
      observability: { enabled: false },  // Disable observability for testing
      tests: [
        {
          name: "basic research test",
          input: "Research AI trends",
          expected: { contains: "fake-gang-response" }
        }
      ]
    };
  }

  if (name === "analysis") {
    return {
      name: "analysis-gang",
      version: 1,
      llm: { model: "openai/gpt-oss-120b", temperature: 0.3 },
      members: [
        { name: "analyzer", role: "Data analysis specialist", tools: [], memoryId: "shared" },
        { name: "reporter", role: "Report generation specialist", tools: [], memoryId: "shared" }
      ],
      workflow: { entry: "analyzer", steps: [] },  // Simple workflow for testing
      observability: { enabled: false },  // Disable observability for testing
      tests: [
        {
          name: "basic analysis test",
          input: "Analyze project files",
          expected: { contains: "fake-gang-response" }
        }
      ]
    };
  }

  throw new Error(`Unknown predefined gang: ${name}. Available: research, analysis`);
}

function runWithTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        ms,
      ),
    ),
  ]);
}

program
  .name("revulation")
  .description("REVULATION 2.0 - Advanced AI-powered development environment")
  .version("2.0.0");

const credits = new CreditManager();
// Initialize agents only when needed to avoid startup errors
let chatAgent, toolsAgent, codingAgent, gaiaAgent;

function getChatAgent() {
  if (!chatAgent) chatAgent = new ChatAgent(credits);
  return chatAgent;
}

async function getToolsAgent() {
  if (!toolsAgent) {
    toolsAgent = new ToolsAgent();
    await toolsAgent.initialize();
  }
  return toolsAgent;
}

async function getCodingAgent() {
  if (!codingAgent) {
    codingAgent = new CodingAgent();
    await codingAgent.init();
  }
  return codingAgent;
}

async function getGaiaAgent() {
  if (!gaiaAgent) {
    gaiaAgent = new GaiaAgent();
    await gaiaAgent.initialize();
  }
  return gaiaAgent;
}

// List of available tools for display in the main menu
const TOOL_DESCRIPTIONS = [
  {
    name: "web_search",
    description: "Comprehensive search using DuckDuckGo and Wikipedia.",
  },
  {
    name: "duckduckgo_search",
    description: "Search DuckDuckGo for current events and general web content.",
  },
  {
    name: "wikipedia_search",
    description: "Search Wikipedia for encyclopedic information.",
  },
  {
    name: "scrape_url",
    description: "Scrape visible text from a web page URL.",
  },
  {
    name: "list_directory",
    description: "List files and folders in a local directory.",
  },
  {
    name: "read_file",
    description: "Read the contents of a local text file.",
  },
];

program
  .command("chat")
  .description("Start conversation with AI assistant")
  .action(async () => {
    console.clear();
    console.log(
      theme.primary(
        figlet.textSync("REVULATION 2.0", { font: "Slant" }),
      ),
    );
    p.intro(
      `${theme.status.info(' REVULATION AI ')} Welcome to your AI-powered development environment!`,
    );
    p.intro(
      `${theme.status.info(' Revulation 2.0 AI ')} Welcome to your AI-powered development environment!`,
    );

    const userId = "cli-user";

    while (true) {
      const userMessage = await p.text({
        message: theme.highlight("You:"),
        placeholder: 'Type your message... (or "exit" to quit)',
      });

      if (
        p.isCancel(userMessage) ||
        (userMessage && userMessage.toLowerCase() === "exit")
      ) {
        p.outro(theme.warning("Goodbye!"));
        process.exit(0);
      }

      const s = p.spinner();
      s.start("Revulation is thinking...");

      let firstToken = true;

      try {
        chatLogger.info(`Processing message from ${userId}`);
        const { usage } = await getChatAgent().streamChat(userId, userMessage, {
          onToken: async (token) => {
            if (firstToken) {
              s.stop("Response received");
              process.stdout.write("\n" + theme.heading("Revulation 2.0: "));
              firstToken = false;
            }
            process.stdout.write(token);
          },
        });

        if (firstToken) {
          // No tokens streamed (e.g. empty response)
          s.stop("No response");
        }

        process.stdout.write("\n\n");
        // Clean separation between response and usage info
        console.log(ResponseFormatter.separator());
        console.log(ResponseFormatter.formatUsage(usage));
        chatLogger.info(`Response completed for user ${userId}`);
      } catch (error) {
        s.stop("Error occurred");
        chatLogger.error(error.message);
        p.note(error.message, "Error");
      }
    }
  });

program
  .command("tools")
  .description("AI agent with web search, file access, and development tools")
  .argument("[task...]", "Task description")
  .action(async (taskParts) => {
    const task =
      (taskParts && taskParts.join(" ")) ||
      "Use any tools you need to search, scrape, inspect files, or call MCP, then explain your findings.";

    const s = p.spinner();
    s.start("Running tools agent...");

    try {
      toolsLogger.info(`Running tools agent with task: ${task}`);
      const out = await runWithTimeout(
        (async () => {
          const agent = await getToolsAgent();
          return agent.run(task);
        })(),
        60000,
        "Tools agent",
      );
      s.stop("Done");
      console.log(out);
      toolsLogger.success("Tools agent completed successfully");
    } catch (error) {
      s.stop("Error occurred");
      toolsLogger.error(`Tools agent failed: ${error.message}`);
      p.note(error.message, "Error");
    }
  });

program
  .command("agentic-chat")
  .description("Interactive AI chat with tool capabilities - persistent until exit")
  .action(async () => {
    console.clear();
    console.log(
      theme.primary(
        figlet.textSync("REVULATION 2.0", { font: "Slant" }),
      ),
    );
    p.intro(
      theme.status.info(' AGENTIC CHAT MODE ') +
      " Persistent chat with AI agent with DuckDuckGo, Wikipedia, file access, and development tools.",
    );

    console.log(ResponseFormatter.separator());
    console.log(theme.status.info("Available tools:"));
    console.log(theme.icon.tool("• DuckDuckGo Search - Current events and web content"));
    console.log(theme.icon.tool("• Wikipedia Search - Encyclopedic information"));
    console.log(theme.icon.tool("• Web Scraping - Extract content from URLs"));
    console.log(theme.icon.tool("• File Operations - Read files and list directories"));
    console.log(ResponseFormatter.separator());
    console.log(theme.status.info("Type 'exit' or 'quit' to end the chat session"));
    console.log(ResponseFormatter.separator());

    const agent = await getToolsAgent();

    while (true) {
      const task = await p.text({
        message: theme.highlight("You:"),
        placeholder: 'Ask me anything (e.g., "search for latest AI news" or "read package.json") - type "exit" to quit',
      });

      if (
        p.isCancel(task) ||
        (task && typeof task === "string" && (task.toLowerCase() === "exit" || task.toLowerCase() === "quit"))
      ) {
        p.outro(theme.warning("Goodbye from agentic chat! Thanks for using REVULATION 2.0."));
        process.exit(0);
      }

      if (!task || task.trim() === '') {
        continue; // Skip empty messages
      }

      const s = p.spinner();
      s.start("Agent thinking with enhanced tools...");

      try {
        toolsLogger.info(`Running agentic chat with task: ${task}`);
        const out = await runWithTimeout(
          (async () => {
            return agent.run(task);
          })(),
          90000, // Increased timeout for complex queries
          "Agentic chat",
        );
        s.stop("Done");

        console.log(ResponseFormatter.formatAgentResponse("AI AGENT", ResponseFormatter.cleanLog(out)));
        console.log(ResponseFormatter.separator());

        toolsLogger.success("Agentic chat response completed successfully");
      } catch (error) {
        s.stop("Error occurred");
        toolsLogger.error(`Agentic chat failed: ${error.message}`);
        console.log(ResponseFormatter.formatError(`Agent error: ${error.message}`));
        console.log(ResponseFormatter.separator());
      }
    }
  });

program
  .command("code")
  .description("Intelligent coding assistant with project analysis")
  .argument("[spec...]", "Task specification")
  .option("--analyze", "Analyze current project structure and conventions")
  .option("--improve <file>", "Analyze and suggest improvements for a specific file")
  .option("--test <file>", "Generate comprehensive tests for a file")
  .option("--project <path>", "Specify project path (default: current directory)")
  .action(async (specParts, options) => {
    if (options.analyze) {
      await runProjectAnalysis(options.project);
    } else if (options.improve) {
      await runCodeImprovement(options.improve, options.project);
    } else if (options.test) {
      await runTestGeneration(options.test, options.project);
    } else {
      const specArg =
        (specParts && specParts.join(" ")) ||
        "Create a comprehensive authentication system";
      await runRevulationSession(specArg, options.project);
    }
  });

program
  .command("gang")
  .description("Run collaborative AI team workflows")
  .argument("<config>", "JavaScript configuration file or workflow name")
  .option("-i, --input <text>", "Input task / idea")
  .option("--tests", "Run tests defined in configuration instead of a single run")
  .action(async (configPath, options) => {
    let gangConfig;

    // Load gang configuration
    if (configPath.endsWith('.js')) {
      const module = await import('file://' + path.resolve(process.cwd(), configPath));
      gangConfig = module.default || module.gangConfig || module;
    } else {
      // Load predefined template
      gangConfig = await loadPredefinedGang(configPath);
    }

    // Use real LLM factory with Groq
    const llmFactory = (opts) => {
      // Configure for Groq if Groq API key is available, otherwise use default GLM
      if (process.env.GROQ_API_KEY) {
        // Import ChatGroq dynamically
        return import("@langchain/groq").then(({ ChatGroq }) => {
          return new ChatGroq({
            model: opts.model || "openai/gpt-oss-120b",
            temperature: opts.temperature || 0.6,
            apiKey: process.env.GROQ_API_KEY,
          });
        });
      } else if (process.env.GLM_API_KEY) {
        // Fall back to default LLM (GLM)
        return createLLM(opts);
      } else {
        // No API keys available - use fake LLM for demo purposes
        console.warn("⚠️  No API keys found (GROQ_API_KEY or GLM_API_KEY). Using demo mode with fake responses.");
        return {
          async invoke(messages) {
            const last = messages[messages.length - 1];
            const baseContent = typeof last?.content === "string" ? last.content : "";
            return {
              content: '{"content":"Demo response: This is a fake gang response. Configure GROQ_API_KEY or GLM_API_KEY for real AI responses.","next":null,"actions":[]}',
            };
          },
          async stream(messages) {
            const response = '{"content":"Demo response: This is a fake gang response. Configure GROQ_API_KEY or GLM_API_KEY for real AI responses.","next":null,"actions":[]}';
            async function* stream() {
              yield { content: response };
            }
            return stream();
    }
  });
}

async function runGaiaBenchmark(options) {
  console.log(ResponseFormatter.section("GAIA BENCHMARK TESTING SUITE"));
  console.log(theme.status.info("Initializing GAIA Agent..."));

  const s = p.spinner();
  s.start("Initializing GAIA Agent...");

  try {
    const agent = await getGaiaAgent();
    s.stop("GAIA Agent ready");

    // Parse options
    const config = {
      categories: options.category || null,
      difficulty: options.difficulty || null,
      maxQuestions: parseInt(options.maxQuestions) || 10,
      progressCallback: options.continuous ? (result) => {
        console.log(theme.icon.test(`📊 Progress: ${result.category.toUpperCase()} - Confidence: ${result.analysis.confidenceScore.toFixed(3)}`));
      } : null
    };

    console.log(theme.heading("🎯 Benchmark Configuration:"));
    console.log(theme.listItem(`Categories: ${config.categories?.join(', ') || 'All'}`));
    console.log(theme.listItem(`Difficulty: ${config.difficulty || 'All'}`));
    console.log(theme.listItem(`Max Questions: ${config.maxQuestions}`));
    console.log(ResponseFormatter.separator());

    // Run benchmark suite
    const benchmarkSpinner = p.spinner();
    benchmarkSpinner.start("Running benchmark tests...");

    const report = await agent.runBenchmarkSuite(config);
    benchmarkSpinner.stop("Benchmark completed");

    // Display results
    console.log(ResponseFormatter.section("BENCHMARK RESULTS"));
    console.log(theme.status.success(`✅ Total Tests: ${report.summary.totalTests}`));
    console.log(theme.status.info(`📈 Success Rate: ${report.summary.successfulTests}/${report.summary.totalTests} (${(report.summary.successfulTests/report.summary.totalTests*100).toFixed(1)}%)`));
    console.log(theme.status.info(`🎯 Average Confidence: ${report.summary.averageConfidence}`));
    console.log(theme.status.info(`⏱️  Average Response Time: ${report.summary.averageResponseTime}`));

    if (report.summary.categoriesTested.length > 0) {
      console.log(ResponseFormatter.section("CATEGORY BREAKDOWN"));
      Object.entries(report.categoryBreakdown).forEach(([category, stats]) => {
        console.log(theme.heading(`${category.toUpperCase()}:`));
        console.log(theme.listItem(`  Tests: ${stats.testsRun}`));
        console.log(theme.listItem(`  Avg Confidence: ${stats.averageConfidence}`));
        console.log(theme.listItem(`  Success Rate: ${(stats.successRate*100).toFixed(1)}%`));
      });
    }

    // Generate summary if requested
    if (options.summary) {
      console.log(ResponseFormatter.section("PERFORMANCE SUMMARY"));
      const summary = agent.generateBenchmarkSummary(report.individualResults);
      
      console.log(theme.heading("Recommendations:"));
      summary.recommendations.forEach(rec => {
        console.log(ui.listItem(`💡 ${rec}`));
      });
    }

    // Generate submission file if requested
    if (options.generateSubmission) {
      const submissionSpinner = p.spinner();
      submissionSpinner.start("Generating submission file...");

      try {
        const submissionFile = await agent.generateSubmissionFile(report.individualResults);
        submissionSpinner.stop("Submission file created");
        console.log(theme.status.success(`📁 Submission file: ${submissionFile}`));
      } catch (error) {
        submissionSpinner.stop("Error creating submission file");
        console.log(theme.error(`❌ Failed to create submission file: ${error.message}`));
      }
    }

    console.log(ResponseFormatter.separator());
    console.log(theme.status.info("Benchmark session completed successfully"));

  } catch (error) {
    s.stop("Error initializing GAIA Agent");
    console.log(theme.error(`❌ GAIA Benchmark Error: ${error.message}`));
    p.note(error.message, "GAIA Benchmark Error");
  }
}

async function showMainMenu() {
  while (true) {
    // Do not clear the screen so the previous agent/tool output stays visible.
    console.log(
      theme.primary(
        figlet.textSync("REVULATION 2.0", { font: "Slant" }),
      ),
    );

    const choice = await p.select({
      message: "Choose a mode:",
      options: [
        { value: "chat", label: "Conversation with AI assistant" },
        { value: "agentic-chat", label: "Persistent agentic chat (DuckDuckGo + Wikipedia)" },
        { value: "code", label: "</> Intelligent coding assistant" },
        { value: "gaia", label: "🧪 GAIA Benchmark Testing Suite" },
        { value: "gang", label: "Collaborative AI team workflows" },
        { value: "tools-info", label: "List available tools" },
        { value: "exit", label: "Exit" },
      ],
    });

    if (p.isCancel(choice) || choice === "exit") {
      p.outro(theme.warning("Goodbye! Thanks for using REVULATION 2.0."));
      process.exit(0);
    }

    if (choice === "chat" || choice === "agentic-chat" || choice === "gaia") {
      await program.parseAsync([process.argv[0], process.argv[1], choice]);
      return; // these commands have their own loop and exits when user is done
    }

    if (choice === "tools") {
      const task = await p.text({
        message:
          "Describe what you want the tools agent to do (can search, scrape, inspect files):",
      });
      if (p.isCancel(task)) {
        continue; // back to main menu
      }
      const s = p.spinner();
      s.start("Running tools agent...");
      try {
        const out = await runWithTimeout(
          (async () => {
            const agent = await getToolsAgent();
            return agent.run(task);
          })(),
          60000,
          "Tools agent",
        );
        s.stop("Done");
        console.log(out);
        await p.confirm({
          message: "Press enter to return to main menu",
          initialValue: true,
        });
      } catch (error) {
        s.stop("Error occurred");
        p.note(error.message, "Error");
      }
      continue;
    }

    if (choice === "code") {
      const spec = await p.text({
        message: "Describe what you want to build or improve:",
        placeholder: "Create a comprehensive authentication system with JWT and refresh tokens",
      });
      if (p.isCancel(spec)) {
        continue; // back to main menu
      }
      await runRevulationSession(spec);
      await p.confirm({
        message: "Press enter to return to main menu",
        initialValue: true,
      });
      continue;
    }

    if (choice === "gaia") {
      // Show GAIA specific options
      const gaiaAction = await p.select({
        message: "Choose GAIA benchmark option:",
        options: [
          { value: "quick", label: "Quick Test (10 questions)" },
          { value: "full", label: "Full Test (50 questions)" },
          { value: "custom", label: "Custom Test Configuration" },
          { value: "generate-submission", label: "Generate Submission File" }
        ]
      });

      if (p.isCancel(gaiaAction)) continue;

      let gaiaOptions = {};

      switch (gaiaAction) {
        case "quick":
          gaiaOptions = { maxQuestions: "10", summary: true };
          break;
        case "full":
          gaiaOptions = { maxQuestions: "50", summary: true, generateSubmission: true };
          break;
        case "custom":
          const categories = await p.multiselect({
            message: "Select categories to test:",
            options: [
              { value: "reasoning", label: "Reasoning (Logical puzzles, problem-solving)" },
              { value: "knowledge", label: "Knowledge (Facts, history, science)" },
              { value: "coding", label: "Coding (Programming, algorithms)" },
              { value: "language", label: "Language (Comprehension, translation)" },
              { value: "multimodal", label: "Multimodal (Multiple data types)" },
              { value: "ethics", label: "Ethics (Moral reasoning, philosophy)" }
            ]
          });

          if (!p.isCancel(categories) && categories.length > 0) {
            const difficulty = await p.select({
              message: "Select difficulty level:",
              options: [
                { value: "easy", label: "Easy" },
                { value: "medium", label: "Medium" },
                { value: "hard", label: "Hard" },
                { value: "", label: "All difficulties" }
              ]
            });

            const maxQuestions = await p.text({
              message: "Maximum number of questions:",
              placeholder: "25"
            });

            if (!p.isCancel(difficulty) && !p.isCancel(maxQuestions)) {
              gaiaOptions = {
                category: categories,
                difficulty: difficulty || undefined,
                maxQuestions: maxQuestions || "25",
                summary: true,
                generateSubmission: true
              };
            }
          }
          break;
        case "generate-submission":
          gaiaOptions = { 
            maxQuestions: "400", 
            generateSubmission: true, 
            summary: true 
          };
          break;
      }

      if (Object.keys(gaiaOptions).length > 0) {
        await runGaiaBenchmark(gaiaOptions);
      }

      await p.confirm({
        message: "Press enter to return to main menu",
        initialValue: true,
      });
      continue;
    }

    if (choice === "gang") {
      const gangAction = await p.select({
        message: "Choose gang option:",
        options: [
          { value: "predefined", label: "Run predefined gang template" },
          { value: "custom", label: "Run custom gang configuration" },
          { value: "tests", label: "Run gang tests" },
        ],
      });

      if (p.isCancel(gangAction)) continue;

      if (gangAction === "predefined") {
        const template = await p.select({
          message: "Choose gang template:",
          options: [
            { value: "research", label: "Research Gang (web search + content creation)" },
            { value: "analysis", label: "Analysis Gang (file analysis + reporting)" },
          ],
        });

        if (p.isCancel(template)) continue;

        const input = await p.text({
          message: "What do you want the gang to work on?",
          placeholder: "Research latest AI trends",
        });

        if (p.isCancel(input)) continue;

        await runGangWorkflow(template, input);
      } else if (gangAction === "custom") {
        const configPath = await p.text({
          message: "Enter gang configuration file path (relative):",
          placeholder: "./my-gang-config.js",
        });

        if (p.isCancel(configPath) || !configPath) continue;

        const input = await p.text({
          message: "What do you want the gang to work on?",
          placeholder: "Analyze project requirements",
        });

        if (p.isCancel(input)) continue;

        await runGangWorkflow(configPath, input);
      } else if (gangAction === "tests") {
        const template = await p.select({
          message: "Choose gang template to test:",
          options: [
            { value: "research", label: "Research Gang" },
            { value: "analysis", label: "Analysis Gang" },
            { value: "custom", label: "Custom configuration" },
          ],
        });

        if (p.isCancel(template)) continue;

        let configPath = template;
        if (template === "custom") {
          const path = await p.text({
            message: "Enter gang configuration file path:",
            placeholder: "./my-gang-config.js",
          });
          if (p.isCancel(path) || !path) continue;
          configPath = path;
        }

        await runGangTests(configPath);
      }

      await p.confirm({
        message: "Press enter to return to main menu",
        initialValue: true,
      });
      continue;
    }

    if (choice === "tools-info") {
      console.log(theme.heading("Available Tools:"));
      for (const t of TOOL_DESCRIPTIONS) {
        console.log(theme.icon.tool(`${t.name}`));
        console.log(theme.textMuted(`  ${t.description}`));
      }
      await p.confirm({ message: "Press enter to return to main menu", initialValue: true });
      continue;
    }
  }
}

async function main() {
  if (process.argv.length <= 2) {
    await showMainMenu();
  } else {
    await program.parseAsync(process.argv);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
