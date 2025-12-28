import { tool } from "@langchain/core/tools";
import fetch from "node-fetch";
import chalk from "chalk";

// Generic MCP JSON-RPC tool.
// It calls an MCP-compatible server over HTTP.
//
// Configuration via env:
// - MCP_SERVER_URL (required): base URL of the MCP server JSON-RPC endpoint
// - MCP_AUTH_TOKEN (optional): bearer token for auth
//
// Expected input shape (from the LLM):
// {
//   "method": "name_of_mcp_method",
//   "params": { ... optional ... }
// }
//
// The tool returns a stringified representation of the JSON-RPC result.

export const mcpCall = tool(
  async (input) => {
    const url = process.env.MCP_SERVER_URL;
    if (!url) {
      throw new Error(
        "MCP_SERVER_URL is not set. Please configure your MCP server endpoint.",
      );
    }

    let payload;
    try {
      if (typeof input === "string") {
        payload = JSON.parse(input);
      } else {
        payload = input;
      }
    } catch {
      throw new Error(
        "mcp_call expects JSON object input like {\"method\":\"name\",\"params\":{...}}",
      );
    }

    const method = payload.method;
    const params = payload.params || {};
    if (!method || typeof method !== "string") {
      throw new Error(
        "mcp_call input must include a string 'method' field indicating the MCP method name.",
      );
    }

    const body = {
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    };

    const headers = {
      "Content-Type": "application/json",
    };
    const token = process.env.MCP_AUTH_TOKEN;
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    console.log(
      chalk.cyan(
        `[TOOL mcp_call] Calling MCP method '${method}' at ${url} with params: ${JSON.stringify(
          params,
        ).slice(0, 160)}`,
      ),
    );

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`MCP server error ${res.status}: ${await res.text()}`);
    }

    const json = await res.json();

    if (json.error) {
      throw new Error(
        `MCP error ${json.error.code}: ${json.error.message || "unknown"}`,
      );
    }

    const result = json.result ?? null;
    const asString =
      typeof result === "string" ? result : JSON.stringify(result, null, 2);

    console.log(
      chalk.gray(
        `[TOOL mcp_call] Result preview: ${asString
          .slice(0, 200)
          .replace(/\s+/g, " ")}...`,
      ),
    );

    return asString;
  },
  {
    name: "mcp_call",
    description:
      "Call a configured MCP server JSON-RPC method. Input must be {\"method\": string, \"params\": object}.",
  },
);
