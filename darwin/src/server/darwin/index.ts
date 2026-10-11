// The phone's backend: one polling query for the whole governance state, plus three operator mutations.
// Reads are public (judges can watch); writes need DARWIN_OPERATOR_TOKEN when it is configured.
import z from "zod";
import { Module } from "modelence/server";
import { config } from "@/darwin/config.ts";
import type { Harness } from "@/darwin/harness.ts";
import type { Generation } from "@/darwin/evolve.ts";
import { decideApproval, getDb, getSettings, lineage, pendingApprovals, searchLessons, setSettings, type Approval, type Lesson } from "@/darwin/store.ts";

config(); // loads .env (MONGODB_URI, VOYAGE_*) for the server process

function requireOperator(args: unknown) {
  const token = process.env.DARWIN_OPERATOR_TOKEN;
  if (!token) return;
  const { op } = z.object({ op: z.string().optional() }).parse(args ?? {});
  if (op !== token) throw new Error("Operator token required: open /m from the QR code on the desktop view.");
}

function summarizeHarness(h: Harness) {
  return {
    version: h.version,
    parentVersion: h.parentVersion,
    status: h.status,
    score: h.score,
    heldout: h.heldout ?? null,
    rules: h.systemRules,
    guardrails: h.guardrails,
    toolAllowlist: h.toolAllowlist,
    skills: h.skills,
    contextPolicy: h.contextPolicy,
    rationale: h.rationale,
    createdBy: h.createdBy,
  };
}

export default new Module("darwin", {
  queries: {
    state: async () => {
      const d = await getDb();
      const [settings, lin, pending, recent, generations, lastRun, lessonCount, runCount, genCount] = await Promise.all([
        getSettings(d),
        lineage(d),
        pendingApprovals(d),
        d.collection<Approval>("approvals").find({ status: { $ne: "pending" } }).sort({ decidedAt: -1 }).limit(8).toArray(),
        d.collection<Generation>("generations").find().sort({ startedAt: -1 }).limit(6).toArray(),
        d.collection("runs").find().sort({ createdAt: -1 }).limit(1).next(),
        d.collection("lessons").countDocuments(),
        d.collection("runs").countDocuments(),
        d.collection("generations").countDocuments(),
      ]);
      const liveRuns = lastRun
        ? await d
            .collection("runs")
            .find({ evolveId: lastRun.evolveId })
            .sort({ createdAt: -1 })
            .limit(30)
            .project({ taskId: 1, split: 1, family: 1, harnessVersion: 1, "outcome.passed": 1, "outcome.failureCategory": 1, "outcome.violations": 1, "outcome.blockedBy": 1, turns: 1, ms: 1, createdAt: 1 })
            .toArray()
        : [];
      const active = lin.find((h) => h.status === "active") ?? null;
      const c = config();
      return {
        now: new Date(),
        dataSource: { db: c.mongoDb, source: c.mongoSource },
        settings: { mode: settings.mode, frozen: settings.frozen },
        active: active ? summarizeHarness(active) : null,
        lineage: lin.map(summarizeHarness),
        pending,
        recent,
        generations,
        liveRuns,
        liveActive: lastRun ? Date.now() - new Date(lastRun.createdAt).getTime() < 90_000 : false,
        counts: { lessons: lessonCount, runs: runCount, generations: genCount },
        operatorRequired: !!process.env.DARWIN_OPERATOR_TOKEN,
      };
    },

    lessons: async (args: unknown) => {
      const { q } = z.object({ q: z.string().max(200).optional() }).parse(args ?? {});
      const d = await getDb();
      if (q?.trim()) {
        return (await searchLessons(d, q, 8)).map(({ embedding, ...l }) => {
          void embedding;
          return l;
        });
      }
      const latest = await d.collection<Lesson>("lessons").find().sort({ createdAt: -1 }).limit(20).project({ embedding: 0 }).toArray();
      return latest.map((l) => ({ ...l, via: "latest" }));
    },
  },

  mutations: {
    decide: async (args: unknown) => {
      requireOperator(args);
      const { id, status } = z.object({ id: z.string(), status: z.enum(["promote", "reject"]) }).parse(args);
      const ok = await decideApproval(await getDb(), id, status, "phone");
      if (!ok) throw new Error("That approval was already decided.");
      return { ok };
    },
    setFrozen: async (args: unknown) => {
      requireOperator(args);
      const { frozen } = z.object({ frozen: z.boolean() }).parse(args);
      const s = await setSettings(await getDb(), { frozen });
      return { frozen: s.frozen };
    },
    setMode: async (args: unknown) => {
      requireOperator(args);
      const { mode } = z.object({ mode: z.enum(["auto", "human"]) }).parse(args);
      const s = await setSettings(await getDb(), { mode });
      return { mode: s.mode };
    },
  },
});
