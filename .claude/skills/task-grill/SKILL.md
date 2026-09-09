---
name: task-grill
description: >-
  Requirements-interrogation stage of the planning family (task-grill, task-design, task-planning) — standalone adaptation for this project, no Firstmate fleet dependency.
  Load when `task-planning` routes a non-Simple ship request here at intake, or invoke directly for any request that needs its requirements interrogated before anything is designed or built.
  Runs a frontier-based captain question loop until shared understanding is confirmed, and hard-gates spec, tickets, and implementation behind that confirmation.
user-invocable: true
metadata:
  internal: false
---

# task-grill

<!-- Adapted 2026-08-30 from Firstmate's internal task-grill (ai2/firstmate2/.agents/skills/task-grill) for
     standalone use in this project's own Claude Code session — no Firstmate fleet/crew dependency. Firstmate-only
     infra (captain-hold-lifecycle) is replaced with direct user interaction. Methodology is otherwise unchanged. -->

This skill interrogates requirements before anything is designed or built.
It is the first stage of the planning flow: `task-grill`, then optional `task-design`, then `task-planning`.
It rewrites Matt Pocock's `grilling` and `domain-modeling` methods.
Their artifact formats stay behind.

## Trigger

Load when `task-planning` classifies a ship request as non-Simple at intake, or invoke directly.
A Simple request skips straight to direct implementation and never runs this skill.

## Design tree

Map the request as a design tree: decisions branching off decisions.
Each node names one decision that must settle before the questions hanging off it can even be asked.
Start from the goal, name the load-bearing branches, and grow children only where an answer would genuinely change what gets built.

## Rounds and the frontier

Work the tree in rounds.
The frontier is every question whose prerequisites are already settled: everything answerable now without guessing at unheard answers.
Each round asks the whole frontier at once, questions numbered, each with a recommended answer.
End the round there and hold for the captain's answers before the tree moves again.
Answers reshape the tree: settled decisions push the frontier outward and unblock their dependents.
Recompute the frontier and ask the next round.
A question whose answer depends on a question still open in this round belongs to a later round, never this one.
Interrogation is done when the frontier is empty: every branch settled or explicitly discarded, nothing assumed in silence.

## Facts versus decisions

Facts are yours to find, never the captain's to supply.
When a frontier question needs repository evidence, read this project directly.
Find one such fact before the first round: whether this project keeps standing structural rules, usually numbered invariants.
Read the project's AGENTS.md/CLAUDE.md and whatever source-of-truth document it points at for them (this project: the INV-0..12 architecture invariants).
If the project has none, record that and move on - the check ends there and adds no requirement to the flow.
If it has some, identify which ones the request would touch, by number.
When a frontier question needs broader investigation than a quick read, fork yourself (`Agent` tool, `subagent_type: "fork"`) or dispatch a focused subagent for that one question instead of asking.
Do not block the whole round on that investigation: only the questions downstream of it wait for the report.
Only decisions go to the captain: preference, product policy, and trade-offs with genuine alternatives.
Never spend a round asking something you could look up yourself.

## Hard gate

While the frontier is not exhausted, or before the captain confirms shared understanding, spec, tickets, and implementation must not start.
This gate is not advisory: no downstream planning artifact may be written against unsettled decisions.

## Captain answers stay human

Never answer a captain question on the captain's behalf.
A recommendation is not consent, and silence is not an answer.
Ask the captain directly (in conversation, or via the `AskUserQuestion` tool for a genuine multi-way judgment call) and wait for their actual answer — never assume, never proceed on an unresolved question.

## Artifacts

Write `docs/features/<feature-slug>/grill.md` in this project, beside the other planning documents.
Keep three things in it:
- a snapshot of the design tree;
- the round log;
- the settled decisions, including which standing project rules the confirmed understanding touches, so the specification stage inherits that check instead of repeating it.

Record terminology cleanups surfaced during grilling there as well.
Promote them into the project AGENTS.md `Domain terms` section at landing time through that project's normal delivery path.

## Domain modeling discipline

Grill the domain model while you grill the requirements.
Challenge glossary conflicts immediately: when fresh language contradicts recorded terms, surface the conflict now instead of shipping both meanings.
Sharpen fuzzy terms: propose a precise canonical name whenever wording is vague or overloaded.
Stress-test relationships with concrete scenarios that probe edge cases and force exact boundaries between concepts.
Cross-check stated behavior against the code and surface contradictions.
Offer an ADR only when all three hold:
- the choice is hard to reverse;
- it is surprising without context;
- it was a real trade-off with genuine alternatives.

If any is missing, skip the ADR.

## Handoff

When the gate passes, hand the confirmed understanding down the family: optional `task-design` for solution shaping, then `task-planning` for specification and ticket decomposition.
This skill ends at confirmed requirements and never writes the spec itself.
