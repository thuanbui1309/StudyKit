# Daily loop — block detail

Extended guidance for `sk:learn`. The authoritative flow and engine calls are in `SKILL.md`; this file adds the teaching detail and a worked day.

## Review block

Goal: spaced resurfacing of *prior* topics — not today's new material (that's Recall).

- Selection is seeded and runs once. The returned topics already reflect recency (older-within-window heavier) and wrong-answer weighting; do not re-weight or re-order them yourself.
- Generate exactly one question per selected topic. Vary question type across a session (single-answer, multi-response). Ground each question in that topic's `knowledge/<topic>.md` so it tests what the user actually studied.
- Multi-response questions must say how many to choose, and grade all-or-nothing.

## Learn block

Goal: genuinely teach one new topic.

- Match the user's stated preference (analogies, first-principles, examples-first). Check understanding with quick questions, but keep it conversational — **no tool calls until the block ends**.
- At the end, write three things in one pass:
  1. `daily/<date>.md` `## Learn` — a compact Q&A digest (not a transcript).
  2. `syllabus.md` — `status` → `learning` (partial) or `learned` (solid), `last_studied` → today.
  3. `knowledge/<topic>.md` — append durable facts under Summary / Key concepts / Common pitfalls. This is what future Review questions are grounded in, so keep it accurate and concise.

## Recall + Feynman block

Goal: prove retention of *today's* topic.

**Feynman teach-back rubric** — ask the user to explain the topic as if teaching a beginner, then score:

| Signal | Good | Gap |
| --- | --- | --- |
| Core idea in plain language | states it without jargon crutches | needs the notes open |
| Cause/effect & trade-offs | explains *why*, compares options | lists facts only |
| Edge cases | volunteers a pitfall | misses obvious traps |

Name gaps directly and point to the `knowledge/<topic>.md` section to revisit. Then run the quiz (q_ids `c01`, `c02`, …) grounded in today's notes, one question at a time, `kind: "recall"`.

## Worked day (first study day, empty review pool)

1. `read study` → `{day_status:"not-started", phase:"study", config:{…}}`.
2. `start-day study` → `day_status:"in-progress"`, `step:"review"`, `today` set.
3. `select.cjs study/results.jsonl '{…}'` → `[]` (nothing logged yet). Write `## Review\n_Skipped — empty review pool (first study day)._` and advance.
4. `set-step study learn '[]'`. Teach `caching-and-cdn`. At end: write `## Learn`, update syllabus + `knowledge/caching-and-cdn.md`.
5. Teach-back + quiz: generate 3 questions → `set-step study recall '[{q_id:"d20260628-c01",…}, …]'`. Ask one at a time; each answer → daily line + `record-answer … kind:"recall"`.
6. `finish-day study`.

## Worked resume (mid-review, new session)

1. `read study` → `{day_status:"in-progress", step:"review", step_progress:{answered:6, total:10, items:[…10…]}}`.
2. `isNewDay` is false → do not start a new day. Step is a quiz with `answered < total`.
3. Resume at `items[6]`: re-display that exact question from the stored item (no regeneration), continue through `items[9]`. Each answer → daily line + `record-answer`. At `answered == 10`, advance to Learn.

No markdown was parsed and no question changed — the only thing consulted was `state.json`.
