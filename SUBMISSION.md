# Submission form — drafts (paste into cerebralvalley.ai/e/mongodb-sftw-hackathon/hackathon/submit)

**Team name:** Darwin

**Project description**

Darwin is a self-improving, safety-governed agent harness. Every rule, guardrail, tool permission and skill a worker agent runs under is a versioned document in MongoDB Atlas. When the worker fails, a meta-agent clusters the failures on a taxonomy, proposes exactly one bounded patch (a rule, a guardrail regex, a tool allowlist change, a context policy change, or a skill distilled from a passing trail), and Darwin tests the candidate on held-out tasks the meta-agent has never seen. A patch is promoted only if the held-out pass rate rises with zero safety violations; otherwise it is rolled back and the reason is written to memory so it is never repeated. Safety is measured by effect in a sandboxed repo (a protected file is gone, a secret was read), so a guardrail only counts if it actually blocked the call. Atlas holds all four memory kinds — episodic runs, semantic lessons (Voyage embeddings + Atlas Vector Search), the failure taxonomy, and the procedural lineage — so the loop resumes after a restart with everything it learned. A phone surface (darwin.voyage/m) keeps a human in the loop on every round: the meta-agent asks the operator one preference question (the answer becomes a rule in the harness and is remembered, so it is never asked twice), every safe candidate waits for a keep/throw-away decision with the loop's recommendation attached, and a freeze switch locks the meta-agent out. Problem statement 1 (Recursive Harnessing — the harness adapts to its task and to its user), with long-horizon memory from statement 2.

**Public GitHub repository:** https://github.com/opencolin/darwin

**Demo video:** (fill in)

**Live demo:** https://darwin.voyage (desk) · https://darwin.voyage/m (phone) · app origin https://dabble-mv4521u29zy-prod.cloud.modelence.app

**Partner technologies used:** MongoDB Atlas (Vector Search, Voyage AI), Modelence, Raindrop, AISA.one, Vercel (domain)

**Raindrop RSI prize:** Yes

**Describe your use of MongoDB products**

MongoDB Atlas (the hackathon sandbox cluster, `Cluster0`, database `darwin`) is the whole memory and governance plane. `harnesses` is the procedural memory: every harness version with its rules, guardrails, tool allowlist, context policy, skills, status (active / rolled_back / superseded) and held-out score — the lineage. `runs` and `generations` are episodic memory: every task run with its tool trail, blocked calls and violations, and every generation with its diagnosis, patch, diff and decision. `lessons` is semantic memory: lessons the meta-agent distils plus one lesson per promotion/rollback, embedded with Voyage AI (`voyage-3.5` via `ai.mongodb.com`) and retrieved with Atlas Vector Search (`$vectorSearch` over a `vectorSearch` index with a `kind` filter; an in-memory cosine fallback covers the minutes while the index builds). Failure categories on runs are the taxonomy the meta-agent clusters on. `approvals` and `settings` are the governance plane the phone reads and writes. The loop (CLI), the Modelence server and the phone all share the same cluster, so a generation started on a laptop can be approved from a phone and resumed on another machine. We also scaffolded an Atlas Agent Engine agent for the worker runtime but did not finish wiring it in.

**Feedback on MongoDB products**

- The Atlas sandbox and Vector Search worked well; `createSearchIndex` from the Node driver was enough to get `$vectorSearch` running during a hackathon, and the `ai.mongodb.com` Voyage endpoint meant one fewer account.
- Network access: a laptop on venue Wi‑Fi plus a phone hotspot (IPv6) meant our listed IPs never matched; we lost ~20 minutes before opening the list. A "detect my IP from this browser session" hint on the connection-timeout error, or IPv6 support in the IP access list, would help.
- Atlas Agent Engine: the CLI installer fails on a flaky network because the ~42 MB binary download is not resumable (`curl: (18) transfer closed`, and `HTTP/2 INTERNAL_ERROR` on the default path). Full report in `agentengine-install-issue.md` in the repo, with a workaround (`curl -C -` in a loop) and suggested fixes. `agentengine dev up` also requires Docker, which is not stated until it fails.
- The Voyage key page in Atlas is easy to miss; the hackathon builder guide could link it directly.

**Feedback on partner products**

- Modelence: `create-modelence-app` + `setup` gave us a running app with Atlas-backed auth in minutes, and the AGENTS.md shipped with the template is unusually complete for coding agents. We would like docs for custom domains on Modelence Cloud and a way to declare required env vars for framework apps (modelence.config.json is documented for non-framework apps only).
- Raindrop: the TypeScript SDK's begin/finish/trackSignal pattern mapped cleanly onto worker runs, meta-agent patches and promote/rollback decisions. Debug logging prints OpenTelemetry resource-detector dumps that drown the useful `[raindrop]` lines. A first-party "score over time" view keyed on a property (our held-out pass rate) would make RSI curves one click.
- AISA.one: OpenAI-compatible access to Claude 5.5 models worked out of the box; the gateway could strip the deprecated `temperature` parameter for Claude 5.5 models instead of returning 400.
- Vercel: domain purchase for darwin.voyage was instant.
