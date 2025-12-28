import chalk from "chalk";

// Revulation 2.0-inspired purple theme configuration
export const theme = {
  // Primary purple colors
  primary: chalk.hex('#8b5cf6'),      // Purple-500
  primaryLight: chalk.hex('#a78bfa'), // Purple-400  
  primaryDark: chalk.hex('#7c3aed'),  // Purple-600
  primaryDarker: chalk.hex('#6d28d9'), // Purple-700

  // Accent colors
  accent: chalk.hex('#ec4899'),        // Pink-500
  accentLight: chalk.hex('#f472b6'),  // Pink-400

  // Success colors (green with purple tint)
  success: chalk.hex('#10b981'),       // Emerald-500
  successBg: chalk.bgHex('#10b981'),  // Emerald-500 background

  // Warning colors  
  warning: chalk.hex('#f59e0b'),       // Amber-500
  warningBg: chalk.bgHex('#f59e0b'),  // Amber-500 background

  // Error colors
  error: chalk.hex('#ef4444'),         // Red-500
  errorBg: chalk.bgHex('#ef4444'),     // Red-500 background

  // Neutral colors
  text: chalk.hex('#e5e7eb'),          // Gray-200
  textMuted: chalk.hex('#9ca3af'),     // Gray-400
  border: chalk.hex('#6b7280'),        // Gray-500

  // Background colors for panels
  bgPanel: chalk.bgHex('#1f2937'),    // Gray-800
  bgPanelLight: chalk.bgHex('#374151'), // Gray-700

  // Special formatting
  heading: (text) => chalk.bold.hex('#8b5cf6')(text),
  subheading: (text) => chalk.hex('#a78bfa')(text),
  highlight: (text) => chalk.hex('#ec4899')(text),
  code: (text) => chalk.hex('#e5e7eb')(text),

  // Panel formatting
  panelHeader: (text) => chalk.bold.bgHex('#7c3aed').hex.white(` ${text} `),
  panelSubheader: (text) => chalk.hex('#a78bfa')(`▶ ${text}`),

  // Status indicators
  status: {
    success: (text) => chalk.bgHex('#10b981').hex('#ffffff')(` ✓ ${text} `),
    error: (text) => chalk.bgHex('#ef4444').hex('#ffffff')(` ✗ ${text} `),
    warning: (text) => chalk.bgHex('#f59e0b').hex('#ffffff')(` ⚠ ${text} `),
    info: (text) => chalk.bgHex('#8b5cf6').hex('#ffffff')(` ℹ ${text} `),
  },

  // Icon formatting
  icon: {
    file: (text) => chalk.hex('#a78bfa')(`📄 ${text}`),
    folder: (text) => chalk.hex('#8b5cf6')(`📁 ${text}`),
    code: (text) => chalk.hex('#ec4899')(`</> ${text}`),
    tool: (text) => chalk.hex('#f59e0b')(`🔧 ${text}`),
    search: (text) => chalk.hex('#3b82f6')(`🔍 ${text}`),
    test: (text) => chalk.hex('#10b981')(`🧪 ${text}`),
    rocket: (text) => chalk.hex('#ec4899')(`🚀 ${text}`),
  },

  // Gradient effects
  gradient: {
    start: chalk.hex('#6d28d9'),   // Dark purple
    middle: chalk.hex('#8b5cf6'),  // Primary purple  
    end: chalk.hex('#a78bfa'),     // Light purple
  }
};

// Helper functions for consistent styling
export const ui = {
  // Panel creation
  panel: (title, color = theme.primary) => {
    const border = '─'.repeat(60);
    return `${color(border)}\n${color(`┌─ ${title} ─┐`)}\n${color(border)}`;
  },

  // Separator lines
  separator: (char = '─', length = 60, color = theme.primary) => {
    return color(char.repeat(length));
  },

  // Section headers
  section: (title, color = theme.primary) => {
    const border = '═'.repeat(60);
    return `${color(border)}\n${color(title)}\n${color(border)}`;
  },

  // List items
  listItem: (text, icon = '•', color = theme.primary) => {
    return `${color(icon)} ${text}`;
  },

  // Code blocks
  codeBlock: (code, language = '') => {
    const lines = code.split('\n');
    const maxWidth = Math.max(...lines.map(line => line.length));
    const border = '─'.repeat(maxWidth + 4);

    return `${theme.border(border)}\n${theme.code('│ ' + lines.join('\n│ ') + ' │')}\n${theme.border(border)}`;
  },

  // Progress indicator
  progress: (current, total, width = 30) => {
    const filled = Math.round((current / total) * width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `${theme.primary('[')}${theme.primaryLight(bar)}${theme.primary(']')} ${current}/${total}`;
  },

  // Table formatting
  table: (headers, rows) => {
    const colWidths = headers.map((h, i) =>
      Math.max(h.length, ...rows.map(row => String(row[i] || '').length))
    );

    const formatRow = (row) => {
      return colWidths.map((width, i) =>
        String(row[i] || '').padEnd(width)
      ).join(' | ');
    };

    const headerRow = formatRow(headers);
    const separator = colWidths.map(width => '─'.repeat(width)).join('─┼─');
    const dataRows = rows.map(formatRow);

    return [
      theme.primary(headerRow),
      theme.border(separator),
      ...dataRows.map(row => theme.text(row))
    ].join('\n');
  },

  // Alert boxes
  alert: {
    success: (message) => theme.status.success(message),
    error: (message) => theme.status.error(message),
    warning: (message) => theme.status.warning(message),
    info: (message) => theme.status.info(message),
  }
};

export default theme;