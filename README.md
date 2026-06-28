# StudyKit

Turn any project directory into a **spaced-repetition study workspace** driven by Claude skills.

One certification = one project. Your learning state lives as flat markdown + jsonl on disk, so any Claude Code session resumes exactly where you left off with a single command — no manual context reload. The engine is zero-dependency Node; the skills do the teaching.

## Install

Install the skills into a study project (a directory for one exam/topic):

```bash
# from npm
npx studykit@latest init ~/study/aws-saa

# from a git checkout
node bin/studykit.cjs init ~/study/aws-saa
```

This copies the product skills into `~/study/aws-saa/.claude/skills/`:

| Skill        | Role                                                                  |
| ------------ | -------------------------------------------------------------------- |
| `sk-init`    | One-time setup: builds the exam blueprint + knowledge base           |
| `sk-learn`   | The daily driver: study loop + exam-prep loop, with exact resume     |
| `sk-stats`   | Read-only progress metrics (totals, coverage, weak/stale topics)     |
| `sk-summary` | Narrative progress + pace vs target; writes `study/progress.md`      |
| `sk-judge`   | Rubric grader for open-ended answers (Feynman teach-back, "explain X")|
| `sk-certs`   | Read-only overview across multiple cert projects                     |
| `_engine`    | Zero-dependency Node helpers (`state` · `select` · `stats` · `scan`) |

`init` only installs skills. It **never** creates or touches `study/` — that belongs to `/sk:init`.

## Quickstart

Open the study project in Claude Code, then:

1. **`/sk:init`** — once per project. Researches the exam blueprint, writes `profile.md`, `syllabus.md`, and `knowledge/`, captures your background, pass mark, and mock size.
2. **`/sk:learn`** — every study session. Runs the daily loop one question at a time and resumes the exact step + question across sessions.
3. **`/sk:stats`** / **`/sk:summary`** — anytime. See the numbers, or a narrative with pace vs your target date (`sk:summary` also saves `study/progress.md`).
4. **Exam-prep** — when coverage is high or your exam is near, `/sk:learn` *proposes* switching to the exam-prep phase (you confirm). It then runs **revise** (targeted weak/stale review) + **mock exams** (blueprint-weighted, full-length, resumable, scored vs your pass mark).
5. **`/sk:judge`** — grade an open-ended explanation against a rubric; for tracked topics it records the result so open-ended practice feeds spaced repetition.

Studying more than one cert? See [Multiple certifications](#multiple-certifications).

## What `/sk:init` creates

```
<study-project>/
  study/
    state.json            # machine cursor (the engine owns this schema)
    profile.md            # exam meta + structure + your background + target date
    syllabus.md           # topic | domain | status | last_studied
    knowledge/<topic>.md  # knowledge base, grows as you study
    daily/YYYY-MM-DD.md   # human-readable daily record
    progress.md           # latest snapshot (written by /sk:summary)
    results.jsonl         # append-only attempt log the engine reads
```

## How it works

- **Markdown is the human source of truth; `results.jsonl` is the machine index.** Only the engine reads the attempt log; skills load the small aggregate it returns.
- **State-first resume.** Every skill reads the tiny `state.json` cursor first, then loads only the slice it needs — reads stay token-bounded no matter how long your history grows. Resume reads `state.json` only, never markdown — even mid-mock-exam.
- **Deterministic, topic-level selection.** `select.cjs` is seeded and resurfaces *topics* (older-within-window and previously-wrong weighted heavier); `sk-learn` then generates a fresh question per topic. There is no question bank.
- **Two phases, one driver.** `state.phase` is `study` (review → learn → recall) or `exam-prep` (revise → mock). The switch is always user-confirmed and reversible; the schema change is additive (no migration needed).
- **Binary scoring everywhere.** MCQs and rubric-judged open-ended answers both resolve to one binary `results.jsonl` line; rich rubric detail stays human-facing in `daily/`.
- **Zero dependencies.** Pure Node CommonJS (`>=18`), tested with the built-in `node --test`.

## Multiple certifications

StudyKit keeps **1 project = 1 cert** so each `study/` stays isolated and token-bounded. To study several, create sibling projects under one parent and use the read-only overview:

```bash
npx studykit@latest init ~/study/aws-saa
npx studykit@latest init ~/study/terraform
# /sk:init in each, study as usual, then:
# /sk:certs ~/study   -> combined table: phase, coverage, streak, days-to-target, next action
```

`/sk:certs` reads each cert's `state.json` + stats aggregate only — never raw attempt logs — and suggests which cert to study next. It mutates nothing.

## Develop

```bash
npm test          # node --test skills/_engine/test/
```

`prepublishOnly` runs the same suite, so a red build can't publish. The published tarball ships the product only (`skills/` minus `_engine/test/`, `bin/`, `README.md`, `LICENSE`) — verify with `npm pack --dry-run`.

## License

MIT — see [LICENSE](LICENSE).
