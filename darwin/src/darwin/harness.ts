// A harness is data, not code: everything the meta-agent may change lives here.
// The scorer, the held-out split and the promotion rule are deliberately NOT part of it.

export type GuardrailAction = "block" | "confirm";

export interface Guardrail {
  id: string;
  /** Regex source matched against the tool name plus its JSON arguments. */
  pattern: string;
  action: GuardrailAction;
  reason: string;
}

export interface ContextPolicy {
  maxTurns: number;
  retrieveK: number;
  summarizeAfter: number;
}

export interface Harness {
  version: number;
  parentVersion: number | null;
  status: "candidate" | "active" | "rolled_back" | "superseded";
  systemRules: string[];
  contextPolicy: ContextPolicy;
  guardrails: Guardrail[];
  toolAllowlist: string[];
  skills: { id: string; title: string; body: string }[];
  score: number | null;
  /** The full held-out score this version was measured with (null until evaluated). */
  heldout: { passRate: number; passed: number; total: number; safetyViolations: number } | null;
  createdBy: "human" | "meta-agent";
  rationale: string;
}

export const ALL_TOOLS = ["read_file", "write_file", "list_files", "run_tests", "shell"] as const;

export function baseHarness(): Harness {
  return {
    version: 0,
    parentVersion: null,
    status: "active",
    systemRules: ["Complete the task using the available tools, then reply DONE."],
    contextPolicy: { maxTurns: 8, retrieveK: 0, summarizeAfter: 12 },
    guardrails: [],
    toolAllowlist: [...ALL_TOOLS],
    skills: [],
    score: null,
    heldout: null,
    createdBy: "human",
    rationale: "Baseline harness: no learned rules, no guardrails, all tools.",
  };
}

export type PatchOp =
  | { op: "addRule"; rule: string }
  | { op: "removeRule"; index: number }
  | { op: "addGuardrail"; guardrail: Guardrail }
  | { op: "removeGuardrail"; id: string }
  | { op: "setTools"; tools: string[] }
  | { op: "setContextPolicy"; policy: Partial<ContextPolicy> }
  | { op: "addSkill"; skill: { id: string; title: string; body: string } };

export interface Patch {
  ops: PatchOp[];
  rationale: string;
}

const MAX_OPS = 3;
const MAX_RULES = 12;
const MAX_GUARDRAILS = 10;
const MAX_SKILLS = 8;
const MAX_TEXT = 400;
const MAX_SKILL_BODY = 1200;
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const KNOWN_OPS = new Set([
  "addRule",
  "removeRule",
  "addGuardrail",
  "removeGuardrail",
  "setTools",
  "setContextPolicy",
  "addSkill",
]);

export function validatePatch(h: Harness, patch: unknown): { ok: true } | { ok: false; error: string } {
  if (!patch || typeof patch !== "object") return { ok: false, error: "patch must be an object" };
  const p = patch as Record<string, unknown>;
  if (typeof p.rationale !== "string" || !p.rationale.trim() || p.rationale.length > 600)
    return { ok: false, error: "rationale required (<=600 chars)" };
  if (!Array.isArray(p.ops) || p.ops.length === 0 || p.ops.length > MAX_OPS)
    return { ok: false, error: `ops must be 1..${MAX_OPS} entries` };
  // Whole patch must stay within size limits after applying; check op by op first.
  for (const raw of p.ops) {
    if (!raw || typeof raw !== "object" || !KNOWN_OPS.has((raw as { op?: string }).op ?? ""))
      return { ok: false, error: "unknown op" };
    const op = raw as PatchOp;
    switch (op.op) {
      case "addRule":
        if (typeof op.rule !== "string" || !op.rule.trim() || op.rule.length > MAX_TEXT)
          return { ok: false, error: "bad rule" };
        break;
      case "removeRule":
        if (!Number.isInteger(op.index) || op.index < 0 || op.index >= h.systemRules.length)
          return { ok: false, error: "bad rule index" };
        if (op.index === 0) return { ok: false, error: "base rule 0 is protected" };
        break;
      case "addGuardrail": {
        const g = op.guardrail;
        if (!g || !ID_RE.test(g.id) || (g.action !== "block" && g.action !== "confirm"))
          return { ok: false, error: "bad guardrail" };
        if (typeof g.reason !== "string" || g.reason.length > MAX_TEXT) return { ok: false, error: "bad guardrail reason" };
        if (typeof g.pattern !== "string" || g.pattern.length === 0 || g.pattern.length > 200)
          return { ok: false, error: "bad guardrail pattern" };
        try {
          new RegExp(g.pattern, "i");
        } catch {
          return { ok: false, error: "guardrail pattern is not a valid regex" };
        }
        if (/\(\?|\\\d|\([^)]*[+*][^)]*\)[+*]/.test(g.pattern)) return { ok: false, error: "guardrail pattern too complex" };
        break;
      }
      case "removeGuardrail":
        if (!h.guardrails.some((g) => g.id === op.id)) return { ok: false, error: "no such guardrail" };
        break;
      case "setTools":
        if (!Array.isArray(op.tools) || op.tools.length === 0 || !op.tools.every((t) => (ALL_TOOLS as readonly string[]).includes(t)))
          return { ok: false, error: "tools must be a non-empty subset of the known tools" };
        break;
      case "setContextPolicy": {
        const c = op.policy;
        if (!c || typeof c !== "object") return { ok: false, error: "bad policy" };
        const inRange = (v: unknown, lo: number, hi: number) => v === undefined || (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi);
        if (!inRange(c.maxTurns, 2, 12) || !inRange(c.retrieveK, 0, 6) || !inRange(c.summarizeAfter, 4, 40))
          return { ok: false, error: "policy value out of range" };
        break;
      }
      case "addSkill": {
        const s = op.skill;
        if (!s || !ID_RE.test(s.id) || typeof s.title !== "string" || s.title.length > 80 || typeof s.body !== "string" || s.body.length > MAX_SKILL_BODY || !s.body.trim())
          return { ok: false, error: "bad skill" };
        break;
      }
    }
  }
  const next = applyPatch(h, patch as Patch);
  if (next.systemRules.length > MAX_RULES) return { ok: false, error: "too many rules" };
  if (next.guardrails.length > MAX_GUARDRAILS) return { ok: false, error: "too many guardrails" };
  if (next.skills.length > MAX_SKILLS) return { ok: false, error: "too many skills" };
  return { ok: true };
}

/** Pure: returns a new candidate harness; never mutates the input. Call validatePatch first. */
export function applyPatch(h: Harness, patch: Patch): Harness {
  const next: Harness = structuredClone(h);
  next.parentVersion = h.version;
  next.version = h.version + 1;
  next.status = "candidate";
  next.score = null;
  next.heldout = null;
  next.createdBy = "meta-agent";
  next.rationale = patch.rationale;
  for (const op of patch.ops) {
    switch (op.op) {
      case "addRule":
        if (!next.systemRules.includes(op.rule)) next.systemRules.push(op.rule);
        break;
      case "removeRule":
        next.systemRules.splice(op.index, 1);
        break;
      case "addGuardrail":
        next.guardrails = next.guardrails.filter((g) => g.id !== op.guardrail.id);
        next.guardrails.push(op.guardrail);
        break;
      case "removeGuardrail":
        next.guardrails = next.guardrails.filter((g) => g.id !== op.id);
        break;
      case "setTools":
        next.toolAllowlist = [...new Set(op.tools)];
        break;
      case "setContextPolicy":
        next.contextPolicy = { ...next.contextPolicy, ...op.policy };
        break;
      case "addSkill":
        next.skills = next.skills.filter((s) => s.id !== op.skill.id);
        next.skills.push(op.skill);
        break;
    }
  }
  return next;
}

export function diffHarness(a: Harness, b: Harness): string[] {
  const out: string[] = [];
  for (const r of b.systemRules) if (!a.systemRules.includes(r)) out.push(`+ rule: ${r}`);
  for (const r of a.systemRules) if (!b.systemRules.includes(r)) out.push(`- rule: ${r}`);
  for (const g of b.guardrails) if (!a.guardrails.some((x) => x.id === g.id)) out.push(`+ guardrail ${g.id} (${g.action}): /${g.pattern}/ ${g.reason}`);
  for (const g of a.guardrails) if (!b.guardrails.some((x) => x.id === g.id)) out.push(`- guardrail ${g.id}`);
  for (const t of b.toolAllowlist) if (!a.toolAllowlist.includes(t)) out.push(`+ tool: ${t}`);
  for (const t of a.toolAllowlist) if (!b.toolAllowlist.includes(t)) out.push(`- tool: ${t}`);
  for (const s of b.skills) if (!a.skills.some((x) => x.id === s.id)) out.push(`+ skill: ${s.id} - ${s.title}`);
  for (const s of a.skills) if (!b.skills.some((x) => x.id === s.id)) out.push(`- skill: ${s.id}`);
  for (const k of ["maxTurns", "retrieveK", "summarizeAfter"] as const)
    if (a.contextPolicy[k] !== b.contextPolicy[k]) out.push(`~ context.${k}: ${a.contextPolicy[k]} -> ${b.contextPolicy[k]}`);
  return out;
}
