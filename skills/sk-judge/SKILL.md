---
name: sk:judge
description: "Rubric-based grader for open-ended study answers (Feynman teach-back, 'explain X', short essay). Produces a rich multi-criterion rubric for the human and records a single binary kind:judge line so open-ended practice feeds spaced repetition + stats — without breaking binary scoring."
user-invocable: true
when_to_use: "Invoke to grade a free-form explanation of a topic. Standalone: paste or speak an answer and get scored feedback. For tracked topics it can record the result so it counts toward review/stats; untracked topics are graded ad-hoc without recording."
category: study
keywords: [study, judge, grading, rubric, feynman, open-ended, spaced-repetition]
argument-hint: "[topic]"
metadata:
  author: studykit
  version: "0.1.0"
---

# sk:judge — grade an open-ended answer

Grade a free-form answer about a topic against a multi-criterion rubric, show the human the nuance, and (for a tracked topic, with the user's OK) record one **binary** `kind:"judge"` line so the result feeds spaced repetition and stats. The rubric lives in `references/judge-rubric.md` — the SAME file `/sk:learn`'s Recall teach-back uses, so grading is identical on both surfaces.

## Conventions (read first)

- **Run from the study project root.** The workspace is `study/`; pass `study` as `<studyDir>`.
- **Binary scoring is the invariant.** The rich per-criterion rubric is human-facing only; what reaches `results.jsonl` is one binary line (`correct` + `score ∈ {0,1}`). Never write fractional scores into `results.jsonl`.
- **Append-only recording.** Record with `append-result` (NOT `record-answer`) so grading never advances an in-progress quiz cursor:
  ```bash
  node .claude/skills/_engine/state.cjs append-result study '<binary json line>'
  ```
- **Confirm before mutate.** Grade first, show the result, then ask before recording. Only record tracked topics.
- **Ground the judgment.** Grade against `knowledge/<topic>.md` (+ official summary), never from thin air. Untracked topic → grade ad-hoc and say it isn't grounded; do not record.
- **Token discipline + language.** Load only the active topic's `knowledge/<topic>.md` and the rubric. Prose in the user's language; machine tokens (`kind:"judge"`, `q_id` `j` prefix, JSON keys, section headers) canonical ASCII.

## Flow

### 1. Resolve the project + topic

```bash
node .claude/skills/_engine/state.cjs read study
```

- `{"exists":false}` → no study project here. Offer a one-off **ad-hoc** grade (no grounding, no record), or tell the user to run `/sk:init` to enable grounding + recording. If they decline both, stop.
- Otherwise note `config.judge_pass_threshold` (default `0.7`) and continue.

Topic = the skill argument if given, else ask which topic the answer is about.

### 2. Get the answer

Accept the user's free-form answer: they paste/type it, or — if they want to practice — ask them to explain the topic from memory now (Feynman style), then grade what they say.

### 3. Decide grounding + whether it's recordable

- **Tracked** — `study/knowledge/<topic>.md` exists (and/or a `syllabus.md` row): load it and ground the rubric in it. Recordable.
- **Untracked but initialized** — no knowledge file: grade from model knowledge, note "not grounded in your knowledge base", and offer to add the topic to the syllabus (via `/sk:learn`). Do **not** record an untracked topic.
- **Uninitialized** — ad-hoc grade only (from step 1), no record.

### 4. Apply the rubric

Follow `references/judge-rubric.md`: score `correctness`, `completeness`, `clarity`, `terminology` (each 0..1, anchored to what the user actually said); `overall = mean(...)`; `correct = overall >= judge_pass_threshold`; `score = correct ? 1 : 0`.

### 5. Present the rich result

Show the per-criterion scores + one-line notes, the `overall`, and PASS / BELOW PASS vs the threshold. Name the concrete gaps and point to the `knowledge/<topic>.md` section to revisit. This is the value for the human.

### 6. Record (tracked + confirmed only)

Ask: *"Record this as a judged attempt on `<topic>` (counts toward review + stats)?"* On **yes**:

1. Append the full rubric to `daily/<date>.md` under `## Judge — <topic>` (today = local date; if a day is in progress use `state.today`).
2. Append the binary line via the engine:
   ```bash
   node .claude/skills/_engine/state.cjs append-result study \
     '{"date":"<today>","topic":"<topic>","kind":"judge","q_id":"d<YYYYMMDD>-j<NN>","correct":<bool>,"score":<0|1>}'
   ```

On **no** → grade-only; write nothing.

## Success check

- Grades an open-ended answer with the 4-criterion rubric and a clear overall + PASS/BELOW-PASS verdict.
- Records at most **one binary** `kind:"judge"` line via `append-result` — fractional detail stays in `daily/<date>.md` only; the quiz cursor is never touched.
- Tracked topic + user confirmation are both required before any record; untracked/ad-hoc grades record nothing.
- Grounds the judgment in `knowledge/<topic>.md` when available; flags clearly when it can't.
- Prose in the user's language; machine tokens + headers canonical ASCII.
