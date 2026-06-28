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

Run one study day: **Review** (resurface past topics, once) → one or more **Learn → Recall** cycles (new material, then teach-back + quiz) → **finish** when the user is done. State is read first and written after every step/answer, so a new session resumes the exact step, topic, AND question with zero manual context.

## Conventions (read first)

- **Run from the study project root.** The workspace is `study/`; pass `study` as `<studyDir>` to every engine call.
- **State is engine-owned.** Read and mutate `study/state.json` ONLY through:
  ```bash
  node .claude/skills/_engine/state.cjs <cmd> study [args]
  ```
  Never hand-edit `state.json`.
- **Resume source = `state.json` only.** The active quiz lives in `state.json.step_progress.items` with an `answered` pointer. Resume reads state.json and continues at `items[answered]`. **Never parse `daily/<date>.md` to resume**, and never re-run selection or regenerate a question for an in-progress block.
- **Token discipline.** Load only: `state.json`, today's `daily/<date>.md` (for human display), the active topic's `knowledge/<topic>.md`, and `syllabus.md` (a small table — read in the Learn block to suggest the next topic). Never load the whole knowledge base, all daily logs, or `results.jsonl` (the engine reads that). When the Learn block fetches an official doc, summarize it into `knowledge/<topic>.md` and discard the raw page — never carry a full doc in context.
- **`today`** = `state.today` (the engine sets it at `start-day`). Use it for `asOf` and every result `date`.
- **Language — match the user.** Respond and write human-facing prose (tutoring, questions, options, verdicts, explanations, and the narrative content of `daily/<date>.md` and `knowledge/<topic>.md`) in the language the user is interacting in — detect it each session, never assume English. Keep machine-facing tokens AND markdown section headers/labels canonical ASCII English (as the templates show) and never translate them: `state.json` values, syllabus `status` values, topic slugs/filenames, `q_id`, JSON keys, and headers like `## Summary` / `## Key concepts` / `## Common pitfalls` / `## References` / `## Next`.

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
  - **`review`/`recall` with `answered < total`** → resume at `step_progress.items[answered]`; ask the remaining items in order. Do NOT re-select, regenerate, or re-fetch.
  - **`review` with `answered == total`** → Review is done → start a **Learn** block.
  - **`recall` with `answered == total`** → this cycle's Recall is done → finalize the topic (syllabus → `learned`) and offer **Continue** (another Learn→Recall cycle) or **Finish** (see End of cycle).
  - **`learn`** → resume the **same** topic from `step_progress.items[0].topic`. NEVER jump to a different topic, re-suggest, or re-fetch — even if `syllabus.md` shows that topic `learned`. Continue from its cached `knowledge/<topic>.md` (+ `## Next` note if present). If the lesson clearly already finished, move on to its **Recall**, not a new topic.
- **Done** — `day_status: "done"`: the day is complete; offer (a) stop, (b) an extra Learn→Recall cycle, or (c) if it's end-of-week, note that a phase switch may be due (full logic is a later release).

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

**Propose a topic — continue in-progress work first, else suggest from the syllabus.** In order:
1. If `/sk:learn` was invoked with a topic argument, propose that.
2. Otherwise read `study/syllabus.md` and propose, in priority:
   - first a **`learning`** topic (started but unfinished) — continue it; read its `## Next` note in `knowledge/<topic>.md` for where to resume;
   - else the **first `not-started` topic in file order** (the syllabus is heaviest-domain-first, so this follows domain priority).
3. If every topic is `learned`, say the syllabus is fully covered and offer to deepen any topic or note that an exam-prep switch may be due (deferred to a later release).

**Confirm before committing anything.** Present the proposal and WAIT for the user's explicit agreement:

> Suggested next: **`<topic>`** (<domain>). Study this, or name another topic?

Do **not** persist state, fetch any docs, or write files until the user confirms a topic (or names their own — then confirm that one). This avoids wasted fetches on the wrong topic.

**Only after the user confirms**, persist the choice (the durable resume record), then mark it learning:

```bash
node .claude/skills/_engine/state.cjs set-step study learn '[{"topic":"<topic>"}]'
```
Then in `study/syllabus.md`: `status` → `learning`, `last_studied` → today.

**Off-syllabus topic?** If the confirmed topic has no `syllabus.md` row (the user named their own), offer to add it as a new row so it's tracked and not repeated. If they decline, proceed ad-hoc: skip syllabus updates but still record results and write `knowledge/<topic>.md`.

**Ground the lesson in official docs (after persisting, before tutoring).** Teach from the authoritative source, not memory alone:
1. **Cache first** — if `knowledge/<topic>.md` already holds a substantive summary with a `## References` URL, teach from it and skip fetching.
2. Else read the `## Official Docs` base in `profile.md`, WebSearch the topic under that domain (e.g. `<topic> site:<doc-base-domain>`), then WebFetch the best official page.
3. **Summarize into `knowledge/<topic>.md`** (Summary / Key concepts / Common pitfalls) and record the page URL under `## References`. Store a concise summary — never keep the full page in context. This is both the teaching source and the cache for next time.
4. **Offline / no base / fetch fails** → ask the user to paste the official doc, or proceed from model knowledge with an explicit "not grounded in official docs" caveat. The loop must still work offline.

- Tutor the chosen topic to the user's stated preference, grounded in the summary above. This is a conversation — **do not** make further tool calls mid-discussion.
- **At block end**, in a single write:
  1. Append the session's Q&A digest to `daily/<date>.md` under `## Learn — <topic>`.
  2. Append durable notes to `knowledge/<topic>.md` (Summary / Key concepts / pitfalls). If only partially covered, also append a `## Next` line naming exactly what to resume.
  3. Leave `syllabus.md` status at `learning` — the topic becomes `learned` only after its **Recall** (next block). This keeps an interrupted learn→recall from being mistaken for a finished topic.

### 5. Recall + Feynman block

Recall the topic just learned **this cycle**. Persist the recall step FIRST so an interruption resumes here, not back in Learn:

1. Generate a short quiz on this cycle's topic, grounded in its `knowledge/<topic>.md`; build `items` with `c` q_ids (each carrying `topic`). Then:
   ```bash
   node .claude/skills/_engine/state.cjs set-step study recall '<itemsJson>'
   ```
   This flips `state.step` to `recall` immediately — from now on, resume lands on this topic's recall.
2. **Teach-back (Feynman)**: ask the user to explain the topic from memory; evaluate against `knowledge/<topic>.md` and name the gaps plainly.
3. Render the quiz into `daily/<date>.md` under `## Recall — <topic>` and ask one at a time with `kind: "recall"` (see "Asking a question").
4. **When the quiz completes** (`answered == total`): set the topic's `syllabus.md` `status` → `learned` (or keep `learning` + a `## Next` note if it still isn't solid). The cycle is done — go to End of cycle.

### 6. End of cycle → continue or finish

After a cycle's Recall, ask:

> Done with **`<topic>`** (learn + recall). Study another topic, or finish for today?

- **Continue** → start a new **Learn** block (step 4): propose the next topic, confirm, persist, fetch, tutor, then Recall. Review runs only once per day, so cycles after the first go straight to Learn. Do NOT call `start-day` between cycles.
- **Finish** (or the user is done):
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

Review once at the top, then a Learn + Recall pair per cycle (topic in the header):

```markdown
# 2026-06-28

## Review
1. [vpc-network-security] Which two controls isolate subnets? (choose 2)
   - Your answer: B, C — ✅ correct

## Learn — iam-and-identity
- Q: Role vs user for cross-account? → A: assume a role, never share user keys…

## Recall — iam-and-identity
Teach-back: solid on roles; shaky on permission boundaries.

### Quiz
1. [iam-and-identity] …
   - Your answer: … — ✅ correct

## Learn — caching-and-cdn
…(second cycle, same day)…
```

This file is for the human. Resume never reads it — `state.json.step_progress.items` is the source of truth.

## Success check

- Reads `state.json` first; uninitialized → instructs `/sk:init` and stops.
- Resume lands on the exact next item via `state.json` (no markdown parsing, no re-selection, no re-fetch): mid-`review`/`recall` → the next unanswered question; mid-`learn` → the SAME topic, never a different one.
- A topic is confirmed by the user before ANY state write, doc fetch, or file write — no wasted fetches.
- Daily Learn draws from the confirmed syllabus (proposed, never forced) or an ad-hoc topic the user names; off-syllabus topics can be added to the syllabus or studied ad-hoc. `learned` topics are not re-proposed.
- Learn→Recall is durable: Recall's `set-step` runs before teach-back, so a clear during recall resumes recall (not a new Learn).
- A topic becomes `learned` only after its Recall; during learn→recall it stays `learning`, so an interrupted cycle resumes the same topic.
- A day runs Review once, then one or more Learn→Recall cycles; `finish-day` only on the user's choice.
- Each quiz answer appends one `results.jsonl` line and increments `answered`; Learn Q&A is written at block end.
- Empty review pool (first day) skips Review straight to Learn with a note.

See `references/daily-loop.md` for block-by-block detail, the Feynman rubric, and a full worked day.
