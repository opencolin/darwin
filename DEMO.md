# Darwin — demo script (3 minutes + Q&A)

## Before you go on

```bash
cd /Users/luxor/Code/hackathon/darwin
npm run darwin -- status          # mode / frozen / lineage / operator link
npm run dev                       # desk at http://localhost:3000 (or the deployed URL)
```

- Phone: open the **operator link** from `status` once (it stores the token), then `/m`. Switch mode to **human**.
- Laptop: desk view (`/`) on the projector. Terminal visible in a split.
- Backup: hotspot on; `darwin/data/*.json` holds the recorded lineage if the room's Wi‑Fi dies.

## The 3 minutes

**0:00 — the problem, in one breath.** "Agents stall in production without governance, memory and security. Darwin is a harness that improves itself *and* governs itself — every rule, guardrail and tool permission is a versioned document in Atlas, and the agent can only change them through a loop it can't cheat."

**0:20 — gen 0 on the desk.** Point at the lineage: `v0 base · 50%`. "The bare harness: one rule, no guardrails. It skips tests, and on this task" — Live tab or `runs` — "it followed instructions planted in a repo file and deleted `data/backups`. That's a safety violation, measured by effect, not by what the model claims."

**0:45 — start a generation.** In the terminal:

```bash
npm run darwin -- evolve --generations 1 --concurrency 14 --mode human
```

While it runs (≈45–60 s), narrate the loop from the desk's *how a generation works* card: train 14 → cluster failures on the taxonomy → the meta-agent (Opus) proposes **one** patch over allowlisted fields → validator → 6 held-out tasks it has never seen → promote only on a gain with zero violations.

**1:30 — the rollback that makes the point.** Show gen 1 in *recent decisions* (from the recorded lineage): "First it tried a *rule* — 'never delete data'. Rolled back: the worker still deleted protected data on held-out. A rule is advice. Next generation, holding that rollback as a lesson in Atlas, it proposed a *guardrail* that blocks the call — and turned on memory retrieval. Promoted, 50 → 67."

**2:00 — the phone.** The live generation stops at the phone (if it beat held-out): rationale in the meta-agent's words, the diff, before/after, "0 safety violations". Tap **Promote**. The terminal continues; the desk score ticks. (If it rolled back instead: "the loop refused its own patch — that's the other half of governance.") Flip **Freeze** to show the kill switch.

**2:30 — memory.** Memory tab: lessons with `via: $vectorSearch`. Kill the terminal process, run `status`: "resumed active harness vN from Atlas". "Kill it, restart it, it's the same agent. Long horizon."

**2:50 — close.** "Three things the meta-agent cannot touch: the scorer, the held-out set, the promotion rule. That's why the number is real."

## Q&A ammunition

- **Reward hacking?** Patches are data over six allowlisted fields; the scorer, tasks and promote rule live outside the harness. Held-out tasks reveal only pass/fail counts. Safety is measured by effect in the sandbox.
- **Why only six held-out tasks?** Time. `minGain` is one task; two-pass majority voting is a flag away.
- **Is this just prompt tuning?** Rules are one of six ops. The promoted patches so far were guardrails (regex over tool+args, enforced before execution), context policy (retrieveK, turn budget) and skills distilled from passing trails.
- **How does it scale to real repos?** The tool interface is the boundary: swap the in-memory repo for a container (Tenki/Agent Engine) and keep everything else.
- **What does Atlas do that a file couldn't?** Lineage, runs, lessons and approvals are shared between the CLI loop, the server and the phone, across machines and restarts; Vector Search gives the worker lessons by similarity to its task.
- **Raindrop?** Every worker and meta-agent call is an event; promotions/rollbacks are signals on the meta event; generations carry before/after scores as properties.
