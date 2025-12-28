import { promises as fs } from "fs";
import { dirname, join, resolve } from "path";
import { createLLM } from "../config/llm.js";
import { codingLogger } from "../config/logging.js";

const SYSTEM_PROMPT = `\
You are Revulation 2.0, an expert software engineering assistant with deep understanding of codebases, architectures, and best practices.

Core Capabilities:
- Analyze existing codebases to understand structure, patterns, and conventions
- Generate production-ready code following established patterns
- Refactor and optimize existing code while maintaining functionality
- Design scalable architectures and suggest improvements
- Debug complex issues with systematic approach
- Write comprehensive tests and documentation
- Follow security best practices and avoid introducing vulnerabilities

Approach:
1. First understand the codebase structure and existing patterns
2. Follow established conventions unless there's a clear reason to deviate
3. Prioritize maintainability, security, and performance
4. Write clean, well-documented code with proper error handling
5. Consider the broader system impact of changes
6. Provide clear explanations for architectural decisions

You work across languages and frameworks, adapting to the project's existing tech stack.
`;

export class CodingAgent {
  constructor() {
    this.llm = null;
    this.initialized = false;
    this.projectContext = new Map(); // projectId -> project analysis
    this.conventionCache = new Map(); // path -> detected conventions
  }

  async init() {
    if (this.initialized) return;
    this.llm = await createLLM({ temperature: 0.3 });
    this.initialized = true;
  }

  async designApp(spec) {
    await this.init();
    const res = await this.llm.invoke([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Project spec:\n${spec}` },
    ]);

    const text = res.content?.toString?.() ?? String(res.content);
    codingLogger.info(`designApp specLen=${spec.length} outLen=${text.length}`);
    return text;
  }

  // Stream the design/thinking tokens as they are produced, and return the full text.
  async streamDesign(spec, { onToken } = {}) {
    await this.init();
    const stream = await this.llm.stream([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Project spec:\n${spec}` },
    ]);

    let full = "";
    for await (const chunk of stream) {
      const token = chunk.content ?? "";
      full += token;
      if (onToken) {
        await onToken(token);
      }
    }

    codingLogger.info(`streamDesign specLen=${spec.length} outLen=${full.length}`);
    return full;
  }

  async generateFile(spec, filePath) {
    await this.init();
    const res = await this.llm.invoke([
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Generate ONE file: ${filePath}\nSpec:\n${spec}`,
      },
    ]);

    const code = res.content?.toString?.() ?? String(res.content);

    await fs.mkdir(dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, code, "utf8");

    codingLogger.info(`generated file ${filePath}`);
    return filePath;
  }

  // Propose an updated version of a file based on instructions and current content.
  // This does not write to disk; callers can show a diff and confirm before saving.
  async proposeFileEdit(instructions, filePath, currentContent) {
    await this.init();
    const res = await this.llm.invoke([
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `You are editing an existing file.\n` +
          `File path: ${filePath}\n` +
          `Instructions:\n${instructions}\n\n` +
          `Current file content between <file> tags. Return ONLY the full, updated file content, no explanations.\n` +
          `<file>\n${currentContent}\n</file>\n`,
      },
    ]);

    const updated = res.content?.toString?.() ?? String(res.content);
    return updated;
  }

  // Edit an existing file: call proposeFileEdit, then write after confirmation in the CLI.
  async editFile(instructions, filePath, currentContent) {
    await this.init();
    const updated = await this.proposeFileEdit(
      instructions,
      filePath,
      currentContent,
    );
    await fs.mkdir(dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, updated, "utf8");
    codingLogger.info(`edited file ${filePath}`);
    return filePath;
  }

  // Analyze project structure and detect patterns
  async analyzeProject(projectPath = process.cwd()) {
    await this.init();

    const analysis = {
      path: projectPath,
      structure: {},
      languages: [],
      frameworks: [],
      conventions: {},
      packageManagers: [],
      buildTools: [],
      testFrameworks: [],
      entryPoints: [],
      configFiles: [],
      dependencies: {}
    };

    try {
      // Read package.json if exists
      const packageJsonPath = join(projectPath, 'package.json');
      try {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
        analysis.dependencies = packageJson.dependencies || {};
        analysis.devDependencies = packageJson.devDependencies || {};
        analysis.scripts = packageJson.scripts || {};

        // Detect frameworks from dependencies
        const deps = { ...analysis.dependencies, ...analysis.devDependencies };
        if (deps.react) analysis.frameworks.push('React');
        if (deps.vue) analysis.frameworks.push('Vue.js');
        if (deps.angular) analysis.frameworks.push('Angular');
        if (deps.express) analysis.frameworks.push('Express.js');
        if (deps.fastify) analysis.frameworks.push('Fastify');
        if (deps.next) analysis.frameworks.push('Next.js');
        if (deps.nuxt) analysis.frameworks.push('Nuxt.js');

        // Detect test frameworks
        if (deps.jest) analysis.testFrameworks.push('Jest');
        if (deps.mocha) analysis.testFrameworks.push('Mocha');
        if (deps.vitest) analysis.testFrameworks.push('Vitest');
        if (deps.cypress) analysis.testFrameworks.push('Cypress');
        if (deps.playwright) analysis.testFrameworks.push('Playwright');
      } catch (e) {
        // No package.json found
      }

      // Scan directory structure
      const scanDir = async (dir, depth = 0) => {
        if (depth > 3) return; // Limit depth for performance

        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });

          for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            const relativePath = fullPath.replace(projectPath, '').replace(/^[\\/]/, '');

            if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
              if (!analysis.structure[relativePath]) {
                analysis.structure[relativePath] = { type: 'directory', files: [] };
              }
              await scanDir(fullPath, depth + 1);
            } else if (entry.isFile()) {
              // Detect file types and languages
              const ext = entry.name.split('.').pop()?.toLowerCase();
              if (ext) {
                if (!analysis.languages.includes(ext)) {
                  analysis.languages.push(ext);
                }
              }

              // Detect config files
              if (entry.name.match(/(config|rc|\.env|\.gitignore|dockerfile|yml|yaml)$/i)) {
                analysis.configFiles.push(relativePath);
              }

              // Detect potential entry points
              if (entry.name.match(/^(index|main|app|server)\.(js|ts|py|java|go|rs)$/i)) {
                analysis.entryPoints.push(relativePath);
              }

              // Store file info
              const parentDir = dirname(relativePath);
              if (!analysis.structure[parentDir]) {
                analysis.structure[parentDir] = { type: 'directory', files: [] };
              }
              analysis.structure[parentDir].files.push(entry.name);
            }
          }
        } catch (e) {
          // Permission errors or other issues
        }
      };

      await scanDir(projectPath);

      // Detect code conventions by sampling files
      await this.detectCodeConventions(projectPath, analysis);

      // Cache the analysis
      const projectId = projectPath.replace(/[^a-zA-Z0-9]/g, '_');
      this.projectContext.set(projectId, analysis);

      codingLogger.info(`Analyzed project at ${projectPath}`);
      return analysis;
    } catch (error) {
      codingLogger.error(`Project analysis failed: ${error.message}`);
      throw error;
    }
  }

  // Detect code conventions from existing files
  async detectCodeConventions(projectPath, analysis) {
    const sampleFiles = [];

    // Find sample files to analyze for conventions
    for (const [dir, info] of Object.entries(analysis.structure)) {
      if (info.files) {
        const codeFiles = info.files.filter(f =>
          f.match(/\.(js|ts|jsx|tsx|py|java|go|rs|cpp|c|h)$/)
        ).slice(0, 2); // Limit samples per directory

        for (const file of codeFiles) {
          sampleFiles.push(join(projectPath, dir, file));
        }
      }
    }

    if (sampleFiles.length === 0) return;

    try {
      const sampleContents = [];
      for (const filePath of sampleFiles.slice(0, 5)) { // Limit total samples
        try {
          const content = await fs.readFile(filePath, 'utf8');
          sampleContents.push({
            path: filePath.replace(projectPath, ''),
            content: content.substring(0, 2000) // Sample first 2KB
          });
        } catch (e) {
          // Skip unreadable files
        }
      }

      if (sampleContents.length > 0) {
        const prompt = `Analyze these code samples and extract coding conventions:
${sampleContents.map(s => `File: ${s.path}\n\`\`\`\n${s.content}\n\`\`\`\n`).join('\n')}

Respond with JSON describing:
- indentationStyle (tabs|spaces)
- quoteStyle (single|double)
- semicolonStyle (always|never|optional)
- namingConvention (camelCase|snake_case|PascalCase|kebab-case)
- maxLineLength (number or null)
- preferredPattern (object-oriented|functional|procedural)
`;

        const response = await this.llm.invoke([
          { role: "system", content: "You are a code analysis expert. Respond with valid JSON only." },
          { role: "user", content: prompt }
        ]);

        try {
          const conventions = JSON.parse(response.content?.toString() || '{}');
          analysis.conventions = conventions;
        } catch (e) {
          // Fallback to basic conventions
          analysis.conventions = {
            indentationStyle: 'spaces',
            quoteStyle: 'single',
            semicolonStyle: 'always',
            namingConvention: 'camelCase',
            maxLineLength: 80,
            preferredPattern: 'object-oriented'
          };
        }
      }
    } catch (error) {
      codingLogger.warn(`Convention detection failed: ${error.message}`);
    }
  }

  // Get project context or analyze if not available
  async getProjectContext(projectPath = process.cwd()) {
    const projectId = projectPath.replace(/[^a-zA-Z0-9]/g, '_');

    if (!this.projectContext.has(projectId)) {
      await this.analyzeProject(projectPath);
    }

    return this.projectContext.get(projectId);
  }

  // Intelligent code generation with context awareness
  async generateWithContext(spec, filePath = null, projectPath = process.cwd()) {
    await this.init();
    const context = await this.getProjectContext(projectPath);

    const contextualPrompt = `Project Context:
- Languages: ${context.languages.join(', ')}
- Frameworks: ${context.frameworks.join(', ')}
- Entry points: ${context.entryPoints.join(', ')}
- Test frameworks: ${context.testFrameworks.join(', ')}

Code Conventions:
- Indentation: ${context.conventions.indentationStyle || 'spaces'}
- Quotes: ${context.conventions.quoteStyle || 'single'}
- Semicolons: ${context.conventions.semicolonStyle || 'always'}
- Naming: ${context.conventions.namingConvention || 'camelCase'}

${filePath ? `Target file: ${filePath}` : ''}

Project spec:
${spec}

Generate code that:
1. Follows the detected conventions and patterns
2. Integrates well with the existing codebase
3. Uses the project's established frameworks and libraries
4. Includes proper error handling and documentation
5. Is production-ready and maintainable
`;

    const res = await this.llm.invoke([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: contextualPrompt },
    ]);

    const code = res.content?.toString?.() ?? String(res.content);

    if (filePath) {
      await fs.mkdir(dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, code, "utf8");
      codingLogger.info(`generated file ${filePath}`);
      return { code, filePath };
    }

    return { code };
  }

  // Analyze and suggest improvements for existing code
  async analyzeAndImprove(filePath, projectPath = process.cwd()) {
    await this.init();
    const context = await this.getProjectContext(projectPath);

    let currentContent;
    try {
      currentContent = await fs.readFile(filePath, 'utf8');
    } catch (error) {
      throw new Error(`Cannot read file ${filePath}: ${error.message}`);
    }

    const prompt = `Analyze this code and suggest improvements:

File: ${filePath}
Project context: Same as above

Code to analyze:
\`\`\`
${currentContent}
\`\`\`

Provide suggestions for:
1. Code quality and best practices
2. Performance optimizations
3. Security considerations
4. Maintainability improvements
5. Integration with project conventions
6. Test coverage recommendations

Respond with a detailed analysis and specific, actionable suggestions.
`;

    const res = await this.llm.invoke([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ]);

    return {
      analysis: res.content?.toString?.() ?? String(res.content),
      originalContent: currentContent,
      filePath,
      context
    };
  }

  // Generate comprehensive test suite
  async generateTests(filePath, projectPath = process.cwd()) {
    await this.init();
    const context = await this.getProjectContext(projectPath);

    let sourceContent;
    try {
      sourceContent = await fs.readFile(filePath, 'utf8');
    } catch (error) {
      throw new Error(`Cannot read source file ${filePath}: ${error.message}`);
    }

    const testFramework = context.testFrameworks[0] || 'jest';
    const fileExt = filePath.split('.').pop()?.toLowerCase();

    let testFileExt;
    switch (fileExt) {
      case 'js': case 'jsx': testFileExt = 'test.js'; break;
      case 'ts': case 'tsx': testFileExt = 'test.ts'; break;
      case 'py': testFileExt = 'test.py'; break;
      default: testFileExt = `test.${fileExt}`;
    }

    const testFilePath = filePath.replace(new RegExp(`\\.${fileExt}$`), `.${testFileExt}`);

    const prompt = `Generate comprehensive tests for this code using ${testFramework}:

Source file: ${filePath}
Test file: ${testFilePath}
Project test framework: ${testFramework}

Source code:
\`\`\`
${sourceContent}
\`\`\`

Generate tests that:
1. Cover all functions/methods and their edge cases
2. Include both positive and negative test cases
3. Test error handling and boundary conditions
4. Follow the project's testing conventions
5. Include setup and teardown if needed
6. Are well-documented with clear test descriptions

Return only the complete test file content.
`;

    const res = await this.llm.invoke([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ]);

    const testCode = res.content?.toString?.() ?? String(res.content);

    await fs.mkdir(dirname(testFilePath), { recursive: true });
    await fs.writeFile(testFilePath, testCode, "utf8");

    codingLogger.info(`generated test file ${testFilePath}`);

    return {
      testCode,
      testFilePath,
      sourceFilePath: filePath,
      testFramework
    };
  }
}
