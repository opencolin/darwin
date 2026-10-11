# Darwin: plan to win (written 12:14 PT, submissions due 5:00 PM)

Product: a safety-governed, self-improving agent harness. Harness (rules, guardrails, tools, skills) = versioned docs in MongoDB Atlas. A meta-agent patches it from failures, tests on held-out tasks, promotes or rolls back, and a human can approve from a phone. Live at darwin.voyage.

Judging weights, Round 1: Technical Demo 35, Difficulty 30, Impact 20, Creativity 15. Round 2: equal weights. Prizes: 1st/2nd/3rd + Raindrop RSI ($3k).

## Status at 12:14
- Done: infra verified (Atlas ping, Voyage embeddings, AISA models, Tenki key, Raindrop key), `src/darwin/` core (harness + patch validator, virtual env + guardrails, 20 tasks, scorer, promote rule), 13/13 tests.
- Not done: LLM client, worker loop, meta-agent, memory, CLI, phone page, deploy, submission.

## Timeline (hard stops; cut scope, never slip the submission)

| Time | Block | Output | Exit criterion |
|---|---|---|---|
| 12:15-12:45 | **A. Worker loop** | `llm.ts` (AISA, OpenAI tool-calling, haiku-5-5), `worker.ts` runs a task under a harness with guardrails and tool allowlist, Raindrop begin/finish per run | One task runs end to end; baseline train pass rate printed |
| 12:45-1:30 | **B. Meta-agent + evolve CLI** | `meta.ts` (opus-5-5 proposes ONE validated patch from failure clusters), `evolve.ts` loop: run train, cluster failures, patch, held-out eval, `decide()`, promote/rollback | `pnpm darwin evolve --generations 3` shows score movement and one rollback. **Tune tasks here if baseline is not failing for real reasons** |
| 1:30-2:15 | **C. Atlas memory** | Collections: harnesses, runs, lessons (Voyage vectors + `$vectorSearch` index), failureTaxonomy, skills. Retrieval of top-K lessons into worker context per `retrieveK`. Failed-patch memory so the meta-agent never repeats a rejected patch | Kill process, rerun: resumes from active harness, memory retrieved |
| 2:15-3:15 | **D. Phone page `/m` + Modelence server methods** | Pending-patch list with rationale, diff, held-out score; Promote/Reject; Freeze switch; live generation view (2 s polling); auto-promote vs human-in-loop toggle | Approve a real patch from a phone on the hotspot |
| 3:15-3:45 | **E. Deploy + domain** | `modelence deploy` (user runs, browser sign-in), `darwin.voyage` CNAME via Vercel, QR code in the CLI/desktop view | `https://darwin.voyage/m` loads on a phone |
| 3:45-4:20 | **F. Demo hardening** | Recorded "gold run" stored in Mongo as demo mode, rehearse the 3-min script twice, fix flaky tasks, Raindrop curve visible | Demo works with Wi-Fi off (demo mode) and on |
| 4:20-5:00 | **G. Submission** | Public repo + README + `WHAT_WE_BUILT_TODAY.md`, 1-min video, form (MongoDB use, MongoDB feedback, partner feedback incl. install issue, Raindrop RSI = yes), remove `0.0.0.0/0` Atlas rule after event | Form submitted by **4:50** |

Stretch only if ahead of schedule: per-user harnesses; Tenki machine for tool execution; shareable read-only live view.

## Architecture

```
phone /m  <->  Modelence server (queries/mutations, polling)
                    |
 evolve CLI / server loop
   worker (haiku-5-5) --tools--> virtual env (guardrails first, effects detected)
   meta-agent (opus-5-5) --patch--> validatePatch --> candidate harness
   held-out eval --> decide() --> promote | rollback
                    |
 MongoDB Atlas: harnesses, runs, lessons(vector), failureTaxonomy, skills, patches
 Voyage (ai.mongodb.com) embeddings, Raindrop traces + score signals, AISA gateway
```

Trust boundaries (say these in the pitch): the meta-agent can only emit validated patches over allowlisted fields; it cannot touch the scorer, the held-out set or the promote rule; held-out tasks reveal only pass/fail counts to it; safety violations are measured by effect, so a guardrail only counts if it actually stops the call.

## Demo script (3 min)
1. (0:00) Gen 0: show the baseline harness, run held-out: ~30%, one safety violation (deleted protected data). Say what Darwin is.
2. (0:30) `darwin evolve`: meta-agent reads failures, adds a guardrail + a rule, held-out rises, **promote**. Next patch fails, **rollback with reason**.
3. (1:30) Phone: patch pending (human-in-loop), read rationale + diff, tap Promote. Score updates.
4. (2:10) Kill the process, restart: resumes, memory retrieved, no re-learning. Show Raindrop score curve.
5. (2:40) Close with the one-liner. Q&A answers ready: reward hacking, why held-out, how it scales, what Atlas does here.

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| Baseline does not fail naturally (model too strong) | Use haiku-class worker, low `maxTurns`, convention tasks that need verification; tune at block B exit |
| Meta-agent proposes useless patches | Give it failure clusters + lessons; bounded ops; retry up to 3 candidates per generation |
| Noisy held-out (6 tasks) | Run each held-out task 2x and use majority; fixed seeds/temperature 0 |
| Venue Wi-Fi / API outage | Demo mode from recorded gold run; hotspot as backup |
| Modelence deploy trouble | Fallback: run locally, expose with the Vercel domain proxy or show on laptop + phone on same network |
| Time | Blocks A-B are the product. If behind at 2:15, skip stretch and ship phone page minimal (approve/reject only) |
| Rule compliance | Public repo, only work done today, Atlas sandbox used for all state, demo shows only new code |

## Rules checklist (before 5:00)
- [ ] Built on the Atlas sandbox cluster (Cluster0) - yes
- [ ] Repo public, README explains Atlas usage
- [ ] Only today's work presented; pre-existing code none
- [ ] Demo video 1 min, link accessible
- [ ] All teammates added on the form
- [ ] Temporary `0.0.0.0/0` rule removed after event
