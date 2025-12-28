import { promises as fs } from "fs";
import path from "path";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { createToolCallingAgent, AgentExecutor } from "langchain/agents";
import { createLLM } from "../config/llm.js";
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

  async loadCustomTools(customDefs, baseDir) {
    if (!Array.isArray(customDefs)) return;
    for (const def of customDefs) {
      const modPath = path.resolve(baseDir, def.module);
      const mod = await import(modPath);
      const tool = mod[def.export];
      if (!tool) {
        throw new Error(
          `Custom tool export "${def.export}" not found in ${modPath}`,
        );
      }
      this.register(def.name, tool);
    }
  }

  // Wrap a LangChain tool to emit observability events.
  wrapTool(tool, memberName) {
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
}

class GangMemory {
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
}

class GangObserver {
  constructor(config = {}) {
    this.enabled = config.enabled ?? true;
    this.logLevel = config.logLevel ?? "info";
    this.markdownReport = config.markdownReport || null; // { enabled, file }
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

  async onNodeStart(payload) {
    if (!this.enabled) return;
    this.events.push({ type: "node_start", ts: Date.now(), ...payload });
  }

  async onNodeEnd(payload) {
    if (!this.enabled) return;
    this.events.push({ type: "node_end", ts: Date.now(), ...payload });
  }

  async onMemberMessage(payload) {
    if (!this.enabled) return;
    this.events.push({ type: "member_message", ts: Date.now(), ...payload });
  }

  async onToolCall(payload) {
    if (!this.enabled) return;
    this.events.push({ type: "tool_call", ts: Date.now(), ...payload });
  }

  async onToolResult(payload) {
    if (!this.enabled) return;
    this.events.push({ type: "tool_result", ts: Date.now(), ...payload });
  }

  async flushMarkdownIfNeeded(baseDir, workflowName) {
    if (!this.enabled) return;
    if (!this.markdownReport || !this.markdownReport.enabled) return;

    const file = this.markdownReport.file
      ? path.resolve(baseDir, this.markdownReport.file)
      : path.resolve(baseDir, `./reports/${workflowName}_run.md`);

    const lines = ["# Gang Workflow Run Report", ""];
    for (const ev of this.events) {
      const ts = new Date(ev.ts).toISOString();
      if (ev.type === "member_message") {
        lines.push(
          `## Gang Member ${ev.memberName} (${ts})`,
          "",
          "### Input",
          "",
          "```",
          ev.input ?? "",
          "```",
          "",
          "### Output (raw)",
          "",
          "```",
          typeof ev.rawOutput === "string"
            ? ev.rawOutput
            : JSON.stringify(ev.rawOutput, null, 2),
          "```",
          "",
        );
      } else if (ev.type === "tool_call") {
        lines.push(
          `### Tool call: ${ev.toolName} (member: ${ev.memberName}, ${ts})`,
          "",
          "```json",
          JSON.stringify({ input: ev.input }, null, 2),
          "```",
          "",
        );
      } else if (ev.type === "tool_result") {
        lines.push(
          `### Tool result: ${ev.toolName} (member: ${ev.memberName}, ${ts})`,
          "",
          "```json",
          JSON.stringify({ result: ev.result }, null, 2),
          "```",
          "",
        );
      }
    }

    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, lines.join("\n"), "utf8");
  }
}

function parseMemberJsonOutput(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return {
        content: parsed.content ?? "",
        next: parsed.next ?? null,
        actions: parsed.actions ?? [],
        raw,
        parsed,
      };
    }
  } catch {
    // fall through
  }
  return {
    content: raw,
    next: null,
    actions: [],
    raw,
    parsed: null,
  };
}

class MemberRunner {
  constructor(def, llm, toolsMap, memory, toolRegistry, observer) {
    this.def = def;
    this.llm = llm;
    this.toolsMap = toolsMap; // Map name -> tool
    this.memory = memory;
    this.toolRegistry = toolRegistry;
    this.observer = observer;

    this.hasTools = (def.tools || []).length > 0;

    if (this.hasTools) {
      const wrappedTools = [];
      for (const [name, tool] of this.toolsMap.entries()) {
        const wrapped = this.toolRegistry.wrapTool(tool, def.name);
        wrappedTools.push(wrapped);
      }

const systemParts = [
        "You are ",
        this.def.name,
        ", role: ",
        this.def.role,
        ".",
        "You can call tools if needed.",
        "ALWAYS respond with STRICT JSON, no extra text.",
        "JSON shape: {",
        '  "content": "natural language reasoning and summary",',
        '  "next": "name of next node (member or squad) or null",',
        '  "actions": [',
        '    {',
        '      "type": "string label for what you recommend next",',
        '      "details": "any extra machine-readable info"',
        '    }',
        '  ]',
        '}'
      ];
      
      const systemPrompt = systemParts.join('');

      const prompt = ChatPromptTemplate.fromMessages([
        ["system", systemPrompt],
        ["user", "{input}"],
        new MessagesPlaceholder("agent_scratchpad"),
      ]);

      const agent = createToolCallingAgent({
        llm,
        tools: wrappedTools,
        prompt,
      });

      this.executor = new AgentExecutor({
        agent,
        tools: wrappedTools,
        verbose: false,
      });
    }
  }

  async run(input, ctx = {}) {
    const memHistory = this.memory.get(this.def.memoryId);

    if (this.hasTools) {
      const userInput =
        `Gang workflow input:\n${input}\n\n` +
        `Context:\n${JSON.stringify(ctx, null, 2)}`;

      await this.observer?.onMemberMessage?.({
        phase: "before",
        memberName: this.def.name,
        input: userInput,
      });

      const result = await this.executor.invoke({ input: userInput });
      const rawOutput = result.output ?? "";
      const parsed = parseMemberJsonOutput(
        typeof rawOutput === "string" ? rawOutput : String(rawOutput),
      );

      this.memory.append(this.def.memoryId, [
        { role: "user", content: input },
        { role: "assistant", content: parsed.content },
      ]);

      await this.observer?.onMemberMessage?.({
        phase: "after",
        memberName: this.def.name,
        input,
        rawOutput: rawOutput,
        structured: parsed,
      });

      return parsed;
    }

const systemPrompt =
      `You are ${this.def.name}, role: ${this.def.role}.
You are part of a gang team. Previous shared context may be provided.

IMPORTANT: Respond with JSON only. Do NOT invent or hallucinate workflow steps.
- For "next" field: ONLY use actual member names that exist in your team, OR null to end the workflow
- Do NOT create fake workflow steps like "request_requirements", "gather_stakeholder_input", etc.
- If you don't know what to do next, set "next": null

ALWAYS respond with STRICT JSON of shape {"content": string, "next": string|null, "actions": any[]}.`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...memHistory,
      {
        role: "user",
        content:
          `Gang workflow input:\n${input}\n\n` +
          `Context:\n${JSON.stringify(ctx, null, 2)}`,
      },
    ];

    await this.observer?.onMemberMessage?.({
      phase: "before",
      memberName: this.def.name,
      input,
    });

    const res = await this.llm.invoke(messages);
    const text = res.content?.toString?.() ?? String(res.content);
    const parsed = parseMemberJsonOutput(text);

    this.memory.append(this.def.memoryId, [
      { role: "user", content: input },
      { role: "assistant", content: parsed.content },
    ]);

    await this.observer?.onMemberMessage?.({
      phase: "after",
      memberName: this.def.name,
      input,
      rawOutput: text,
      structured: parsed,
    });

    return parsed;
  }
}

export class GangEngine {
  constructor({ config, llmFactory } = {}) {
    this.config = config;
    this.workflowName = config.name || "unnamed-gang";

    this.observer = null;
    this.toolRegistry = null;
    this.memory = new GangMemory();
    this.members = new Map();
    this.squads = new Map();

    // Allow injecting a fake LLM factory for tests; default to createLLM.
    this.llmFactory =
      llmFactory || (async (opts) => {
        return await createLLM(opts);
      });
  }

  validateConfig(config) {
    const required = ['version', 'llm', 'members', 'workflow'];
    for (const field of required) {
      if (!config[field]) {
        throw new Error(`Missing required gang config field: ${field}`);
      }
    }
    
    // Validate members
    if (!Array.isArray(config.members) || config.members.length === 0) {
      throw new Error("Gang must have at least one member");
    }
    
    // Validate workflow entry exists
    const entryExists = config.members.some(m => m.name === config.workflow.entry);
    if (!entryExists) {
      throw new Error(`Workflow entry '${config.workflow.entry}' is not a defined member`);
    }
  }

  async load() {
    this.validateConfig(this.config);

    this.observer = new GangObserver(this.config.observability || {});
    this.toolRegistry = new ToolRegistry(this.observer);

    await this.toolRegistry.loadCustomTools(
      this.config.tools?.custom,
      process.cwd(),
    );

    const llmOpts = {
      model: this.config.llm?.model,
      temperature: this.config.llm?.temperature ?? 0.4,
    };
    const llm = await this.llmFactory(llmOpts);

    // Build members (formerly agents)
    for (const m of this.config.members || []) {
      const toolsMap = new Map();
      for (const tName of m.tools || []) {
        toolsMap.set(tName, this.toolRegistry.get(tName));
      }
      const runner = new MemberRunner(
        m,
        llm,
        toolsMap,
        this.memory,
        this.toolRegistry,
        this.observer,
      );
      this.members.set(m.name, runner);
    }

    // Build squads (formerly teams)
    for (const s of this.config.squads || []) {
      this.squads.set(s.name, s);
    }
  }

  async runGraph(input, runId = "single") {
    if (!this.members || this.members.size === 0) {
      await this.load();
    }

    const entryName = this.config.workflow?.entry;
    if (!entryName) {
      throw new Error("workflow.entry is required in gang configuration");
    }

    await this.observer?.onRunStart?.({
      runId,
      workflow: this.workflowName,
      input,
    });

    const steps = this.config.workflow?.steps || [];
    const ctx = {};
    const nodeResults = [];

    let current = entryName;
    let safetyCounter = 0;

    while (current && safetyCounter < 50) {
      safetyCounter += 1;
      const nodeName = current;
      await this.observer?.onNodeStart?.({ runId, nodeName });

      let result;

      const squadMeta = this.squads.get(nodeName);
      if (squadMeta) {
        // Squad node
        if (squadMeta.mode === "parallel") {
          const promises = squadMeta.members.map((name) => {
            const member = this.members.get(name);
            if (!member) {
              throw new Error(`Unknown member in squad ${squadMeta.name}: ${name}`);
            }
            return member.run(input, ctx);
          });
          const outputs = await Promise.all(promises);
          const squadNext = outputs.find((o) => o.next)?.next ?? null;
          result = {
            type: "squad",
            nodeName,
            mode: "parallel",
            outputs: outputs.map((o, idx) => ({
              member: squadMeta.members[idx],
              ...o,
            })),
            next: squadNext,
          };
          ctx[nodeName] = result.outputs;
        } else {
          // sequential
          let currentInput = input;
          const seqOutputs = [];
          for (const name of squadMeta.members) {
            const member = this.members.get(name);
            if (!member) {
              throw new Error(
                `Unknown member in squad ${squadMeta.name}: ${name}`,
              );
            }
            const out = await member.run(currentInput, ctx);
            seqOutputs.push({ member: name, ...out });
            currentInput = out.content;
          }
          const last = seqOutputs[seqOutputs.length - 1];
          result = {
            type: "squad",
            nodeName,
            mode: "sequential",
            outputs: seqOutputs,
            next: last?.next ?? null,
          };
          ctx[nodeName] = seqOutputs;
        }
      } else {
        // Single member node
        const member = this.members.get(nodeName);
        if (!member) {
          throw new Error(`Unknown node (neither member nor squad): ${nodeName}`);
        }
        const out = await member.run(input, ctx);
        result = {
          type: "member",
          nodeName,
          output: out,
          next: out.next,
        };
        ctx[nodeName] = out;
      }

      await this.observer?.onNodeEnd?.({ runId, nodeName, result });
      nodeResults.push(result);

      // Determine next node using workflow.steps and the structured next field.
      const structuredNext = result.next;
      let nextNode = null;

      if (steps.length === 0) {
        nextNode = structuredNext || null;
      } else {
        if (structuredNext) {
          // Prefer a step matching from + to or from + when == structuredNext
          const match =
            steps.find(
              (s) =>
                s.from === nodeName &&
                (s.to === structuredNext || s.when === structuredNext),
            ) ||
            steps.find((s) => s.from === nodeName && s.when === "always");
          nextNode = match ? match.to : null;
        } else {
          const always = steps.find(
            (s) => s.from === nodeName && s.when === "always",
          );
          nextNode = always ? always.to : null;
        }
      }

      if (!nextNode) break;
      current = nextNode;
    }

    const finalResult = nodeResults[nodeResults.length - 1] || null;

    await this.observer?.onRunEnd?.({
      runId,
      workflow: this.workflowName,
      input,
      finalNode: finalResult?.nodeName ?? null,
    });

    await this.observer?.flushMarkdownIfNeeded(process.cwd(), this.workflowName);

    return {
      runId,
      workflow: this.workflowName,
      input,
      nodes: nodeResults,
      final: finalResult,
      memory: this.memory,
    };
  }

  async runOnce(input) {
    return this.runGraph(input, "single");
  }

  async runTests() {
    if (!this.config) {
      await this.load();
    }

    const tests = this.config.tests;
    if (!Array.isArray(tests) || tests.length === 0) {
      throw new Error("No tests array defined in gang configuration");
    }

    const results = [];

    for (const t of tests) {
      const runId = t.name || `test_${results.length + 1}`;
      const input = t.input || "";
      const run = await this.runGraph(input, runId);
      const evalResult = this.evaluateTestAssertions(t, run);
      results.push({ test: t, run, assertions: evalResult });
    }

    await this.writeTestReports(results);

    return results;
  }

  evaluateTestAssertions(test, run) {
    const assertions = test.asserts || [];
    const evaluated = [];

    // Build a simple map memberName -> content snippet from run
    const memberOutputs = {};
    for (const node of run.nodes) {
      if (node.type === "squad") {
        for (const o of node.outputs || []) {
          memberOutputs[o.member] = String(o.content ?? o.raw ?? "");
        }
      } else if (node.type === "member") {
        memberOutputs[node.nodeName] = String(
          node.output?.content ?? node.output?.raw ?? "",
        );
      }
    }

    for (const a of assertions) {
      if (a.type === "contains") {
        const targetName = a.target;
        const txt = memberOutputs[targetName] || "";
        const passed = txt.includes(a.value || "");
        evaluated.push({
          ...a,
          passed,
          actualSnippet: txt.slice(0, 200),
        });
      } else {
        evaluated.push({
          ...a,
          passed: false,
          error: `Unknown assertion type: ${a.type}`,
        });
      }
    }

    return evaluated;
  }

  async writeTestReports(results) {
    const reportDir = path.resolve(process.cwd(), "./gang_reports");
    await fs.mkdir(reportDir, { recursive: true });

    const jsonPath = path.join(
      reportDir,
      `${this.workflowName}_tests.json`,
    );
    await fs.writeFile(jsonPath, JSON.stringify(results, null, 2), "utf8");

    const mdPath = path.join(reportDir, `${this.workflowName}_tests.md`);

    const lines = [
      `# Gang Workflow Tests for ${this.workflowName}`,
      "",
    ];

    for (const r of results) {
      const testName = r.test.name || "(unnamed)";
      lines.push(`## ${testName}`, "");
      lines.push("### Input", "", "```", r.test.input || "", "```", "");

      const finalNode = r.run.final?.nodeName ?? "(none)";
      lines.push(`- Final node: ${finalNode}`);
      lines.push("- Assertions:");
      for (const a of r.assertions) {
        lines.push(
          `  - [${a.passed ? "x" : " "}] ${a.type} on ${a.target}: "${a.value}"`
        );
      }
      lines.push("");
    }

    await fs.writeFile(mdPath, lines.join("\n"), "utf8");
  }
}

// Factory functions for creating gang configurations
export function createGang(config) {
  return new GangEngine({ config });
}

export function createMember(name, role, tools = [], memoryId = "shared") {
  return { name, role, tools, memoryId };
}

export function createSquad(name, members, mode = "parallel") {
  return { name, members, mode };
}

export function createWorkflow(entry, steps = []) {
  return { entry, steps };
}