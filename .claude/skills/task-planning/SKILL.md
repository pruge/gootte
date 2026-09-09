---
name: task-planning
description: >-
  Orchestrator of the planning family (task-grill, task-design, task-planning) — standalone adaptation for this project, no Firstmate fleet dependency.
  Use at ship-task intake when authorized work spans multiple meaningful changes, or when unresolved decisions could materially change what is built.
  Classifies the request, routes non-Simple work through task-grill and optional task-design, owns the wayfinder/spec/ticket artifacts, and hands each approved ticket to direct implementation in this session (or delegated subagents per this project's own delegation gate).
  This skill does not implement project code, interrogate requirements, build prototypes, or perform code review itself.
user-invocable: true
metadata:
  internal: false
---

# task-planning

<!-- Adapted 2026-08-30 from Firstmate's internal task-planning (ai2/firstmate2/.agents/skills/task-planning) for
     standalone use in this project's own Claude Code session. Firstmate-only execution infra (fm-brief.sh,
     fm-spawn.sh, fm-send.sh, crew/fleet supervision, captain-hold-lifecycle, quota-array-dispatch, no-mistakes,
     bin/fm-ticket-check.sh) is replaced throughout with what this session actually has: direct implementation,
     the Agent tool for subagents, AskUserQuestion/plain conversation for captain decisions, this project's own
     `pnpm run verify`/`verify:web` gates, and manual application of the ticket-quality checklist. The core
     methodology (frontier-based grilling, seams-first spec, vertical ticket slicing, expand/migrate/contract,
     the recursion gate) is unchanged from the source skill. This coexists with — does not replace — this
     project's existing mattpocock-style planning skills (/wayfinder, /to-spec, /to-tickets, /triage): reach for
     this family when its heavier, decision-tree-driven rigor earns its cost; reach for the lighter existing
     skills otherwise. Both write into the same `docs/features/<slug>/` convention. -->

This skill is the orchestrator of the planning family.
It classifies each ship request, routes work to the right family member, owns the planning artifacts, and ends at an approved ticket graph implemented directly in this session.
It is inspired by the method behind Matt Pocock's Wayfinder, `to-spec`, and `to-tickets`.

**On the `implement` phase**: unlike the Firstmate original this was adapted from, this session *is* the implementer — there is no separate crew/fleet layer to hand off to. Section 11 below describes how this session carries out approved tickets directly.

## 1. The planning family

Each family member owns exactly one contract, and every other mention of it stays a one-line cross-reference.

- `task-grill` owns requirements interrogation: the design tree, frontier rounds, the facts-versus-decisions discipline, the hard gate, and the `grill.md` decision log.
- `task-design` owns throwaway prototypes that answer exactly one design question each, built and reviewed through Lavish.
- `task-planning`, this skill, owns classification, the wayfinder index, the specification, ticket decomposition, the ticket quiz, the recursion gate, and the dispatch handoff.

Non-Simple work always flows `task-grill` first, then optional `task-design`, then this skill's spec and tickets.

## 2. Classify at intake

Do not run this full workflow for every request.
At intake, classify the request using evidence rather than a fixed token-expensive ritual.

At intake also inspect the target project's `docs/features/`: an existing feature directory covering this request means resume or extend that plan instead of duplicating it, and its resolved decisions are established evidence.

### Simple

Implement directly, no planning family involved, when all of the following are true:

- the requested behavior is already unambiguous;
- the affected area is narrow and known;
- there is one obvious implementation path;
- no meaningful architecture, data-model, migration, security, or cross-boundary decision is unresolved;
- the work can reasonably be completed in this session without coordinating across independent parts.

Do not create Wayfinder/spec/ticket artifacts for a simple task.

### Planned

Use specification + ticket decomposition when the request is clear enough to implement but spans multiple meaningful changes, boundaries, or files, or when independent tickets could be delegated to run in parallel.

The minimum artifact set is `spec.md` plus `tickets/`.

### Wayfinder-planned

Use the full workflow when the destination is not yet clear.
Signals include:

- multiple plausible architectures or implementation strategies;
- unresolved product or behavior decisions;
- greenfield work or a major feature;
- cross-cutting changes involving several subsystems;
- migrations or compatibility constraints;
- security, authorization, concurrency, or data-integrity decisions;
- uncertainty whose resolution could materially change the implementation scope;
- work that is clearly too large for one coherent agent session.

When uncertain between Planned and Wayfinder-planned, prefer the cheaper Planned path unless the unresolved uncertainty could invalidate the resulting ticket graph.

### The grill gate

Every non-Simple classification routes through `task-grill` before any downstream planning artifact is written, and this skill may not proceed past it until that skill's frontier is exhausted and the captain confirms shared understanding; `task-grill` owns that gate.

## 3. Establish the planning workspace

Before writing artifacts, choose a kebab-case `<feature-slug>` for the request, and create the feature directory:

```text
docs/features/<feature-slug>/
  grill.md       # owned by task-grill
  design/        # prototypes owned by task-design
  wayfinder.md   # only for Wayfinder-planned work
  spec.md
  tickets/
    T01.md
    T02.md
    ...
```

These documents live in the project so the captain can browse every planned or running feature in one place.
Writing planning documents and design prototypes under `docs/features/` follows this project's own `docs/features/` convention (see `docs/agents/issue-tracker.md`) — no separate authorization gate beyond that.
Design prototypes stay uncommitted throwaway artifacts - `task-design` owns that boundary.
The written plan itself is *not* auto-committed — this project's git rule is commit-only-on-explicit-request (never auto-commit, never auto-push). At planning completion, ask the captain whether to commit and push the planning documents now (see "Versioning the approved plan").

The planning directory is evidence for the captain and for later review.
It must contain conclusions and rationale, not hidden chain-of-thought or raw model deliberation.

## 4. Wayfinder phase: index the decisions

For Wayfinder-planned work, maintain `wayfinder.md` from before grilling starts until the last ticket dispatches.
Interrogation itself belongs to `task-grill`; this phase organizes what interrogation produces instead of repeating it.

### Fog of war

Some questions cannot yet be stated sharply enough to answer or schedule.
Record them under a `Not yet specified` section rather than splitting them into tickets or forcing premature decisions.
They graduate onto the decision map when the frontier reaches them.
The test is a single question: can this be stated as a sharp question now?

### Map-as-index

`wayfinder.md` is an index only.
Each decision's substance lives in exactly one place: the `grill.md` decision log while unsettled, the spec's Decisions section once graduated, or a prototype's recorded verdict.
An index entry names the decision, gives its current status, and points at that single place.

```markdown
# Wayfinder plan

## Goal
<one paragraph>

## Destination
<what success looks like>

## Not yet specified
<questions too fuzzy to ask yet; each graduates when it can be stated sharply>

## Decision map

### D01 - <decision question>
- Status: open | settled | discarded
- Substance: <pointer to the one place this decision's detail lives>
- Consequence for implementation:

### D02 - ...

## Exit condition
<what must be true before this graduates to a spec>
```

Update index entries whenever a decision moves or settles; never let `wayfinder.md` grow a second copy of any substance.

### Dispatch shape of non-code work

A decision is not an implementation ticket.
Map every pre-ticket work item onto its real dispatch shape:

| Work item | Dispatch | Who waits |
| --- | --- | --- |
| research question | a fork of this session, or a focused subagent (`Agent` tool) | nobody; runs in the background |
| design question | `task-design` prototype | the captain reviews |
| preference, policy, or trade-off | `task-grill` round, or a direct question to the captain | the captain answers |
| manual work outside the codebase | a plain checklist handed to the captain | depends on the work |

Whether an unknown is a fact to find or a decision to ask is `task-grill`'s facts-versus-decisions boundary.
Do not start implementing while load-bearing decisions remain unsettled.

## 5. Graduate into a specification

Once the destination is clear, write `spec.md`.
The spec is an implementation contract, not a transcript of the planning conversation.
It should be concise enough for every ticket owner to read and complete enough that ticket owners do not need to rediscover product decisions.

### Seams first

Prefer existing seams over inventing new ones.
Choose the fewest seams that can carry all the user stories, and place each seam as high in the architecture as it will reach.
Confirm the seam choice directly with the captain before writing `spec.md`; a wrong seam invalidates every ticket cut against it.

### Template

```markdown
# Specification

## Goal

## User stories
<numbered and extensive; drafting rules below>

## Scope

## Out of scope

## Decisions

## Existing seams / integration points

## Data and migration

## Security / authorization

## Compatibility / rollout

## Acceptance criteria

## Verification strategy
```

Two drafting rules bind every spec:

- the user-story list is numbered and extensive, one story per capability, so every ticket traces back to at least one story and every story back to settled decisions;
- the spec carries no file paths and no code snippets, with one exception: a validated prototype snippet that encodes a decision more precisely than prose may appear, explicitly noted as coming from the prototype that validated it.
- the no-paths rule binds the spec alone: tickets carry concrete file paths and surface lists because they are execution contracts, so keep path detail out of the spec and push it down into the tickets that need it.

Preserve project terminology.
Explicitly record constraints that would otherwise be rediscovered by every crew.
When the target project keeps standing structural rules, name in `## Decisions` every rule the confirmed understanding touches, by its number in that project, and only those - never the project's whole inventory.
A project with no standing rules leaves this empty and nothing else in the flow changes.
Planning that would overturn a standing rule is exactly the trigger for a decision record (ADR) in the project's own decision-record home: it names the rule being overturned, the original reasons for it, which of those still hold, and carries the captain's ruling.

## 6. Decompose into vertical tickets

Create `tickets/TNN.md` from the spec.
Tickets are implementation units for this session (or a delegated subagent), not architecture-layer chores.

Prefer vertical slices:

```text
GOOD:
T01 = one user-visible behavior across the necessary data/API/UI/test path

AVOID:
T01 = database only
T02 = API only
T03 = UI only
```

A ticket should contain:

```markdown
# T01 - <short title>

## Goal

## Why this slice

## Produces

## Consumers

## Touched surfaces

## Explicitly out of scope

## Locked decisions

## Evidence anchors

## Regression guards

## Scope

## Implementation notes

## Acceptance criteria

## Verification

## Depends on
- T00 / none

## Can run in parallel with
- ...
```

The seven structural fields between the slice's identity and its notes are mandatory, and each exists because omitting it has already cost a follow-up PR:

- `Produces` names the single value, state, or behavior change this slice creates, concretely enough to search the codebase for its other users.
- `Consumers` lists every existing place that reads, displays, counts, sorts, filters, joins, or stores that value, found by sweeping the project structure before the ticket is written.
  A ticket whose value touches existing seats never leaves this field empty; when the value is genuinely local, write the one line saying why instead.
- `Touched surfaces` carries the concrete file paths, modules, and subsystems expected to change, including every consumer listed above; the spec stays path-free precisely because this field owns paths at ticket level.
- `Explicitly out of scope` names neighboring surfaces the ticket deliberately leaves alone, so their absence later reads as a decision rather than a blind spot.
- `Locked decisions` records choices already settled by the captain, grill, or spec, each pointing at where it was settled, so implementation proceeds instead of reopening them.
It also names the numbers of the project's standing rules that bind this specific ticket - only the subset touching this slice, never the whole list.
- `Evidence anchors` points at the symbols, tests, or fixtures where implementation and verification start.
- `Regression guards` names the existing tests or checks covering the touched surfaces that must keep passing.

The producer-consumer rule behind `Produces` and `Consumers`: a ticket that creates or changes a value must name every existing place that reads, displays, counts, sorts, filters, joins, or stores that value.
Those seats are structural facts found by sweeping, not judgment calls, so finding them is planning work that belongs in the ticket, never discovery left for whoever implements it.
An implementation that lands a produced value while known seats still read the old shape has not finished the ticket.

Follow this project's own ticket convention (`docs/agents/issue-tracker.md`): each ticket carries a `Status:` line (open values include `claimed`/`resolved (YYYY-MM-DD)`) and a `Blocked by:` line for dependency edges, directly in the file — that is this project's execution-state SoT, not a separate backlog. `gootte start`/`gootte end <feature-slug> <ticket>` records time against the ticket for whoever works it.

Keep each ticket small enough for one continuous implementation pass, but large enough to produce a meaningful, testable vertical slice.
Do not split merely to increase how many tickets can be delegated in parallel.
The size ceiling is one fresh agent context window per ticket: if the honest work cannot fit one clean context, the ticket is too big.

Every dependency must be explicit.
If T02 cannot start until T01 produces a concrete seam, write `Depends on: T01` and explain the dependency briefly.
The resulting ticket graph must be acyclic unless a human explicitly approves an unusual cycle.

### Wide refactors: expand, migrate, contract

A mechanical change with codebase-wide blast radius, such as a rename, an interface migration, or a dependency swap, must never be one ticket and must never interleave its phases.
Decompose it in three stages:

1. expand - introduce the new mechanism alongside the old, behind a spec-chosen seam;
2. migrate - move call sites in independent batches, one batch per ticket;
3. contract - remove the old mechanism in a final ticket, only after the last migration lands.

### Terminal review ticket

Every approved ticket graph MUST end with a terminal captain-review ticket blocked by all other tickets in the graph.
Dispatch it last, handing the captain the landed result together with the graph's accumulated evidence.
Light feedback means fixing it inline in this session and updating the docs to match reality.
Major feedback means a new parent plan through the recursion gate, not an ever-growing patch series.

## 7. Ticket quality gate

Before presenting the plan, check (no automated script for this in this project — walk the checklist by hand against every ticket):

- every in-scope requirement is covered by one or more tickets;
- every ticket has an observable acceptance criterion;
- every ticket has a verification method;
- dependencies are explicit and acyclic;
- no ticket is merely a database/API/UI layer without a good reason;
- no ticket is so broad that it becomes a second project;
- shared-file contention is minimized;
- unresolved decisions are not hidden inside implementation notes;
- out-of-scope items are not accidentally represented as work;
- the graph ends with the required terminal captain-review ticket;
- every ticket would pass the recursion gate today: one coherent change, no unresolved decisions, one context window;
- the ticket graph is executable by this session directly (implement, or delegate per section 11).

The seven structural fields carry their own gate checks on top:

- every producing ticket names its consumers; an empty `Consumers` field fails the gate unless the ticket carries its one-line genuine-locality justification;
- `Touched surfaces` covers every listed consumer, so no seat that reads the produced value is left unowned;
- deliberate exclusions appear under `Explicitly out of scope`, never nowhere;
- locked decisions point at where they were settled, and evidence anchors plus regression guards resolve to real code and real tests.

If a quality check fails, revise the decomposition before asking for approval.

## 8. Ticket-to-code contrast review

Between the quality gate and the captain quiz, contrast every ticket against the actual codebase structure.
The quiz judges judgment; this step verifies the facts a structural sweep can settle mechanically, and the two stay separate.

Split the sweep work by feature size:

- a plan of two to three tickets: perform the sweep directly in this session (codegraph_explore / grep / Read against this project);
- a larger graph, or one spanning several subsystems: fork this session, or dispatch a dedicated subagent, whose report carries the per-ticket contrast evidence, then fold its findings back into the tickets before the quiz.

Check mechanically, per ticket:

- every claimed consumer exists in the code where the ticket says it does;
- every place the codebase actually reads, displays, counts, sorts, filters, joins, or stores the produced value appears under `Consumers`;
- every `Touched surfaces` path resolves;
- every `Evidence anchors` and `Regression guards` entry resolves to real code and a real test or check.

Ask the captain only what the sweep cannot answer: whether an explicit exclusion is the right call, and whether a newly discovered seat changes the plan.
Findings are fixed by revising the tickets and re-running the gate - never by planning to explain gaps in the ticket later.
A ticket that passes this review but still sends its implementer researching scope it should already cover, or re-deciding a choice recorded as settled, is evidence the review failed: stop and escalate, and repair the ticket instead of patching around the gap during implementation.

## 9. Captain review: the ticket quiz

When this skill was invoked for Planned or Wayfinder-planned work, do not start implementing merely because the artifacts were generated.

Present the captain with:

1. the planning level selected;
2. the key decisions;
3. the spec summary;
4. the ticket graph and dependencies;
5. notable risks or unresolved choices;
6. the artifact paths.

Before asking for approval, run the ticket quiz on the proposed breakdown and iterate until the captain approves:

- granularity: is each slice the right size?
- blocking edges: does every dependency reflect reality, or is some ordering invented?
- merge or split: which tickets are really one change wearing two numbers?

Revise the decomposition and repeat the quiz across as many rounds as the graph needs.

Then ask the captain directly for approval, unless the captain has already explicitly authorized continuous execution of planning work in this session (per this project's "skill 기반 = 판단으로 연속 실행" convention — even then, a genuinely risky or irreversible step still stops for confirmation).

A captain approval of the plan authorizes implementation of the approved ticket graph only.
It does not authorize committing/pushing without a separate explicit ask (this project's git rule), and it does not override this project's other standing rules (architecture invariants INV-0..12, etc.).

### Versioning the approved plan

Planning completion is the moment the captain approves the ticket graph.
This project has no separate crew/fleet layer to hand the documents to, so there is no worktree-and-PR dance for the planning docs themselves — just this project's ordinary git rule: **never commit without an explicit ask.**

- Ask the captain whether to commit and push `grill.md`, `wayfinder.md` (when present), `spec.md`, and `tickets/` now.
- If yes: stage exactly the feature directory (`docs/features/<feature-slug>/`), commit with a `docs:`/`planning:`-style message, and push — following whatever branch this session is already on (direct-to-`main` if that is this project's live convention for docs, or a feature branch + PR if the captain says so).
- If the captain wants to keep iterating first, leave the documents uncommitted and simply keep working — nothing about implementation is blocked on the commit.
- A later grill round that revises the documents is just another edit + another explicit commit ask, not a special worktree flow.

## 10. Recursion gate at dispatch

Re-judge the section 2 complexity gate at EVERY dispatch, not only at intake.
Before any ticket is briefed or spawned, ask the classification question again against everything learned since.

A ticket that now spans multiple meaningful changes, or that carries unresolved decisions, stops being a ticket: it becomes its own feature and runs the same family pipeline of `task-grill`, then optional `task-design`, then this skill.
Give it a new `<feature-slug>` under `docs/features/`, note the parent feature it split off from at the top of its own `spec.md`, and let its own decomposition produce its own `tickets/`.

Dispatching an overgrown ticket anyway is precisely the failure this gate exists to prevent.

## 11. Carry out the approved tickets

After approval, fire the versioning step above (ask about the commit), then implement.

**This session keeps its own context for the feature's whole ticket sequence.**
Unlike the Firstmate original this was adapted from, there is no separate crew to spawn or steer — re-parsing the spec, prior tickets' landed decisions, and the project's structure on every ticket would be pure waste when this session already holds all of it. Work through the ticket graph in order in this same conversation, ticket by ticket, unless a ticket is delegated per the gate below.

For each ready ticket, in dependency order:

1. run the recursion gate (section 10) — if the ticket has outgrown itself, stop and re-plan it as its own feature instead of implementing it as-is;
2. decide whether to implement it directly or delegate it, using this project's own delegation gate (`AGENTS.md`/`CLAUDE.md` "Opus orchestrator → Sonnet worker 위임 게이트"):
   - delegate (`Agent` tool, `subagent_type` appropriate to the work, e.g. a Sonnet worker) only when the ticket is a full Phase-sized unit (multiple files + tests) *and* its brief is self-contained (no mid-flight architecture judgment needed); delegating ≥2 independent ready tickets in parallel is strongly preferred when both qualify;
   - implement directly for everything else: architecture/invariant/API-contract design, a single-file fix, a ticket small enough to be "just do it", or anything that needs a back-and-forth with the captain to resolve;
3. when delegating, hand the ticket file itself as the brief (its body verbatim — never re-elaborate, paraphrase, or summarize it) plus a pointer to `docs/features/<feature-slug>/spec.md` for context;
4. implement (or receive the delegated result) with tests, following this project's TDD/testing conventions;
5. verify — run this project's actual gate for what changed (`pnpm run verify` or the narrower `verify:web`, per the touched-path table in `AGENTS.md`); **trust but verify** on any delegated result: re-run the verify command and re-check the diff yourself rather than trusting the worker's report or LSP diagnostics alone;
6. mark the ticket's `Status:` line `resolved (YYYY-MM-DD)` in its file (this project's own issue-tracker convention), and ask the captain before committing/pushing/opening a PR — this project never auto-commits and never auto-merges;
7. move to the next ready ticket (a ticket unlocks only once its declared `Blocked by:` predecessors are actually resolved).

The terminal captain-review ticket dispatches like any other ticket once its blockers resolve, and it is where the captain sees the whole landed graph together with its accumulated evidence.

**Do not build a second dispatch system.**
This section ends at "ticket implemented and verified" using this session's ordinary tools (direct work, `Agent` for delegation, `pnpm run verify`) — nothing here invents new infrastructure.

## 12. Verification is risk-based

This planning layer records verification requirements per ticket, but it does not force the full critical-tier gate on every ticket.

Use the ticket's verification section to distinguish:

- routine: this project's normal `pnpm run verify`/`verify:web` gate (see `AGENTS.md`'s touched-path table for which one applies);
- elevated: targeted code review (e.g. dispatch a `code-reviewer`/security-focused subagent) or additional test evidence for a risk-bearing change;
- critical: full `pnpm run verify` plus an explicit captain sign-off before merge, for anything touching INV-0..12 invariants, auth, or data integrity.

The planner must not call an external review agent merely because a ticket exists.

## 13. Composition and imports

This skill deliberately composes with, rather than replaces:

- `task-grill` for requirements interrogation;
- `task-design` for prototypes;
- this project's own `/diagnosing-bugs` skill for bug causality and reproduction;
- direct captain conversation (or `AskUserQuestion`) for captain decisions — no separate hold-tracking layer;
- the `Agent` tool for delegation, gated by this project's own delegation rule (section 11);
- `pnpm run verify`/`verify:web` for actual verification.

For a reported bug, diagnosis comes first when the cause is uncertain.
A confirmed diagnosis can then feed this planning skill if the fix is large enough to require decomposition.

This family coexists with this project's existing lighter-weight planning skills (`/wayfinder`, `/to-spec`, `/to-tickets`, `/triage`, `/grill-with-docs`, `/domain-modeling`) — both write into the same `docs/features/<slug>/` convention. Reach for this heavier, decision-tree-driven family when a request's destination is genuinely unclear or spans unresolved cross-cutting decisions; reach for the lighter existing skills when the request is more straightforwardly Planned or Simple. When unsure which to use, ask the captain rather than silently picking one.

Do not import:

- a separate crew/fleet runtime — this session is the implementer (section 11);
- branch/worktree orchestration from another system;
- another issue tracker as the source of truth — this project's own ticket files (`Status:`/`Blocked by:` lines) are the SoT;
- mandatory planning for every task;
- mandatory code review for every ticket.

The useful imported ideas are fog graduation, the map-as-index decision map, seams-first specification, vertical ticket slicing with explicit blocking edges, the expand-contract pattern, and inspectable planning artifacts.
