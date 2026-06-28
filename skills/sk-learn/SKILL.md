---
name: sk:learn
description: "The StudyKit daily driver. Reads study/state.json first, resumes the exact step and question across sessions, and runs the study-phase loop (review → learn → recall+Feynman) one question at a time with per-question durability."
user-invocable: true
when_to_use: "Invoke for every study session after /sk:init. Handles fresh days, mid-quiz resume, and finished days. If the project is uninitialized it points you to /sk:init."
category: study
keywords: [study, learn, review, recall, feynman, spaced-repetition, resume]
argument-hint: "[topic to learn (optional)]"
metadata:
  author: studykit
  version: "0.1.0"
---

# sk:learn — the daily study loop

Run one study day: **Review** (resurface past topics) → **Learn** (new material) → **Recall + Feynman** (teach back + quiz today's material). State is read first and written after every answered question, so a new session resumes the exact step AND question with zero manual context.

## Conventions (read first)

- **Run from the study project root.** The workspace is `study/`; pass `study` as `<studyDir>` to every engine call.
- **State is engine-owned.** Read and mutate `study/state.json` ONLY through:
  ```bash
  node .claude/skills/_engine/state.cjs <cmd> study [args]
  ```
  Never hand-edit `state.json`.
- **Resume source = `state.json` only.** The active quiz lives in `state.json.step_progress.items` with an `answered` pointer. Resume reads state.json and continues at `items[answered]`. **Never parse `daily/<date>.md` to resume**, and never re-run selection or regenerate a question for an in-progress block.
- **Token discipline.** Load only: `state.json`, today's `daily/<date>.md` (for human display), and the active topic's `knowledge/<topic>.md`. Never load the whole knowledge base, all daily logs, or `results.jsonl` (the engine reads that).
- **`today`** = `state.today` (the engine sets it at `start-day`). Use it for `asOf` and every result `date`.

## The active-quiz item schema (resume contract)

When a quiz block starts, generate the questions, then store them as `items` via `set-step`. Each item carries everything needed to re-display and grade it, so resume needs nothing but `state.json`:

```json
{ "q_id": "d20260628-r01", "topic": "vpc-network-security",
  "question": "…", "options": ["A …","B …","C …","D …"],
  "answer": ["B","C"] }
```

- `options`/`answer` are present for multiple-choice/response; for open question types, `options` may be `[]` and `answer` a model answer string.
- **q_id** = `d<YYYYMMDD>-<k><NN>`: `r` for review, `c` for recall (e.g. `d20260628-r01`, `d20260628-c03`).
- `kind` is not stored per item — it is the current `step` (`review` → kind `review`, `recall` → kind `recall`).

## Flow

### 1. State-first read + uninitialized guard

```bash
node .claude/skills/_engine/state.cjs read study
```

- `{"exists":false}` → tell the user to run **`/sk:init`** first, then stop. Do nothing else.
- Otherwise keep the returned state in mind: `phase`, `day_status`, `step`, `step_progress`, and `config`. MVP handles `phase: "study"` (other phases: tell the user that phase isn't supported yet).

### 2. Resume decision

- **New day** — `isNewDay` (i.e. `state.today` ≠ local today) OR `day_status: "not-started"`:
  ```bash
  node .claude/skills/_engine/state.cjs start-day study
  ```
  then begin the **Review** block fresh.
- **In progress** — `day_status: "in-progress"`: jump to `state.step`.
  - Quiz block (`review`/`recall`) with `answered < total` → resume at `step_progress.items[answered]`; ask the remaining items in order. Do NOT re-select or regenerate.
  - `answered == total` → that block is done; advance to the next block.
  - `step: "learn"` → resume the Learn discussion.
- **Done** — `day_status: "done"`: tell the user the day is complete; offer (a) stop, (b) an extra ad-hoc session, or (c) if it's end-of-week, note that a phase switch may be due (full phase-switch logic is a later release).

### 3. Review block

Resurface previously-studied topics. Run selection ONCE at block start:

```bash
node .claude/skills/_engine/select.cjs study/results.jsonl \
  '{"n":<config.review_quiz_size>,"seed":<config.select_seed>,"asOf":"<today>","windowDays":<config.window_days>,"wrongFactor":<config.wrong_factor>}'
```

- **Empty array (first study day, nothing to resurface)** → write the Review section as skipped and go straight to **Learn**:
  ```markdown
  ## Review
  _Skipped — empty review pool (first study day)._
  ```
- **Otherwise**: for each selected topic, generate ONE fresh question grounded in that topic's `knowledge/<topic>.md`. Build the `items` array (schema above, `r` q_ids), then:
  ```bash
  node .claude/skills/_engine/state.cjs set-step study review '<itemsJson>'
  ```
  Render all questions into `daily/<date>.md` under `## Review` (human record), then ask **one at a time** (see "Asking a question").

### 4. Learn block

```bash
node .claude/skills/_engine/state.cjs set-step study learn '[]'
```

- The user names the topic (or use the skill argument). Tutor it: answer questions and explain to the user's stated preference. This is a conversation — **do not** make tool calls mid-discussion.
- **At block end**, in a single write, append the session's Q&A to `daily/<date>.md` under `## Learn` (silent logging — buffer in the conversation, write once).
- Update `study/syllabus.md`: set the topic's `status` to `learning` or `learned` and `last_studied` to today.
- Append durable notes to `study/knowledge/<topic>.md` (Summary / Key concepts / pitfalls).

### 5. Recall + Feynman block

1. **Teach-back**: ask the user to explain today's topic from memory; evaluate against `knowledge/<topic>.md` and name the gaps plainly.
2. **Quiz**: generate a short quiz on today's material grounded in today's `knowledge/<topic>.md`; build `items` with `c` q_ids; then:
   ```bash
   node .claude/skills/_engine/state.cjs set-step study recall '<itemsJson>'
   ```
   Render into `daily/<date>.md` under `## Recall + Feynman` and ask one at a time with `kind: "recall"`.

### 6. End of day

```bash
node .claude/skills/_engine/state.cjs finish-day study
```

Summarize the day. If it's end-of-week or other criteria suggest exam-prep, *suggest* a phase switch (do not perform it — deferred to a later release).

## Asking a question (every quiz item)

For `items[answered]`:

1. Present the question (and options) to the user. Accept their answer.
2. Grade with **binary, all-or-nothing** scoring: `correct = true` only if the chosen option set exactly equals the correct set; `score = correct ? 1 : 0`.
3. Show the verdict and the correct answer (with a one-line why).
4. Append the result to `daily/<date>.md` under the block's section (question, the user's answer, ✅/❌, correct answer).
5. Record it (this appends `results.jsonl` and increments `answered` in one call):
   ```bash
   node .claude/skills/_engine/state.cjs record-answer study \
     '{"date":"<today>","topic":"<topic>","kind":"<review|recall>","q_id":"<q_id>","correct":<true|false>,"score":<0|1>}'
   ```
6. When `answered == total`, the block is complete — advance.

The order matters: write the human line into `daily/<date>.md`, then `record-answer`. If interrupted between questions, the next session reads `state.json`, sees `answered`, and resumes at the exact next item.

## `daily/<date>.md` format

```markdown
# 2026-06-28

## Review
1. [vpc-network-security] Which two controls isolate subnets? (choose 2)
   - Your answer: B, C — ✅ correct
2. [iam-and-identity] …
   - Your answer: A — ❌ wrong (correct: C — IAM roles, not users, for cross-account)

## Learn
Topic: caching-and-cdn
- Q: When CloudFront vs ElastiCache? → A: edge content delivery vs in-memory data cache…

## Recall + Feynman
Teach-back: solid on cache invalidation; shaky on TTL trade-offs.

### Quiz
1. [caching-and-cdn] …
   - Your answer: … — ✅ correct
```

This file is for the human. Resume never reads it — `state.json.step_progress.items` is the source of truth.

## Success check

- Reads `state.json` first; uninitialized → instructs `/sk:init` and stops.
- Mid-review resume lands on the exact next unanswered question, driven by `state.json` (no markdown parsing, no re-selection).
- Blocks run review → learn → recall; each quiz answer appends one `results.jsonl` line and increments `answered`.
- Learn Q&A is written at block end, not mid-discussion.
- Empty review pool (first day) skips Review straight to Learn with a note.

See `references/daily-loop.md` for block-by-block detail, the Feynman rubric, and a full worked day.
