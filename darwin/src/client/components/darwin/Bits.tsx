// Darwin's signature elements (see DESIGN.md): wordmark, gen tag, numeral, diff ledger, lineage.
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/client/lib/utils";
import { patchTitle, pct, type GenerationSummary, type HarnessSummary } from "@/client/lib/darwin";

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display font-semibold tracking-[-0.02em]", className)}>
      darwin
      <span className="font-normal text-ink-3">
        .<span className="font-semibold text-tide">voyage</span>
      </span>
    </span>
  );
}

const TONES = {
  neutral: "border-line-strong text-ink-2 bg-surface",
  active: "border-tide text-tide bg-tide-soft",
  pending: "border-pending text-pending bg-pending-soft",
  rolled: "border-rollback text-rollback line-through",
  violation: "border-violation text-violation bg-violation-soft",
  promote: "border-promote text-promote bg-promote-soft",
} as const;

export function GenTag({ children, tone = "neutral", className }: { children: ReactNode; tone?: keyof typeof TONES; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-xs border px-1.5 py-[5px] font-mono text-[11px] uppercase leading-none tracking-[0.08em]", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function Numeral({ value, size = "lg", className }: { value: number | null; size?: "md" | "lg" | "xl"; className?: string }) {
  const sizes = { md: "text-[40px]", lg: "text-[54px]", xl: "text-[88px]" };
  return (
    <span
      key={value ?? "none"}
      className={cn("inline-block animate-tick font-display font-semibold leading-none tracking-[-0.035em]", sizes[size], className)}
      style={{ fontVariationSettings: '"opsz" 144' }}
    >
      {value === null ? "—" : value}
      <span className="text-[0.42em] font-medium tracking-normal text-ink-3">%</span>
    </span>
  );
}

export function DiffLedger({ lines, className }: { lines: string[]; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-md border border-line bg-surface", className)}>
      {lines.map((l, i) => {
        const k = l[0];
        const cls = k === "+" ? "diff-add" : k === "-" ? "diff-del" : "diff-mod";
        return (
          <div key={i} className={cn("grid grid-cols-[18px_1fr] gap-2 border-b border-line px-3 py-2 font-mono text-[12.5px] leading-snug last:border-b-0", cls)}>
            <b className="font-semibold">{k === "-" ? "−" : k}</b>
            <span className="break-words">{l.slice(2)}</span>
          </div>
        );
      })}
      {!lines.length && <div className="px-3 py-2 font-mono text-[12.5px] text-ink-3">no changes</div>}
    </div>
  );
}

export function Lineage({ versions, className }: { versions: HarnessSummary[]; className?: string }) {
  const step = 124;
  const pad = 70;
  const w = pad * 2 + step * Math.max(0, versions.length - 1);
  return (
    <div className={cn("overflow-x-auto", className)}>
      <svg viewBox={`0 0 ${w} 78`} width={w} height={78} className="block max-w-none" aria-label="harness lineage">
        {versions.length > 1 && (
          <path d={`M${pad} 28 H${w - pad}`} stroke="var(--color-line-strong)" strokeWidth="1.5" fill="none" pathLength={1} strokeDasharray={1} className="animate-draw" />
        )}
        {versions.map((h, i) => {
          const x = pad + i * step;
          const st = h.status;
          const fill = st === "active" ? "var(--color-tide)" : st === "superseded" ? "var(--color-ink-3)" : "var(--color-paper)";
          const stroke = st === "rolled_back" ? "var(--color-rollback)" : st === "candidate" ? "var(--color-pending)" : fill;
          const label = st === "active" ? "active" : st === "rolled_back" ? "rolled back" : st === "candidate" ? "pending" : "superseded";
          return (
            <g key={h.version}>
              <circle cx={x} cy={28} r={7} fill={fill} stroke={stroke} strokeWidth="1.5" strokeDasharray={st === "candidate" ? "3 2" : undefined} />
              {st === "rolled_back" && <path d={`M${x - 4} 24 l8 8 M${x + 4} 24 l-8 8`} stroke="var(--color-rollback)" strokeWidth="1.5" />}
              <text x={x} y={56} textAnchor="middle" fill="var(--color-ink-2)" style={{ font: "500 10.5px var(--font-mono)", letterSpacing: ".06em", textTransform: "uppercase" }}>
                v{h.version} {label}
              </text>
              <text x={x} y={70} textAnchor="middle" fill="var(--color-ink-3)" style={{ font: "10px var(--font-mono)" }}>
                {h.score === null ? "" : `${Math.round(h.score * 100)}%`}
                {h.guardrails.length ? ` · ${h.guardrails.length} guard` : ""}
                {h.contextPolicy.retrieveK ? ` · mem${h.contextPolicy.retrieveK}` : ""}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function Stagger({ i, className, children, style }: { i: number; className?: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className={cn("stagger", className)} style={{ ...style, ["--i" as string]: Math.min(i, 10) }}>
      {children}
    </div>
  );
}

export function GenerationCard({ g, i }: { g: GenerationSummary; i: number }) {
  const promoted = g.decision?.action === "promote";
  const before = pct(g.heldoutBefore);
  const after = pct(g.heldoutAfter);
  return (
    <Stagger i={i} className="flex flex-col overflow-hidden rounded-md border border-line bg-surface">
      <div className="p-4 pb-0">
        <div className="flex flex-wrap items-center gap-2">
          <GenTag>
            gen {String(g.gen).padStart(2, "0")} · from v{g.harnessVersion}
          </GenTag>
          {g.decision && (
            <GenTag tone={promoted ? "promote" : "rolled"}>
              {promoted ? "promoted" : "rolled back"} · v{g.candidateVersion}
            </GenTag>
          )}
          {!g.decision && !g.patch && <GenTag tone="active">nothing to patch</GenTag>}
        </div>
        <h2 className="mt-2.5 text-[20px]">{g.patch ? patchTitle(g.patch.ops) : `train ${g.train.passed}/${g.train.total}: no failures`}</h2>
        <p className="mt-1 font-mono text-xs text-ink-3">
          train {g.train.passed}/{g.train.total} · cluster {g.largestCluster ?? "none"}
        </p>
        {g.diagnosis && (
          <p className="mt-2 text-[13.5px] leading-snug text-ink-2">
            {g.diagnosis.slice(0, 220)}
            {g.diagnosis.length > 220 ? "…" : ""}
          </p>
        )}
      </div>
      {g.patch && <DiffLedger lines={g.diff} className="mt-3 rounded-none border-x-0 border-b-0" />}
      <div className="mt-auto grid grid-cols-[auto_auto_1fr] items-end gap-3 border-t border-line p-4">
        <div>
          <div className="tag">held-out</div>
          <Numeral value={before} size="md" />
        </div>
        <div className="pb-2 font-mono text-ink-3">→</div>
        <div>
          <div className="tag">candidate</div>
          <Numeral value={after} size="md" />
        </div>
      </div>
      {g.decision && <p className="border-t border-line px-4 py-2 font-mono text-[11.5px] text-ink-3">{g.decision.reason}</p>}
    </Stagger>
  );
}
