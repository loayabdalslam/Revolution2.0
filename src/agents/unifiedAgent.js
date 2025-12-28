import { ChatAgent } from "./chatAgent.js";
import { ToolsAgent } from "./toolsAgent.js";
import { CodingAgent } from "./codingAgent.js";
import { chatLogger, toolsLogger, codingLogger } from "../config/logging.js";

/**
 * UnifiedAgentManager - Manages seamless switching between agent modes
 * 
 * Modes:
 * - chat: Basic conversational AI with streaming
 * - tools: Agent with web search, scraping, file tools, MCP
 * - coding: Code generation and file editing capabilities
 * - auto: Automatic mode detection based on user input
 */
export class UnifiedAgentManager {
  constructor(creditManager) {
    this.creditManager = creditManager;
    this.chatAgent = new ChatAgent(creditManager);
    this.toolsAgent = null; // Lazy initialization
    this.codingAgent = null; // Lazy initialization
    
    // Shared context across modes
    this.sharedContext = new Map(); // userId -> context
    this.currentModes = new Map(); // userId -> current mode
    
    // Mode detection patterns
    this.modePatterns = {
      tools: [
        /search|find|look up|web|internet|scrape|url|link|website/i,
        /file|read|write|directory|folder|list/i,
        /computer|system|terminal|command/i,
        /mcp|call|invoke/i
      ],
      coding: [
        /code|program|app|application|create|build|develop/i,
        /function|class|component|module|script/i,
        /debug|fix|refactor|edit|modify/i,
        /test|unit test|integration test/i,
        /generate.*code|write.*code|create.*file/i
      ],
      chat: [
        /talk|chat|conversation|discuss|explain/i,
        /help|assist|guide|advice/i,
        /what|why|how|when|where/i
      ]
    };
  }

  async getToolsAgent() {
    if (!this.toolsAgent) {
      this.toolsAgent = new ToolsAgent();
      await this.toolsAgent.initialize();
    }
    return this.toolsAgent;
  }

  async getCodingAgent() {
    if (!this.codingAgent) {
      this.codingAgent = new CodingAgent();
      await this.codingAgent.init();
    }
    return this.codingAgent;
  }

  getUserContext(userId) {
    return this.sharedContext.get(userId) || {
      history: [],
      lastMode: 'chat',
      preferences: {},
      sessionData: {}
    };
  }

  updateUserContext(userId, updates) {
    const context = this.getUserContext(userId);
    Object.assign(context, updates);
    this.sharedContext.set(userId, context);
  }

  detectMode(input, userId) {
    const context = this.getUserContext(userId);
    
    // Check for explicit mode requests
    if (input.match(/switch to chat|chat mode|conversation mode/i)) {
      return 'chat';
    }
    if (input.match(/switch to tools|tools mode|agent mode|use tools/i)) {
      return 'tools';
    }
    if (input.match(/switch to code|coding mode|developer mode|code mode/i)) {
      return 'coding';
    }
    
    // Pattern-based detection
    for (const [mode, patterns] of Object.entries(this.modePatterns)) {
      for (const pattern of patterns) {
        if (input.match(pattern)) {
          return mode;
        }
      }
    }
    
    // Default to chat or last used mode
    return context.lastMode || 'chat';
  }

  async processMessage(userId, userMessage, options = {}) {
    const context = this.getUserContext(userId);
    let mode = options.mode || this.detectMode(userMessage, userId);
    
    // Handle explicit mode switching
    if (userMessage.match(/switch to|change mode|use .* mode/i)) {
      const newMode = this.detectMode(userMessage, userId);
      this.updateUserContext(userId, { lastMode: newMode });
      return {
        answer: `Switched to ${newMode} mode. How can I help you?`,
        mode: newMode,
        usage: this.creditManager.getUsage(userId),
        modeSwitched: true
      };
    }
    
    // Update context
    this.updateUserContext(userId, { lastMode: mode });
    this.currentModes.set(userId, mode);
    
    // Route to appropriate agent
    let result;
    try {
      switch (mode) {
        case 'tools':
          result = await this.processWithToolsAgent(userId, userMessage, options);
          break;
        case 'coding':
          result = await this.processWithCodingAgent(userId, userMessage, options);
          break;
        case 'chat':
        default:
          result = await this.processWithChatAgent(userId, userMessage, options);
          break;
      }
    } catch (error) {
      console.error(`Error in ${mode} mode:`, error);
      // Fallback to chat mode
      try {
        result = await this.processWithChatAgent(userId, userMessage, {
          ...options,
          fallbackMode: true
        });
        result.fallback = true;
        result.originalError = error.message;
      } catch (fallbackError) {
        throw new Error(`All modes failed. Original: ${error.message}, Fallback: ${fallbackError.message}`);
      }
    }
    
    // Update shared context
    this.updateUserContext(userId, {
      history: [
        ...context.history,
        { role: 'user', content: userMessage, mode },
        { role: 'assistant', content: result.answer, mode }
      ]
    });
    
    return {
      ...result,
      mode,
      context: this.getUserContext(userId)
    };
  }

  async processWithChatAgent(userId, userMessage, options) {
    const context = this.getUserContext(userId);
    
    // Add mode context to system prompt if needed
    let systemPrompt = options.systemPrompt;
    if (options.fallbackMode) {
      systemPrompt = (systemPrompt || '') + '\n\nNote: Another mode failed, so I\'m responding in chat mode.';
    }
    
    // Add context from other modes if relevant
    if (context.history.length > 0) {
      const recentContext = context.history
        .slice(-6) // Last 3 exchanges
        .map(h => `${h.role} (${h.mode}): ${h.content}`)
        .join('\n');
      
      if (!systemPrompt) {
        systemPrompt = `You are switching between different AI modes (chat, tools, coding). Recent context:\n${recentContext}`;
      }
    }
    
    return await this.chatAgent.streamChat(userId, userMessage, {
      systemPrompt,
      onToken: options.onToken
    });
  }

  async processWithToolsAgent(userId, userMessage, options) {
    const context = this.getUserContext(userId);
    const toolsAgent = await this.getToolsAgent();
    
    // Add context from chat/coding modes
    let enhancedTask = userMessage;
    if (context.history.length > 0) {
      const relevantContext = context.history
        .slice(-4) // Last 2 exchanges
        .filter(h => h.mode !== 'tools') // Avoid duplication
        .map(h => `${h.role}: ${h.content}`)
        .join('\n');
      
      if (relevantContext) {
        enhancedTask = `${userMessage}\n\nContext from previous conversation:\n${relevantContext}`;
      }
    }
    
    const result = await toolsAgent.run(enhancedTask);
    
    return {
      answer: result,
      usage: this.creditManager.getUsage(userId) || { inputTokens: 0, outputTokens: 0 }
    };
  }

  async processWithCodingAgent(userId, userMessage, options) {
    const context = this.getUserContext(userId);
    const codingAgent = await this.getCodingAgent();
    
    // For coding mode, we'll primarily use design capabilities
    // but can also integrate with file editing if requested
    
    if (userMessage.match(/generate|create|build|write.*code/i)) {
      // Use design mode for code generation requests
      const result = await codingAgent.streamDesign(userMessage, {
        onToken: options.onToken
      });
      
      return {
        answer: result,
        usage: this.creditManager.getUsage(userId) || { inputTokens: 0, outputTokens: 0 }
      };
    } else {
      // Use regular LLM for coding discussions
      return await this.processWithChatAgent(userId, userMessage, {
        ...options,
        systemPrompt: "You are a senior software engineer. Provide expert advice on coding, architecture, and development practices."
      });
    }
  }

  // Stream processing for unified interface
  async streamProcessMessage(userId, userMessage, options = {}) {
    const context = this.getUserContext(userId);
    const mode = options.mode || this.detectMode(userMessage, userId);
    
    // Update context
    this.updateUserContext(userId, { lastMode: mode });
    this.currentModes.set(userId, mode);
    
    let firstToken = true;
    let answer = "";
    
    const wrappedOnToken = async (token) => {
      if (firstToken) {
        // Could emit mode change notification here
        if (options.onModeChange) {
          await options.onModeChange(mode);
        }
        firstToken = false;
      }
      answer += token;
      if (options.onToken) {
        await options.onToken(token);
      }
    };
    
    const result = await this.processMessage(userId, userMessage, {
      ...options,
      onToken: wrappedOnToken
    });
    
    return result;
  }

  // Get current mode for user
  getCurrentMode(userId) {
    return this.currentModes.get(userId) || 'chat';
  }

  // Get available modes and descriptions
  getAvailableModes() {
    return {
      chat: {
        name: 'Chat',
        description: 'Conversational AI with streaming responses',
        capabilities: ['text generation', 'conversation', 'explanation', 'help']
      },
      tools: {
        name: 'Tools Agent',
        description: 'AI agent with web search, file access, and computer tools',
        capabilities: ['web search', 'file operations', 'web scraping', 'MCP calls']
      },
      coding: {
        name: 'Coding Agent',
        description: 'Code generation and development assistance',
        capabilities: ['code generation', 'app design', 'file editing', 'development guidance']
      },
      auto: {
        name: 'Auto Mode',
        description: 'Automatically selects the best mode based on your input',
        capabilities: ['intelligent mode switching', 'context awareness', 'seamless experience']
      }
    };
  }

  // Clear user context and history
  clearUserContext(userId) {
    this.sharedContext.delete(userId);
    this.currentModes.delete(userId);
    this.chatAgent.histories.delete(userId);
  }

  // Get conversation statistics
  getStats(userId) {
    const context = this.getUserContext(userId);
    const modeCounts = {};
    
    context.history.forEach(item => {
      modeCounts[item.mode] = (modeCounts[item.mode] || 0) + 1;
    });
    
    return {
      totalMessages: context.history.length,
      currentMode: this.getCurrentMode(userId),
      modeUsage: modeCounts,
      usage: this.creditManager.getUsage(userId)
    };
  }
}