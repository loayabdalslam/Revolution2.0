import { promises as fs } from "fs";
import path from "path";
import { tool } from "@langchain/core/tools";
import chalk from "chalk";

// List files in a directory relative to the current working directory.
export const listDirectory = tool(
  async (dir = ".") => {
    console.log(chalk.cyan(`[TOOL list_directory] Listing directory: ${dir}`));
    const target = path.resolve(process.cwd(), dir);
    const entries = await fs.readdir(target, { withFileTypes: true });
    const listing = entries
      .map((e) => `${e.isDirectory() ? "[dir]" : "[file]"} ${e.name}`)
      .join("\n");
    console.log(
      chalk.gray(
        `[TOOL list_directory] Found ${entries.length} entries. Preview: ${listing
          .split("\n")
          .slice(0, 5)
          .join(", ")}`,
      ),
    );
    return listing;
  },
  {
    name: "list_directory",
    description:
      "List files and folders in a directory on the local machine (relative to the current working directory).",
  }
);

// Read a text file relative to the current working directory.
export const readFileTool = tool(
  async (relativePath) => {
    console.log(
      chalk.cyan(`[TOOL read_file] Reading file: ${relativePath}`),
    );
    const target = path.resolve(process.cwd(), relativePath);
    const content = await fs.readFile(target, "utf8");
    const snippet = content.slice(0, 4000);
    console.log(
      chalk.gray(
        `[TOOL read_file] Content preview: ${snippet
          .slice(0, 160)
          .replace(/\s+/g, " ")}...`,
      ),
    );
    // Limit output length to keep things safe and usable
    return snippet;
  },
  {
    name: "read_file",
    description:
      "Read the contents of a local text file (relative path) for analysis or editing.",
  }
);
