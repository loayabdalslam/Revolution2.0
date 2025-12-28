import chalk from "chalk";
import { theme, ui } from "../config/theme.js";

export class ResponseFormatter {
  static separator(char = "─", length = 60) {
    return theme.primary(char.repeat(length));
  }

  static section(title, color = null) {
    const titleColor = color || theme.primary;
    const boldText = chalk.bold(`[PANEL] ${title}`);
    return `\n${titleColor(ui.separator('═', 60))}\n${titleColor(boldText)}\n${titleColor(ui.separator('═', 60))}\n`;
  }

  static cleanLog(text) {
    // Remove log prefixes from responses
    return text.replace(/\[[A-Z]+\]/g, '').trim();
  }

  static formatAgentResponse(agentName, response) {
    return `\n${theme.heading(`${agentName.toUpperCase()}:`)}\n${theme.code(response)}\n`;
  }

  static formatUsage(usage) {
    return theme.textMuted(`Usage — inputTokens: ${usage.inputTokens}, outputTokens: ${usage.outputTokens}, creditsUsed: ${usage.creditsUsed?.toFixed(4) || 'N/A'}`);
  }

  static menuHeader(title) {
    return `\n${theme.heading(title)}\n`;
  }

  static menuFooter() {
    return `\n${theme.textMuted(ui.separator('─', 30))}\n`;
  }

  static codeBlock(code, language = '') {
    return ui.codeBlock(code, language);
  }

  static alert(type, message) {
    return ui.alert[type](message);
  }

  static progress(current, total, width = 30) {
    return ui.progress(current, total, width);
  }

  static table(headers, rows) {
    return ui.table(headers, rows);
  }

  static listItem(text, icon = '•') {
    return ui.listItem(text, icon);
  }

  static fileItem(text) {
    return theme.icon.file(text);
  }

  static folderItem(text) {
    return theme.icon.folder(text);
  }

  static toolItem(text) {
    return theme.icon.tool(text);
  }

  static success(text) {
    return theme.status.success(text);
  }

  static error(text) {
    return theme.status.error(text);
  }

  static warning(text) {
    return theme.status.warning(text);
  }

  static info(text) {
    return theme.status.info(text);
  }
}