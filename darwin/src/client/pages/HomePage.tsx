// / — the desk: what judges see on the projector. The score, the lineage, the latest patches, and the QR to the phone.
import { QRCodeSVG } from 'qrcode.react';
import Page from '@/client/components/Page';
import { GenerationCard, Lineage, Numeral } from '@/client/components/darwin/Bits';
import { Expeditions } from '@/client/components/darwin/Expeditions';
import { cn } from '@/client/lib/utils';
import { useDarwinState, useOperatorToken } from '@/client/lib/darwin';

export default function HomePage() {
  const { data, error } = useDarwinState(3000);
  const op = useOperatorToken();
  const active = data?.active ?? null;
  const phoneUrl = typeof window !== 'undefined' ? `${window.location.origin}/m${op ? `?op=${op}` : ''}` : '/m';

  return (
    <Page>
      <section className="grid gap-8 md:grid-cols-[1fr_auto] md:items-start">
        <div className="animate-rise">
          <p className="tag">self-improving agent harness · mongodb atlas · voyage ai · raindrop</p>
          <h1 className="mt-3 max-w-[18ch] text-[40px] leading-[1.05] md:text-[60px]" style={{ fontVariationSettings: '"opsz" 144' }}>
            Agents that rewrite their own harness — and show their work.
          </h1>
          <p className="mt-4 max-w-[58ch] text-[16px] text-ink-2 md:text-[17px]">
            Every rule, guardrail, tool permission and skill the worker runs under is a versioned document in Atlas. When it fails, a meta-agent
            proposes one bounded patch, Darwin tests it on tasks the meta-agent has never seen, and promotes it only if the held-out score rises
            with zero safety violations. Anything else is rolled back — and you can veto from your phone.
          </p>
          <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
            <Stat label="held-out pass rate" sub={active ? `harness v${active.version}` : 'no harness yet'}>
              <Numeral value={active && active.score !== null ? Math.round(active.score * 100) : null} size="lg" />
            </Stat>
            <Stat label="harness versions" sub={`${data?.lineage.filter((h) => h.status === 'rolled_back').length ?? 0} rolled back`}>
              <Big n={data?.lineage.length ?? 0} />
            </Stat>
            <Stat label="lessons in memory" sub={`${data?.counts.runs ?? 0} runs remembered`}>
              <Big n={data?.counts.lessons ?? 0} />
            </Stat>
          </div>
          {error && <p className="mt-4 font-mono text-sm text-rollback">{(error as Error).message}</p>}
          {data && (
            <p className={cn('mt-4 font-mono text-[11px]', data.dataSource.source === 'DARWIN_MONGODB_URI' ? 'text-ink-3' : 'text-pending')}>
              memory · database `{data.dataSource.db}` via {data.dataSource.source}
              {data.dataSource.source !== 'DARWIN_MONGODB_URI' && ' — set DARWIN_MONGODB_URI to the Atlas sandbox'}
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
            {op ? <span className="text-tide"> · operator</span> : <span className="text-ink-3"> · view only</span>}
          </p>
          <p className="mt-2 text-[13px] text-ink-3">Approve or reject patches, freeze the meta-agent, watch the loop run.</p>
        </aside>
      </section>

      <section>
        <p className="tag border-b border-line pb-2">lineage</p>
        {data?.lineage.length ? (
          <Lineage versions={data.lineage} className="mt-3 rounded-md border border-line bg-surface px-3 py-2" />
        ) : (
          <p className="mt-3 font-mono text-sm text-ink-3">no harness in Atlas yet — run `npm run darwin -- evolve`</p>
        )}
        {active && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Card title={`v${active.version} · rules`}>
              <ol className="list-decimal space-y-1.5 pl-5 text-[14px] text-ink-2">
                {active.rules.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
            </Card>
            <Card title={`v${active.version} · guardrails · tools · memory`}>
              {active.guardrails.length ? (
                <ul className="space-y-2 font-mono text-[12.5px] leading-snug">
                  {active.guardrails.map((g) => (
                    <li key={g.id}>
                      <span className="text-tide">{g.id}</span> <span className="text-ink-3">({g.action})</span> <code className="break-all text-ink-2">/{g.pattern}/</code>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="font-mono text-[12.5px] text-ink-3">no guardrails yet — the baseline trusts the worker</p>
              )}
              <p className="mt-3 font-mono text-[12.5px] text-ink-2">
                [{active.toolAllowlist.join(' ')}] · maxTurns {active.contextPolicy.maxTurns} · retrieveK {active.contextPolicy.retrieveK}
                {active.skills.length ? ` · skills: ${active.skills.map((s) => s.id).join(', ')}` : ''}
              </p>
            </Card>
          </div>
        )}
      </section>

      {data && data.generations.length > 0 && (
        <section>
          <p className="tag border-b border-line pb-2">generations · newest first</p>
          <div className="mt-3 grid gap-4 lg:grid-cols-3">
            {data.generations.slice(0, 3).map((g, i) => (
              <GenerationCard key={`${g.evolveId}-${g.gen}`} g={g} i={i} />
            ))}
          </div>
        </section>
      )}

      <Expeditions />

      <section className="grid gap-4 md:grid-cols-[1fr_1fr]">
        <Card title="how a generation works">
          <ol className="list-decimal space-y-2 pl-5 text-[14px] text-ink-2">
            <li>The worker (Claude Haiku) runs 14 train tasks under the active harness; every run is an episodic memory in Atlas and an event in Raindrop.</li>
            <li>Failures are clustered on the failure taxonomy (unsafe action, skipped verification, convention missed, …).</li>
            <li>The meta-agent (Claude Opus) proposes <b>one</b> patch over allowlisted fields; the validator rejects anything else.</li>
            <li>The candidate runs 6 held-out tasks it has never seen. Promote only if the pass rate rises with zero safety violations; otherwise roll back and remember why.</li>
          </ol>
        </Card>
        <Card title="what the meta-agent cannot touch">
          <ul className="space-y-2 text-[14px] text-ink-2">
            <li>— the scorer, the held-out tasks, and the promotion rule live outside the harness</li>
            <li>— safety violations are measured by effect, so a guardrail only counts if it actually stops the call</li>
            <li>— a human can veto a promotion from the phone, never override a safety rollback</li>
            <li>— memory is retrieved with Voyage embeddings and Atlas Vector Search; the harness decides how much to read</li>
          </ul>
        </Card>
      </section>
    </Page>
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

