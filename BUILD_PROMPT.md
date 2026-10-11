# Build this: Darwin (hackathon edition)

**Pitch (one line):** "Agents that rewrite their own harness from their own failures, with every rule, memory and guardrail living in MongoDB Atlas, and a phone in your pocket to approve or roll back what they learned."

Targets: Problem Statement 1 (Recursive Harnessing) as the core, Statement 2 (Long Horizon) via persistent memory, and the Raindrop RSI prize.
Hard deadline: submissions at 5:00 PM PT. About 6 hours of build time. Everything below is ordered so that stopping at any point still leaves a working demo.

## Hackathon constraints (non-negotiable)
- Built on the **MongoDB Atlas Sandbox** cluster. Finalists who don't are ineligible.
- **Public GitHub repo.** Demo shows only what we built today. Keep a `WHAT_WE_BUILT_TODAY.md`; nothing pre-existing is presented as ours.
- Not allowed as the main feature: a dashboard, basic RAG, a Streamlit app, a chatbot wrapper. The main feature is the **self-improvement loop plus phone steering**, with the UI as a thin window onto it.
- Demo: about 3 min live + 1 min video. Round 1 weights: Technical Demo 35%, Implementation Difficulty 30%, Impact 20%, Creativity 15%.

## Stack (what we already have; do not substitute)
- **Modelence** app (`/darwin`): TypeScript, React, Node, MongoDB. Modelence's team is on the judging panel. Use its modules, queries and mutations rather than a separate Next.js app.
- **MongoDB Atlas (sandbox)** for all state, with **Atlas Vector Search + Voyage AI** embeddings for semantic retrieval.
- **Atlas Agent Engine** agent `darwin-worker` (`/darwin-worker/agents/darwin-worker`, template `hello-world-agent-ts`; its `LLM_API_KEY` and egress point at the chosen gateway's host instead of `api.anthropic.com`) is the worker agent runtime and gets deployed with `agentengine deploy`.
- **Raindrop** for observability of every worker and meta-agent call (write key in `.env` as `RAINDROP_WRITE_KEY`; never print it).
- **LLM access through a gateway, not a direct Anthropic key.** Use the Vercel AI SDK (`ai`) against an OpenAI-compatible gateway, chosen by env (default `aisa`, key present): Vercel AI Gateway (`AI_GATEWAY_API_KEY`), OpenRouter (`OPENROUTER_API_KEY`) or AISA.one (`AISA_API_KEY`). One small `model()` factory reads `LLM_PROVIDER` and a base URL; models are Claude via the gateway (`anthropic/claude-sonnet-5-5` worker, `anthropic/claude-opus-5-5` meta-agent). The Vercel AI SDK also gives Raindrop its first-party integration, so traces come almost for free. The factory is the one place provider choice lives; the worker and meta-agent never import a provider SDK directly.
- Tests: Node's built-in `node:test` for every pure helper.
- **Tenki Cloud sandboxes** (`TENKI_API_KEY` is set) back the machine layer for stretch items; if it fails the machine layer runs behind the same interface as local processes. Never block on Tenki.
- Env: `MONGODB_URI` (Atlas sandbox), `LLM_PROVIDER` (`vercel|openrouter|aisa`) with that provider's key, `VOYAGE_API_KEY`, `RAINDROP_WRITE_KEY`, `DARWIN_SIGNING_SECRET` (32 random bytes). With no LLM key the app runs in **demo mode** from recorded traces.

## Must ship (in this order)

### 1. The harness as data (Mongo schema)
A harness is a versioned document, not code:
`harnesses {_id, version, parentVersion, status: candidate|active|rolled_back, systemRules[], contextPolicy {maxTurns, retrieveK, summarizeAfter}, guardrails[{id, pattern, action: block|confirm}], toolAllowlist[], skills[], score, createdAt, createdBy: human|meta-agent, rationale}`.
Helpers (pure, tested): `applyPatch(harness, patch)`, `validatePatch` (allowlisted fields only, bounded sizes), `diffHarness`.

### 2. Task suite and hard-metric scorer
About 20 small, deterministic tasks with checkable outcomes (fix a failing test, transform a file, a multi-step tool task, and a few that tempt an unsafe action such as `rm -rf` or reading a secret). Split 14 train / 6 held-out. The scorer returns pass/fail per task, with a safety violation counted as a hard fail. No LLM-judge for the headline metric.

### 3. Worker loop
The worker runs one task under the active harness with the allowlisted tools, inside a temp workspace. Every run is written to `runs {harnessVersion, taskId, trace[], toolCalls[], passed, failureCategory, tokens, ms}`. Guardrails run before each tool call; a block is logged as an event, not an error. Every run is also sent to Raindrop (`begin`/`finish`, real `userId` = operator id, `convoId` = harness version, `trackSignal` with the score).

### 4. Meta-agent: the recursive part
After a generation: cluster failures by category (embed failure summaries with Voyage, cosine-group with a threshold; taxonomy kept in a `failureTaxonomy` collection). The meta-agent reads the clusters and proposes ONE bounded patch with a rationale: add or tighten a rule, add a guardrail after an unsafe action, prune a misfiring tool, change the context policy, or promote a successful trace into a reusable skill. Then:
1. Apply the patch to a candidate harness.
2. Run the candidate on the held-out split.
3. **Promote if the score improves and there are zero safety violations; otherwise roll back** and record why in memory (so it doesn't propose the same patch twice).

### 5. Four-kind memory in Atlas
- **Episodic:** runs and traces.
- **Semantic:** embeddings of failure summaries and lessons, queried with `$vectorSearch` and injected into the worker's context according to `retrieveK`.
- **Taxonomic:** the failure-category tree.
- **Procedural:** promoted skills and rules.
Kill the process and restart: the next session resumes from the active harness and memory, no re-learning. This is the Long Horizon proof.

### 6. CLI-first demo driver
`pnpm darwin evolve --generations 5` prints, per generation: held-out pass rate, the patch the meta-agent chose and why, promote or rollback, and safety violations. Target story: 30% to about 75% over 4–5 generations, with at least one rollback shown on purpose. A thin web view (Modelence page) shows the harness diff and the score line. It is a window onto the loop, not the product.

### 7. Phone steering (`/m`, mobile web)
A phone-first page (QR code on the desktop view). It is the governance surface:
- Pending patches, needs-you first: shows rationale, diff and the candidate's held-out score, with **Promote / Reject** buttons.
- Live view of the running generation (poll over plain HTTP every 2 s; no long-lived connections).
- A "freeze" switch that stops the meta-agent from changing the harness (a kill switch).
- Badge / notification count for patches awaiting a human.
Mode setting: **auto-promote** (fully recursive) or **human-in-the-loop** (phone approval required).

### 8. Raindrop RSI evidence
Every generation emits a Raindrop signal with its score so the improvement curve is visible there. Add a Raindrop Investigate pass in the final minutes to find one more failure cluster live if time allows.

### 9. Submission assets (reserve the last 40 minutes)
Public repo with README (architecture, how Atlas is used, how to run), 1-minute demo video, form answers (MongoDB use, MongoDB feedback, partner feedback including the `agentengine` install download issue in `agentengine-install-issue.md`), and the Raindrop RSI checkbox set to yes.

## Hard-won lessons
1. Nothing user- or model-supplied goes into a shell. Tools run as argv with allowlists; test with a hostile string (`hi"; rm -rf ~ #`).
2. Patches are bounded and validated before they touch a harness; the meta-agent can never edit the scorer, the held-out set or its own promotion rule. Say so in the pitch, because judges will ask about reward hacking.
3. Held-out split is never shown to the meta-agent, only its pass or fail.
4. Demo mode is a feature: pre-recorded generations in Mongo so the demo survives bad venue Wi-Fi or API outages.
5. Venue networks drop long transfers; keep downloads small and resumable.
6. Never brand the site as another company without their consent.

## Stretch (in order)
1. Carry the session to the phone: the desktop QR contains a one-time, 2-minute signed token for the operator id; `/m?claim=` redeems it once.
2. Per-user harness: the same agent develops different rules for different users or tasks (answers "adapt their entire environment to fit a specific user").
3. A browser desktop shell with terminal windows over Tenki machines.
4. Share a read-only live view of a generation.

## Demo script (3 minutes)
1. Show generation 0: the agent fails tasks, including one unsafe action. Show the score (about 30%).
2. Run `darwin evolve`: watch the meta-agent diagnose failures, patch the harness, and promote one patch and roll back another.
3. Phone: a patch is pending; read the rationale and diff, tap Promote. Score goes up on the held-out set.
4. Kill the process, restart: it resumes from Atlas memory with no re-learning. Show the Raindrop curve.
5. Close: "Agents stall in production without governance, memory and security. Darwin gives them all three, and it improves itself."

## Done means
A judge can watch the loop raise a held-out score with a hard metric, see a rollback, approve a patch from a phone, restart and see memory persist. A `node:test` suite covers `applyPatch`/`validatePatch`, the scorer, the guardrail matcher, the cookie/token signing, and the promote-or-rollback rule.
