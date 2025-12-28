export { createLLM } from "./config/llm.js";
export { CreditManager } from "./config/credits.js";
export { theme, ui } from "./config/theme.js";
export { ChatAgent } from "./agents/chatAgent.js";
export { ToolsAgent } from "./agents/toolsAgent.js";
export { CodingAgent } from "./agents/codingAgent.js";
export { GaiaAgent } from "./agents/gaiaAgent.js";
export { UnifiedAgentManager } from "./agents/unifiedAgent.js";

// New Gang workflow framework (JavaScript-based)
export { 
  GangEngine, 
  createGang, 
  createMember, 
  createSquad, 
  createWorkflow 
} from "./workflows/gangEngine.js";


