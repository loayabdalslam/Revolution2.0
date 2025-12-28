import { test } from "node:test";
import assert from "node:assert";
import { promises as fs } from "fs";
import path from "path";

import { GangEngine, createMember, createWorkflow } from "../src/workflows/gangEngine.js";

// Fake LLM that always returns a static JSON payload
function createFakeLlm() {
  return {
    async invoke(messages) {
      // Echo last user message into content for visibility
      const last = messages[messages.length - 1];
      const baseContent = typeof last?.content === "string" ? last.content : "";
      return {
        content: JSON.stringify({
          content: `fake-llm-response:${baseContent.slice(0, 20)}`,
          next: null,
          actions: [],
        }),
      };
    },
  };
}

test("GangEngine runOnce with single member and no tools", async () => {
  const gangConfig = {
    name: "test-gang",
    version: 1,
    llm: {
      model: "test-model",
      temperature: 0
    },
    members: [
      createMember("m1", "Simple member.", [], "global")
    ],
    workflow: createWorkflow("m1"),
    observability: {
      enabled: false
    }
  };

  const engine = new GangEngine({
    config: gangConfig,
    llmFactory: () => createFakeLlm(),
  });

  const run = await engine.runOnce("hello world");

  assert.ok(run.final, "final node should exist");
  assert.strictEqual(run.final.type, "member");
  assert.strictEqual(run.final.nodeName, "m1");
  assert.ok(
    typeof run.final.output.content === "string",
    "member content should be a string",
  );
});

test("evaluateTestAssertions with contains", async () => {
  const gangConfig = {
    name: "test-gang",
    version: 1,
    llm: { model: "test-model", temperature: 0 },
    members: [
      createMember("tester", "Testing member.", [], "global")
    ],
    workflow: createWorkflow("tester"),
    observability: { enabled: false }
  };

  const engine = new GangEngine({ 
    config: gangConfig, 
    llmFactory: () => createFakeLlm() 
  });

  const run = {
    nodes: [
      {
        type: "member",
        nodeName: "tester",
        output: { content: "there is an edge case here" },
      },
    ],
  };

  const testDef = {
    asserts: [
      { type: "contains", target: "tester", value: "edge case" },
      { type: "contains", target: "tester", value: "missing" },
    ],
  };

  const res = engine.evaluateTestAssertions(testDef, run);
  assert.strictEqual(res.length, 2);
  assert.strictEqual(res[0].passed, true);
  assert.strictEqual(res[1].passed, false);
});

test("runTests executes gang tests and writes reports", async () => {
  const gangConfig = {
    name: "test-gang",
    version: 1,
    llm: {
      model: "test-model",
      temperature: 0
    },
    members: [
      createMember("tester", "Testing member.", [], "global")
    ],
    workflow: createWorkflow("tester"),
    observability: {
      enabled: false
    },
    tests: [
      {
        name: "basic",
        input: "check edge case",
        asserts: [
          {
            type: "contains",
            target: "tester",
            value: "fake-llm-response"
          }
        ]
      }
    ]
  };

  const engine = new GangEngine({
    config: gangConfig,
    llmFactory: () => createFakeLlm(),
  });

  const results = await engine.runTests();
  assert.ok(results.length >= 1, "should run at least one test");
  const first = results[0];
  assert.ok(first.assertions[0].passed, "contains assertion should pass");

  const jsonReport = path.join(process.cwd(), "gang_reports", "test-gang_tests.json");
  const mdReport = path.join(process.cwd(), "gang_reports", "test-gang_tests.md");

  await fs.access(jsonReport);
  await fs.access(mdReport);
});