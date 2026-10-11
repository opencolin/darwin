// The worker: runs one task under a harness. The harness decides rules, tools, guardrails and turn budget;
// the worker never bypasses it. Every run is an episodic memory record and a Raindrop event.
import { randomUUID } from "node:crypto";
import type { Harness } from "./harness.ts";
import type { Task } from "./tasks.ts";
import { execTool, type ToolCall } from "./env.ts";
import { scoreRun, type RunOutcome } from "./scorer.ts";
import { chat, parseToolArgs, type Msg, type ToolDef } from "./llm.ts";
import { config } from "./config.ts";
import { getRaindrop } from "./observe.ts";

export const TOOL_DEFS: Record<string, ToolDef> = {
  read_file: {
    type: "function",
    function: { name: "read_file", description: "Read a file's full contents.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  },
  write_file: {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or overwrite a file with exact content.",
      parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
    },
  },
  list_files: {
    type: "function",
    function: { name: "list_files", description: "List files, optionally under a prefix.", parameters: { type: "object", properties: { prefix: { type: "string" } } } },
  },
  run_tests: {
    type: "function",
    function: { name: "run_tests", description: "Run the repository's test suite. Returns PASS or FAIL with details.", parameters: { type: "object", properties: {} } },
  },
  shell: {
    type: "function",
    function: {
      name: "shell",
      description: "Run a shell command. Supports rm [-rf], cat, ls, echo. No pipes, redirects or substitutions.",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
    },
  },
};

export interface RunRecord {
  runId: string;
  eventId: string;
  taskId: string;
  split: Task["split"];
  family: Task["family"];
  harnessVersion: number;
  outcome: RunOutcome;
  toolCalls: ToolCall[];
  finalText: string;
  turns: number;
  tokens: { prompt: number; completion: number };
  ms: number;
  createdAt: Date;
}

export function buildSystemPrompt(h: Harness, lessons: string[]): string {
  const parts = ["You are a software agent working in a small repository through tools.", "Rules:", ...h.systemRules.map((r, i) => `${i + 1}. ${r}`)];
  if (h.skills.length) parts.push("", "Skills (procedures that worked before):", ...h.skills.map((s) => `## ${s.title}\n${s.body}`));
  if (lessons.length) parts.push("", "Lessons from memory relevant to this task:", ...lessons.map((l) => `- ${l}`));
  parts.push("", `You have at most ${h.contextPolicy.maxTurns} turns. When the task is complete, reply with the single word DONE.`);
  return parts.join("\n");
}

export async function runTask(
  harness: Harness,
  task: Task,
  opts: { lessons?: string[]; convoId?: string; log?: (s: string) => void } = {},
): Promise<RunRecord> {
  const c = config();
  const env = task.build();
  const tools = harness.toolAllowlist.filter((t) => TOOL_DEFS[t]).map((t) => TOOL_DEFS[t]);
  const messages: Msg[] = [
    { role: "system", content: buildSystemPrompt(harness, opts.lessons ?? []) },
    { role: "user", content: task.prompt },
  ];
  const eventId = randomUUID();
  const convoId = opts.convoId ?? `harness-v${harness.version}`;
  const interaction = getRaindrop()?.begin({
    eventId,
    event: "darwin_worker_run",
    userId: c.operatorId,
    convoId,
    input: task.prompt,
    model: c.workerModel,
    properties: { task_id: task.id, split: task.split, family: task.family, harness_version: harness.version },
  });

  const max = harness.contextPolicy.maxTurns;
  const t0 = Date.now();
  const tokens = { prompt: 0, completion: 0 };
  let turns = 0;
  let finished = false;
  let finalText = "";
  while (turns < max) {
    turns++;
    const res = await chat({ model: c.workerModel, messages, tools });
    tokens.prompt += res.usage.prompt;
    tokens.completion += res.usage.completion;
    const m = res.message;
    messages.push(m);
    if (m.tool_calls?.length) {
      for (const tc of m.tool_calls) {
        const args = parseToolArgs(tc.function.arguments);
        const call = execTool(env, harness.toolAllowlist, harness.guardrails, tc.function.name, args);
        opts.log?.(`    ${tc.function.name}(${JSON.stringify(args).slice(0, 70)}) -> ${call.result.split("\n")[0].slice(0, 70)}`);
        messages.push({ role: "tool", tool_call_id: tc.id, name: tc.function.name, content: call.result.slice(0, 4000) });
      }
      continue;
    }
    finalText = m.content ?? "";
    if (/\bDONE\b/.test(finalText)) {
      finished = true;
      break;
    }
    messages.push({ role: "user", content: "Continue. Use the tools to complete the task, then reply DONE." });
  }

  const outcome = scoreRun(task.id, env, turns, max, finished);
  const ms = Date.now() - t0;
  interaction?.setProperties({
    passed: outcome.passed,
    failure_category: outcome.failureCategory ?? "none",
    violations: outcome.violations.length,
    blocked_calls: outcome.blockedBy.length,
    turns,
    tests_run: outcome.testsRun,
    latency_ms: ms,
    prompt_tokens: tokens.prompt,
    completion_tokens: tokens.completion,
  });
  interaction?.finish({ output: finalText || "(no final message: ran out of turns)" });
  const rd = getRaindrop();
  if (rd) {
    await rd.trackSignal({
      eventId,
      name: outcome.passed ? "task_passed" : `task_failed_${outcome.failureCategory}`,
      sentiment: outcome.passed ? "POSITIVE" : "NEGATIVE",
      ...(outcome.violations.length ? { comment: outcome.violations.join("; ") } : {}),
    });
  }
  return {
    runId: randomUUID(),
    eventId,
    taskId: task.id,
    split: task.split,
    family: task.family,
    harnessVersion: harness.version,
    outcome,
    toolCalls: env.calls,
    finalText,
    turns,
    tokens,
    ms,
    createdAt: new Date(),
  };
}
