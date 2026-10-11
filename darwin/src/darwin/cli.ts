// Darwin CLI.
//   darwin run <taskId...>                                   run tasks under the baseline harness (verbose)
//   darwin bench [--heldout] [--concurrency N]               baseline pass rate on a split, with failure categories
//   darwin evolve --generations N [--concurrency N] [--mode auto|human] [--no-store]
//                                                            run the self-improvement loop (persists to Atlas unless --no-store)
//   darwin status                                            active harness, lineage, pending approvals, memory counts
//   darwin approve <approvalId> promote|reject               decide a pending approval from the terminal
//   darwin freeze on|off                                     lock the meta-agent out of the harness
import { randomUUID } from "node:crypto";
import { baseHarness } from "./harness.ts";
import { TASKS } from "./tasks.ts";
import { runTask } from "./worker.ts";
import { aggregate } from "./scorer.ts";
import { evolve, runSuite, type EvolveHooks } from "./evolve.ts";
import { closeRaindrop } from "./observe.ts";
import { config } from "./config.ts";
import { writeFileSync, mkdirSync } from "node:fs";
import { atlasHooks, closeDb, decideApproval, exportAll, getDb, getSettings, lineage, pendingApprovals, resetAll, searchLessons, setSettings } from "./store.ts";

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name: string, def: number) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? Number(rest[i + 1]) : def;
};
const sflag = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const log = (s: string) => console.log(s);

async function main() {
  if (cmd === "run") {
    const ids = rest.filter((a) => !a.startsWith("--"));
    const h = baseHarness();
    for (const id of ids.length ? ids : ["conv-1"]) {
      const t = TASKS.find((x) => x.id === id);
      if (!t) throw new Error(`no task ${id}; known: ${TASKS.map((x) => x.id).join(", ")}`);
      console.log(`\n> ${t.id} (${t.family}, ${t.split}) under harness v${h.version}`);
      const r = await runTask(h, t, { log });
      console.log(
        `  => ${r.outcome.passed ? "PASS" : "FAIL"} ${r.outcome.failureCategory ?? ""} violations=${r.outcome.violations.length} turns=${r.turns} ${r.ms}ms tokens=${r.tokens.prompt}+${r.tokens.completion}`,
      );
    }
    return;
  }
  if (cmd === "bench") {
    const split = rest.includes("--heldout") ? "heldout" : "train";
    const tasks = TASKS.filter((t) => t.split === split);
    const t0 = Date.now();
    const runs = await runSuite(baseHarness(), tasks, { concurrency: flag("concurrency", 5), convoId: "bench", log });
    const s = aggregate(runs.map((r) => r.outcome));
    const cats: Record<string, number> = {};
    for (const r of runs) if (!r.outcome.passed) cats[r.outcome.failureCategory ?? "?"] = (cats[r.outcome.failureCategory ?? "?"] ?? 0) + 1;
    console.log(`\n${split}: ${s.passed}/${s.total} passed (${Math.round(s.passRate * 100)}%), ${s.safetyViolations} safety violations, ${Math.round((Date.now() - t0) / 1000)}s`);
    console.log("failures by category:", cats);
    return;
  }
  if (cmd === "evolve") {
    const useStore = !rest.includes("--no-store") && !!config().mongoUri;
    const evolveId = randomUUID().slice(0, 8);
    let hooks: EvolveHooks | undefined;
    if (useStore) {
      const mode = sflag("mode");
      if (mode === "auto" || mode === "human") await setSettings(await getDb(), { mode });
      const s = await getSettings(await getDb());
      log(`memory: MongoDB Atlas (${config().mongoDb})  mode=${s.mode}  frozen=${s.frozen}`);
      hooks = await atlasHooks({ evolveId, log });
    } else {
      log("memory: none (--no-store or MONGODB_URI unset); this run will not persist");
    }
    await evolve({
      generations: flag("generations", 3),
      concurrency: flag("concurrency", 5),
      heldoutReps: flag("reps", 2),
      skipBaseline: rest.includes("--skip-baseline"),
      log,
      hooks,
      evolveId,
    });
    return;
  }
  if (cmd === "status") {
    const d = await getDb();
    const s = await getSettings(d);
    console.log(`mode=${s.mode}  frozen=${s.frozen}`);
    if (process.env.DARWIN_OPERATOR_TOKEN) console.log(`operator link: ${process.env.DARWIN_PUBLIC_URL ?? "http://localhost:3000"}/?op=${process.env.DARWIN_OPERATOR_TOKEN}`);
    console.log("lineage:");
    for (const h of await lineage(d)) {
      console.log(
        `  v${String(h.version).padEnd(3)} ${h.status.padEnd(11)} score=${h.score === null ? "-" : Math.round(h.score * 100) + "%"}  rules=${h.systemRules.length} guardrails=${h.guardrails.length} skills=${h.skills.length} retrieveK=${h.contextPolicy.retrieveK}  ${h.rationale.slice(0, 70)}`,
      );
    }
    const p = await pendingApprovals(d);
    console.log(`pending approvals: ${p.length}${p.length ? "  " + p.map((a) => `${a._id.slice(0, 8)} (v${a.candidateVersion})`).join(", ") : ""}`);
    console.log(`memory: ${await d.collection("lessons").countDocuments()} lessons, ${await d.collection("runs").countDocuments()} runs, ${await d.collection("generations").countDocuments()} generations`);
    return;
  }
  if (cmd === "approve") {
    const [id, status] = rest;
    if (!id || (status !== "promote" && status !== "reject")) throw new Error("usage: darwin approve <approvalId|prefix> promote|reject");
    const d = await getDb();
    const match = (await pendingApprovals(d)).find((a) => a._id.startsWith(id));
    if (!match) throw new Error(`no pending approval matching ${id}`);
    console.log((await decideApproval(d, match._id, status, "cli")) ? `${status}: v${match.candidateVersion}` : "already decided");
    return;
  }
  if (cmd === "freeze") {
    const s = await setSettings(await getDb(), { frozen: rest[0] !== "off" });
    console.log(`frozen=${s.frozen}`);
    return;
  }
  if (cmd === "recall") {
    const q = rest.filter((a) => !a.startsWith("--")).join(" ");
    if (!q) throw new Error("usage: darwin recall <query...>");
    const hits = await searchLessons(await getDb(), q, flag("k", 5));
    for (const l of hits) console.log(`[${l.kind.padEnd(9)} v${l.harnessVersion} via ${l.via}] ${l.text}`);
    if (!hits.length) console.log("no lessons");
    return;
  }
  if (cmd === "export") {
    const file = rest[0] ?? `data/export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    mkdirSync(file.replace(/\/[^/]+$/, ""), { recursive: true });
    const snap = await exportAll(await getDb());
    writeFileSync(file, JSON.stringify(snap, null, 2));
    console.log(`exported ${snap.harnesses.length} harnesses, ${snap.generations.length} generations, ${snap.runs.length} runs, ${snap.lessons.length} lessons -> ${file}`);
    return;
  }
  if (cmd === "reset") {
    if (!rest.includes("--yes")) throw new Error("reset wipes every Darwin collection in Atlas; pass --yes to confirm (run `export` first)");
    await resetAll(await getDb());
    console.log("reset: harnesses, runs, generations, lessons, approvals, settings are empty");
    return;
  }
  console.log("usage: darwin run <taskId...> | bench [--heldout] | evolve --generations N [--mode auto|human] [--no-store] | status | approve <id> promote|reject | freeze on|off | export [file] | reset --yes");
  process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.stack ?? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => Promise.all([closeRaindrop(), closeDb()]));
