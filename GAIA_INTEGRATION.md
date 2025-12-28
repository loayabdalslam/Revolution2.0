# GAIA Benchmark Integration

This document provides comprehensive information about the GAIA benchmark integration in Revolution 2.0.

## Overview

The GAIA (General AI Assistant) benchmark integration provides:
- **400+ benchmark questions** across 7 categories
- **Production-ready evaluation system** with LangChain tools
- **Submission format generation** for official GAIA leaderboard
- **Comprehensive performance tracking** and reporting

## Features

### 🔧 Production-Ready Components

1. **GaiaAgent Class** (`src/agents/gaiaAgent.js`)
   - LangChain-based agent with tool integration
   - Support for Groq and GLM LLMs
   - Built-in tools: DuckDuckGo search, Wikipedia, Calculator
   - Custom tools: Logical Reasoning, Knowledge Verification

2. **Benchmark Configuration** (`src/config/gaia-benchmark-config.js`)
   - 400+ questions across 7 categories
   - Difficulty levels: easy, medium, hard
   - Answer type classification (string, number, list)

3. **CLI Integration** (`bin/cli.js`)
   - `gaia` command with comprehensive options
   - Main menu integration
   - Interactive configuration

### 📊 Categories Covered

1. **Reasoning** - Logical puzzles, mathematical problems
2. **Knowledge** - Facts, history, science
3. **Coding** - Programming, algorithms, debugging
4. **Language** - Comprehension, translation, linguistics
5. **Multimodal** - Multiple data type processing
6. **Ethics** - Moral reasoning, philosophy
7. **Science** - Scientific methodology, experiments

### 🎯 Usage Examples

#### CLI Commands
```bash
# Quick test with 10 questions
node bin/cli.js gaia --max-questions 10

# Full benchmark with submission file
node bin/cli.js gaia --max-questions 400 --generate-submission

# Specific categories and difficulty
node bin/cli.js gaia --category reasoning knowledge --difficulty hard

# Interactive menu mode
node bin/cli.js
# Select "🧪 GAIA Benchmark Testing Suite"
```

#### Programmatic Usage
```javascript
import { GaiaAgent } from './src/index.js';

const agent = new GaiaAgent({
  model: "mixtral-8x7b-32768",
  enableTools: true,
  verbose: true
});

await agent.initialize();

const results = await agent.runBenchmarkSuite({
  categories: ["reasoning", "knowledge"],
  difficulty: "medium",
  maxQuestions: 50
});

const submissionFile = await agent.generateSubmissionFile(results);
const summary = agent.generateBenchmarkSummary(results);
```

### 📁 File Structure

```
revolution/
├── src/
│   ├── agents/
│   │   ├── gaiaAgent.js           # Main GAIA agent implementation
│   │   └── ...
│   └── config/
│       ├── gaia-benchmark-config.js # 400+ benchmark questions
│       └── ...
├── bin/
│   └── cli.js                     # CLI integration with gaia command
├── submissions/                   # Generated submission files
└── reports/                      # Detailed benchmark reports
```

### 🎮 Interactive Features

The system provides multiple interaction modes:

1. **Quick Test** - 10 questions for rapid validation
2. **Full Test** - 50 questions with submission file
3. **Custom Test** - Choose categories, difficulty, and question count
4. **Generate Submission** - Create official GAIA submission format

### 📊 Submission Format

Generates official GAIA submission files in JSONL format:
```json
{"task_id": "task_001", "model_answer": "canberra", "reasoning_trace": "Capital of Australia is Canberra..."}
{"task_id": "task_002", "model_answer": "6 PM", "reasoning_trace": "Meeting time calculation..."}
```

### 🔧 Configuration Options

```javascript
const agent = new GaiaAgent({
  model: "mixtral-8x7b-32768",     // LLM model
  temperature: 0.2,                  // Response randomness
  maxTokens: 4000,                  // Maximum response length
  enableTools: true,                 // Enable LangChain tools
  maxIterations: 5,                 // Agent tool usage limit
  verbose: false                     // Debug output
});
```

### 📈 Performance Metrics

The system tracks:
- **Confidence scores** for each answer
- **Response times** for performance analysis
- **Tool usage** patterns
- **Category-specific** performance
- **Success rates** by difficulty

### 🚀 Production Deployment

#### Environment Setup
```bash
# Required environment variables
export GROQ_API_KEY="your-groq-api-key"
# or
export GLM_API_KEY="your-glm-api-key"

# Install dependencies
npm install
```

#### Running Benchmarks
```bash
# Production mode with logging
NODE_ENV=production node bin/cli.js gaia --generate-submission

# Continuous monitoring mode
node bin/cli.js gaia --continuous --max-questions 100
```

### 🎯 Submission Ready

The system generates:
- **Official GAIA format** JSONL files
- **Reasoning traces** for each answer
- **Proper answer formatting** (FINAL ANSWER: [answer])
- **Metadata tracking** for evaluation

### 📋 Quality Assurance

#### Answer Formatting
- Enforces GAIA required format: "FINAL ANSWER: [answer]"
- Handles string, number, and list answer types
- Automatic normalization for submission

#### Error Handling
- Graceful degradation when tools fail
- Fallback to direct LLM calls
- Comprehensive logging and error reporting

#### Performance Optimization
- Tool selection based on category and difficulty
- Response caching for repeated questions
- Progress tracking for long-running benchmarks

### 🔄 Integration Points

The GAIA agent integrates with:
- **LangChain** for tool orchestration
- **Revolution logging** for consistent error tracking
- **CLI framework** for seamless user experience
- **File system** for result persistence

### 📊 Reporting Features

Generate comprehensive reports including:
- **Executive summary** with key metrics
- **Category breakdown** by performance
- **Tool usage analysis**
- **Recommendations** for improvement
- **Submission readiness** checklist

---

## Getting Started

1. **Initialize the agent:**
   ```bash
   node bin/cli.js
   # Select "🧪 GAIA Benchmark Testing Suite"
   ```

2. **Run your first test:**
   - Choose "Quick Test (10 questions)"
   - Review results and performance metrics

3. **Generate submission file:**
   - Choose "Generate Submission File"
   - Find submission in `./submissions/` directory

4. **Analyze performance:**
   - Review generated reports in `./reports/`
   - Use recommendations to improve results

The system is now production-ready for GAIA benchmark evaluation!