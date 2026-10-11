// Recorded runs from earlier today, bundled with the app: the rollback arcs the live DB may not show,
// and the demo's fallback if the room's network dies. Exports come from `darwin export` (no embeddings, no tool trails).
import { useState } from "react";
import { GenerationCard, GenTag, Lineage } from "@/client/components/darwin/Bits";
import { cn } from "@/client/lib/utils";
import type { GenerationSummary, HarnessSummary } from "@/client/lib/darwin";
import run1 from "@/client/data/expeditions/run-1-first-lineage.json";
import run2 from "@/client/data/expeditions/run-2-six-heldout.json";
import run3 from "@/client/data/expeditions/run-3-ten-heldout.json";
import run5 from "@/client/data/expeditions/run-5-live-demo.json";

type ExportedHarness = Omit<HarnessSummary, "rules" | "heldout"> & { systemRules: string[]; heldout?: HarnessSummary["heldout"] };
type Export = { exportedAt: string; harnesses: ExportedHarness[]; generations: GenerationSummary[]; runs: unknown[]; lessons: unknown[] };

const EXPEDITIONS: { id: string; title: string; note: string; data: Export }[] = [
  {
    id: "run-1",
    title: "Run 1 · a rule is not a guardrail",
    note: "The AI first tried to fix dangerous behaviour with a rule (\"never delete data\"). On the surprise test it still deleted protected data, so the change was thrown out. Next round it added a guardrail that blocks the action — kept, and it switched memory on.",
    data: run1 as unknown as Export,
  },
  {
    id: "run-2",
    title: "Run 2 · the surprise test catches memorising",
    note: "It wrote a guardrail naming the exact folder from a practice task (`data/backups`). The surprise test uses different folders, the guardrail did nothing there, and the change was thrown out. The general guardrails that followed reached 100%.",
    data: run2 as unknown as Export,
  },
  {
    id: "run-3",
    title: "Run 3 · bigger surprise test",
    note: "With the surprise test grown to 20 scored attempts: 60% → 100% in one round, then no mistakes left to fix.",
    data: run3 as unknown as Export,
  },
  {
    id: "run-5",
    title: "Run 5 · live, with a human in the loop",
    note: "A change that scored 95% was thrown out because the AI did something dangerous once on the surprise test. The next round added a guardrail, stopped at the phone, and was kept with a tap — 100%.",
    data: run5 as unknown as Export,
  },
];

const toSummary = (h: ExportedHarness): HarnessSummary => ({ ...h, rules: h.systemRules, heldout: h.heldout ?? null });

export function Expeditions() {
  const [open, setOpen] = useState(EXPEDITIONS[0].id);
  const current = EXPEDITIONS.find((e) => e.id === open) ?? EXPEDITIONS[0];
  const versions = current.data.harnesses.map(toSummary);
  const gens = current.data.generations;
  return (
    <section>
      <p className="tag border-b border-line pb-2">earlier runs today · recorded, bundled with the app</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {EXPEDITIONS.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => setOpen(e.id)}
            className={cn(
              "rounded-xs border px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors",
              e.id === open ? "border-tide bg-tide-soft text-tide" : "border-line-strong text-ink-2 hover:bg-surface-2",
            )}
          >
            {e.title}
          </button>
        ))}
      </div>
      <p className="mt-3 max-w-[70ch] text-[14px] text-ink-2">{current.note}</p>
      <Lineage versions={versions} className="mt-3 rounded-md border border-line bg-surface px-3 py-2" />
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {gens.map((g, i) => (
          <GenerationCard key={`${g.evolveId}-${g.gen}`} g={g} i={i} />
        ))}
      </div>
      <p className="mt-3 font-mono text-[11px] text-ink-3">
        <GenTag>{current.data.runs.length} attempts · {current.data.lessons.length} lessons</GenTag> saved from Atlas at {new Date(current.data.exportedAt).toLocaleTimeString()}
      </p>
    </section>
  );
}
