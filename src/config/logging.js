// Create a logger that separates logs from main response flow
export const createLogger = (prefix, color = 'gray') => {
  return {
    info: (...args) => {
      // Write logs to stderr to separate from stdout responses
      process.stderr.write(`\x1b[90m[${prefix}]\x1b[0m ${args.join(' ')}\n`);
    },
    success: (...args) => {
      process.stderr.write(`\x1b[32m[${prefix}]\x1b[0m ${args.join(' ')}\n`);
    },
    warn: (...args) => {
      process.stderr.write(`\x1b[33m[${prefix}]\x1b[0m ${args.join(' ')}\n`);
    },
    error: (...args) => {
      process.stderr.write(`\x1b[31m[${prefix}]\x1b[0m ${args.join(' ')}\n`);
    }
  };
};

export const chatLogger = createLogger('CHAT', 'blue');
export const toolsLogger = createLogger('TOOLS', 'green');
export const codingLogger = createLogger('CODING', 'magenta');

// Utility to clean output for responses
export const cleanResponse = (text) => {
  return text.replace(/\[[A-Z]+\]/g, '').trim();
};
