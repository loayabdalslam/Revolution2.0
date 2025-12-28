import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLLM } from "../config/llm.js";
import { gaiaLogger } from "../config/logging.js";
import { theme } from "../config/theme.js";

// LangChain built-in tools
import { DuckDuckGoSearchRun } from "@langchain/community/tools/duckduckgo_search";
import { WikipediaQueryRun } from "@langchain/community/tools/wikipedia_query_run";
import {
  DynamicTool,
  Tool,
} from "@langchain/core/tools";
import { Calculator } from "@langchain/community/tools/calculator";
import { initializeAgentExecutor } from "langchain/agents";

export class GaiaAgent {
  constructor(options = {}) {
    this.options = {
      model: options.model || "mixtral-8x7b-32768",
      temperature: options.temperature || 0.2,
      maxTokens: options.maxTokens || 4000,
      enableTools: options.enableTools !== false,
      maxIterations: options.maxIterations || 5,
      verbose: options.verbose || false,
      ...options
    };

    this.llm = null;
    this.tools = [];
    this.agentExecutor = null;
    this.initialized = false;
    this.benchmarkCategories = this.initializeBenchmarkCategories();
    this.currentBenchmarkResults = [];
    this.progressCallback = null;
  }

  initializeBenchmarkCategories() {
    return {
      "reasoning": {
        description: "Logical reasoning and problem-solving tasks",
        color: theme?.primary || "#3498db",
        examples: ["mathematical proofs", "logical puzzles", "deductive reasoning"]
      },
      "knowledge": {
        description: "General knowledge and factual recall",
        color: theme?.success || "#27ae60",
        examples: ["historical facts", "scientific concepts", "geographical information"]
      },
      "coding": {
        description: "Programming and algorithmic challenges",
        color: theme?.warning || "#f39c12",
        examples: ["code completion", "debugging", "algorithm design"]
      },
      "language": {
        description: "Natural language understanding and generation",
        color: theme?.info || "#9b59b6",
        examples: ["text summarization", "translation", "creative writing"]
      },
      "multimodal": {
        description: "Tasks involving multiple data types",
        color: theme?.danger || "#e74c3c",
        examples: ["image analysis", "audio processing", "mixed media tasks"]
      },
      "ethics": {
        description: "Ethical reasoning and moral philosophy",
        color: "#34495e",
        examples: ["ethical dilemmas", "moral reasoning", "philosophical questions"]
      },
      "science": {
        description: "Scientific reasoning and analysis",
        color: "#16a085",
        examples: ["experimental design", "data interpretation", "scientific methodology"]
      }
    };
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Initialize LLM based on available API keys
      if (process.env.GROQ_API_KEY) {
        this.llm = new ChatGroq({
          model: this.options.model,
          temperature: this.options.temperature,
          maxTokens: this.options.maxTokens,
          apiKey: process.env.GROQ_API_KEY,
        });
        gaiaLogger.success("Initialized GaiaAgent with Groq");
      } else if (process.env.GLM_API_KEY) {
        this.llm = createLLM({
          model: this.options.model,
          temperature: this.options.temperature,
          maxTokens: this.options.maxTokens
        });
        gaiaLogger.success("Initialized GaiaAgent with GLM");
      } else {
        throw new Error("No API keys available. Please set GROQ_API_KEY or GLM_API_KEY");
      }

      // Initialize LangChain built-in tools if enabled
      if (this.options.enableTools) {
        await this.initializeTools();
        await this.initializeAgent();
      }

      this.initialized = true;
      gaiaLogger.info("GaiaAgent initialized successfully");
    } catch (error) {
      gaiaLogger.error(`Failed to initialize GaiaAgent: ${error.message}`);
      throw error;
    }
  }

  async initializeTools() {
    try {
      this.tools = [];

      // Web search tools
      this.tools.push(
        new DuckDuckGoSearchRun({
          name: "duckduckgo_search",
          description: "Search for current events, news, and general web content using DuckDuckGo. Use this for up-to-date information."
        }),
        new WikipediaQueryRun({
          name: "wikipedia_search",
          description: "Search Wikipedia for encyclopedic information and factual data. Use this for established knowledge and facts."
        })
      );

      // Calculator for mathematical tasks
      this.tools.push(
        new Calculator({
          name: "calculator",
          description: "Useful for mathematical calculations, computations, and numerical problem-solving"
        })
      );

      // Custom reasoning tool
      this.tools.push(
        new DynamicTool({
          name: "logical_reasoning",
          description: "Apply logical reasoning frameworks to solve complex problems step by step. Use for deductive and inductive reasoning tasks.",
          func: async (input) => {
            return `Logical Reasoning Analysis for: ${input}
            
Reasoning Framework Applied:
1. Problem Decomposition: Breaking down the complex problem into manageable components
2. Pattern Recognition: Identifying relevant patterns and relationships
3. Logical Deduction: Applying formal logic rules
4. Hypothesis Testing: Evaluating potential solutions
5. Conclusion Synthesis: Combining insights to reach a reasoned answer

Key Principles:
- Avoid logical fallacies
- Ensure sound premises
- Follow valid inference rules
- Consider alternative explanations
- Verify reasoning chain consistency

This structured approach ensures comprehensive and logically sound problem-solving.`;
          }
        })
      );

      // Knowledge verification tool
      this.tools.push(
        new DynamicTool({
          name: "knowledge_verification",
          description: "Cross-reference and verify factual information for accuracy. Use to check claims and validate information.",
          func: async (input) => {
            return `Knowledge Verification for: ${input}
            
Verification Methodology:
1. Source Credibility Assessment: Evaluating the reliability of information sources
2. Cross-Reference Analysis: Checking multiple independent sources
3. Temporal Accuracy: Ensuring information is current and relevant
4. Contextual Validation: Understanding the context and scope of claims
5. Consistency Check: Identifying potential contradictions or biases

Verification Criteria:
- Primary sources preferred over secondary
- Peer-reviewed sources for scientific claims
- Multiple independent corroboration
- Recent updates and revisions considered
- Expert consensus when available

This rigorous verification process ensures high factual accuracy and reliability.`;
          }
        })
      );

      gaiaLogger.success(`Initialized ${this.tools.length} LangChain tools for GaiaAgent`);
    } catch (error) {
      gaiaLogger.error(`Failed to initialize tools: ${error.message}`);
      throw error;
    }
  }

  async initializeAgent() {
    if (!this.llm || this.tools.length === 0) {
      throw new Error("LLM and tools must be initialized before creating agent");
    }

    try {
      // Create agent executor with tools
      this.agentExecutor = initializeAgentExecutor({
        tools: this.tools,
        llm: this.llm,
        agentType: "chat-conversational-react-description",
        verbose: this.options.verbose,
        maxIterations: this.options.maxIterations,
        returnIntermediateSteps: true
      });

      gaiaLogger.success("Initialized LangChain agent executor");
    } catch (error) {
      gaiaLogger.error(`Failed to initialize agent: ${error.message}`);
      throw error;
    }
  }

  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  async processBenchmarkQuestion(questionData) {
    if (!this.initialized) {
      await this.initialize();
    }

    const {
      question,
      category,
      difficulty = "medium",
      context = "",
      expectedAnswer = null,
      id = null
    } = questionData;

    const startTime = Date.now();

    try {
      gaiaLogger.info(`Processing ${category} benchmark question: ${question.substring(0, 100)}...`);

      let response;
      let intermediateSteps = [];

      const expectedFormat = questionData.type || "string";

      if (this.agentExecutor && this.shouldUseTools(category, difficulty)) {
        // Use agent with tools
        const agentInput = this.buildAgentPrompt(question, category, difficulty, context, expectedFormat);

        try {
          const result = await this.agentExecutor.invoke({
            input: agentInput
          });

          response = result.output;
          intermediateSteps = result.intermediateSteps || [];
        } catch (agentError) {
          gaiaLogger.warn(`Agent execution failed, falling back to direct LLM: ${agentError.message}`);
          // Fallback to direct LLM
          response = await this.callLLMDirectly(question, category, difficulty, context, expectedFormat);
        }
      } else {
        // Use direct LLM
        response = await this.callLLMDirectly(question, category, difficulty, context, expectedFormat);
      }

      const responseTime = Date.now() - startTime;
      const analysis = this.analyzeResponse(response, expectedAnswer, intermediateSteps);

      const result = {
        id: id || Date.now(),
        question,
        category,
        difficulty,
        answer: response,
        responseTime,
        analysis,
        intermediateSteps,
        timestamp: new Date().toISOString(),
        toolsUsed: intermediateSteps.map(step => step.tool || 'unknown')
      };

      // Update progress if callback is set
      if (this.progressCallback) {
        this.progressCallback(result);
      }

      return result;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      gaiaLogger.error(`Error processing benchmark question: ${error.message}`);

      return {
        id: id || Date.now(),
        question,
        category,
        difficulty,
        answer: `Error: ${error.message}`,
        responseTime,
        error: true,
        errorMessage: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  shouldUseTools(category, difficulty) {
    // Determine if tools should be used based on category and difficulty
    const toolFriendlyCategories = ["reasoning", "knowledge", "science", "ethics"];
    const toolRequiredDifficulties = ["hard", "expert"];

    return toolFriendlyCategories.includes(category) ||
      toolRequiredDifficulties.includes(difficulty);
  }

  buildAgentPrompt(question, category, difficulty, context, expectedFormat = null) {
    const categoryInfo = this.benchmarkCategories[category] || {};

    let prompt = `You are a general AI assistant. I will ask you a question. Report your thoughts, and finish your answer with following template: FINAL ANSWER: [YOUR FINAL ANSWER]. YOUR FINAL ANSWER should be a number OR as few words as possible OR a comma separated list of numbers and/or strings.

Category: ${category.toUpperCase()}
Difficulty: ${difficulty.toUpperCase()}
Description: ${categoryInfo.description || "Complex benchmark task"}

Question: ${question}`;

    if (context && context.trim()) {
      prompt += `\n\nContext: ${context}`;
    }

    if (expectedFormat) {
      prompt += `\n\nExpected Answer Format: ${expectedFormat}`;
    }

    prompt += `

Formatting Instructions:
- If you are asked for a number, don't use comma to write your number neither use units such as $ or percent sign unless specified otherwise.
- If you are asked for a string, don't use articles, neither abbreviations (e.g. for cities), and write digits in plain text unless specified otherwise.
- If you are asked for a comma separated list, apply above rules depending of whether element to be put in list is a number or a string.
- Always end with "FINAL ANSWER: " followed by your answer.

Tools available:
- duckduckgo_search: For current information and web content
- wikipedia_search: For factual and encyclopedic information
- calculator: For mathematical calculations
- logical_reasoning: For structured problem analysis
- knowledge_verification: For fact-checking and validation

Please provide comprehensive reasoning followed by your final answer in the required format.`;

    return prompt;
  }

  async callLLMDirectly(question, category, difficulty, context, expectedFormat = "string") {
    const systemPrompt = this.buildSystemPrompt(category, difficulty);
    const userPrompt = this.buildUserPrompt(question, context, expectedFormat);

    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt)
    ];

    const response = await this.llm.invoke(messages);
    return response.content;
  }

  buildSystemPrompt(category, difficulty) {
    const basePrompt = `You are a general AI assistant. I will ask you a question. Report your thoughts, and finish your answer with following template: FINAL ANSWER: [YOUR FINAL ANSWER]. YOUR FINAL ANSWER should be a number OR as few words as possible OR a comma separated list of numbers and/or strings. If you are asked for a number, don't use comma to write your number neither use units such as $ or percent sign unless specified otherwise. If you are asked for a string, don't use articles, neither abbreviations (e.g. for cities), and write digits in plain text unless specified otherwise. If you are asked for a comma separated list, apply above rules depending of whether the element to be put in list is a number or a string.

Current Category: ${category}
Difficulty Level: ${difficulty}

Key Guidelines:
- Provide step-by-step reasoning for complex problems
- Show your work when applicable (especially for mathematical/coding problems)
- Be precise and accurate in your responses
- Always end with "FINAL ANSWER: " followed by your answer in the correct format
- For coding problems, provide clean, well-commented code
- For reasoning problems, clearly explain your logical steps
- For knowledge-based questions, ensure factual accuracy`;

    const categorySpecific = this.getCategorySpecificPrompt(category);

    return `${basePrompt}

${categorySpecific}

Remember: This is a benchmark evaluation. Always end with FINAL ANSWER: followed by your correctly formatted answer.`;
  }

  getCategorySpecificPrompt(category) {
    const prompts = {
      "reasoning": `For reasoning tasks:
- Break down complex problems into smaller, manageable steps
- Use logical frameworks and systematic approaches
- Clearly state any assumptions you make
- Consider alternative solutions and explain your choices
- Validate your reasoning chain for logical consistency`,

      "knowledge": `For knowledge tasks:
- Provide accurate and up-to-date information
- Cite relevant facts and sources when appropriate
- Acknowledge any limitations in your knowledge
- Distinguish between established facts and reasonable inferences
- Cross-reference information when possible`,

      "coding": `For coding tasks:
- Write clean, efficient, and well-documented code
- Consider edge cases and error handling
- Explain your algorithmic approach
- Use appropriate data structures and design patterns
- Test your solution mentally for correctness`,

      "language": `For language tasks:
- Demonstrate strong comprehension skills
- Use clear and articulate language
- Show creativity where appropriate
- Maintain proper grammar and syntax
- Consider cultural and contextual nuances`,

      "multimodal": `For multimodal tasks:
- Integrate information from multiple sources
- Consider how different data types relate to each other
- Provide comprehensive analysis across modalities
- Acknowledge any limitations in processing certain data types`,

      "ethics": `For ethics tasks:
- Consider multiple ethical frameworks and perspectives
- Identify stakeholders and potential consequences
- Apply ethical principles systematically
- Acknowledge moral complexity and ambiguity
- Provide well-reasoned ethical justification`,

      "science": `For science tasks:
- Apply scientific methodology and principles
- Consider experimental design and data interpretation
- Use established scientific concepts accurately
- Acknowledge limitations and uncertainties
- Distinguish between theory and empirical evidence`
    };

    return prompts[category] || "";
  }

  buildUserPrompt(question, context, expectedFormat) {
    let prompt = `Question: ${question}`;

    if (context && context.trim()) {
      prompt += `\n\nAdditional Context: ${context}`;
    }

    if (expectedFormat) {
      prompt += `\n\nExpected Answer Type: ${expectedFormat}`;
    }

    prompt += `\n\nPlease provide comprehensive reasoning followed by your final answer in the required format, ending with "FINAL ANSWER:" followed by your answer.`;

    return prompt;
  }

  analyzeResponse(response, expectedAnswer, intermediateSteps = []) {
    const analysis = {
      length: response.length,
      hasReasoning: false,
      hasCodeBlocks: false,
      hasStepByStep: false,
      hasMathematicalContent: false,
      toolsUsed: intermediateSteps.length,
      confidenceScore: 0.7, // Base confidence
      complexity: 'medium'
    };

    // Check for reasoning indicators
    if (/step|first|next|finally|therefore|because|since|due to|reason|conclude/i.test(response)) {
      analysis.hasReasoning = true;
      analysis.confidenceScore += 0.1;
    }

    // Check for code blocks
    if (/```[\s\S]*```/.test(response)) {
      analysis.hasCodeBlocks = true;
      analysis.confidenceScore += 0.05;
    }

    // Check for step-by-step structure
    if (/\d+\.|step \d+|first,|second,|third,/i.test(response)) {
      analysis.hasStepByStep = true;
      analysis.confidenceScore += 0.1;
    }

    // Check for mathematical content
    if (/\d+[\+\-\*\/\=\(\)]|formula|equation|calculate|compute/i.test(response)) {
      analysis.hasMathematicalContent = true;
      analysis.confidenceScore += 0.05;
    }

    // Adjust confidence based on tool usage
    if (analysis.toolsUsed > 0) {
      analysis.confidenceScore += Math.min(analysis.toolsUsed * 0.02, 0.1);
    }

    // Determine complexity based on response characteristics
    if (response.length > 1000 && analysis.hasReasoning && analysis.hasStepByStep) {
      analysis.complexity = 'high';
    } else if (response.length < 300) {
      analysis.complexity = 'low';
    }

    analysis.confidenceScore = Math.min(analysis.confidenceScore, 1.0);

    // If expected answer is provided, do basic comparison
    if (expectedAnswer) {
      analysis.matchesExpected = this.compareAnswers(response, expectedAnswer);
    }

    return analysis;
  }

  compareAnswers(response, expectedAnswer) {
    // Enhanced answer comparison
    const responseLower = response.toLowerCase();
    const expectedLower = expectedAnswer.toLowerCase();

    // Check for exact match
    if (responseLower.includes(expectedLower) || expectedLower.includes(responseLower)) {
      return "exact";
    }

    // Check for partial match using word overlap
    const responseWords = responseLower.split(/\s+/).filter(w => w.length > 2);
    const expectedWords = expectedLower.split(/\s+/).filter(w => w.length > 2);
    const commonWords = responseWords.filter(word => expectedWords.includes(word));

    const overlapRatio = commonWords.length / Math.max(responseWords.length, expectedWords.length, 1);

    if (overlapRatio > 0.7) {
      return "high";
    } else if (overlapRatio > 0.4) {
      return "partial";
    } else if (overlapRatio > 0.1) {
      return "low";
    }

    return "none";
  }

  async runBenchmarkSuite(config = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const {
      categories = null,
      difficulty = null,
      maxQuestions = null,
      progressCallback = null,
      saveResults = true
    } = config;

    // Load benchmark questions
    const questions = await this.loadBenchmarkQuestions(categories, difficulty, maxQuestions);

    if (questions.length === 0) {
      throw new Error("No questions found for the specified criteria");
    }

    // Reset current results and set progress callback
    this.currentBenchmarkResults = [];
    this.setProgressCallback(progressCallback);

    console.log(theme.heading("🧪 GAIA BENCHMARK SUITE"));
    console.log(theme.status.info(`Running ${questions.length} benchmark tests...`));

    const results = [];
    let completed = 0;

    for (const questionData of questions) {
      try {
        const result = await this.processBenchmarkQuestion(questionData);
        results.push(result);
        completed++;

        // Update progress
        const progress = (completed / questions.length) * 100;
        console.log(
          theme.icon.test(`✅ [${completed}/${questions.length}] ${result.category.toUpperCase()} - ${result.analysis.confidenceScore.toFixed(2)} confidence (${progress.toFixed(1)}%)`)
        );

        // Add small delay to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.log(theme.icon.error(`❌ Error processing question: ${error.message}`));
        completed++;
      }
    }

    const report = this.generateBenchmarkReport(results);

    if (saveResults) {
      await this.saveBenchmarkResults(report);
    }

    return report;
  }

  async loadBenchmarkQuestions(categories = null, difficulty = null, maxQuestions = null) {
    const { gaiaBenchmarkQuestions, getRandomQuestions } = await import("../config/gaia-benchmark-config.js");

    let questions = gaiaBenchmarkQuestions;

    if (categories && categories.length > 0) {
      if (typeof categories === 'string') {
        categories = [categories];
      }
      questions = questions.filter(q => categories.includes(q.category));
    }

    if (difficulty) {
      questions = questions.filter(q => q.difficulty === difficulty);
    }

    if (maxQuestions && maxQuestions > 0) {
      questions = questions.slice(0, maxQuestions);
    }

    return questions;
  }

  generateBenchmarkReport(results) {
    const report = {
      summary: {
        totalTests: results.length,
        successfulTests: results.filter(r => !r.error).length,
        failedTests: results.filter(r => r.error).length,
        averageConfidence: 0,
        averageResponseTime: 0,
        categoriesTested: [...new Set(results.map(r => r.category))],
        timestamp: new Date().toISOString(),
        toolsUsed: [...new Set(results.flatMap(r => r.toolsUsed || []))]
      },
      categoryBreakdown: {},
      difficultyBreakdown: {},
      toolUsage: {},
      individualResults: results,
      performance: this.calculatePerformanceMetrics(results)
    };

    // Calculate averages and breakdowns
    const successfulResults = results.filter(r => !r.error);

    if (successfulResults.length > 0) {
      const totalConfidence = successfulResults.reduce((sum, result) => sum + result.analysis.confidenceScore, 0);
      const totalResponseTime = successfulResults.reduce((sum, result) => sum + result.responseTime, 0);

      report.summary.averageConfidence = totalConfidence / successfulResults.length;
      report.summary.averageResponseTime = totalResponseTime / successfulResults.length;
    }

    // Category breakdown
    for (const category of report.summary.categoriesTested) {
      const categoryResults = successfulResults.filter(r => r.category === category);
      if (categoryResults.length > 0) {
        const categoryConfidence = categoryResults.reduce((sum, r) => sum + r.analysis.confidenceScore, 0) / categoryResults.length;
        const categoryResponseTime = categoryResults.reduce((sum, r) => sum + r.responseTime, 0) / categoryResults.length;

        report.categoryBreakdown[category] = {
          testsRun: categoryResults.length,
          averageConfidence: categoryConfidence,
          averageResponseTime: categoryResponseTime,
          successRate: categoryResults.length / (results.filter(r => r.category === category).length)
        };
      }
    }

    // Difficulty breakdown
    const difficulties = [...new Set(results.map(r => r.difficulty))];
    for (const diff of difficulties) {
      const diffResults = successfulResults.filter(r => r.difficulty === diff);
      if (diffResults.length > 0) {
        report.difficultyBreakdown[diff] = {
          testsRun: diffResults.length,
          averageConfidence: diffResults.reduce((sum, r) => sum + r.analysis.confidenceScore, 0) / diffResults.length
        };
      }
    }

    // Tool usage statistics
    for (const tool of report.summary.toolsUsed) {
      report.toolUsage[tool] = results.filter(r => r.toolsUsed && r.toolsUsed.includes(tool)).length;
    }

    return report;
  }

  calculatePerformanceMetrics(results) {
    const successfulResults = results.filter(r => !r.error);

    return {
      confidenceDistribution: this.calculateDistribution(successfulResults.map(r => r.analysis.confidenceScore)),
      responseTimeDistribution: this.calculateDistribution(successfulResults.map(r => r.responseTime / 1000)), // Convert to seconds
      categoryPerformance: Object.fromEntries(
        [...new Set(successfulResults.map(r => r.category))].map(cat => [
          cat,
          successfulResults.filter(r => r.category === cat).reduce((sum, r) => sum + r.analysis.confidenceScore, 0) /
          successfulResults.filter(r => r.category === cat).length
        ])
      )
    };
  }

  calculateDistribution(values) {
    if (values.length === 0) return { min: 0, max: 0, mean: 0, median: 0 };

    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const median = sorted[Math.floor(sorted.length / 2)];

    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean,
      median,
      count: values.length
    };
  }

  async saveBenchmarkResults(report) {
    try {
      const filename = `gaia-benchmark-results-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      const filepath = `./reports/${filename}`;

      // Create reports directory if it doesn't exist
      const fs = await import('fs/promises');
      const path = await import('path');

      try {
        await fs.mkdir(path.dirname(filepath), { recursive: true });
      } catch (error) {
        // Directory might already exist
      }

      await fs.writeFile(filepath, JSON.stringify(report, null, 2));
      gaiaLogger.success(`Benchmark results saved to ${filepath}`);

      return filepath;
    } catch (error) {
      gaiaLogger.error(`Failed to save benchmark results: ${error.message}`);
      throw error;
    }
  }

  getBenchmarkCategories() {
    return this.benchmarkCategories;
  }

  async getPerformanceStats() {
    if (!this.initialized) {
      throw new Error("GaiaAgent not initialized");
    }

    return {
      model: this.options.model,
      temperature: this.options.temperature,
      maxTokens: this.options.maxTokens,
      categories: Object.keys(this.benchmarkCategories),
      initialized: this.initialized,
      toolsAvailable: this.tools.map(t => t.name),
      agentConfigured: !!this.agentExecutor
    };
  }

  getCurrentResults() {
    return this.currentBenchmarkResults;
  }

  resetResults() {
    this.currentBenchmarkResults = [];
  }

  // GAIA Submission Format Generator
  async generateSubmissionFile(results = null, filename = null) {
    if (!results) {
      results = this.currentBenchmarkResults;
    }

    if (!results || results.length === 0) {
      throw new Error("No results available for submission file generation");
    }

    const fs = await import('fs/promises');
    const path = await import('path');

    // Generate filename if not provided
    if (!filename) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      filename = `gaia-submission-${timestamp}.jsonl`;
    }

    // Ensure submissions directory exists
    const submissionsDir = './submissions';
    try {
      await fs.mkdir(submissionsDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    const filepath = path.join(submissionsDir, filename);

    try {
      // Generate JSONL format
      const jsonlLines = results.map(result => {
        const finalAnswer = this.extractFinalAnswer(result.answer);

        const submission = {
          task_id: result.id || result.questionId || `task_${result.id}`,
          model_answer: finalAnswer
        };

        // Add reasoning trace if available and meaningful
        if (result.intermediateSteps && result.intermediateSteps.length > 0) {
          submission.reasoning_trace = this.generateReasoningTrace(result);
        } else if (result.answer && result.answer.length > 50) {
          submission.reasoning_trace = result.answer.substring(0, 1000) + (result.answer.length > 1000 ? '...' : '');
        }

        return JSON.stringify(submission);
      }).join('\n');

      await fs.writeFile(filepath, jsonlLines, 'utf8');
      gaiaLogger.success(`GAIA submission file created: ${filepath}`);

      return filepath;
    } catch (error) {
      gaiaLogger.error(`Failed to create submission file: ${error.message}`);
      throw error;
    }
  }

  extractFinalAnswer(response) {
    if (!response) return "";

    // Look for "FINAL ANSWER:" pattern
    const finalAnswerRegex = /FINAL\s+ANSWER:\s*([^\n]+)/i;
    const match = response.match(finalAnswerRegex);

    if (match && match[1]) {
      // Clean up the final answer
      let answer = match[1].trim();

      // Remove quotes if present
      answer = answer.replace(/^["']|["']$/g, '');

      // Convert to lowercase for string answers (GAIA expects case-insensitive)
      if (!/^\d+(\.\d+)?$/.test(answer) && !/,/.test(answer)) {
        answer = answer.toLowerCase();
      }

      return answer;
    }

    // Fallback: try to extract from last line
    const lines = response.split('\n').filter(line => line.trim());
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1].trim();

      // Check if last line looks like a simple answer
      if (lastLine.length < 100 && !/^\s*$/.test(lastLine)) {
        return lastLine.replace(/^["']|["']$/g, '').toLowerCase();
      }
    }

    // Final fallback: return truncated response
    return response.substring(0, 200).trim();
  }

  generateReasoningTrace(result) {
    if (result.intermediateSteps && result.intermediateSteps.length > 0) {
      return result.intermediateSteps.map(step => {
        const tool = step.tool || 'unknown';
        const input = typeof step.input === 'string' ? step.input : JSON.stringify(step.input);
        const output = typeof step.output === 'string' ? step.output : JSON.stringify(step.output);

        return `Used ${tool}: ${input.substring(0, 100)}... -> ${output.substring(0, 100)}...`;
      }).join('\n');
    }

    // Generate trace from response if no intermediate steps
    if (result.answer) {
      // Extract reasoning part (everything before FINAL ANSWER)
      const finalAnswerIndex = result.answer.toUpperCase().indexOf('FINAL ANSWER:');
      if (finalAnswerIndex > 0) {
        return result.answer.substring(0, finalAnswerIndex).trim();
      }
    }

    return "No reasoning trace available";
  }

  // Generate benchmark summary
  generateBenchmarkSummary(results = null) {
    if (!results) {
      results = this.currentBenchmarkResults;
    }

    if (!results || results.length === 0) {
      return {
        error: "No results available for summary generation"
      };
    }

    const successfulResults = results.filter(r => !r.error);
    const failedResults = results.filter(r => r.error);

    const summary = {
      overview: {
        totalQuestions: results.length,
        successfulRuns: successfulResults.length,
        failedRuns: failedResults.length,
        successRate: (successfulResults.length / results.length * 100).toFixed(2) + '%',
        averageConfidence: 0,
        averageResponseTime: 0,
        timestamp: new Date().toISOString()
      },
      performance: {
        categories: {},
        difficulties: {},
        overall: {}
      },
      submissionReady: {
        totalValidForSubmission: successfulResults.length,
        hasFinalAnswers: successfulResults.filter(r => this.extractFinalAnswer(r.answer)).length,
        hasReasoningTraces: successfulResults.filter(r => this.generateReasoningTrace(r).length > 0).length
      },
      recommendations: []
    };

    // Calculate averages
    if (successfulResults.length > 0) {
      const totalConfidence = successfulResults.reduce((sum, r) => sum + (r.analysis?.confidenceScore || 0), 0);
      const totalResponseTime = successfulResults.reduce((sum, r) => sum + (r.responseTime || 0), 0);

      summary.overview.averageConfidence = (totalConfidence / successfulResults.length).toFixed(3);
      summary.overview.averageResponseTime = Math.round(totalResponseTime / successfulResults.length) + 'ms';
    }

    // Category breakdown
    const categories = [...new Set(successfulResults.map(r => r.category))];
    for (const category of categories) {
      const categoryResults = successfulResults.filter(r => r.category === category);
      const categoryConfidence = categoryResults.reduce((sum, r) => sum + (r.analysis?.confidenceScore || 0), 0) / categoryResults.length;

      summary.performance.categories[category] = {
        count: categoryResults.length,
        averageConfidence: categoryConfidence.toFixed(3),
        successRate: (categoryResults.length / results.filter(r => r.category === category).length * 100).toFixed(2) + '%'
      };
    }

    // Difficulty breakdown
    const difficulties = [...new Set(successfulResults.map(r => r.difficulty))];
    for (const difficulty of difficulties) {
      const diffResults = successfulResults.filter(r => r.difficulty === difficulty);
      const diffConfidence = diffResults.reduce((sum, r) => sum + (r.analysis?.confidenceScore || 0), 0) / diffResults.length;

      summary.performance.difficulties[difficulty] = {
        count: diffResults.length,
        averageConfidence: diffConfidence.toFixed(3)
      };
    }

    // Overall performance metrics
    summary.performance.overall = {
      confidenceDistribution: this.calculateConfidenceDistribution(successfulResults),
      responseTimeDistribution: this.calculateResponseTimeDistribution(successfulResults),
      toolUsage: this.analyzeToolUsage(successfulResults)
    };

    // Generate recommendations
    summary.recommendations = this.generateRecommendations(summary);

    return summary;
  }

  calculateConfidenceDistribution(results) {
    const ranges = {
      'low (0.0-0.3)': 0,
      'medium (0.3-0.7)': 0,
      'high (0.7-1.0)': 0
    };

    results.forEach(result => {
      const confidence = result.analysis?.confidenceScore || 0;
      if (confidence < 0.3) ranges['low (0.0-0.3)']++;
      else if (confidence < 0.7) ranges['medium (0.3-0.7)']++;
      else ranges['high (0.7-1.0)']++;
    });

    return ranges;
  }

  calculateResponseTimeDistribution(results) {
    const times = results.map(r => r.responseTime || 0).sort((a, b) => a - b);
    if (times.length === 0) return { min: 0, max: 0, median: 0, mean: 0 };

    const mean = times.reduce((sum, t) => sum + t, 0) / times.length;
    const median = times[Math.floor(times.length / 2)];

    return {
      min: times[0] + 'ms',
      max: times[times.length - 1] + 'ms',
      median: median + 'ms',
      mean: Math.round(mean) + 'ms'
    };
  }

  analyzeToolUsage(results) {
    const toolCounts = {};
    results.forEach(result => {
      if (result.toolsUsed) {
        result.toolsUsed.forEach(tool => {
          toolCounts[tool] = (toolCounts[tool] || 0) + 1;
        });
      }
    });
    return toolCounts;
  }

  generateRecommendations(summary) {
    const recommendations = [];

    if (summary.overview.successRate < 80) {
      recommendations.push("Consider improving error handling and fallback mechanisms");
    }

    if (parseFloat(summary.overview.averageConfidence) < 0.7) {
      recommendations.push("Average confidence is below 0.7 - consider adjusting model parameters");
    }

    if (parseInt(summary.overview.averageResponseTime) > 10000) {
      recommendations.push("Response times are high - consider optimizing tool usage");
    }

    if (summary.submissionReady.hasFinalAnswers < summary.submissionReady.totalValidForSubmission) {
      recommendations.push("Some answers missing FINAL ANSWER format - improve prompt formatting");
    }

    // Check category-specific issues
    Object.entries(summary.performance.categories).forEach(([category, perf]) => {
      if (parseFloat(perf.averageConfidence) < 0.6) {
        recommendations.push(`Category '${category}' shows low confidence - consider specialized prompts`);
      }
    });

    if (recommendations.length === 0) {
      recommendations.push("Performance looks good - ready for submission!");
    }

    return recommendations;
  }
}