// Client-side view of Darwin's governance state: one polled query, three mutations, and the operator token.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createQueryKey, modelenceMutation, modelenceQuery } from "@modelence/react-query";

export type Score = { passRate: number; passed: number; total: number; safetyViolations: number };
export type Decision = { action: "promote" | "rollback"; reason: string };
export type Guardrail = { id: string; pattern: string; action: string; reason: string };
export type HarnessSummary = {
  version: number;
  parentVersion: number | null;
  status: "candidate" | "active" | "rolled_back" | "superseded";
  score: number | null;
  heldout: Score | null;
  rules: string[];
  guardrails: Guardrail[];
  toolAllowlist: string[];
  skills: { id: string; title: string; body: string }[];
  contextPolicy: { maxTurns: number; retrieveK: number; summarizeAfter: number };
  rationale: string;
  createdBy: string;
};
export type PatchOp = { op: string; [k: string]: unknown };
export type Approval = {
  _id: string;
  evolveId: string;
  gen: number;
  kind: "patch" | "question";
  candidateVersion: number;
  parentVersion: number;
  diagnosis: string;
  before: Score;
  patch?: { ops: PatchOp[]; rationale: string };
  diff?: string[];
  after?: Score;
  auto?: Decision;
  question?: { text: string; options: string[] };
  answer?: string;
  status: "pending" | "promote" | "reject" | "answered";
  decidedBy?: string;
  createdAt: string;
  decidedAt?: string;
};
export type GenerationSummary = {
  evolveId: string;
  gen: number;
  harnessVersion: number;
  train: Score;
  largestCluster: string | null;
  diagnosis: string;
  lessons: string[];
  patch: { ops: PatchOp[]; rationale: string } | null;
  candidateVersion: number | null;
  diff: string[];
  heldoutBefore: Score;
  heldoutAfter: Score | null;
  decision: Decision | null;
  startedAt: string;
  ms: number;
};
export type LiveRun = {
  taskId: string;
  split: string;
  family: string;
  harnessVersion: number;
  outcome: { passed: boolean; failureCategory: string | null; violations: string[]; blockedBy: string[] };
  turns: number;
  ms: number;
  createdAt: string;
};
export type DarwinState = {
  now: string;
  dataSource: { db: string; source: "DARWIN_MONGODB_URI" | "MONGODB_URI" | "unset" };
  settings: { mode: "auto" | "human"; frozen: boolean };
  active: HarnessSummary | null;
  lineage: HarnessSummary[];
  pending: Approval[];
  recent: Approval[];
  generations: GenerationSummary[];
  liveRuns: LiveRun[];
  liveActive: boolean;
  counts: { lessons: number; runs: number; generations: number };
  operatorRequired: boolean;
};
export type LessonRow = { kind: string; text: string; category?: string; harnessVersion: number; createdAt: string; via: string };

export function useDarwinState(intervalMs = 2000) {
  return useQuery({ ...modelenceQuery<DarwinState>("darwin.state"), refetchInterval: intervalMs });
}

const OP_KEY = "darwin.op";

/** The operator token arrives once via ?op= (from the desktop QR) and then lives in localStorage. */
export function useOperatorToken(): string | undefined {
  const [op, setOp] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem(OP_KEY) ?? undefined;
    } catch {
      return undefined;
    }
  });
  useEffect(() => {
    const u = new URL(window.location.href);
    const q = u.searchParams.get("op");
    if (!q) return;
    try {
      localStorage.setItem(OP_KEY, q);
    } catch {
      /* private mode */
    }
    setOp(q);
    u.searchParams.delete("op");
    window.history.replaceState({}, "", u.toString());
  }, []);
  return op;
}

export function useDarwinMutation(name: "darwin.decide" | "darwin.answer" | "darwin.setFrozen" | "darwin.setMode") {
  const qc = useQueryClient();
  return useMutation({
    ...modelenceMutation(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: createQueryKey("darwin.state") }),
  });
}

export const pct = (s?: Score | null) => (s ? Math.round(s.passRate * 100) : null);

export function patchTitle(ops: PatchOp[]): string {
  return ops
    .map((o) => {
      switch (o.op) {
        case "addRule":
          return "a new rule";
        case "removeRule":
          return "drop a rule";
        case "addGuardrail":
          return `a guardrail (${(o.guardrail as Guardrail | undefined)?.id ?? "block"})`;
        case "removeGuardrail":
          return "drop a guardrail";
        case "setTools":
          return "which tools it may use";
        case "setContextPolicy":
          return "turn budget / memory settings";
        case "addSkill":
          return `a skill (${(o.skill as { id?: string } | undefined)?.id ?? ""})`;
        default:
          return o.op;
      }
    })
    .join(" + ");
}

/** Failure categories in words, e.g. "skipped_verification x6" -> "skipped the tests ×6". */
export function humanCategory(s: string | null | undefined): string {
  if (!s) return "none";
  const words: Record<string, string> = {
    skipped_verification: "skipped the tests",
    unsafe_action: "did something dangerous",
    convention_missed: "ignored the repo's conventions",
    tool_misfire: "used the wrong tool",
    out_of_turns: "ran out of turns",
    wrong_output: "got the wrong result",
  };
  return s.replace(/[a-z_]+/g, (m) => words[m] ?? m).replace(/ x(\d+)/, " ×$1");
}

export const STATUS_WORDS: Record<HarnessSummary["status"], string> = {
  active: "in use",
  candidate: "waiting",
  rolled_back: "thrown out",
  superseded: "replaced",
};
