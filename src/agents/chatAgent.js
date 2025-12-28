import { createLLM } from "../config/llm.js";
import { chatLogger } from "../config/logging.js";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { createToolCallingAgent, AgentExecutor } from "langchain/agents";
import { webSearch } from "../tools/webSearch.js";
import { scrapeUrl } from "../tools/scraper.js";
import { listDirectory, readFileTool } from "../tools/computerTools.js";
import { mcpCall } from "../tools/mcpTools.js";

// ChatAgent keeps simple OpenAI-style message history per user
// and supports both one-shot and streaming chat with optional tool capabilities.
export class ChatAgent {
  constructor(creditManager) {
    this.credits = creditManager;
    this.histories = new Map(); // userId -> { role, content }[]
    this.llmReady = false;
    this.agentMode = false; // Enable agent mode for tool calling
    this.executor = null;
    this.tools = [];
    this.initLLM();
  }

  async initLLM() {
    if (this.llmReady) return;

    if (process.env.GROQ_API_KEY) {
      try {
        const { ChatGroq } = await import("@langchain/groq");
        this.llm = new ChatGroq({
          model: "openai/gpt-oss-120b", // Use valid Groq model
          temperature: 0.6,
          apiKey: process.env.GROQ_API_KEY.trim(),
        });
        console.log('[ChatAgent] Using Groq with openai/gpt-oss-120b');
      } catch (err) {
        console.error('Failed to use Groq, falling back to GLM:', err.message);
        this.llm = await createLLM({ model: "GLM-4.5-Flash" });
      }
    } else {
      // Fallback to GLM with proper model
      this.llm = await createLLM({ model: "GLM-4.5-Flash" });
    }
    this.llmReady = true;
  }

  _getHistory(userId) {
    return this.histories.get(userId) || [];
  }

  async chatOnce(userId, userMessage, options = {}) {
    await this.initLLM();
    const { systemPrompt } = options;
    let history = this._getHistory(userId);

    const messages = [...history];
    if (systemPrompt && history.length === 0) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: userMessage });

    const response = await this.llm.invoke(messages);
    const answer = response.content?.toString?.() ?? String(response.content);

    // Update in-memory history
    history = [
      ...history,
      { role: "user", content: userMessage },
      { role: "assistant", content: answer },
    ];
    this.histories.set(userId, history);

    // Rough token estimate (you can replace with real token counts later)
    const inputTokens = userMessage.split(/\s+/).length;
    const outputTokens = answer.split(/\s+/).length;
    this.credits.recordUsage(userId, inputTokens, outputTokens);

    const usage = this.credits.getUsage(userId);

    chatLogger.info(`user=${userId}`, { inputTokens, outputTokens, usage });

    return { answer, usage };
  }

  // Streaming chat: calls onToken for each chunk of text as it arrives,
  // and returns final answer and updated usage when complete.
  async streamChat(userId, userMessage, options = {}) {
    await this.initLLM();
    const { systemPrompt, onToken } = options;
    let history = this._getHistory(userId);

    const messages = [...history];
    if (systemPrompt && history.length === 0) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: userMessage });

    const stream = await this.llm.stream(messages);

    let answer = "";
    for await (const chunk of stream) {
      const token = chunk.content ?? "";
      answer += token;
      if (onToken) {
        await onToken(token);
      }
    }

    // Update in-memory history
    history = [
      ...history,
      { role: "user", content: userMessage },
      { role: "assistant", content: answer },
    ];
    this.histories.set(userId, history);

    // Rough token estimate (you can replace with real token counts later)
    const inputTokens = userMessage.split(/\s+/).length;
    const outputTokens = answer.split(/\s+/).length;
    this.credits.recordUsage(userId, inputTokens, outputTokens);

    const usage = this.credits.getUsage(userId);

    chatLogger.info(`user=${userId}`, { inputTokens, outputTokens, usage });

    return { answer, usage };
  }
}