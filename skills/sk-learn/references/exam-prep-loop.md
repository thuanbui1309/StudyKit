# Exam-prep loop — block detail

Extended guidance for `sk:learn` when `state.phase === "exam-prep"`. The phase routing and engine calls are in `SKILL.md`; this file is the revise + mock detail. The study-phase loop is unchanged and lives in `daily-loop.md`.

The exam-prep day is: **Revise** (targeted weak/stale review, once) → **Mock** (a full, blueprint-weighted exam, on the user's choice) → **finish**. Every invariant from study phase still holds: binary scoring, confirm-before-fetch, official-docs grounding, token discipline, and **resume reads `state.json` only**.

`q_id` prefixes in this phase: `v` for revise, `m` for mock (study phase used `r`/`c`). So `d20260815-v01`, `d20260815-m07`.

## Day routing (exam-prep)

After `read study` shows `phase: "exam-prep"`:

- **New day** (`isNewDay` or `day_status: "not-started"`) → `start-day study`, then the **Revise** block.
- **In progress** → jump to `state.step`:
  - `revise` with `answered < total` → resume at `step_progress.items[answered]`; ask the rest. No re-select, no regenerate.
  - `revise` with `answered == total` → Revise done → offer the **Mock** block.
  - `mock` with `answered < total` → resume the mock at `items[answered]` (see Mock resume). Never regenerate the mock.
  - `mock` with `answered == total` → the mock is finished → score it (below) if not already scored, then End of day.
- **Done** (`day_status: "done"`) → offer: stop, run another mock, or revise more. Also offer to **switch back to study** (`set-phase study study`).

## Revise block (once/day)

Goal: resurface the **weakest and stalest** topics harder than study-phase Review.

1. Get the targets from the stats aggregate (never read `results.jsonl` yourself):
   ```bash
   node .claude/skills/_engine/stats.cjs study '{}'
   ```
   Take `wrongHeavy` (worst accuracy first) and `stale` (most overdue first).
2. Also run the seeded selector, biased harder than study Review — a larger `n` and a higher `wrongFactor` so wrong topics dominate:
   ```bash
   node .claude/skills/_engine/select.cjs study/results.jsonl \
     '{"n":<~10>,"seed":<config.select_seed>,"asOf":"<today>","windowDays":<config.window_days>,"wrongFactor":<higher, e.g. 5>}'
   ```
   Union the selector's topics with the top `wrongHeavy`/`stale` topics; dedupe; cap at a sane revise size.
3. **Empty pool** (no history yet) → write `## Revise\n_Skipped — no attempts to resurface yet._` and go straight to the Mock offer.
4. Otherwise generate ONE fresh question per selected topic, grounded in that topic's `knowledge/<topic>.md`. Build `items` (`v` q_ids, each carrying `topic`), then:
   ```bash
   node .claude/skills/_engine/state.cjs set-step study revise '<itemsJson>'
   ```
   Render them into `daily/<date>.md` under `## Revise`, then ask **one at a time** (same "Asking a question" rules as `SKILL.md`), recording each with `kind: "revise"`.

## Mock block (on the user's choice — a full mock is long)

Goal: a realistic, blueprint-weighted, full-length exam scored against the pass mark. Confirm the user wants it before generating (it's a long, durable commitment).

### 1. Blueprint allocation (deterministic)

Read the **Domains** table weights from `profile.md` and `config.mock_size` from state. Allocate questions per domain with the **largest-remainder** rule so the counts always sum to `mock_size`:

1. For each domain, `raw = mock_size * weight` (weight as a fraction).
2. Give each domain `floor(raw)`.
3. Distribute the leftover (`mock_size - sum of floors`) one each to the domains with the largest fractional remainders; break ties by the domain's order in the table.

Show the per-domain counts to the user before starting, e.g. *"65 questions: Secure 20, Resilient 17, High-Perf 16, Cost 12 — start?"*. This is the only confirmation needed for the mock.

### 2. Generate the whole exam, then persist it once

For each domain, generate its allotment of fresh questions across that domain's `learned`/`learning` topics (from `syllabus.md`), each grounded in the topic's `knowledge/<topic>.md`. Vary single-answer and multi-response. Build the full `items` array (`m` q_ids, each carrying `topic`), then store the **entire** mock in one call:

```bash
node .claude/skills/_engine/state.cjs set-step study mock '<itemsJson — all mock_size items>'
```

This is the resume contract: the whole exam lives in `state.json.step_progress.items` with an `answered` cursor. (Cost: a 65-item mock makes `state.json` tens of KB and each resume reloads it — accepted and bounded to one mock at a time. For very large exams, propose a smaller `mock_size`.)

### 3. Ask one at a time, record `kind: "mock"`

Render the mock into `daily/<date>.md` under `## Mock — <date>` and ask `items[answered]` one at a time, binary all-or-nothing grading, each answer written to the daily file (with ✅/❌) then recorded:

```bash
node .claude/skills/_engine/state.cjs record-answer study \
  '{"date":"<today>","topic":"<topic>","kind":"mock","q_id":"<q_id>","correct":<bool>,"score":<0|1>}'
```

### 4. Mock resume (across a session boundary)

`read study` → `step: "mock"`, `answered < total`. Resume at `items[answered]` and continue — **never regenerate the mock**, never re-allocate, never re-read the blueprint. Only `state.json` is consulted for the position. (This is the same per-question resume the study loop uses, just over a longer item list.)

### 5. Score at completion

When `answered == total`, score the mock and compare to `config.pass_mark`:

- `score = correct / total` (a fraction). Verdict = `score >= pass_mark ? PASS : BELOW PASS`.
- Tally `correct` from this session if you ran the whole mock here. If the mock was **resumed** across sessions, count the ✅ marks in this mock's `## Mock` section of `daily/<date>.md` to get the total correct — this is a one-time end-of-mock report read, NOT resume (the resume cursor still came from `state.json` only).
- Write the verdict line into `daily/<date>.md`, e.g. `**Mock result: 48/65 = 73.8% — PASS (pass mark 72%)**`, with a short per-domain breakdown and the weakest domains to revise next.

## End of day

After Revise (+ optional Mock):

```bash
node .claude/skills/_engine/state.cjs finish-day study
```

Then offer: another mock, more revision tomorrow, or **switch back to study** (`set-phase study study`) if coverage gaps remain. Switch-back is always the user's choice.

## Mock on demand

`/sk:learn mock` (the `mock` argument) runs just the Mock block in the current phase, reusing all of the above — one entry command, honoring the single-driver invariant. (A separate `sk:exam` skill is a possible future split, not built now.)
