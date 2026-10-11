// The recursive loop: run train -> cluster failures -> propose patch -> candidate -> held-out eval -> promote | rollback.
// Hooks let a store (Atlas) and a human gate (phone) plug in without changing the loop.
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { applyPatch, baseHarness, diffHarness, validatePatch, type Harness, type Patch } from "./harness.ts";
import { heldoutTasks, trainTasks, type Task } from "./tasks.ts";
import { runTask, type RunRecord } from "./worker.ts";
import { aggregate, type Score } from "./scorer.ts";
import { decide, type Decision } from "./promote.ts";
import { proposePatch, type RejectedPatch } from "./meta.ts";
import { getRaindrop } from "./observe.ts";
import { config } from "./config.ts";

export interface Generation {
  evolveId: string;
  gen: number;
  harnessVersion: number;
  train: Score;
  largestCluster: string | null;
  diagnosis: string;
  lessons: string[];
  question: { text: string; options: string[]; answer: string | null } | null;
  patch: Patch | null;
  candidateVersion: number | null;
  diff: string[];
  heldoutBefore: Score;
  heldoutAfter: Score | null;
  decision: Decision | null;
  startedAt: Date;
  ms: number;
}

export interface EvolveHooks {
  loadActive?: () => Promise<Harness | null>;
  maxVersion?: () => Promise<number>;
  onHarness?: (h: Harness) => Promise<void>;
  onRuns?: (runs: RunRecord[]) => Promise<void>;
  onGeneration?: (g: Generation, runs: RunRecord[]) => Promise<void>;
  lessonsFor?: (task: Task, h: Harness) => Promise<string[]>;
  metaLessons?: (h: Harness) => Promise<string[]>;
  /** Ask the operator the meta-agent's question; resolves to the chosen option, or null if nobody answers / not in human mode. */
  ask?: (ctx: { gen: number; evolveId: string; candidateVersion: number; parentVersion: number; diagnosis: string; before: Score; question: { text: string; options: string[] } }) => Promise<string | null>;
  /** Human-in-the-loop gate: can veto (or wait for the phone), never override a safety/metric rollback. */
  gate?: (ctx: {
    gen: number;
    evolveId: string;
    candidate: Harness;
    patch: Patch;
    diff: string[];
    diagnosis: string;
    before: Score;
    after: Score;
    auto: Decision;
  }) => Promise<Decision>;
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

export async function runSuite(
  h: Harness,
  tasks: Task[],
  opts: { concurrency: number; convoId?: string; lessonsFor?: EvolveHooks["lessonsFor"]; log?: (s: string) => void; reps?: number },
): Promise<RunRecord[]> {
  // reps > 1 runs every task several times: the models are non-deterministic, so a score over 2x10 runs is far less noisy than over 6.
  const list = Array.from({ length: Math.max(1, opts.reps ?? 1) }, () => tasks).flat();
  return mapLimit(list, opts.concurrency, async (t) => {
    const lessons = opts.lessonsFor ? await opts.lessonsFor(t, h) : [];
    const r = await runTask(h, t, { lessons, convoId: opts.convoId });
    opts.log?.(`    ${r.outcome.passed ? "pass" : "FAIL"}  ${t.id.padEnd(14)} ${r.outcome.failureCategory ?? ""}${r.outcome.violations.length ? "  !! " + r.outcome.violations[0] : ""}`);
    return r;
  });
}

const pct = (s: Score) => `${s.passed}/${s.total} (${Math.round(s.passRate * 100)}%)`;

export async function evolve(opts: {
  generations: number;
  concurrency?: number;
  log?: (s: string) => void;
  hooks?: EvolveHooks;
  historyFile?: string | null;
  evolveId?: string;
  /** How many times each held-out task is run per evaluation (default 2). */
  heldoutReps?: number;
  /** Reuse the active harness's stored held-out score instead of re-measuring it at generation 0 (live demos). */
  skipBaseline?: boolean;
}): Promise<{ active: Harness; history: Generation[] }> {
  const log = opts.log ?? (() => {});
  const conc = opts.concurrency ?? 5;
  const reps = opts.heldoutReps ?? 2;
  const MIN_GAIN = 0.1; // promote only on a >= 10 point held-out gain (2 of 20 runs), well above run-to-run noise
  const hooks = opts.hooks ?? {};
  const c = config();
  const evolveId = opts.evolveId ?? randomUUID().slice(0, 8);
  const history: Generation[] = [];
  const rejected: RejectedPatch[] = [];

  let active = (await hooks.loadActive?.()) ?? baseHarness();
  // Versions are global, not per-parent: a rolled-back v1 is never reused for the next candidate.
  let nextVersion = ((await hooks.maxVersion?.()) ?? active.version) + 1;
  log(`\nDARWIN evolve ${evolveId}  worker=${c.workerModel}  meta=${c.metaModel}`);
  log(`GEN 0  harness v${active.version}: ${active.systemRules.length} rules, ${active.guardrails.length} guardrails, tools [${active.toolAllowlist.join(" ")}]`);
  let activeScore: Score;
  if (opts.skipBaseline && active.heldout) {
    activeScore = active.heldout;
    log(`  held-out (stored) ${pct(activeScore)}  safety violations ${activeScore.safetyViolations}`);
  } else {
    log(`  held-out eval:`);
    const baseRuns = await runSuite(active, heldoutTasks(), { concurrency: conc, convoId: `evolve-${evolveId}-g0-heldout`, lessonsFor: hooks.lessonsFor, log, reps });
    await hooks.onRuns?.(baseRuns);
    activeScore = aggregate(baseRuns.map((r) => r.outcome));
    log(`  => held-out ${pct(activeScore)}  safety violations ${activeScore.safetyViolations}`);
  }
  active.score = activeScore.passRate;
  active.heldout = activeScore;
  await hooks.onHarness?.(active);

  for (let gen = 1; gen <= opts.generations; gen++) {
    const t0 = Date.now();
    log(`\nGEN ${gen}  train under v${active.version}:`);
    const trainRuns = await runSuite(active, trainTasks(), { concurrency: conc, convoId: `evolve-${evolveId}-g${gen}-train`, lessonsFor: hooks.lessonsFor, log });
    await hooks.onRuns?.(trainRuns);
    const train = aggregate(trainRuns.map((r) => r.outcome));
    log(`  => train ${pct(train)}  safety violations ${train.safetyViolations}`);

    const gi = getRaindrop()?.begin({
      eventId: randomUUID(),
      event: "darwin_generation",
      userId: c.operatorId,
      convoId: `evolve-${evolveId}`,
      input: `generation ${gen} from harness v${active.version}`,
      model: c.metaModel,
      properties: { gen, harness_version: active.version, train_pass_rate: train.passRate, heldout_before: activeScore.passRate },
    });

    const record: Generation = {
      evolveId, gen, harnessVersion: active.version, train, largestCluster: null, diagnosis: "", lessons: [], question: null, patch: null, candidateVersion: null,
      diff: [], heldoutBefore: activeScore, heldoutAfter: null, decision: null, startedAt: new Date(t0), ms: 0,
    };

    if (train.passed === train.total) {
      log("  no train failures; nothing to patch.");
      record.ms = Date.now() - t0;
      gi?.finish({ output: "no failures" });
      history.push(record);
      await hooks.onGeneration?.(record, trainRuns);
      break;
    }

    const metaLessons = (await hooks.metaLessons?.(active)) ?? [];
    const proposal = await proposePatch(active, trainRuns, rejected, { convoId: `evolve-${evolveId}`, lessons: metaLessons, log });
    record.largestCluster = proposal.clusters[0] ? `${proposal.clusters[0].category} x${proposal.clusters[0].count}` : null;
    record.diagnosis = proposal.diagnosis;
    record.lessons = proposal.lessons;
    record.patch = proposal.patch;
    let candidate = applyPatch(active, proposal.patch);
    candidate.version = nextVersion++;
    // The meta-agent's question for the operator: the chosen answer becomes a user-preference rule in the candidate.
    if (proposal.question && hooks.ask) {
      const answer = await hooks.ask({ gen, evolveId, candidateVersion: candidate.version, parentVersion: active.version, diagnosis: proposal.diagnosis, before: activeScore, question: proposal.question });
      record.question = { ...proposal.question, answer };
      if (answer) {
        const pref: Patch = { ops: [{ op: "addRule", rule: `User preference: ${proposal.question.text} ${answer}`.slice(0, 400) }], rationale: "operator answered a question" };
        const ok = validatePatch(candidate, pref);
        if (ok.ok) {
          const withPref = applyPatch(candidate, pref);
          withPref.version = candidate.version;
          withPref.parentVersion = active.version;
          withPref.rationale = proposal.patch.rationale;
          candidate = withPref;
          log(`  operator answered: "${answer}" -> added as a user-preference rule`);
        } else log(`  operator answered: "${answer}" (not added as a rule: ${ok.error})`);
      }
    }
    record.candidateVersion = candidate.version;
    record.diff = diffHarness(active, candidate);
    log(`  largest cluster: ${record.largestCluster}`);
    log(`  meta-agent: ${proposal.diagnosis.slice(0, 220)}`);
    log(`  patch -> candidate v${candidate.version}:`);
    for (const line of record.diff) log(`    ${line}`);
    await hooks.onHarness?.(candidate);

    log(`  held-out eval of v${candidate.version}:`);
    const candRuns = await runSuite(candidate, heldoutTasks(), { concurrency: conc, convoId: `evolve-${evolveId}-g${gen}-heldout`, lessonsFor: hooks.lessonsFor, log, reps });
    await hooks.onRuns?.(candRuns);
    const candScore = aggregate(candRuns.map((r) => r.outcome));
    record.heldoutAfter = candScore;
    candidate.heldout = candScore;

    let decision = decide(activeScore, candScore, { minGain: MIN_GAIN });
    if (hooks.gate) {
      decision = await hooks.gate({ gen, evolveId, candidate, patch: proposal.patch, diff: record.diff, diagnosis: proposal.diagnosis, before: activeScore, after: candScore, auto: decision });
    }
    record.decision = decision;
    log(`  held-out ${pct(activeScore)} -> ${pct(candScore)}  ${decision.action.toUpperCase()}  (${decision.reason})`);

    const rd = getRaindrop();
    if (rd) {
      await rd.trackSignal({
        eventId: proposal.eventId,
        name: decision.action === "promote" ? "patch_promoted" : "patch_rolled_back",
        sentiment: decision.action === "promote" ? "POSITIVE" : "NEGATIVE",
        comment: `${pct(activeScore)} -> ${pct(candScore)}: ${decision.reason}`,
      });
    }
    gi?.setProperties({ heldout_after: candScore.passRate, heldout_violations: candScore.safetyViolations, decision: decision.action, candidate_version: candidate.version });
    gi?.finish({ output: `${decision.action}: ${decision.reason}` });

    if (decision.action === "promote") {
      candidate.status = "active";
      candidate.score = candScore.passRate;
      active = candidate;
      activeScore = candScore;
    } else {
      candidate.status = "rolled_back";
      rejected.push({ patch: proposal.patch, reason: decision.reason });
    }
    await hooks.onHarness?.(candidate);
    record.ms = Date.now() - t0;
    history.push(record);
    await hooks.onGeneration?.(record, [...trainRuns, ...candRuns]);
    if (opts.historyFile !== null) {
      const file = opts.historyFile ?? ".darwin/history.json";
      mkdirSync(file.replace(/\/[^/]+$/, ""), { recursive: true });
      writeFileSync(file, JSON.stringify({ evolveId, active, activeScore, history }, null, 2));
    }
  }

  log(`\nFINAL  harness v${active.version}  held-out ${pct(activeScore)}  (${history.filter((g) => g.decision?.action === "promote").length} promoted, ${history.filter((g) => g.decision?.action === "rollback").length} rolled back)`);
  return { active, history };
}
