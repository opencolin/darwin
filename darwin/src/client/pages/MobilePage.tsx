// /m — the phone. What's waiting for you, the live round, the rulebook history, and memory.
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useQuery } from "@tanstack/react-query";
import { modelenceQuery } from "@modelence/react-query";
import { Seo } from "@/client/components/Seo";
import { cn } from "@/client/lib/utils";
import { ApprovalCard, decisionWords, GenTag, Lineage, QuestionCard, Stagger, Wordmark } from "@/client/components/darwin/Bits";
import {
  humanCategory,
  patchTitle,
  pct,
  STATUS_WORDS,
  useDarwinMutation,
  useDarwinState,
  useOperatorToken,
  type Approval,
  type DarwinState,
  type LessonRow,
} from "@/client/lib/darwin";

type Tab = "pending" | "live" | "history" | "memory";

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
        {!data && !error && <p className="tag">connecting…</p>}
        {data && tab === "pending" && <PendingTab data={data} canAct={canAct} op={op} />}
        {data && tab === "live" && <LiveTab data={data} />}
        {data && tab === "history" && <HistoryTab data={data} />}
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
            title="Ask me first: changes wait for your OK. Auto: changes that pass the surprise test are kept without asking."
            disabled={!canAct || !s || setMode.isPending}
            onClick={() => s && setMode.mutate({ mode: s.mode === "auto" ? "human" : "auto", op })}
            className="tag whitespace-nowrap rounded-xs border border-line-strong px-2 py-1.5 transition-colors hover:bg-surface-2 disabled:opacity-50"
          >
            {s?.mode === "human" ? "ask me first" : "auto-approve"}
          </button>
          <span className="flex items-center gap-2">
            <span className="tag">{s?.frozen ? "frozen" : "live"}</span>
            <button
              type="button"
              role="switch"
              aria-checked={!s?.frozen}
              aria-label="allow the AI to change its rulebook"
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
          ◼ frozen — the AI can't change its rulebook until you flip this back on
        </div>
      )}
      {data && !canAct && (
        <div className="mt-3 rounded-sm bg-surface-2 px-3 py-2 font-mono text-[11px] uppercase leading-relaxed tracking-[0.06em] text-ink-3">
          view only · open the operator link once to approve changes
        </div>
      )}
    </header>
  );
}

function Tabs({ tab, setTab, pendingCount }: { tab: Tab; setTab: (t: Tab) => void; pendingCount: number }) {
  const items: [Tab, string][] = [
    ["pending", "For you"],
    ["live", "Live"],
    ["history", "History"],
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
  const answer = useDarwinMutation("darwin.answer");
  const questions = data.pending.filter((a) => a.kind === "question");
  const patches = data.pending.filter((a) => a.kind !== "question");
  if (questions.length) {
    return (
      <div className="space-y-4">
        {questions.map((a, i) => (
          <QuestionCard
            key={a._id}
            a={a}
            i={i}
            canAct={canAct}
            busy={answer.isPending}
            onAnswer={(choice) => answer.mutate({ id: a._id, answer: choice, op }, { onSuccess: () => toast.success(`Answered: ${choice}`) })}
          />
        ))}
      </div>
    );
  }
  if (!patches.length) {
    return (
      <div className="animate-rise space-y-4">
        <div className="rounded-md border border-line bg-surface p-4">
          <p className="tag">nothing waiting on you</p>
          <p className="mt-2 font-display text-[19px] leading-snug">
            {data.settings.frozen
              ? "Frozen. Every change the AI proposes is thrown out until you unfreeze."
              : data.settings.mode === "auto"
                ? "Auto-approve is on: a change that passes the surprise test is kept without asking you."
                : "Ask-me-first is on: the next change that passes the surprise test stops here for your OK."}
          </p>
        </div>
        <RecentDecisions recent={data.recent} />
      </div>
    );
  }
  const first = patches[0];
  const onDecide = (a: Approval, status: "promote" | "reject") =>
    decide.mutate(
      { id: a._id, status, op },
      { onSuccess: () => toast.success(status === "promote" ? `Kept rulebook v${a.candidateVersion}` : `Threw out v${a.candidateVersion}`) },
    );
  return (
    <div className="space-y-4">
      {patches.map((a, i) => (
        <ApprovalCard key={a._id} a={a} i={i} />
      ))}
      {/* Outside any animated ancestor: a transform would turn `fixed` into "fixed to the card". */}
      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto grid w-full max-w-md grid-cols-[1fr_1.3fr] gap-2.5 border-t border-line bg-paper/90 p-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-lift backdrop-blur">
        <button
          type="button"
          disabled={!canAct || decide.isPending}
          onClick={() => onDecide(first, "reject")}
          className="h-12 rounded-sm border border-rollback font-semibold text-rollback transition-colors hover:bg-rollback-soft disabled:opacity-50"
        >
          Throw away
        </button>
        <button
          type="button"
          disabled={!canAct || decide.isPending}
          onClick={() => onDecide(first, "promote")}
          className="h-12 rounded-sm bg-promote font-semibold text-paper transition-colors hover:brightness-95 disabled:opacity-50"
        >
          Keep v{first.candidateVersion}
        </button>
      </div>
    </div>
  );
}

function RecentDecisions({ recent }: { recent: Approval[] }) {
  if (!recent.length) return null;
  const who = (by?: string) => (by === "phone" ? "you" : by === "auto" ? "automatic" : (by ?? "—"));
  return (
    <section>
      <p className="tag border-b border-line pb-2">what happened recently</p>
      <div className="mt-2 overflow-hidden rounded-md border border-line bg-surface">
        {recent.map((a, i) =>
          a.kind === "question" ? (
            <Stagger i={i} key={a._id} className="border-b border-line px-3 py-2.5 last:border-b-0">
              <div className="flex items-center justify-between gap-2">
                <GenTag tone="active">you answered · round {a.gen}</GenTag>
                <span className="font-mono text-[11px] text-ink-3">{who(a.decidedBy)}</span>
              </div>
              <p className="mt-1.5 text-[13px] text-ink-2">
                {a.question?.text} — <b className="text-ink">{a.answer || "no answer"}</b>
              </p>
            </Stagger>
          ) : (
            <Stagger i={i} key={a._id} className="border-b border-line px-3 py-2.5 last:border-b-0">
              <div className="flex items-center justify-between gap-2">
                <GenTag tone={a.status === "promote" ? "promote" : "rolled"}>
                  {a.status === "promote" ? "kept" : "thrown out"} · v{a.candidateVersion}
                </GenTag>
                <span className="font-mono text-[11px] text-ink-3">
                  {pct(a.before)}% → {pct(a.after)}% · {who(a.decidedBy)}
                </span>
              </div>
              <p className="mt-1.5 text-[13px] text-ink-2">
                {patchTitle(a.patch?.ops ?? [])} — {decisionWords(a.auto?.reason ?? "")}
              </p>
            </Stagger>
          ),
        )}
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
        {data.liveActive ? "running" : "idle"} · rulebook v{data.active?.version ?? "–"} · {passed} of {runs.length} tasks passed
      </div>
      <h2 className="mt-2 text-[21px]">
        {data.liveActive ? "Running a round" : g ? `Last round: ${g.decision ? (g.decision.action === "promote" ? "kept" : "threw out") : "no changes to"} v${g.candidateVersion ?? g.harnessVersion}` : "No rounds yet"}
      </h2>
      {g && (
        <div className="mt-3 rounded-md border border-line bg-surface p-3 text-[13px] leading-snug text-ink-2">
          <span className="font-mono text-ink">round {g.gen}</span> · practice {g.train.passed}/{g.train.total} · biggest problem:{" "}
          <span className="font-mono text-ink">{humanCategory(g.largestCluster)}</span>
          <br />
          {g.diagnosis.slice(0, 240)}
          {g.diagnosis.length > 240 ? "…" : ""}
        </div>
      )}
      <p className="tag mt-4 border-b border-line pb-2">every task it tried · newest first</p>
      <div className="mt-2 overflow-hidden rounded-md border border-line bg-surface">
        {runs.map((r, i) => {
          const [status, tone] = r.outcome.violations.length
            ? ["unsafe", "text-violation"]
            : !r.outcome.passed
              ? ["failed", "text-rollback"]
              : r.outcome.blockedBy.length
                ? ["blocked", "text-pending"]
                : ["passed", "text-promote"];
          const why = r.outcome.violations[0] ?? (r.outcome.failureCategory ? humanCategory(r.outcome.failureCategory) : null) ?? (r.outcome.blockedBy[0] ? `guardrail ${r.outcome.blockedBy[0]} stepped in` : `${r.turns} turns`);
          return (
            <Stagger i={i} key={`${r.taskId}-${r.createdAt}-${i}`} className="grid grid-cols-[62px_1fr_auto] gap-2.5 border-b border-line px-3 py-2 font-mono text-[12.5px] last:border-b-0">
              <span className={cn("font-semibold", tone)}>{status}</span>
              <span>
                {r.taskId}
                <span className="text-ink-3"> · {r.split === "heldout" ? "surprise test" : "practice"}</span>
              </span>
              <span className="max-w-[150px] truncate text-ink-3">{why}</span>
            </Stagger>
          );
        })}
        {!runs.length && <div className="px-3 py-2 font-mono text-[12.5px] text-ink-3">nothing yet — start a round from the laptop</div>}
      </div>
    </div>
  );
}

function HistoryTab({ data }: { data: DarwinState }) {
  const h = data.active;
  return (
    <div className="animate-rise space-y-4">
      <p className="tag">rulebook history · filled = in use · ⊗ = thrown out · dotted = waiting</p>
      <Lineage versions={data.lineage} className="rounded-md border border-line bg-surface px-2 py-2" />
      {h && (
        <section className="rounded-md border border-line bg-surface p-4">
          <GenTag tone="active">in use · rulebook v{h.version}</GenTag>
          <h2 className="mt-2.5 text-[21px]">{h.rationale}</h2>
          <p className="tag mt-4 border-b border-line pb-2">rules it follows</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13.5px] text-ink-2">
            {h.rules.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ol>
          <p className="tag mt-4 border-b border-line pb-2">guardrails · actions it is not allowed to take</p>
          {h.guardrails.length ? (
            <ul className="mt-2 space-y-2">
              {h.guardrails.map((g) => (
                <li key={g.id} className="font-mono text-[12.5px] leading-snug">
                  <span className="text-tide">{g.id}</span>
                  <br />
                  <code className="break-all text-ink-2">/{g.pattern}/</code>
                  <br />
                  <span className="text-ink-3">{g.reason}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 font-mono text-[12.5px] text-ink-3">none yet — the starting rulebook trusts the AI</p>
          )}
          <p className="tag mt-4 border-b border-line pb-2">tools · settings</p>
          <p className="mt-2 font-mono text-[12.5px] text-ink-2">
            tools: {h.toolAllowlist.join(", ")} · up to {h.contextPolicy.maxTurns} turns per task · reads {h.contextPolicy.retrieveK} memories per task
            {h.skills.length ? ` · skills: ${h.skills.map((s) => s.id).join(", ")}` : ""}
          </p>
        </section>
      )}
      <section className="overflow-hidden rounded-md border border-line bg-surface">
        {[...data.lineage].reverse().map((v, i) => (
          <Stagger i={i} key={v.version} className="border-b border-line px-3 py-2.5 last:border-b-0">
            <div className="flex items-center justify-between gap-2">
              <GenTag tone={v.status === "active" ? "active" : v.status === "rolled_back" ? "rolled" : v.status === "candidate" ? "pending" : "neutral"}>
                v{v.version} · {STATUS_WORDS[v.status]}
              </GenTag>
              <span className="font-mono text-[11px] text-ink-3">
                {v.score === null ? "—" : `${Math.round(v.score * 100)}%`} · {v.rules.length} rules · {v.guardrails.length} guardrails · {v.skills.length} skills
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
  const kindWord = (k: string) => (k === "promotion" ? "a change it kept" : k === "rollback" ? "a change it threw out" : k === "skill" ? "skill" : "lesson");
  const viaWord = (v: string) => (v === "$vectorSearch" ? "found by Atlas Vector Search" : v === "latest" ? "newest" : v === "cosine-fallback" ? "found by similarity (index still building)" : v);
  return (
    <div className="animate-rise space-y-4">
      <p className="tag">everything is remembered in MongoDB Atlas — restart and nothing is lost</p>
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["lessons", data.counts.lessons, "what it learned"],
            ["attempts", data.counts.runs, "every task it tried"],
            ["rulebooks", data.lineage.length, "versions so far"],
          ] as const
        ).map(([label, n, sub]) => (
          <div key={label} className="rounded-md border border-line bg-surface p-3">
            <div className="tag">{label}</div>
            <div className="mt-1 font-display text-[28px] font-semibold leading-none" style={{ fontVariationSettings: '"opsz" 144' }}>
              {n}
            </div>
            <div className="mt-1 font-mono text-[11px] text-ink-3">{sub}</div>
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
          placeholder="ask its memory: 'cleaning up build files safely'"
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
              <GenTag tone={tone(l.kind)}>{kindWord(l.kind)}</GenTag>
              <span className="font-mono text-[11px] text-ink-3">
                v{l.harnessVersion} · {viaWord(l.via)}
              </span>
            </div>
            <p className="mt-1.5 text-[13px] leading-snug text-ink-2">{decisionWords(l.text)}</p>
          </Stagger>
        ))}
        {lessons && !lessons.length && <div className="px-3 py-2 font-mono text-[12.5px] text-ink-3">no lessons yet</div>}
      </div>
    </div>
  );
}
