// The only place the LLM provider lives. OpenAI-compatible chat completions over the AISA gateway
// (swap LLM_BASEURL / key for OpenRouter or Vercel AI Gateway). Worker and meta-agent import only this.
import { config } from "./config.ts";

export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCallReq {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface Msg {
  role: Role;
  content: string | null;
  tool_calls?: ToolCallReq[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatResult {
  message: Msg;
  usage: { prompt: number; completion: number };
  ms: number;
  model: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function chat(opts: {
  model: string;
  messages: Msg[];
  tools?: ToolDef[];
  temperature?: number;
  maxTokens?: number;
}): Promise<ChatResult> {
  const c = config();
  if (!c.llmKey) throw new Error("No LLM key: set AISA_API_KEY (or LLM_API_KEY) in .env");
  const t0 = Date.now();
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    max_tokens: opts.maxTokens ?? 1500,
  };
  // Claude 5.5 models via the gateway reject `temperature`; only send it when a caller asks for it.
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.tools?.length) {
    body.tools = opts.tools;
    body.tool_choice = "auto";
  }
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`${c.llmBaseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${c.llmKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
      if (r.status === 429 || r.status >= 500) {
        lastErr = new Error(`LLM ${r.status}: ${(await r.text()).slice(0, 200)}`);
        await sleep(1500 * (attempt + 1));
        continue;
      }
      if (!r.ok) throw new Error(`LLM ${r.status}: ${(await r.text()).slice(0, 300)}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const j: any = await r.json();
      const m = j.choices?.[0]?.message;
      if (!m) throw new Error("LLM returned no choices");
      return {
        message: { role: "assistant", content: m.content ?? null, tool_calls: m.tool_calls?.length ? m.tool_calls : undefined },
        usage: { prompt: j.usage?.prompt_tokens ?? 0, completion: j.usage?.completion_tokens ?? 0 },
        ms: Date.now() - t0,
        model: j.model ?? opts.model,
      };
    } catch (e) {
      lastErr = e;
      if (attempt === 2) break;
      await sleep(1000 * (attempt + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Extracts the first JSON object from a model reply (tolerates code fences and prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], text, text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)].filter(Boolean) as string[];
  for (const c of candidates) {
    try {
      return JSON.parse(c.trim());
    } catch {
      /* try next */
    }
  }
  return null;
}
