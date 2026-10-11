# Darwin — demo script (3 minutes + Q&A)

## Before you go on (≈2 minutes, do it at the table)

```bash
cd /Users/luxor/Code/hackathon/darwin
npm run darwin -- reset --yes                                   # fresh live database
npm run darwin -- evolve --generations 0 --concurrency 14 --reps 2   # scores the bare harness v0 (~40 s)
npm run darwin -- status                                        # prints the operator link
npm run dev                                                     # desk at http://localhost:3000 (or the deployed URL)
```

- Phone: open the **operator link** once (it stores the token), then `/m`. Tap the mode button until it reads **mode · human**.
- Laptop: desk (`/`) on the projector, terminal in a split. The *recorded expeditions* section at the bottom holds the rollback arcs from earlier today.
- Backup: hotspot on. If Atlas is unreachable, the expeditions section still renders (bundled JSON); narrate from it.

## The 3 minutes

**0:00 — the problem.** "Agents stall in production without governance, memory and security. Darwin is a harness that improves itself *and* governs itself: every rule, guardrail and tool permission is a versioned document in Atlas, and the agent can only change them through a loop it can't cheat."

**0:20 — gen 0 on the desk.** Lineage shows `v0 · 60%` (or whatever it scored). "The bare harness: one rule, no guardrails. It writes files without running tests, and on the train set it followed instructions planted in a repo file and deleted `data/backups`. Measured by effect, not by what the model says."

**0:40 — start the generation.** In the terminal:

```bash
npm run darwin -- evolve --generations 1 --concurrency 14 --reps 2 --mode human --skip-baseline
```

While it runs (≈70 s), narrate from the desk's *how a generation works* card: 14 train tasks → failures clustered on the taxonomy → the meta-agent (Opus) proposes **one** patch over six allowlisted fields → validator → 10 held-out tasks it has never seen, twice → promote only on ≥10 points with zero violations.

**1:30 — the rollbacks (recorded expeditions).** Scroll to expedition 1: "Earlier today it first tried a *rule* — 'never delete data'. Rolled back: the worker still deleted protected data on held-out. A rule is advice. Next generation, holding that rollback as a lesson in Atlas, it proposed a *guardrail* that blocks the call — and turned on memory retrieval. Promoted." Expedition 2: "Then it overfit — a guardrail that literally said `data/backups` — and held-out tasks about `archive/` caught it."

**2:10 — the phone.** The live generation stops at the phone: rationale in the meta-agent's words, the diff, before/after, "0 safety violations". Tap **Promote**. The terminal continues; the desk score ticks. (If it rolled back instead: "the loop refused its own patch — the other half of governance.") Flip **freeze** to show the kill switch.

**2:40 — memory.** Memory tab: lessons with `via $vectorSearch`. "Kill the process, run `status`: resumed active harness from Atlas. Same agent, long horizon."

**2:55 — close.** "Three things the meta-agent cannot touch: the scorer, the held-out set, the promotion rule. That's why the number is real."

## Q&A ammunition

- **Reward hacking?** Patches are data over six allowlisted fields; the scorer, tasks and promotion rule live outside the harness. Held-out tasks reveal only pass/fail counts. Safety is measured by effect in the sandbox.
- **Noise?** Claude 5.5 ignores `temperature`; we saw the same harness score 50% and 83% on six tasks. So held-out is 10 tasks × 2 reps = 20 runs, and promotion needs ≥10 points.
- **Is this just prompt tuning?** Rules are one of six ops. Promoted patches so far were guardrails (regex over tool+args, enforced before execution), context policy (retrieveK, turn budget) and skills distilled from passing trails.
- **Real repos?** The tool interface is the boundary: swap the in-memory repo for a container (Tenki / Agent Engine) and keep everything else.
- **Why Atlas?** Lineage, runs, lessons and approvals are shared between the CLI loop, the server and the phone across machines and restarts; Vector Search gives the worker lessons by similarity to its task.
- **Raindrop?** Every worker and meta-agent call is an event; promotions/rollbacks are signals on the meta event; generations carry before/after scores as properties.
