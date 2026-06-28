# Judge rubric — open-ended grading (shared)

Single source of truth for grading a free-form answer (Feynman teach-back, "explain X", short essay). Loaded by **both** `/sk:judge` (standalone) and `/sk:learn`'s Recall teach-back, so the two surfaces grade identically.

The crux: produce a **rich human-facing rubric** but record only a **single binary** `results.jsonl` line. This keeps the binary-scoring invariant intact while letting open-ended practice feed spaced repetition + stats.

## Grounding rule (non-negotiable)

Grade against the topic's `knowledge/<topic>.md` (and any `## References` official summary), not from thin air. If there is no knowledge file (untracked/ad-hoc topic), grade from model knowledge but say so plainly — and do not record a result for an untracked topic.

## Criteria (each scored 0..1)

| Criterion | 0.0 | 0.5 | 1.0 |
|-----------|-----|-----|-----|
| **correctness** | mostly wrong / misconceptions | partly right, some errors | accurate, no significant errors |
| **completeness** | misses the core idea | core present, key pieces missing | covers the essentials |
| **clarity** | confused / jargon with no understanding | understandable but shaky | clear, plain-language, explains cause/effect |
| **terminology** | wrong or absent domain terms | some correct terms | precise, correct domain terms |

Use intermediate values (0.25, 0.75) when warranted. Anchor each score to something the user actually said.

## Overall → binary mapping

```
overall = mean(correctness, completeness, clarity, terminology)   # 0..1, round to 2 dp for display
correct = overall >= config.judge_pass_threshold                  # default 0.7
score   = correct ? 1 : 0                                         # strictly binary
```

Read `config.judge_pass_threshold` from `state.json` (default `0.7`). The fractional `overall` and per-criterion scores are **human-facing only** — they never enter `results.jsonl`.

## What gets recorded (binary, append-only)

Record via the engine's append-only path so a standalone grade never disturbs an in-progress quiz cursor:

```bash
node .claude/skills/_engine/state.cjs append-result study \
  '{"date":"<today>","topic":"<topic>","kind":"judge","q_id":"d<YYYYMMDD>-j<NN>","correct":<bool>,"score":<0|1>}'
```

- `kind:"judge"`, `q_id` uses the `j` prefix.
- Use `append-result` (NOT `record-answer`) — judging is out-of-step, so it must not advance `step_progress.answered`. `select.cjs`/`stats.cjs` read this line by `topic`/`date`/`correct` and ignore `kind`, so it feeds spaced repetition + stats like any attempt.
- Only record when the topic is tracked (has a `knowledge/<topic>.md` / syllabus row) AND the user confirms. Untracked/ad-hoc → grade only, no record.

## What gets written to the daily log (rich, human)

Append the full rubric to `daily/<date>.md` under the relevant section (`## Judge — <topic>` standalone, or within `## Recall — <topic>` for teach-back):

```markdown
### Teach-back judged — <topic>
- correctness: 0.75 — <one-line note>
- completeness: 0.5 — <note>
- clarity: 1.0 — <note>
- terminology: 0.75 — <note>
- overall: 0.75 → PASS (threshold 0.70)
```

The human sees the nuance; the engine sees one binary fact.
