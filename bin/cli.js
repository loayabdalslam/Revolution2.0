#!/usr/bin/env node

import dotenv from "dotenv";
dotenv.config(); // Load environment variables

import { Command } from "commander";
import * as p from "@clack/prompts";
import chalk from "chalk";
import figlet from "figlet";
import { promises as fs } from "fs";
import path from "path";

import { ChatAgent, ToolsAgent, CodingAgent, CreditManager, createLLM } from "../src/index.js";
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
let chatAgent, toolsAgent, codingAgent;

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

// List of available tools for display in the main menu
const TOOL_DESCRIPTIONS = [
  {
    name: "web_search",
    description: "Search the web for free via DuckDuckGo Instant Answer API.",
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
  .description("Interactive AI chat with tool capabilities")
  .action(async () => {
    console.clear();
    console.log(
      theme.primary(
        figlet.textSync("REVULATION 2.0", { font: "Slant" }),
      ),
    );
    p.intro(
      theme.status.info(' AGENTIC CHAT ') +
      " Talk to an AI agent with web search, file access, and development tools.",
    );
    p.intro(
      theme.status.info(' AGENTIC CHAT ') +
      " Talk to an AI agent with web search, file access, and development tools.",
    );

    while (true) {
      const task = await p.text({
        message: theme.highlight("You:"),
        placeholder: 'Describe what you want the agent to do (or "exit" to quit)',
      });

      if (
        p.isCancel(task) ||
        (task && typeof task === "string" && task.toLowerCase() === "exit")
      ) {
        p.outro(theme.warning("Goodbye from agentic chat."));
        process.exit(0);
      }

      const s = p.spinner();
      s.start("Agent thinking (with tools)...");

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
        console.log(ResponseFormatter.formatAgentResponse("TOOLS AGENT", ResponseFormatter.cleanLog(out)));
        toolsLogger.success("Tools agent completed successfully");
      } catch (error) {
        s.stop("Error occurred");
        toolsLogger.error(`Tools agent failed: ${error.message}`);
        p.note(error.message, "Error");
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
        };
      }
    };

    const engine = new GangEngine({ config: gangConfig, llmFactory });

    if (options.tests) {
      const s = p.spinner();
      s.start("Running gang tests...");
      try {
        const results = await engine.runTests();
        s.stop("Tests completed");
        console.log(
          theme.subheading(
            `✅ Ran ${results.length} tests. Reports written to gang_reports/.`,
          ),
        );
      } catch (err) {
        s.stop("Error");
        p.note(err.message, "Error");
      }
      return;
    }

    const input =
      options.input ||
      (await p.text({
        message: "What do you want the gang to work on?",
        placeholder: "Design and test a simple todo web app.",
      }));

    if (p.isCancel(input)) return;

    const s = p.spinner();
    s.start("Running gang workflow...");
    try {
      const run = await engine.runOnce(input);
      s.stop("Done");
      console.log(theme.heading("Workflow Results:"));
      console.log(theme.code(JSON.stringify({
        finalNode: run.final?.nodeName ?? null,
        finalType: run.final?.type ?? null,
        finalContent:
          run.final?.type === "member"
            ? run.final.output?.content ?? null
            : run.final?.type === "squad"
              ? run.final.outputs
              : null,
      }, null, 2)));
    } catch (err) {
      s.stop("Error");
      p.note(err.message, "Error");
    }
  });

async function runRevulationSession(initialSpec, projectPath = process.cwd()) {
  codingLogger.info("Starting Revulation 2.0 session");
  console.log(ResponseFormatter.section("REVULATION 2.0 - AI CODING ASSISTANT"));
  console.log(theme.panelSubheader("PROJECT ANALYSIS"));

  const s = p.spinner();
  s.start("Analyzing project structure and conventions...");

  try {
    const agent = await getCodingAgent();
    const projectContext = await agent.getProjectContext(projectPath);

    s.stop("Project analysis complete");

    console.log(theme.heading("Project Overview:"));
    console.log(theme.icon.code(`Languages: ${projectContext.languages.join(', ') || 'None detected'}`));
    console.log(theme.icon.rocket(`Frameworks: ${projectContext.frameworks.join(', ') || 'None detected'}`));
    console.log(theme.icon.test(`Test Frameworks: ${projectContext.testFrameworks.join(', ') || 'None detected'}`));

    if (Object.keys(projectContext.conventions).length > 0) {
      console.log(theme.heading("\n📋 Detected Conventions:"));
      Object.entries(projectContext.conventions).forEach(([key, value]) => {
        console.log(ui.listItem(`${key}: ${value}`, '  ✓'));
      });
    }

    if (projectContext.entryPoints.length > 0) {
      console.log(theme.heading("\n🚀 Entry Points:"));
      projectContext.entryPoints.forEach(point => console.log(ui.listItem(point, '  •')));
    }

    console.log(ResponseFormatter.separator());
    console.log(theme.panelSubheader("AI ASSISTANCE"));

    await runCodingWorkflow(agent, initialSpec, projectPath, projectContext);

  } catch (error) {
    s.stop("Analysis failed");
    codingLogger.error(`Project analysis failed: ${error.message}`);
    p.note(error.message, "Error analyzing project");

    // Fallback to basic coding session
    console.log(theme.warning("Falling back to basic coding mode..."));
    await runBasicCodingSession(initialSpec);
  }
}

async function runProjectAnalysis(projectPath = process.cwd()) {
  codingLogger.info("Running project analysis");
  console.log(ResponseFormatter.section("REVULATION 2.0 - PROJECT ANALYSIS"));

  const s = p.spinner();
  s.start("Deep project analysis...");

  try {
    const agent = await getCodingAgent();
    const analysis = await agent.analyzeProject(projectPath);

    s.stop("Analysis complete");
    console.log(ResponseFormatter.success("Analysis completed successfully"));

    console.log(theme.heading("\n📁 Project Structure:"));
    Object.entries(analysis.structure).forEach(([path, info]) => {
      if (info.type === 'directory') {
        console.log(theme.folderItem(path));
        info.files?.forEach(file => console.log(ui.listItem(`  ${file}`)));
      }
    });

    console.log(theme.heading("\n🔧 Technical Stack:"));
    console.log(theme.icon.code(`Languages: ${analysis.languages.join(', ') || 'None'}`));
    console.log(theme.icon.rocket(`Frameworks: ${analysis.frameworks.join(', ') || 'None'}`));
    console.log(theme.icon.tool(`Package Manager: ${Object.keys(analysis.dependencies).length > 0 ? 'npm/yarn' : 'None'}`));
    console.log(theme.icon.test(`Test Frameworks: ${analysis.testFrameworks.join(', ') || 'None'}`));

    if (Object.keys(analysis.conventions).length > 0) {
      console.log(theme.heading("\n📝 Code Conventions:"));
      Object.entries(analysis.conventions).forEach(([key, value]) => {
        console.log(ui.listItem(`${key}: ${value}`, '  ✓'));
      });
    }

    if (analysis.configFiles.length > 0) {
      console.log(theme.heading("\n⚙️ Configuration Files:"));
      analysis.configFiles.forEach(file => console.log(theme.listItem(`  ${file}`)));
    }

  } catch (error) {
    s.stop("Analysis failed");
    codingLogger.error(`Analysis failed: ${error.message}`);
    p.note(error.message, "Project analysis error");
  }
}

async function runCodeImprovement(filePath, projectPath = process.cwd()) {
  codingLogger.info(`Running code improvement for ${filePath}`);
  console.log(ResponseFormatter.section("REVULATION 2.0 - CODE IMPROVEMENT"));

  const s = p.spinner();
  s.start(`Analyzing ${filePath} and suggesting improvements...`);

  try {
    const agent = await getCodingAgent();
    const analysis = await agent.analyzeAndImprove(filePath, projectPath);

    s.stop("Analysis complete");

    console.log(theme.fileItem(`Analysis for ${filePath}:`));
    console.log(analysis.analysis);

    const action = await p.select({
      message: "What would you like to do?",
      options: [
        { value: "apply", label: "Apply suggested improvements" },
        { value: "review", label: "Review detailed suggestions" },
        { value: "tests", label: "Generate tests for this file" },
        { value: "exit", label: "Exit without changes" }
      ]
    });

    if (action === "apply") {
      const improveSpinner = p.spinner();
      improveSpinner.start("Applying improvements...");

      try {
        const improved = await agent.proposeFileEdit(
          "Apply all suggested improvements while maintaining functionality",
          filePath,
          analysis.originalContent
        );

        await fs.writeFile(filePath, improved, "utf8");
        improveSpinner.stop("Improvements applied");
        console.log(ResponseFormatter.success("File improved successfully"));
      } catch (error) {
        improveSpinner.stop("Failed to apply improvements");
        p.note(error.message, "Error applying improvements");
      }
    } else if (action === "tests") {
      await runTestGeneration(filePath, projectPath);
    }

  } catch (error) {
    s.stop("Analysis failed");
    codingLogger.error(`Improvement analysis failed: ${error.message}`);
    p.note(error.message, "Code improvement error");
  }
}

async function runTestGeneration(filePath, projectPath = process.cwd()) {
  codingLogger.info(`Generating tests for ${filePath}`);
  console.log(ResponseFormatter.section("REVULATION 2.0 - TEST GENERATION"));

  const s = p.spinner();
  s.start(`Generating comprehensive tests for ${filePath}...`);

  try {
    const agent = await getCodingAgent();
    const result = await agent.generateTests(filePath, projectPath);

    s.stop("Tests generated");

    console.log(theme.testItem(`Generated test file: ${result.testFilePath}`));
    console.log(theme.icon.tool(`Using framework: ${result.testFramework}`));

    console.log(ResponseFormatter.success("\nTest generation complete"));

    const runTests = await p.confirm({
      message: "Run generated tests?",
      initialValue: false
    });

    if (runTests) {
      // This would integrate with test runners
      console.log(theme.info("Test runner integration would go here"));
    }

  } catch (error) {
    s.stop("Test generation failed");
    codingLogger.error(`Test generation failed: ${error.message}`);
    p.note(error.message, "Test generation error");
  }
}

async function runCodingWorkflow(agent, initialSpec, projectPath, projectContext) {
  let spec = initialSpec;
  if (!spec) {
    spec = await p.text({
      message: "What would you like to create or improve?",
      placeholder: "Create a new component to handle user authentication"
    });
    if (p.isCancel(spec)) return;
  }

  console.log(chalk.magenta("\n[PANEL] AI DESIGN PHASE"));

  const designSpinner = p.spinner();
  designSpinner.start("AI is designing solution...");

  let firstToken = true;
  let fullDesign = "";

  try {
    codingLogger.info(`Generating design with context for spec: ${spec}`);
    fullDesign = await agent.streamDesign(spec, {
      onToken: async (token) => {
        if (firstToken) {
          designSpinner.stop("AI designing...");
          firstToken = false;
        }
        process.stdout.write(token);
      }
    });
    codingLogger.success("Design generation completed");
  } catch (error) {
    designSpinner.stop("Design failed");
    codingLogger.error(`Design generation failed: ${error.message}`);
    p.note(error.message, "Design generation error");
    return;
  }

  process.stdout.write("\n\n");
  console.log(chalk.magenta("[PANEL] ACTIONS"));

  const action = await p.select({
    message: "What would you like to do with this design?",
    options: [
      { value: "generate", label: "Generate code following project conventions" },
      { value: "create-file", label: "Create/modify specific file" },
      { value: "improve-existing", label: "Improve existing file" },
      { value: "generate-tests", label: "Generate test suite" },
      { value: "analyze-project", label: "Deep project analysis" },
      { value: "exit", label: "Exit without changes" }
    ]
  });

  if (p.isCancel(action) || action === "exit") {
    return;
  }

  switch (action) {
    case "generate":
      await handleCodeGeneration(agent, spec, projectPath, projectContext);
      break;
    case "create-file":
      await handleFileCreation(agent, spec, projectPath, projectContext);
      break;
    case "improve-existing":
      await handleExistingFileImprovement(agent, projectPath);
      break;
    case "generate-tests":
      await handleTestGeneration(agent, projectPath);
      break;
    case "analyze-project":
      await runProjectAnalysis(projectPath);
      break;
  }
}

async function handleCodeGeneration(agent, spec, projectPath, projectContext) {
  const filePath = await p.text({
    message: "Enter file path to generate (relative to project):",
    placeholder: "src/components/NewComponent.js"
  });
  if (p.isCancel(filePath) || !filePath) return;

  const fullPath = resolve(projectPath, filePath);

  const generateSpinner = p.spinner();
  generateSpinner.start("Generating code with project conventions...");

  try {
    const result = await agent.generateWithContext(spec, fullPath, projectPath);
    generateSpinner.stop("Code generated");

    console.log(chalk.green(`✅ Generated: ${result.filePath}`));

    // Show code preview
    const previewLines = result.code.split('\n').slice(0, 20);
    console.log(chalk.cyan("\n📄 Code Preview:"));
    console.log(previewLines.join('\n'));

    if (result.code.split('\n').length > 20) {
      console.log(chalk.gray("... (truncated)"));
    }

  } catch (error) {
    generateSpinner.stop("Generation failed");
    p.note(error.message, "Code generation error");
  }
}

async function handleFileCreation(agent, spec, projectPath, projectContext) {
  const filePath = await p.text({
    message: "Enter file path to create/modify:",
    placeholder: "src/utils/helper.js"
  });
  if (p.isCancel(filePath) || !filePath) return;

  const fullPath = resolve(projectPath, filePath);

  const createSpinner = p.spinner();
  createSpinner.start("Creating file with context awareness...");

  try {
    const result = await agent.generateWithContext(spec, fullPath, projectPath);
    createSpinner.stop("File created");

    console.log(chalk.green(`✅ Created: ${result.filePath}`));
  } catch (error) {
    createSpinner.stop("Creation failed");
    p.note(error.message, "File creation error");
  }
}

async function handleExistingFileImprovement(agent, projectPath) {
  const filePath = await p.text({
    message: "Enter file path to improve:",
    placeholder: "src/components/OldComponent.js"
  });
  if (p.isCancel(filePath) || !filePath) return;

  await runCodeImprovement(resolve(projectPath, filePath), projectPath);
}

async function handleTestGeneration(agent, projectPath) {
  const filePath = await p.text({
    message: "Enter file path to generate tests for:",
    placeholder: "src/components/Component.js"
  });
  if (p.isCancel(filePath) || !filePath) return;

  await runTestGeneration(resolve(projectPath, filePath), projectPath);
}

async function runBasicCodingSession(initialSpec) {
  console.log(ResponseFormatter.section("BASIC CODING SESSION", "magenta"));
  console.log(chalk.magenta("[PANEL] REASONING"));

  const s = p.spinner();
  s.start("Thinking about app design...");

  let spec = initialSpec;
  if (!spec) {
    const input = await p.text({
      message: "Describe the app you want to create:",
      placeholder: "Create a simple todo CLI in Node.js",
    });
    if (p.isCancel(input)) return;
    spec = input;
  }

  let firstToken = true;
  let fullDesign = "";

  try {
    codingLogger.info(`Generating design for spec: ${spec}`);
    fullDesign = await (await getCodingAgent()).streamDesign(spec, {
      onToken: async (token) => {
        if (firstToken) {
          s.stop("Streaming design...");
          firstToken = false;
        }
        process.stdout.write(token);
      },
    });
    codingLogger.success("Design generation completed");
  } catch (error) {
    s.stop("Error occurred");
    codingLogger.error(`Design generation failed: ${error.message}`);
    p.note(error.message, "Error");
    return;
  }

  process.stdout.write("\n\n");

  // FILE ACTION PANEL
  console.log(chalk.cyan("[PANEL] FILE ACTIONS"));
  const action = await p.select({
    message: "What do you want to do with this design?",
    options: [
      {
        value: "none",
        label: "Plan only: keep reasoning, no file changes",
      },
      {
        value: "new-index",
        label: "Create a new project entry (index file) in a folder",
      },
      {
        value: "custom-file",
        label: "Generate or overwrite a specific file path",
      },
      {
        value: "edit-existing",
        label: "Edit an existing file (add features / refactor)",
      },
      {
        value: "multi-edit",
        label: "Multi-file edit in a folder (experimental)",
      },
    ],
  });

  if (p.isCancel(action) || action === "none") {
    return;
  }

  // Multi-file edit mode is handled separately
  if (action === "multi-edit") {
    await runMultiFileEdit();
    return;
  }

  let targetPath;
  let mode = "generate"; // or "edit"

  if (action === "new-index") {
    const dir = await p.text({
      message: "Folder to place index.js (relative, e.g. ./generated-app):",
      placeholder: "./generated-app",
    });
    if (p.isCancel(dir)) return;
    const base = dir || "./generated-app";
    targetPath = path.resolve(process.cwd(), base, "index.js");
  } else if (action === "custom-file") {
    const fp = await p.text({
      message: "Enter file path to generate/overwrite (relative):",
      placeholder: "src/index.js",
    });
    if (p.isCancel(fp) || !fp) return;
    targetPath = path.resolve(process.cwd(), fp);
  } else if (action === "edit-existing") {
    const fp = await p.text({
      message: "Enter existing file path to edit (relative):",
      placeholder: "src/index.js",
    });
    if (p.isCancel(fp) || !fp) return;
    targetPath = path.resolve(process.cwd(), fp);
    mode = "edit";
  }

  if (!targetPath) return;

  if (mode === "edit") {
    // Show current file preview, ask for edit instructions, generate diff, then apply.
    console.log(
      chalk.cyan(
        `[PANEL] CURRENT FILE PREVIEW (${path.relative(
          process.cwd(),
          targetPath,
        )})`,
      ),
    );
    let currentContent = "";
    let previewOld = "";
    try {
      currentContent = await fs.readFile(targetPath, "utf8");
      previewOld = currentContent.split("\n").slice(0, 40).join("\n");
      console.log(previewOld);
    } catch (e) {
      console.log("(file does not exist yet; edits will create it)");
    }

    const instructions = await p.text({
      message:
        "Describe the edits / features to add to this file (be specific):",
      placeholder: "Add JWT authentication middleware and new /login route",
    });
    if (p.isCancel(instructions) || !instructions) return;

    console.log(chalk.cyan("[PANEL] DIFF PREVIEW"));
    const previewSpinner = p.spinner();
    previewSpinner.start("Proposing file edits...");

    let proposed = "";
    try {
      proposed = await (await getCodingAgent()).proposeFileEdit(
        instructions,
        targetPath,
        currentContent || "",
      );
      previewSpinner.stop("Diff ready");
    } catch (error) {
      previewSpinner.stop("Error occurred");
      p.note(error.message, "Error");
      return;
    }

    console.log(chalk.yellow("----- BEFORE (first 40 lines) -----"));
    console.log(previewOld || "(empty file)");
    console.log(chalk.yellow("----- AFTER (first 40 lines) ------"));
    const previewNew = proposed.split("\n").slice(0, 40).join("\n");
    console.log(previewNew || "(empty file)");

    const confirmEdit = await p.confirm({
      message: `Apply edits to: ${targetPath}? (will overwrite file)`,
      initialValue: true,
    });
    if (!confirmEdit) return;

    console.log(chalk.cyan("[PANEL] APPLYING EDITS"));
    const editSpinner = p.spinner();
    editSpinner.start("Writing edited file to disk...");

    try {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, proposed, "utf8");
      editSpinner.stop("File edited");
    } catch (error) {
      editSpinner.stop("Error occurred");
      p.note(error.message, "Error");
      return;
    }
  } else {
    const confirm = await p.confirm({
      message: `Generate code into: ${targetPath}? (may overwrite existing file)`,
      initialValue: true,
    });
    if (!confirm) return;

    console.log(chalk.cyan("[PANEL] GENERATING FILE"));
    const genSpinner = p.spinner();
    genSpinner.start("Calling coding agent to generate file...");

    try {
      await (await getCodingAgent()).generateFile(spec, targetPath);
      genSpinner.stop("File generated");
    } catch (error) {
      genSpinner.stop("Error occurred");
      p.note(error.message, "Error");
      return;
    }
  }

  // FILES PANEL + CODE PREVIEW PANEL
  console.log(chalk.cyan("[PANEL] FILES"));
  const dirToShow = path.dirname(targetPath);
  try {
    const entries = await fs.readdir(dirToShow, { withFileTypes: true });
    for (const e of entries) {
      console.log(
        `${e.isDirectory() ? "[dir]" : "[file]"} ${e.name}`,
      );
    }
  } catch (e) {
    console.log("(could not list directory)");
  }

  console.log(
    chalk.green(
      `\n[PANEL] CODE PREVIEW (${path.relative(process.cwd(), targetPath)})`,
    ),
  );
  try {
    const content = await fs.readFile(targetPath, "utf8");
    const preview = content.split("\n").slice(0, 40).join("\n");
    console.log(preview);
  } catch (e) {
    console.log("(could not read generated file)");
  }
}

async function runMultiFileEdit() {
  console.log(chalk.cyan("[PANEL] MULTI-FILE EDIT"));
  const folder = await p.text({
    message: "Folder to scan for files (relative, e.g. ./src):",
    placeholder: "./src",
  });
  if (p.isCancel(folder) || !folder) return;
  const baseDir = path.resolve(process.cwd(), folder);

  let entries;
  try {
    entries = await fs.readdir(baseDir, { withFileTypes: true });
  } catch (e) {
    p.note("Could not read directory", "Error");
    return;
  }

  const files = entries.filter((e) => e.isFile()).map((e) => e.name);
  if (!files.length) {
    console.log("No files found in folder.");
    return;
  }

  console.log("Files in folder:");
  for (const f of files) {
    console.log("- " + f);
  }

  const instructions = await p.text({
    message:
      "Describe the feature/refactor to apply across these files (agent decides what to change):",
    placeholder: "Add logging import and log at start of each handler",
  });
  if (p.isCancel(instructions) || !instructions) return;

  for (const f of files) {
    const filePath = path.resolve(baseDir, f);
    console.log(
      chalk.cyan(
        `\n[PANEL] EDITING ${path.relative(process.cwd(), filePath)}`,
      ),
    );

    let current = "";
    try {
      current = await fs.readFile(filePath, "utf8");
    } catch {
      current = "";
    }

    const proposeSpinner = p.spinner();
    proposeSpinner.start("Proposing edits for this file...");

    let proposed = "";
    try {
      proposed = await (await getCodingAgent()).proposeFileEdit(
        instructions +
        `\n(This is file ${path.relative(process.cwd(), filePath)} in the project.)`,
        filePath,
        current,
      );
      proposeSpinner.stop("Diff ready");
    } catch (error) {
      proposeSpinner.stop("Error occurred");
      p.note(error.message, "Error");
      continue;
    }

    if (proposed === current) {
      console.log("(no changes proposed)");
      continue;
    }

    const beforeSnippet = current.split("\n").slice(0, 20).join("\n");
    const afterSnippet = proposed.split("\n").slice(0, 20).join("\n");

    console.log(chalk.yellow("----- BEFORE (first 20 lines) -----"));
    console.log(beforeSnippet || "(empty file)");
    console.log(chalk.yellow("----- AFTER (first 20 lines) ------"));
    console.log(afterSnippet || "(empty file)");

    const confirm = await p.confirm({
      message: `Apply changes to ${path.relative(process.cwd(), filePath)}?`,
      initialValue: true,
    });
    if (!confirm) {
      continue;
    }

    try {
      await fs.writeFile(filePath, proposed, "utf8");
      console.log("Changes applied.");
    } catch (error) {
      p.note(error.message, "Error writing file");
    }
  }
}

async function runGangWorkflow(configPath, input) {
  const s = p.spinner();
  s.start("Running gang workflow...");

  try {
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
        };
      }
    };

    const engine = new GangEngine({ config: gangConfig, llmFactory });
    const run = await engine.runOnce(input);

    s.stop("Done");
    
    // Extract the content
    const finalNode = run.final?.nodeName ?? null;
    const finalType = run.final?.type ?? null;
    const finalContent = run.final?.type === "member"
      ? run.final.output?.content ?? null
      : run.final?.type === "squad"
        ? run.final.outputs
        : null;
    
    // Display formatted output
    console.log(chalk.cyan("\n═════════════════════════════════════════════════"));
    console.log(chalk.cyan(`📋 GANG WORKFLOW RESULT`));
    console.log(chalk.cyan("═════════════════════════════════════════════════"));
    console.log(chalk.bold(`\n🎯 Final Node: ${finalNode}`));
    console.log(chalk.bold(`📝 Type: ${finalType}`));
    console.log(chalk.bold(`\n📄 Content:`));
    console.log(chalk.white(finalContent || "No content generated"));
    console.log(chalk.cyan("═════════════════════════════════════════════════\n"));
    
    // Save to README.md
    if (finalContent) {
      try {
        await fs.writeFile("README.md", `# Gang Workflow Result\n\n**Generated by:** ${finalNode} (${finalType})\n\n${finalContent}\n\n---\n*Generated at: ${new Date().toISOString()}*`);
        console.log(chalk.green("✅ Result saved to README.md"));
      } catch (err) {
        console.error(chalk.red("❌ Failed to save README.md:"), err.message);
      }
    }
  } catch (err) {
    s.stop("Error");
    p.note(err.message, "Error");
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
        { value: "chat", label: "💬 Conversation with AI assistant" },
        { value: "tools", label: "🔧 AI agent with web & file tools" },
        { value: "code", label: "</> Intelligent coding assistant" },
        { value: "gang", label: "👥 Collaborative AI team workflows" },
        { value: "tools-info", label: "ℹ️ List available tools" },
        { value: "exit", label: "👋 Exit" },
      ],
    });

    if (p.isCancel(choice) || choice === "exit") {
      p.outro(theme.warning("Goodbye! Thanks for using REVULATION 2.0."));
      process.exit(0);
    }

    if (choice === "chat") {
      await program.parseAsync([process.argv[0], process.argv[1], "chat"]);
      return; // chat command has its own loop and exits when user is done
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
