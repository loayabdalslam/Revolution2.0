import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { createToolCallingAgent, AgentExecutor } from "langchain/agents";
import { toolsLogger } from "../config/logging.js";
import { webSearch } from "../tools/webSearch.js";
import { scrapeUrl } from "../tools/scraper.js";
import { listDirectory, readFileTool } from "../tools/computerTools.js";
import { mcpCall } from "../tools/mcpTools.js";

class ToolRegistry {
  constructor(observer) {
    this.observer = observer;
    this.tools = new Map([
      ["web_search", webSearch],
      ["scrape_url", scrapeUrl],
      ["list_directory", listDirectory],
      ["read_file", readFileTool],
    ]);

    // Optionally register MCP tool when configured.
    if (process.env.MCP_SERVER_URL) {
      this.tools.set("mcp_call", mcpCall);
    }
  }

  register(name, tool) {
    this.tools.set(name, tool);
  }

  get(name) {
    const t = this.tools.get(name);
    if (!t) throw new Error(`Unknown tool: ${name}`);
    return t;
  }

  getAll() {
    return Array.from(this.tools.values());
  }

  // Wrap a LangChain tool to emit observability events.
  wrapTool(tool, memberName = "ToolsAgent") {
    const observer = this.observer;
    if (!observer) return tool;

    const wrapped = Object.create(tool);
    wrapped.name = tool.name;
    wrapped.description = tool.description;
    wrapped.invoke = async (input, config) => {
      await observer.onToolCall?.({
        memberName,
        toolName: tool.name,
        input,
      });
      const result = await tool.invoke(input, config);
      await observer.onToolResult?.({
        memberName,
        toolName: tool.name,
        input,
        result,
      });
      return result;
    };
    return wrapped;
  }

  getAllWrapped(memberName = "ToolsAgent") {
    return Array.from(this.tools.values()).map(tool => this.wrapTool(tool, memberName));
  }
}

class AgentMemory {
  constructor() {
    this.buckets = new Map(); // memoryId -> messages[]
  }

  get(memoryId) {
    if (!memoryId) return [];
    return this.buckets.get(memoryId) || [];
  }

  append(memoryId, messages) {
    if (!memoryId) return;
    const current = this.get(memoryId);
    this.buckets.set(memoryId, current.concat(messages));
  }

  clear(memoryId) {
    if (memoryId) {
      this.buckets.delete(memoryId);
    }
  }
}

class AgentObserver {
  constructor(config = {}) {
    this.enabled = config.enabled ?? true;
    this.logLevel = config.logLevel ?? "info";
    this.events = [];
  }

  async onRunStart(payload) {
    if (!this.enabled) return;
    this.events.push({ type: "run_start", ts: Date.now(), ...payload });
  }

  async onRunEnd(payload) {
    if (!this.enabled) return;
    this.events.push({ type: "run_end", ts: Date.now(), ...payload });
  }

  async onToolCall(payload) {
    if (!this.enabled) return;
    this.events.push({ type: "tool_call", ts: Date.now(), ...payload });
  }

  async onToolResult(payload) {
    if (!this.enabled) return;
    this.events.push({ type: "tool_result", ts: Date.now(), ...payload });
  }

  getEvents() {
    return this.events;
  }

  clearEvents() {
    this.events = [];
  }
}



export class ToolsAgent {
  constructor(config = {}) {
    this.config = {
      name: "ToolsAgent",
      role: "Agent that can use tools and run multi-step workflows to help the user",
      memoryId: "default",
      enableObservability: true,
      workflow: {
        maxSteps: 10,
        autoContinue: true
      },
      ...config
    };

    this.initialized = false;
    this.llm = null;
    this.executor = null;
    this.simpleMode = false;
    this.observer = null;
    this.toolRegistry = null;
    this.memory = null;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      console.log(`[${this.config.name}] Starting initialization...`);

      // Initialize observability
      this.observer = new AgentObserver({
        enabled: this.config.enableObservability,
        logLevel: this.config.logLevel
      });

      // Initialize memory
      this.memory = new AgentMemory();

      // Initialize tool registry
      this.toolRegistry = new ToolRegistry(this.observer);

      // Try Groq first, then fall back to GLM like ChatAgent does
      if (process.env.GROQ_API_KEY) {
        try {
          const { ChatGroq } = await import("@langchain/groq");
          this.llm = new ChatGroq({
            model: "openai/gpt-oss-120b",
            temperature: 0.4,
            apiKey: process.env.GROQ_API_KEY.trim(),
          });

          // Test the connection
          console.log(`[${this.config.name}] Testing Groq connection...`);
          await this.llm.invoke([{ type: "human", content: "test" }]);
          console.log(`[${this.config.name}] Using Groq with openai/gpt-oss-120b`);
        } catch (err) {
          console.warn(`[${this.config.name}] Failed to use Groq, falling back to GLM:`, err.message);
          if (err.message.includes('401') || err.message.includes('authentication')) {
            console.error(`[${this.config.name}] Groq authentication failed - check API key`);
          }
          const { createLLM } = await import("../config/llm.js");
          this.llm = await createLLM({ temperature: 0.4 });
          console.log(`[${this.config.name}] Using GLM fallback`);
        }
      } else {
        // Fallback to GLM
        const { createLLM } = await import("../config/llm.js");
        this.llm = await createLLM({ temperature: 0.4 });
        console.log(`[${this.config.name}] Using GLM`);
      }

      this.simpleMode = false;

      try {
        const tools = this.toolRegistry.getAllWrapped(this.config.name);
        console.log(`[${this.config.name}] Attempting to create agent with ${tools.length} tools...`);

        if (tools.length === 0) {
          console.warn(`[${this.config.name}] No tools available, using simple mode`);
          this.simpleMode = true;
        } else {
          const systemPrompt = `You are ${this.config.name}, role: ${this.config.role}.
You can call tools if needed.
Help the user with their request using the available tools.`;

          const prompt = ChatPromptTemplate.fromMessages([
            ["system", systemPrompt],
            ["user", "{input}"],
            new MessagesPlaceholder("agent_scratchpad"),
          ]);

          console.log(`[${this.config.name}] Prompt created successfully`);

          const agent = createToolCallingAgent({ llm: this.llm, tools, prompt });
          console.log(`[${this.config.name}] Agent created successfully`);

          this.executor = new AgentExecutor({
            agent,
            tools,
            verbose: false,
            handle_parsing_errors: true,
            maxIterations: 5,
            returnIntermediateSteps: false
          });
          console.log(`[${this.config.name}] Executor created successfully`);
        }

      } catch (agentError) {
        console.warn(`[${this.config.name}] Agent creation failed, falling back to simple LLM mode:`, agentError.message);
        this.simpleMode = true;
      }

      this.initialized = true;
      console.log(`[${this.config.name}] Initialization complete`);
    } catch (error) {
      console.error(`[${this.config.name}] Constructor error:`, error);
      throw error;
    }
  }

  async run(task) {
    console.log(`[${this.config.name}] Run called with task: ${task}`);

    // Initialize if not already done
    if (!this.initialized) {
      await this.initialize();
    }

    // Validate and sanitize input
    if (!task || typeof task !== 'string') {
      task = String(task || 'Use any tools you need to search, scrape, inspect files, or call MCP, then explain your findings.');
    }

    // Ensure task is not empty or just whitespace
    if (task.trim() === '') {
      task = 'Use any tools you need to search, scrape, inspect files, or call MCP, then explain your findings.';
    }

    // Start observability
    await this.observer?.onRunStart?.({
      agentName: this.config.name,
      input: task,
    });

    let result;
    try {
      if (this.simpleMode) {
        console.log(`[${this.config.name}] Using simple LLM mode`);
        result = await this.runSimpleMode(task);
      } else {
        console.log(`[${this.config.name}] Using full agent mode`);
        result = await this.runAgentMode(task);
      }

      // Store in memory
      this.memory.append(this.config.memoryId, [
        { type: "human", content: task },
        { type: "ai", content: result }
      ]);

      return result;
    } finally {
      await this.observer?.onRunEnd?.({
        agentName: this.config.name,
        input: task,
        result
      });
    }
  }

  async runSimpleMode(task) {
    try {
      // Use the same LLM but without tool binding
      const systemPrompt = `You are ${this.config.name}, role: ${this.config.role}. 
You are a helpful assistant. Provide informative responses based on your knowledge.
You cannot browse the web or access files, but you can share general information and guidance.`;

      const messages = [
        { type: "system", content: systemPrompt },
        ...this.memory.get(this.config.memoryId),
        { type: "human", content: task }
      ];

      const result = await this.llm.invoke(messages);
      return result.content?.toString() || 'No response generated.';
    } catch (error) {
      console.error(`[${this.config.name}] Simple mode error:`, error);
      return `I apologize, but I'm currently unable to process your request due to technical difficulties. Please try again or use a different mode.`;
    }
  }

  async runAgentMode(task) {
    try {
      const memHistory = this.memory.get(this.config.memoryId);
      const contextualInput = memHistory.length > 0
        ? `Previous context:\n${memHistory.map(m => `${m.type}: ${m.content}`).join('\n')}\n\nCurrent request: ${task}`
        : task;

      try {
        const result = await this.executor.invoke({ input: contextualInput });
        console.log(`[${this.config.name}] Executor result received`);
        return result.output || 'No response generated.';
      } catch (agentError) {
        // If agent fails, fall back to simple mode
        console.warn(`[${this.config.name}] Agent execution failed, falling back to simple mode:`, agentError.message);
        return await this.runSimpleMode(task);
      }
    } catch (error) {
      console.error(`[${this.config.name}] Agent mode error:`, error);
      throw new Error(`Agent mode failed: ${error.message}`);
    }
  }

  // Workflow methods for multi-step execution
  async runWorkflow(task, workflowConfig = null) {
    console.log(`[${this.config.name}] Starting workflow execution`);

    const workflow = workflowConfig || this.config.workflow;
    const maxSteps = workflow.maxSteps || 10;
    const autoContinue = workflow.autoContinue !== false;

    let currentStep = 0;
    let currentInput = task;
    let finalResult = null;
    const stepResults = [];

    while (currentStep < maxSteps) {
      console.log(`[${this.config.name}] Workflow step ${currentStep + 1}/${maxSteps}`);

      const stepResult = await this.run(currentInput);
      stepResults.push(stepResult);

      // For now, we'll stop after one step unless autoContinue is explicitly set
      // In a more complex implementation, you could analyze the result to determine
      // if more steps are needed
      if (!autoContinue) break;

      // Simple continuation logic - could be enhanced with decision making
      currentStep++;
      if (currentStep >= maxSteps) break;

      // Use the previous result as context for the next step
      currentInput = `Continue the task based on this previous result: ${stepResult}`;
    }

    finalResult = stepResults[stepResults.length - 1] || 'No results generated';

    console.log(`[${this.config.name}] Workflow completed with ${stepResults.length} steps`);
    return finalResult;
  }

  // Memory management methods
  getMemory(memoryId = null) {
    return this.memory.get(memoryId || this.config.memoryId);
  }

  clearMemory(memoryId = null) {
    this.memory.clear(memoryId || this.config.memoryId);
  }

  // Observability methods
  getEvents() {
    return this.observer?.getEvents() || [];
  }

  clearEvents() {
    this.observer?.clearEvents();
  }

  // Tool management methods
  registerTool(name, tool) {
    this.toolRegistry?.register(name, tool);

    // Reinitialize executor if it exists
    if (this.executor && !this.simpleMode) {
      this.simpleMode = false;
      console.log(`[${this.config.name}] Tool registered, executor will be reinitialized on next run`);
    }
  }

  getAvailableTools() {
    return this.toolRegistry ? Array.from(this.toolRegistry.tools.keys()) : [];
  }
}
