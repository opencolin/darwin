// /m — the governance phone. Pending patches to approve, the live loop, the lineage, and memory.
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useQuery } from "@tanstack/react-query";
import { modelenceQuery } from "@modelence/react-query";
import { Seo } from "@/client/components/Seo";
import { cn } from "@/client/lib/utils";
import { DiffLedger, GenTag, Lineage, Numeral, Stagger, Wordmark } from "@/client/components/darwin/Bits";
import { patchTitle, pct, useDarwinMutation, useDarwinState, useOperatorToken, type Approval, type DarwinState, type LessonRow } from "@/client/lib/darwin";

type Tab = "pending" | "live" | "lineage" | "memory";

export default function MobilePage() {
  const { data, error } = useDarwinState(2000);
  const op = useOperatorToken();
  const [tab, setTab] = useState<Tab>("pending");
  const pendingCount = data?.pending.length ?? 0;
  const canAct = !!data && (!data.operatorRequired || !!op);

  useEffect(() => {
    try {
      if (pendingCount) navigator.setAppBadge?.(pendingCount);
      else navigator.clearAppBadge?.();
    } catch {
      /* unsupported */
    }
    document.title = pendingCount ? `(${pendingCount}) Darwin` : "Darwin";
  }, [pendingCount]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-paper text-ink">
      <Seo title="Phone" noindex />
      <Header data={data} canAct={canAct} op={op} />
      <Tabs tab={tab} setTab={setTab} pendingCount={pendingCount} />
      <main className="flex-1 px-4 pb-32 pt-3">
        {error && <p className="font-mono text-sm text-rollback">{(error as Error).message}</p>}
        {!data && !error && <p className="tag">connecting to atlas…</p>}
        {data && tab === "pending" && <PendingTab data={data} canAct={canAct} op={op} />}
        {data && tab === "live" && <LiveTab data={data} />}
        {data && tab === "lineage" && <LineageTab data={data} />}
        {data && tab === "memory" && <MemoryTab data={data} />}
      </main>
    </div>
  );
}

function Header({ data, canAct, op }: { data?: DarwinState; canAct: boolean; op?: string }) {
  const setFrozen = useDarwinMutation("darwin.setFrozen");
  const setMode = useDarwinMutation("darwin.setMode");
  const s = data?.settings;
  return (
    <header className="px-4 pt-4">
      <div className="flex items-center justify-between">
        <Wordmark className="text-[22px]" />
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!canAct || !s || setMode.isPending}
            onClick={() => s && setMode.mutate({ mode: s.mode === "auto" ? "human" : "auto", op })}
            className="tag whitespace-nowrap rounded-xs border border-line-strong px-2 py-1.5 transition-colors hover:bg-surface-2 disabled:opacity-50"
          >
            {s?.mode === "human" ? "mode · human" : "mode · auto"}
          </button>
          <span className="flex items-center gap-2">
            <span className="tag">{s?.frozen ? "frozen" : "live"}</span>
            <button
              type="button"
              role="switch"
              aria-checked={!s?.frozen}
              aria-label="meta-agent may change the harness"
              disabled={!canAct || !s || setFrozen.isPending}
              onClick={() => s && setFrozen.mutate({ frozen: !s.frozen, op })}
              className={cn("relative h-[22px] w-10 rounded-full transition-colors disabled:opacity-50", s?.frozen ? "bg-line-strong" : "bg-tide")}
            >
              <span className={cn("absolute top-[3px] h-4 w-4 rounded-full bg-paper transition-all", s?.frozen ? "left-[3px]" : "left-[21px]")} />
            </button>
          </span>
        </div>
      </div>
      {s?.frozen && (
        <div className="mt-3 rounded-sm bg-pending-soft px-3 py-2 font-mono text-[11px] uppercase leading-relaxed tracking-[0.06em] text-pending">
          ◼ harness frozen — the meta-agent cannot change it until you unfreeze
        </div>
      )}
      {data && !canAct && (
        <div className="mt-3 rounded-sm bg-surface-2 px-3 py-2 font-mono text-[11px] uppercase leading-relaxed tracking-[0.06em] text-ink-3">view only · scan the operator qr on the desk to act</div>
      )}
    </header>
  );
}

function Tabs({ tab, setTab, pendingCount }: { tab: Tab; setTab: (t: Tab) => void; pendingCount: number }) {
  const items: [Tab, string][] = [
    ["pending", "Pending"],
    ["live", "Live"],
    ["lineage", "Lineage"],
    ["memory", "Memory"],
  ];
  return (
    <nav className="mt-2 flex gap-5 border-b border-line px-4">
      {items.map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => setTab(k)}
          className={cn("-mb-px flex items-center gap-1.5 border-b-2 py-2.5 text-[13px] font-medium transition-colors", tab === k ? "border-tide text-ink" : "border-transparent text-ink-3")}
        >
          {label}
          {k === "pending" && pendingCount > 0 && (
            <span className="min-w-[18px] rounded-full bg-pending px-1.5 text-center font-mono text-[11px] leading-[18px] text-paper">{pendingCount}</span>
          )}
        </button>
      ))}
    </nav>
  );
}

function PendingTab({ data, canAct, op }: { data: DarwinState; canAct: boolean; op?: string }) {
  const decide = useDarwinMutation("darwin.decide");
  if (!data.pending.length) {
    return (
      <div className="animate-rise space-y-4">
        <div className="rounded-md border border-line bg-surface p-4">
          <p className="tag">nothing waiting on you</p>
          <p className="mt-2 font-display text-[19px] leading-snug">
            {data.settings.frozen
              ? "The harness is frozen. Every proposed patch is rejected until you unfreeze."
              : data.settings.mode === "auto"
                ? "Auto-promote is on: the loop decides alone on the held-out score."
                : "Human-in-the-loop is on: the next patch that improves held-out stops here for you."}
          </p>
        </div>
        <RecentDecisions recent={data.recent} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {data.pending.map((a, i) => (
        <ApprovalCard
          key={a._id}
          a={a}
          i={i}
          canAct={canAct}
          busy={decide.isPending}
          onDecide={(status) =>
            decide.mutate(
              { id: a._id, status, op },
              { onSuccess: () => toast.success(status === "promote" ? `Promoted v${a.candidateVersion}` : `Rejected v${a.candidateVersion}`) },
            )
          }
        />
      ))}
    </div>
  );
}

function ApprovalCard({ a, i, canAct, busy, onDecide }: { a: Approval; i: number; canAct: boolean; busy: boolean; onDecide: (s: "promote" | "reject") => void }) {
  const before = pct(a.before);
  const after = pct(a.after);
  const delta = (after ?? 0) - (before ?? 0);
  return (
    <Stagger i={i}>
      <article className="overflow-hidden rounded-md border border-line bg-surface">
        <div className="p-4 pb-0">
          <GenTag tone="pending">
            pending · gen {String(a.gen).padStart(2, "0")} · candidate v{a.candidateVersion}
          </GenTag>
          <h2 className="mt-2.5 text-[21px]">{patchTitle(a.patch.ops)}</h2>
          <p className="mt-1 font-mono text-xs text-ink-3">from v{a.parentVersion} · {a.diagnosis.slice(0, 110)}{a.diagnosis.length > 110 ? "…" : ""}</p>
          <blockquote className="mt-3 border-l-2 border-line-strong pl-3 font-display text-[15.5px] italic leading-snug" style={{ fontVariationSettings: '"opsz" 24' }}>
            “{a.patch.rationale}”
          </blockquote>
        </div>
        <DiffLedger lines={a.diff} className="mt-3.5 rounded-none border-x-0 border-b-0" />
        <div className="grid grid-cols-[auto_auto_1fr] items-end gap-3.5 border-t border-line p-4">
          <div>
            <div className="tag">held-out before</div>
            <Numeral value={before} size="md" />
          </div>
          <div className="pb-2 font-mono text-ink-3">→</div>
          <div>
            <div className="tag">candidate</div>
            <Numeral value={after} size="md" />{" "}
            <span className={cn("font-mono text-xs font-semibold", delta >= 0 ? "text-promote" : "text-rollback")}>
              {delta >= 0 ? "+" : ""}
              {delta}
            </span>
          </div>
        </div>
        <div className="px-4 pb-4">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xs px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em]",
              a.after.safetyViolations ? "bg-violation-soft text-violation" : "bg-promote-soft text-promote",
            )}
          >
            {a.after.safetyViolations ? `✕ ${a.after.safetyViolations} safety violation(s) on held-out` : "✓ 0 safety violations on held-out"}
          </span>
        </div>
      </article>
      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto grid w-full max-w-md grid-cols-[1fr_1.3fr] gap-2.5 border-t border-line bg-paper/90 p-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-lift backdrop-blur">
        <button type="button" disabled={!canAct || busy} onClick={() => onDecide("reject")} className="h-12 rounded-sm border border-rollback font-semibold text-rollback transition-colors hover:bg-rollback-soft disabled:opacity-50">
          Reject
        </button>
        <button type="button" disabled={!canAct || busy} onClick={() => onDecide("promote")} className="h-12 rounded-sm bg-promote font-semibold text-paper transition-colors hover:brightness-95 disabled:opacity-50">
          Promote v{a.candidateVersion}
        </button>
      </div>
    </Stagger>
  );
}

function RecentDecisions({ recent }: { recent: Approval[] }) {
  if (!recent.length) return null;
  return (
    <section>
      <p className="tag border-b border-line pb-2">recent decisions</p>
      <div className="mt-2 overflow-hidden rounded-md border border-line bg-surface">
        {recent.map((a, i) => (
          <Stagger i={i} key={a._id} className="border-b border-line px-3 py-2.5 last:border-b-0">
            <div className="flex items-center justify-between gap-2">
              <GenTag tone={a.status === "promote" ? "promote" : "rolled"}>
                {a.status === "promote" ? "promoted" : "rolled back"} · v{a.candidateVersion}
              </GenTag>
              <span className="font-mono text-[11px] text-ink-3">
                {pct(a.before)}% → {pct(a.after)}% · {a.decidedBy}
              </span>
            </div>
            <p className="mt-1.5 text-[13px] text-ink-2">{patchTitle(a.patch.ops)} — {a.auto.reason}</p>
          </Stagger>
        ))}
      </div>
    </section>
  );
}

function LiveTab({ data }: { data: DarwinState }) {
  const g = data.generations[0];
  const runs = data.liveRuns;
  const passed = runs.filter((r) => r.outcome.passed).length;
  return (
    <div className="animate-rise">
      <div className="tag flex items-center gap-2">
        {data.liveActive && <i className="inline-block h-2 w-2 rounded-full bg-tide animate-pulse-tide" />}
        {data.liveActive ? "running" : "idle"} · harness v{data.active?.version ?? "–"} · {passed} of {runs.length} passed
      </div>
      <h2 className="mt-2 text-[21px]">
        {data.liveActive ? "Running the loop" : g ? `Last: ${g.decision?.action === "promote" ? "promoted" : "rolled back"} v${g.candidateVersion}` : "No generations yet"}
      </h2>
      {g && (
        <div className="mt-3 rounded-md border border-line bg-surface p-3 text-[13px] leading-snug text-ink-2">
          <span className="font-mono text-ink">gen {g.gen}</span> · train {g.train.passed}/{g.train.total} · largest cluster <span className="font-mono text-ink">{g.largestCluster ?? "none"}</span>
          <br />
          {g.diagnosis.slice(0, 240)}
          {g.diagnosis.length > 240 ? "…" : ""}
        </div>
      )}
      <div className="mt-3 overflow-hidden rounded-md border border-line bg-surface">
        {runs.map((r, i) => {
          const [status, tone] = r.outcome.violations.length
            ? ["viol.", "text-violation"]
            : !r.outcome.passed
              ? ["fail", "text-rollback"]
              : r.outcome.blockedBy.length
                ? ["guarded", "text-pending"]
                : ["pass", "text-promote"];
          const why = r.outcome.violations[0] ?? r.outcome.failureCategory ?? (r.outcome.blockedBy[0] ? `blocked: ${r.outcome.blockedBy[0]}` : `${r.turns} turns`);
          return (
            <Stagger i={i} key={r.taskId + r.createdAt} className="grid grid-cols-[62px_1fr_auto] gap-2.5 border-b border-line px-3 py-2 font-mono text-[12.5px] last:border-b-0">
              <span className={cn("font-semibold", tone)}>{status}</span>
              <span>
                {r.taskId}
                <span className="text-ink-3"> · {r.split}</span>
              </span>
              <span className="max-w-[150px] truncate text-ink-3">{why}</span>
            </Stagger>
          );
        })}
        {!runs.length && <div className="px-3 py-2 font-mono text-[12.5px] text-ink-3">no runs yet — start `darwin evolve`</div>}
      </div>
    </div>
  );
}

function LineageTab({ data }: { data: DarwinState }) {
  const h = data.active;
  return (
    <div className="animate-rise space-y-4">
      <Lineage versions={data.lineage} className="rounded-md border border-line bg-surface px-2 py-2" />
      {h && (
        <section className="rounded-md border border-line bg-surface p-4">
          <GenTag tone="active">active · v{h.version}</GenTag>
          <h2 className="mt-2.5 text-[21px]">{h.rationale}</h2>
          <p className="tag mt-4 border-b border-line pb-2">rules</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13.5px] text-ink-2">
            {h.rules.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ol>
          <p className="tag mt-4 border-b border-line pb-2">guardrails</p>
          {h.guardrails.length ? (
            <ul className="mt-2 space-y-2">
              {h.guardrails.map((g) => (
                <li key={g.id} className="font-mono text-[12.5px] leading-snug">
                  <span className="text-tide">{g.id}</span> <span className="text-ink-3">({g.action})</span>
                  <br />
                  <code className="break-all text-ink-2">/{g.pattern}/</code>
                  <br />
                  <span className="text-ink-3">{g.reason}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 font-mono text-[12.5px] text-ink-3">none yet</p>
          )}
          <p className="tag mt-4 border-b border-line pb-2">tools · context</p>
          <p className="mt-2 font-mono text-[12.5px] text-ink-2">
            [{h.toolAllowlist.join(" ")}] · maxTurns {h.contextPolicy.maxTurns} · retrieveK {h.contextPolicy.retrieveK}
            {h.skills.length ? ` · skills: ${h.skills.map((s) => s.id).join(", ")}` : ""}
          </p>
        </section>
      )}
      <section className="overflow-hidden rounded-md border border-line bg-surface">
        {[...data.lineage].reverse().map((v, i) => (
          <Stagger i={i} key={v.version} className="border-b border-line px-3 py-2.5 last:border-b-0">
            <div className="flex items-center justify-between gap-2">
              <GenTag tone={v.status === "active" ? "active" : v.status === "rolled_back" ? "rolled" : v.status === "candidate" ? "pending" : "neutral"}>
                v{v.version} · {v.status.replace("_", " ")}
              </GenTag>
              <span className="font-mono text-[11px] text-ink-3">
                {v.score === null ? "—" : `${Math.round(v.score * 100)}%`} · {v.rules.length}r {v.guardrails.length}g {v.skills.length}s
              </span>
            </div>
            <p className="mt-1.5 text-[13px] text-ink-2">{v.rationale}</p>
          </Stagger>
        ))}
      </section>
    </div>
  );
}

function MemoryTab({ data }: { data: DarwinState }) {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const { data: lessons, isFetching } = useQuery({ ...modelenceQuery<LessonRow[]>("darwin.lessons", { q: query }), placeholderData: (prev) => prev });
  const tone = (k: string) => (k === "promotion" ? "promote" : k === "rollback" ? "rolled" : k === "skill" ? "active" : "neutral");
  return (
    <div className="animate-rise space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["lessons", data.counts.lessons, "semantic"],
            ["runs", data.counts.runs, "episodic"],
            ["versions", data.lineage.length, "procedural"],
          ] as const
        ).map(([label, n, kind]) => (
          <div key={label} className="rounded-md border border-line bg-surface p-3">
            <div className="tag">{kind}</div>
            <div className="mt-1 font-display text-[28px] font-semibold leading-none" style={{ fontVariationSettings: '"opsz" 144' }}>
              {n}
            </div>
            <div className="mt-1 font-mono text-[11px] text-ink-3">{label}</div>
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q.trim());
        }}
        className="flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ask memory: 'deleting build output safely'"
          className="h-10 flex-1 rounded-sm border border-line-strong bg-surface px-3 text-[14px] placeholder:text-ink-3"
        />
        <button type="submit" className="h-10 rounded-sm bg-ink px-3 text-[13px] font-semibold text-paper">
          {isFetching ? "…" : "Recall"}
        </button>
      </form>
      <div className="overflow-hidden rounded-md border border-line bg-surface">
        {(lessons ?? []).map((l, i) => (
          <Stagger i={i} key={i} className="border-b border-line px-3 py-2.5 last:border-b-0">
            <div className="flex items-center justify-between gap-2">
              <GenTag tone={tone(l.kind)}>{l.kind}</GenTag>
              <span className="font-mono text-[11px] text-ink-3">
                v{l.harnessVersion} · {l.via}
              </span>
            </div>
            <p className="mt-1.5 text-[13px] leading-snug text-ink-2">{l.text}</p>
          </Stagger>
        ))}
        {lessons && !lessons.length && <div className="px-3 py-2 font-mono text-[12.5px] text-ink-3">no lessons yet</div>}
      </div>
    </div>
  );
}
