// MongoDB Atlas is Darwin's memory. Four kinds live here:
//   episodic   - `runs` (every task run with its tool trail) and `generations`
//   semantic   - `lessons` with Voyage embeddings, retrieved with Atlas Vector Search ($vectorSearch)
//   taxonomic  - failure categories on runs/generations (the failure taxonomy the meta-agent clusters on)
//   procedural - `harnesses`: versioned rules, guardrails, tool allowlists and skills (the lineage)
// Plus `settings` (mode, freeze) and `approvals` (the phone's inbox).
import { MongoClient, type Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { config } from "./config.ts";
import type { Harness, Patch } from "./harness.ts";
import type { RunRecord } from "./worker.ts";
import type { EvolveHooks, Generation } from "./evolve.ts";
import type { Score } from "./scorer.ts";
import type { Decision } from "./promote.ts";

export interface Lesson {
  kind: "failure" | "rollback" | "promotion" | "skill" | "preference";
  text: string;
  category?: string;
  harnessVersion: number;
  embedding: number[];
  createdAt: Date;
}

export interface Settings {
  _id: "settings";
  mode: "auto" | "human";
  frozen: boolean;
  updatedAt: Date;
}

/** The phone's inbox: a patch to keep or throw away, or a question the meta-agent asks the operator. */
export interface Approval {
  _id: string;
  evolveId: string;
  gen: number;
  kind: "patch" | "question";
  candidateVersion: number;
  parentVersion: number;
  diagnosis: string;
  before: Score;
  // patch
  patch?: Patch;
  diff?: string[];
  after?: Score;
  auto?: Decision;
  // question
  question?: { text: string; options: string[] };
  answer?: string;
  status: "pending" | "promote" | "reject" | "answered";
  decidedBy?: string;
  createdAt: Date;
  decidedAt?: Date;
}

const VECTOR_INDEX = "lessons_vector";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let client: MongoClient | null = null;

export async function getDb(): Promise<Db> {
  if (!client) {
    const c = config();
    if (!c.mongoUri) throw new Error("MONGODB_URI is not set");
    client = new MongoClient(c.mongoUri, { serverSelectionTimeoutMS: 15000 });
    await client.connect();
  }
  return client.db(config().mongoDb);
}

export async function closeDb() {
  await client?.close();
  client = null;
}

/** Voyage AI embeddings (served through MongoDB's ai.mongodb.com endpoint when VOYAGE_ENDPOINT says so). */
export async function embed(texts: string[]): Promise<number[][]> {
  const c = config();
  if (!c.voyageKey || texts.length === 0) return texts.map(() => []);
  const r = await fetch(c.voyageUrl, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${c.voyageKey}` },
    body: JSON.stringify({ input: texts, model: c.voyageModel }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`voyage ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { data: { embedding: number[] }[] };
  return j.data.map((d) => d.embedding);
}

export async function ensureIndexes(d: Db) {
  await d.collection("harnesses").createIndex({ version: 1 }, { unique: true });
  await d.collection("harnesses").createIndex({ status: 1, version: -1 });
  await d.collection("runs").createIndex({ harnessVersion: 1, taskId: 1 });
  await d.collection("runs").createIndex({ evolveId: 1, createdAt: -1 });
  await d.collection("approvals").createIndex({ status: 1, createdAt: -1 });
  await d.collection("lessons").createIndex({ kind: 1, createdAt: -1 });
  try {
    const col = d.collection("lessons");
    const existing = await col.listSearchIndexes().toArray();
    if (!existing.some((i) => i.name === VECTOR_INDEX)) {
      await col.createSearchIndex({
        name: VECTOR_INDEX,
        type: "vectorSearch",
        definition: { fields: [{ type: "vector", path: "embedding", numDimensions: 1024, similarity: "cosine" }, { type: "filter", path: "kind" }] },
      });
    }
  } catch {
    // Search index management may be unavailable on some tiers; searchLessons falls back to in-memory cosine.
  }
}

export async function addLessons(d: Db, lessons: Omit<Lesson, "embedding" | "createdAt">[]) {
  if (!lessons.length) return;
  const vectors = await embed(lessons.map((l) => l.text));
  await d.collection<Lesson>("lessons").insertMany(lessons.map((l, i) => ({ ...l, embedding: vectors[i] ?? [], createdAt: new Date() })));
}

function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return -1;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/** Semantic retrieval: Atlas Vector Search first; while the index is still building, cosine over the (small) collection. */
export async function searchLessons(d: Db, query: string, k: number, kinds?: Lesson["kind"][]): Promise<(Lesson & { via: string })[]> {
  const [qv] = await embed([query]);
  if (!qv?.length || k <= 0) return [];
  const col = d.collection<Lesson>("lessons");
  try {
    const res = await col
      .aggregate<Lesson>([
        {
          $vectorSearch: {
            index: VECTOR_INDEX,
            path: "embedding",
            queryVector: qv,
            numCandidates: Math.max(50, k * 10),
            limit: k,
            ...(kinds ? { filter: { kind: { $in: kinds } } } : {}),
          },
        },
        { $project: { embedding: 0 } },
      ])
      .toArray();
    if (res.length) return res.map((l) => ({ ...l, via: "$vectorSearch" }));
  } catch {
    /* index missing or still building */
  }
  const all = await col.find(kinds ? { kind: { $in: kinds } } : {}).sort({ createdAt: -1 }).limit(500).toArray();
  return all
    .map((l) => ({ l, s: cosine(qv, l.embedding) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((x) => ({ ...x.l, via: "cosine-fallback" }));
}

export async function getSettings(d: Db): Promise<Settings> {
  const col = d.collection<Settings>("settings");
  const s = await col.findOne({ _id: "settings" });
  if (s) return s;
  const fresh: Settings = { _id: "settings", mode: "auto", frozen: false, updatedAt: new Date() };
  await col.updateOne({ _id: "settings" }, { $setOnInsert: fresh }, { upsert: true });
  return fresh;
}

export async function setSettings(d: Db, patch: Partial<Pick<Settings, "mode" | "frozen">>): Promise<Settings> {
  await getSettings(d);
  await d.collection<Settings>("settings").updateOne({ _id: "settings" }, { $set: { ...patch, updatedAt: new Date() } });
  return getSettings(d);
}

/** Wipes every Darwin collection (indexes, including the vector index, stay). */
export async function resetAll(d: Db) {
  for (const c of ["harnesses", "runs", "generations", "lessons", "approvals", "settings"]) await d.collection(c).deleteMany({});
}

/** Snapshot of the memory without embeddings, for the repo's evidence folder. */
export async function exportAll(d: Db) {
  const [harnesses, generations, approvals, lessons, runs] = await Promise.all([
    d.collection("harnesses").find().sort({ version: 1 }).toArray(),
    d.collection("generations").find().sort({ startedAt: 1 }).toArray(),
    d.collection("approvals").find().sort({ createdAt: 1 }).toArray(),
    d.collection("lessons").find().sort({ createdAt: 1 }).project({ embedding: 0 }).toArray(),
    d.collection("runs").find().sort({ createdAt: 1 }).project({ toolCalls: 0 }).toArray(),
  ]);
  return { exportedAt: new Date(), harnesses, generations, approvals, lessons, runs };
}

export async function lineage(d: Db): Promise<Harness[]> {
  return (await d.collection<Harness>("harnesses").find().sort({ version: 1 }).toArray()).map(stripDoc);
}

export async function pendingApprovals(d: Db): Promise<Approval[]> {
  return d.collection<Approval>("approvals").find({ status: "pending" }).sort({ createdAt: -1 }).toArray();
}

export async function decideApproval(d: Db, id: string, status: "promote" | "reject", by: string): Promise<boolean> {
  const r = await d.collection<Approval>("approvals").updateOne({ _id: id, status: "pending", kind: "patch" }, { $set: { status, decidedBy: by, decidedAt: new Date() } });
  return r.modifiedCount === 1;
}

export async function answerQuestion(d: Db, id: string, answer: string, by: string): Promise<boolean> {
  const r = await d.collection<Approval>("approvals").updateOne({ _id: id, status: "pending", kind: "question" }, { $set: { status: "answered", answer, decidedBy: by, decidedAt: new Date() } });
  return r.modifiedCount === 1;
}

function stripDoc<T extends object>(doc: T & { _id?: unknown; createdAt?: unknown; updatedAt?: unknown }): T {
  const { _id, createdAt, updatedAt, ...rest } = doc;
  void _id;
  void createdAt;
  void updatedAt;
  return rest as T;
}

/** Hooks that make the evolve loop persistent and governable. */
export async function atlasHooks(opts: { evolveId: string; log?: (s: string) => void; approvalTimeoutMs?: number }): Promise<EvolveHooks> {
  const log = opts.log ?? (() => {});
  const d = await getDb();
  await ensureIndexes(d);
  const harnesses = d.collection<Harness>("harnesses");

  return {
    loadActive: async () => {
      const h = await harnesses.find({ status: "active" }).sort({ version: -1 }).limit(1).next();
      if (h) log(`  resumed active harness v${h.version} from Atlas (${h.systemRules.length} rules, ${h.guardrails.length} guardrails, ${h.skills.length} skills)`);
      return h ? stripDoc(h) : null;
    },
    maxVersion: async () => (await harnesses.find().sort({ version: -1 }).limit(1).next())?.version ?? 0,
    onHarness: async (h) => {
      if (h.status === "active") await harnesses.updateMany({ status: "active", version: { $ne: h.version } }, { $set: { status: "superseded" } });
      await harnesses.updateOne({ version: h.version }, { $set: { ...h, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
    },
    onRuns: async (runs: RunRecord[]) => {
      if (runs.length) await d.collection("runs").insertMany(runs.map((r) => ({ ...r, evolveId: opts.evolveId })));
    },
    onGeneration: async (g: Generation) => {
      await d.collection("generations").insertOne({ ...g });
      const lessons: Omit<Lesson, "embedding" | "createdAt">[] = g.lessons.map((text) => ({ kind: "failure", text, harnessVersion: g.harnessVersion, category: g.largestCluster ?? undefined }));
      if (g.question?.answer) lessons.push({ kind: "preference", text: `Operator preference: ${g.question.text} ${g.question.answer}`, harnessVersion: g.harnessVersion });
      if (g.patch && g.decision) {
        const ops = g.patch.ops.map((o) => o.op).join(",");
        lessons.push({
          kind: g.decision.action === "promote" ? "promotion" : "rollback",
          text: `v${g.harnessVersion} -> v${g.candidateVersion} [${ops}] ${g.decision.action === "promote" ? "PROMOTED" : "ROLLED BACK"}: ${g.decision.reason}. Patch: ${g.diff.join(" | ").slice(0, 300)}`,
          harnessVersion: g.harnessVersion,
        });
      }
      await addLessons(d, lessons);
    },
    lessonsFor: async (task, h) => {
      const k = h.contextPolicy.retrieveK;
      if (k <= 0) return [];
      const hits = await searchLessons(d, `${task.family}: ${task.prompt}`, k, ["failure", "skill", "preference"]);
      return hits.map((l) => l.text);
    },
    metaLessons: async () => {
      const recent = await d.collection<Lesson>("lessons").find({ kind: { $in: ["rollback", "promotion", "preference"] } }).sort({ createdAt: -1 }).limit(10).toArray();
      return recent.map((l) => l.text);
    },
    ask: async (ctx) => {
      const settings = await getSettings(d);
      if (settings.mode !== "human" || settings.frozen) return null;
      const approvals = d.collection<Approval>("approvals");
      const q: Approval = {
        _id: randomUUID(),
        evolveId: ctx.evolveId,
        gen: ctx.gen,
        kind: "question",
        candidateVersion: ctx.candidateVersion,
        parentVersion: ctx.parentVersion,
        diagnosis: ctx.diagnosis,
        before: ctx.before,
        question: ctx.question,
        status: "pending",
        createdAt: new Date(),
      };
      await approvals.insertOne(q);
      log(`  asking on the phone: "${ctx.question.text}" [${ctx.question.options.join(" / ")}]`);
      const deadline = Date.now() + (opts.approvalTimeoutMs ?? 15 * 60_000);
      while (Date.now() < deadline) {
        await sleep(2000);
        const a = await approvals.findOne({ _id: q._id });
        if (a?.status === "answered" && a.answer) return a.answer;
      }
      await approvals.updateOne({ _id: q._id, status: "pending" }, { $set: { status: "answered", answer: "", decidedBy: "timeout", decidedAt: new Date() } });
      return null;
    },
    gate: async (ctx) => {
      const settings = await getSettings(d);
      const approvals = d.collection<Approval>("approvals");
      const base: Approval = {
        _id: randomUUID(),
        evolveId: ctx.evolveId,
        gen: ctx.gen,
        kind: "patch",
        candidateVersion: ctx.candidate.version,
        parentVersion: ctx.candidate.parentVersion ?? 0,
        patch: ctx.patch,
        diff: ctx.diff,
        diagnosis: ctx.diagnosis,
        before: ctx.before,
        after: ctx.after,
        auto: ctx.auto,
        status: "pending",
        createdAt: new Date(),
      };
      if (settings.frozen) {
        await approvals.insertOne({ ...base, status: "reject", decidedBy: "frozen", decidedAt: new Date() });
        return { action: "rollback", reason: "harness frozen by operator" };
      }
      // The safety gate is hard: something dangerous on held-out is thrown out without asking anyone.
      const unsafe = ctx.after.safetyViolations > 0;
      if (settings.mode === "auto" || unsafe) {
        await approvals.insertOne({ ...base, status: ctx.auto.action === "promote" ? "promote" : "reject", decidedBy: "auto", decidedAt: new Date() });
        return ctx.auto;
      }
      // Human mode: every safe candidate is a question for the operator, with the loop's recommendation attached.
      await approvals.insertOne(base);
      log(`  waiting for a decision on the phone (approval ${base._id.slice(0, 8)}; candidate v${ctx.candidate.version}; loop recommends ${ctx.auto.action})...`);
      const deadline = Date.now() + (opts.approvalTimeoutMs ?? 15 * 60_000);
      while (Date.now() < deadline) {
        await sleep(2000);
        const a = await approvals.findOne({ _id: base._id });
        if (a?.status === "promote") {
          return { action: "promote", reason: `approved by ${a.decidedBy ?? "operator"} (loop recommended ${ctx.auto.action}); ${ctx.auto.reason}` };
        }
        if (a?.status === "reject") return { action: "rollback", reason: `rejected by ${a.decidedBy ?? "operator"} (loop recommended ${ctx.auto.action})` };
      }
      await approvals.updateOne({ _id: base._id, status: "pending" }, { $set: { status: "reject", decidedBy: "timeout", decidedAt: new Date() } });
      return { action: "rollback", reason: "no decision before the approval timeout" };
    },
  };
}
