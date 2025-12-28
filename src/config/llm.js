import dotenv from "dotenv";
import { ChatOpenAI } from "@langchain/openai";

// Load env variables once here
dotenv.config();

const DEFAULT_MODEL = "openai/gpt-oss-120b";
// Default to a generic GLM-compatible endpoint; can be overridden via env
const DEFAULT_API_BASE = process.env.GLM_API_BASE || "https://api.z.ai/api/paas/v4/";

// Global, very simple concurrency limiter so we don't send too many LLM
// requests at the same time across all modules (chat, tools, coding, crew).
const MAX_CONCURRENT_REQUESTS = Number.parseInt(
  process.env.LLM_MAX_CONCURRENCY || "1",
  10,
);
let activeRequests = 0;
const waitQueue = [];

async function acquireSlot() {
  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests += 1;
    return () => releaseSlot();
  }

  return new Promise((resolve) => {
    waitQueue.push(() => {
      activeRequests += 1;
      resolve(() => releaseSlot());
    });
  });
}

function releaseSlot() {
  activeRequests = Math.max(0, activeRequests - 1);
  const next = waitQueue.shift();
  if (next) {
    next();
  }
}

function estimateTokensFromText(text) {
  if (!text) return 0;
  return String(text).split(/\s+/).filter(Boolean).length;
}

function estimateTokensFromMessages(messages) {
  if (!Array.isArray(messages)) return 0;
  return messages.reduce((sum, m) => {
    const c = typeof m.content === "string" ? m.content : "";
    return sum + estimateTokensFromText(c);
  }, 0);
}

class RateLimitedChatOpenAI {
  constructor(inner, { creditManager = null, userId = null, label = null } = {}) {
    this.inner = inner;
    this.creditManager = creditManager;
    this.userId = userId;
    this.label = label || "llm";
  }

  async invoke(messages, options) {
    const release = await acquireSlot();
    try {
      const res = await this.inner.invoke(messages, options);

      if (this.creditManager && this.userId) {
        const inputTokens = estimateTokensFromMessages(messages);
        const outputText = res?.content?.toString?.() ?? String(res?.content ?? "");
        const outputTokens = estimateTokensFromText(outputText);
        this.creditManager.recordUsage(this.userId, inputTokens, outputTokens);
      }

      return res;
    } finally {
      release();
    }
  }

  async stream(messages, options) {
    const outer = this;
    async function* wrappedStream() {
      const release = await acquireSlot();
      let collected = "";
      try {
        const innerStream = await outer.inner.stream(messages, options);
        for await (const chunk of innerStream) {
          const token = chunk?.content ?? "";
          collected += token;
          yield chunk;
        }

        if (outer.creditManager && outer.userId) {
          const inputTokens = estimateTokensFromMessages(messages);
          const outputTokens = estimateTokensFromText(collected);
          outer.creditManager.recordUsage(
            outer.userId,
            inputTokens,
            outputTokens,
          );
        }
      } finally {
        release();
      }
    }

    return wrappedStream();
  }

  // Ensure compatibility with LangChain's .bind() API.
  bind(config) {
    const boundInner = this.inner.bind(config);
    return new RateLimitedChatOpenAI(boundInner, {
      creditManager: this.creditManager,
      userId: this.userId,
      label: this.label,
    });
  }
}

export async function createLLM(options = {}) {
  const {
    temperature = 0.6,
    model = DEFAULT_MODEL,
    creditManager = null,
    userId = null,
    label = null,
  } = options;

  // Try Groq first, then fall back to GLM
  if (process.env.GROQ_API_KEY) {
    try {
      // Dynamic import for Groq to avoid dependency issues
      const { ChatGroq } = await import("@langchain/groq");
      
      // Use valid Groq models - map common names to Groq models
      let groqModel;
      if (model.startsWith("groq/")) {
        groqModel = model.replace("groq/", "");
      } else if (model.includes("ll ama")) {
        groqModel = "openai/gpt-oss-120b";
      } else if (model.includes("mixtral")) {
        groqModel = "mixtral-8x7b-32768";
      } else if (model.includes("gemma")) {
        groqModel = "gemma2-9b-it";
      } else {
        groqModel = "openai/gpt-oss-120b"; // Default to a reliable model
      }
      
      const base = new ChatGroq({
        temperature,
        model: groqModel,
        apiKey: process.env.GROQ_API_KEY.trim(), // Ensure no whitespace
      });
      
      // Test the connection with a simple call
      console.log(`[LLM] Testing Groq connection with model: ${groqModel}`);
      try {
        await base.invoke([{ role: "user", content: "test" }]);
        console.log(`[LLM] Groq connection successful`);
        return new RateLimitedChatOpenAI(base, { creditManager, userId, label: label || "groq" });
      } catch (testError) {
        console.warn(`[LLM] Groq connection test failed:`, testError.message);
        if (testError.message.includes('401') || testError.message.includes('authentication')) {
          console.error(`[LLM] Groq authentication failed - check API key`);
        }
        throw testError;
      }
    } catch (importError) {
      console.warn("[LLM] Failed to import or use Groq:", importError.message);
    }
  }

  // Fall back to GLM
  const apiKey = process.env.GLM_API_KEY;
  if (!apiKey) {
    throw new Error(
      "No LLM API key found. Please set either GROQ_API_KEY or GLM_API_KEY in your .env file.\n" +
      "- Groq: https://console.groq.com/ (recommended)\n" +
      "- GLM: https://open.bigmodel.cn/"
    );
  }

  const base = new ChatOpenAI({
    temperature,
    model,
    apiKey,
    configuration: {
      baseURL: DEFAULT_API_BASE,
    },
  });
  
  console.log(`[LLM] Using GLM with model: ${model}`);
  return new RateLimitedChatOpenAI(base, { creditManager, userId, label: label || "glm" });
}
