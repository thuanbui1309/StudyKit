<div align="center">

# StudyKit

**Turn any project directory into a spaced-repetition study workspace, driven by Claude skills.**

[![npm version](https://img.shields.io/npm/v/studykit.svg)](https://www.npmjs.com/package/studykit)
[![node](https://img.shields.io/node/v/studykit.svg)](https://nodejs.org)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![dependencies: zero](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)

</div>

---

StudyKit installs a small set of [Claude Code](https://claude.com/claude-code) skills plus a zero-dependency Node engine into a project directory. You study one certification per project; your learning state lives as flat markdown + JSONL on disk, so **any session resumes exactly where you left off** with a single command — no manual context reload.

- 📚 **Two phases, one driver** — a daily *study* loop (review → learn → recall) that graduates to an *exam-prep* loop (targeted revision + full mock exams), switched only with your confirmation.
- 🎯 **Deterministic spaced repetition** — a seeded selector resurfaces the topics you're weakest on and haven't seen in a while.
- 🧮 **Honest progress** — coverage, accuracy, streaks, and pace vs. your target date, computed from your real attempt log.
- ✍️ **Open-ended grading** — rubric-based judging of Feynman teach-backs and "explain X" answers, fed back into spaced repetition.
- 🗂️ **Multi-cert overview** — one read-only dashboard across every cert you're studying.
- 🪶 **Zero runtime dependencies** — pure Node (`>=18`), tested with the built-in `node --test`.

## Table of contents

- [Install](#install)
- [Quickstart](#quickstart)
- [Skills](#skills)
- [What `/sk:init` creates](#what-skinit-creates)
- [How it works](#how-it-works)
- [Multiple certifications](#multiple-certifications)
- [Development](#development)
- [Releasing](#releasing)
- [License](#license)

## Install

> The npm package is **`studykit`** (lowercase, an npm requirement); the project name is **StudyKit**.

Install the skills into a study project — a directory for one exam or topic:

```bash
# from npm
npx studykit@latest init ~/study/aws-saa

# from a git checkout
node bin/studykit.cjs init ~/study/aws-saa
```

`init` only installs skills into `<project>/.claude/skills/`. It **never** creates or touches `study/` — that belongs to `/sk:init`.

## Quickstart

Open the study project in Claude Code, then:

| Step | Command | What it does |
|------|---------|--------------|
| 1 | **`/sk:init`** | Once per project. Researches the exam blueprint, writes `profile.md` / `syllabus.md` / `knowledge/`, captures your background, pass mark, and mock size. |
| 2 | **`/sk:learn`** | Every session. Runs the daily loop one question at a time and resumes the exact step + question across sessions. |
| 3 | **`/sk:stats`** · **`/sk:summary`** | Anytime. The numbers, or a narrative with pace vs. your target date (`sk:summary` also saves `study/progress.md`). |
| 4 | *Exam-prep* | When coverage is high or the exam is near, `/sk:learn` **proposes** switching phases (you confirm), then runs revision + blueprint-weighted, resumable, scored mock exams. |
| 5 | **`/sk:judge`** | Grade an open-ended explanation against a rubric; tracked topics get recorded so the result feeds spaced repetition. |

Studying more than one cert? See [Multiple certifications](#multiple-certifications).

## Skills

| Skill | Role |
| ----- | ---- |
| `sk-init` | One-time setup: builds the exam blueprint + knowledge base |
| `sk-learn` | The daily driver: study loop + exam-prep loop, with exact resume |
| `sk-stats` | Read-only progress metrics (totals, coverage, weak/stale topics) |
| `sk-summary` | Narrative progress + pace vs. target; writes `study/progress.md` |
| `sk-judge` | Rubric grader for open-ended answers (Feynman teach-back, "explain X") |
| `sk-certs` | Read-only overview across multiple cert projects |
| `_engine` | Zero-dependency Node helpers (`state` · `select` · `stats` · `scan`) |

## What `/sk:init` creates

```text
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
- **State-first resume.** Every skill reads the tiny `state.json` cursor first, then loads only the slice it needs — reads stay token-bounded no matter how long your history grows. Resume reads `state.json` only, never markdown, even mid-mock-exam.
- **Deterministic, topic-level selection.** `select.cjs` is seeded and resurfaces *topics* (older-within-window and previously-wrong weighted heavier); `sk-learn` then generates a fresh question per topic. There is no question bank.
- **Two phases, one driver.** `state.phase` is `study` or `exam-prep`. The switch is always user-confirmed and reversible; the schema change is additive (no migration needed).
- **Binary scoring everywhere.** Multiple-choice and rubric-judged open-ended answers both resolve to one binary `results.jsonl` line; rich rubric detail stays human-facing in `daily/`.
- **Zero dependencies.** Pure Node CommonJS (`>=18`), tested with the built-in `node --test`.

## Multiple certifications

StudyKit keeps **1 project = 1 cert**, so each `study/` stays isolated and token-bounded. To study several, create sibling projects under one parent and use the read-only overview:

```bash
npx studykit@latest init ~/study/aws-saa
npx studykit@latest init ~/study/terraform
# run /sk:init in each, study as usual, then from any project:
#   /sk:certs ~/study
#   -> combined table: phase, coverage, streak, days-to-target, next action
```

`/sk:certs` reads each cert's `state.json` + stats aggregate only — never raw attempt logs — and suggests which cert to study next. It mutates nothing.

## Development

```bash
npm test          # node --test skills/_engine/test/
```

The engine is pure Node CommonJS with zero runtime dependencies. Every `.cjs` ships with a `node:test` suite; keep it green.

## Releasing

See **[docs/release-process.md](docs/release-process.md)** for the full publish runbook: semantic versioning, the pre-publish audit, git tagging, GitHub push, and `npm publish` (including the 2FA one-time-password step).

## License

[MIT](LICENSE) © Thuan Bui
