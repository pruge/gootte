# Specification

## Goal

A recent decision made a ticket's recorded start/finish timestamp line the *sole*
source of truth for that ticket's done/in-progress/pending status. Every
new-convention ticket that was actually implemented and landed *before* that
timestamp convention existed has no such line, so the screen now reads all of
them as still pending even though the work is long done. This feature backfills
those historical timestamp lines from git evidence so the board reflects
reality again.

## User stories

1. As the captain, when I open the plan or steps tab for a feature whose
   tickets landed before the timestamp convention existed, I see the correct
   done state and a plausible elapsed-time tooltip, not "pending".
2. As the captain, I can trust that a backfilled time was derived from real
   git history evidence (which commit, why it was chosen), not invented.
3. As the captain, a ticket that genuinely cannot be matched to landing
   evidence stays unmarked and is reported to me, rather than guessed at.

## Scope

- Every new-convention ticket document in this repository that has no
  timestamp line today (found 2026-08-29: 48 files across 24 feature
  directories).
- Deriving start/finish timestamps for each from git log evidence and
  inserting one timestamp line, in the exact literal format the existing
  time-recording CLI writes, in the same header-block position that CLI
  uses (directly after the ticket's title line, before any blank line or
  other metadata line).

## Out of scope

- Any ticket that already carries a timestamp line (currently only one,
  already landed) — do not touch it.
- Old-convention tickets — they are not read by the timestamp parser and are
  unaffected by the recent decision.
- Any ticket the crew cannot confidently match to a landing commit — leave it
  alone and list it in the report instead of guessing.
- Code changes of any kind. This is a documentation-only backfill.

## Decisions

- D1 (captain, 2026-08-29): backfill by deriving real historical timestamps
  from git log evidence (option B), not by stamping "now" via the CLI's
  start/end commands (option A, which would have zeroed out every elapsed-time
  value).

## Existing seams / integration points

- The existing time-recording CLI's timestamp line format and insertion
  position is the literal contract the parser expects; the backfilled line
  must be byte-shape compatible with what that CLI itself writes.
- The existing ticket parser already reads this timestamp line; no code path
  needs to change for this feature.

## Data and migration

N/A — plain markdown edits, no schema.

## Security / authorization

N/A.

## Compatibility / rollout

Docs-only change, backward compatible, no rollout risk beyond a wrong
timestamp being displayed (mitigated by the verification ticket below).

## Acceptance criteria

- Every in-scope ticket file either gains a correctly-shaped timestamp line
  backed by cited git evidence, or is explicitly reported as unmatched.
- No ticket that already had a timestamp line is touched.
- Plan/steps tabs show the corrected done state and a natural elapsed-time
  phrase for backfilled tickets.

## Verification strategy

- Mechanical: for a sample of backfilled tickets, confirm the git log for the
  cited commit hash actually shows the claimed author date and matches the
  ticket's subject.
- Visual (captain, terminal ticket): open the app and spot-check a few
  backfilled tickets in both tabs.
