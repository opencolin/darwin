// / — the desk: what judges see on the projector. The score, the rulebook history, the latest rounds, the QR to the phone.
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import Page from '@/client/components/Page';
import { ApprovalCard, GenerationCard, Lineage, Numeral, QuestionCard } from '@/client/components/darwin/Bits';
import { Expeditions } from '@/client/components/darwin/Expeditions';
import { cn } from '@/client/lib/utils';
import { useDarwinMutation, useDarwinState, useOperatorToken, type Approval } from '@/client/lib/darwin';

export default function HomePage() {
  const { data, error } = useDarwinState(3000);
  const op = useOperatorToken();
  const active = data?.active ?? null;
  const canAct = !!data && (!data.operatorRequired || !!op);
  const phoneUrl = typeof window !== 'undefined' ? `${window.location.origin}/m${op ? `?op=${op}` : ''}` : '/m';

  return (
    <Page>
      <section className="grid gap-8 md:grid-cols-[1fr_auto] md:items-start">
        <div className="animate-rise">
          <p className="tag">a self-improving agent rulebook · mongodb atlas · voyage ai · raindrop</p>
          <h1 className="mt-3 max-w-[18ch] text-[40px] leading-[1.05] md:text-[60px]" style={{ fontVariationSettings: '"opsz" 144' }}>
            Agents that rewrite their own rulebook.
          </h1>
          <p className="mt-4 max-w-[58ch] text-[16px] text-ink-2 md:text-[17px]">
            An AI does small coding chores following a rulebook. When it makes mistakes, a second AI proposes <b className="text-ink">one change</b> to the rulebook.
            The new rulebook takes a <b className="text-ink">surprise test</b> — ten tasks the AI has never seen. If the score goes up and nothing dangerous happened, the
            change is kept; otherwise it's thrown away and the reason is remembered. You can approve or veto every change from your phone.
          </p>
          <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
            <Stat label="surprise-test score" sub={active ? `rulebook v${active.version} · 10 tasks, twice` : 'no rulebook yet'}>
              <Numeral value={active && active.score !== null ? Math.round(active.score * 100) : null} size="lg" />
            </Stat>
            <Stat label="rulebook versions" sub={`${data?.lineage.filter((h) => h.status === 'rolled_back').length ?? 0} thrown out`}>
              <Big n={data?.lineage.length ?? 0} />
            </Stat>
            <Stat label="lessons remembered" sub={`${data?.counts.runs ?? 0} attempts remembered`}>
              <Big n={data?.counts.lessons ?? 0} />
            </Stat>
          </div>
          {error && <p className="mt-4 font-mono text-sm text-rollback">{(error as Error).message}</p>}
          {data && (
            <p className={cn('mt-4 font-mono text-[11px]', data.dataSource.db === 'darwin' ? 'text-ink-3' : 'text-pending')}>
              memory · database `{data.dataSource.db}` via {data.dataSource.source}
              {data.dataSource.db !== 'darwin' && ' — not the Atlas sandbox: set DARWIN_MONGODB_URI'}
            </p>
          )}
        </div>

        <aside className="animate-rise rounded-md border border-line bg-surface p-5 md:w-[260px]" style={{ ['--i' as string]: 2 }}>
          <p className="tag">carry it to your phone</p>
          <div className="mt-3 rounded-sm bg-paper p-3 text-ink">
            <QRCodeSVG value={phoneUrl} size={196} bgColor="transparent" fgColor="currentColor" level="M" className="block h-auto w-full" />
          </div>
          <p className="mt-3 font-mono text-[12px] leading-snug text-ink-2">
            {phoneUrl.replace(/^https?:\/\//, '').replace(/\?op=.*$/, '')}
            {op ? <span className="text-tide"> · you can approve</span> : <span className="text-ink-3"> · view only</span>}
          </p>
          <p className="mt-2 text-[13px] text-ink-3">Approve or veto changes, freeze the AI, watch it work.</p>
        </aside>
      </section>

      {data && data.pending.length > 0 && (
        <section>
          <p className="tag border-b border-pending pb-2 text-pending">
            waiting for you · {data.pending.some((a) => a.kind === 'question') ? 'the AI has a question' : 'the AI wants to change its rulebook'}
          </p>
          <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,640px)]">
            {data.pending.map((a, i) =>
              a.kind === 'question' ? (
                <DeskQuestion key={a._id} a={a} i={i} canAct={canAct} op={op} />
              ) : (
                <ApprovalCard key={a._id} a={a} i={i} actions={<DeskActions a={a} canAct={canAct} op={op} />} />
              ),
            )}
          </div>
        </section>
      )}

      <section>
        <p className="tag border-b border-line pb-2">rulebook history · filled = in use · ⊗ = thrown out · dotted = waiting for you</p>
        {data?.lineage.length ? (
          <Lineage versions={data.lineage} className="mt-3 rounded-md border border-line bg-surface px-3 py-2" />
        ) : (
          <p className="mt-3 font-mono text-sm text-ink-3">no rulebook yet — start a round from the laptop: `npm run darwin -- evolve`</p>
        )}
        {active && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Card title={`rulebook v${active.version} · rules it follows`}>
              <ol className="list-decimal space-y-1.5 pl-5 text-[14px] text-ink-2">
                {active.rules.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
            </Card>
            <Card title={`rulebook v${active.version} · guardrails (actions it is not allowed to take) · tools · memory`}>
              {active.guardrails.length ? (
                <ul className="space-y-2 font-mono text-[12.5px] leading-snug">
                  {active.guardrails.map((g) => (
                    <li key={g.id}>
                      <span className="text-tide">{g.id}</span> <code className="break-all text-ink-2">/{g.pattern}/</code>
                      <br />
                      <span className="text-ink-3">{g.reason}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="font-mono text-[12.5px] text-ink-3">no guardrails yet — the starting rulebook trusts the AI</p>
              )}
              <p className="mt-3 font-mono text-[12.5px] text-ink-2">
                tools: {active.toolAllowlist.join(', ')} · up to {active.contextPolicy.maxTurns} turns per task · reads {active.contextPolicy.retrieveK} memories per task
                {active.skills.length ? ` · skills: ${active.skills.map((s) => s.id).join(', ')}` : ''}
              </p>
            </Card>
          </div>
        )}
      </section>

      {data && data.generations.length > 0 && (
        <section>
          <p className="tag border-b border-line pb-2">rounds · newest first · each round: 14 practice tasks → one proposed change → surprise test → keep or throw away</p>
          <div className="mt-3 grid gap-4 lg:grid-cols-3">
            {data.generations.slice(0, 3).map((g, i) => (
              <GenerationCard key={`${g.evolveId}-${g.gen}`} g={g} i={i} />
            ))}
          </div>
        </section>
      )}

      <Expeditions />

      <section className="grid gap-4 md:grid-cols-[1fr_1fr]">
        <Card title="how a round works">
          <ol className="list-decimal space-y-2 pl-5 text-[14px] text-ink-2">
            <li>The AI (Claude Haiku) does 14 practice tasks following the rulebook. Every attempt is saved in Atlas and sent to Raindrop.</li>
            <li>Its mistakes are sorted into kinds: skipped the tests, did something dangerous, ignored the repo's conventions, …</li>
            <li>A second AI (Claude Opus) looks at the mistakes and the lessons in memory, and proposes <b>one</b> change: a rule, a guardrail, which tools it may use, its turn budget, or a skill.</li>
            <li>The changed rulebook takes the surprise test: 10 tasks it has never seen, twice. The change is kept only if the score goes up by 10 points or more and nothing dangerous happened. Otherwise it is thrown away — and the reason is remembered so it is not tried again.</li>
          </ol>
        </Card>
        <Card title="what the AI can't change">
          <ul className="space-y-2 text-[14px] text-ink-2">
            <li>— the tests, the surprise-test tasks, and the keep-or-throw-away rule live outside the rulebook</li>
            <li>— "dangerous" is measured by what actually happened (a protected file is gone, a secret was read), not by what the AI says it did</li>
            <li>— you can veto a change from the phone; nobody can override a safety rejection</li>
            <li>— memory is MongoDB Atlas: lessons are found with Voyage embeddings and Atlas Vector Search, and the rulebook decides how much to read</li>
          </ul>
        </Card>
      </section>
    </Page>
  );
}

function DeskQuestion({ a, i, canAct, op }: { a: Approval; i: number; canAct: boolean; op?: string }) {
  const answer = useDarwinMutation('darwin.answer');
  return (
    <QuestionCard
      a={a}
      i={i}
      canAct={canAct}
      busy={answer.isPending}
      onAnswer={(choice) => answer.mutate({ id: a._id, answer: choice, op }, { onSuccess: () => toast.success(`Answered: ${choice}`) })}
    />
  );
}

function DeskActions({ a, canAct, op }: { a: Approval; canAct: boolean; op?: string }) {
  const decide = useDarwinMutation('darwin.decide');
  const act = (status: 'promote' | 'reject') =>
    decide.mutate({ id: a._id, status, op }, { onSuccess: () => toast.success(status === 'promote' ? `Kept rulebook v${a.candidateVersion}` : `Threw out v${a.candidateVersion}`) });
  if (!canAct) return <p className="font-mono text-[12px] text-ink-3">view only — open the operator link once to approve from here</p>;
  return (
    <div className="grid grid-cols-[1fr_1.3fr] gap-2.5">
      <button type="button" disabled={decide.isPending} onClick={() => act('reject')} className="h-11 rounded-sm border border-rollback font-semibold text-rollback transition-colors hover:bg-rollback-soft disabled:opacity-50">
        Throw away
      </button>
      <button type="button" disabled={decide.isPending} onClick={() => act('promote')} className="h-11 rounded-sm bg-promote font-semibold text-paper transition-colors hover:brightness-95 disabled:opacity-50">
        Keep v{a.candidateVersion}
      </button>
    </div>
  );
}

function Stat({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <div className="tag">{label}</div>
      <div className="mt-1.5">{children}</div>
      <div className="mt-1 font-mono text-[11px] text-ink-3">{sub}</div>
    </div>
  );
}

function Big({ n }: { n: number }) {
  return (
    <span key={n} className="inline-block animate-tick font-display text-[54px] font-semibold leading-none tracking-[-0.035em]" style={{ fontVariationSettings: '"opsz" 144' }}>
      {n}
    </span>
  );
}

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-md border border-line bg-surface p-4', className)}>
      <p className="tag border-b border-line pb-2">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}
