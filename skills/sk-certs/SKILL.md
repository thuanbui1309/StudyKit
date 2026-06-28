---
name: sk:certs
description: "Read-only multi-cert overview. Scans a parent directory of sibling StudyKit projects (~/study/aws-saa/, ~/study/terraform/, ...) and renders a combined progress table — phase, coverage, streak, days-to-target, next action — so you can see all your certifications and decide what to study. Never mutates any project."
user-invocable: true
when_to_use: "Invoke when you study more than one certification (one project per cert) and want a single combined view across them, plus a suggestion of which to study next. Point it at the parent directory that holds the cert projects."
category: study
keywords: [study, certs, multi-cert, overview, progress, dashboard]
argument-hint: "[parent dir of cert projects, default .]"
metadata:
  author: studykit
  version: "0.1.0"
---

# sk:certs — multi-cert overview

StudyKit keeps **1 project = 1 cert** (each cert has its own isolated `study/`). This skill adds a thin, **read-only** cross-project view: given a parent dir holding several cert projects, it reads each project's small `state.json` + `stats.cjs` aggregate and renders one combined table — so you can see every cert at a glance and pick what to study next. It changes nothing.

## Conventions (read first)

- **Read-only, always.** Never call `state.cjs` mutators (`start-day`/`set-step`/`record-answer`/`set-phase`) or write any file in any cert. This skill only reads.
- **Parent-dir convention.** Cert projects are siblings under one parent: `~/study/aws-saa/`, `~/study/terraform/`, …. The skill takes that parent dir as its argument (default `.` — the current dir).
- **Token discipline.** Get the cert list from `scan.cjs` and each cert's numbers from that cert's `stats.cjs` aggregate. Never open any cert's raw `results.jsonl` — the engine reads it and returns a small aggregate.
- **Language — match the user.** Table prose + the recommendation in the user's language; project names, `phase`/`status` values, and headers canonical ASCII.

## Flow

### 1. Enumerate the cert projects

```bash
node .claude/skills/_engine/scan.cjs <parentDir>   # default "."
```

Returns `[{ project, studyDir, exam, phase, day_status, updated_at }, ...]` for every child with a `study/state.json`.

- **Empty** → tell the user no study projects were found under `<parentDir>`, and that each cert is a sibling project created with `studykit init` + `/sk:init` (e.g. `~/study/<cert>/`). Stop.

### 2. Per-cert metrics (read-only)

For each returned cert, read its target date and aggregate (using that cert's `studyDir`):

```bash
grep -i "target date" <studyDir>/profile.md           # optional; for days-to-target / pace
node .claude/skills/_engine/stats.cjs <studyDir> '{"targetDate":"<date>"}'   # drop opt if none
```

Pull from each aggregate: `coverage.pct_learned`, `totals.streak`, `totals.last_activity`, and `pace.days_remaining` (when a target exists). This is a few small calls per cert — never the raw attempt log.

### 3. Render the combined table

One row per cert, e.g.:

| Cert | Phase | Coverage | Streak | Days to target | Last active | Next |
|------|-------|----------|--------|----------------|-------------|------|
| aws-saa | exam-prep | 82% | 5 | 12 | 2026-06-28 | run a mock |
| terraform | study | 35% | 0 | — | 2026-06-20 | learn next topic |

"Next" is a short read of each cert's state (e.g. `study` + low coverage → "learn next topic"; `exam-prep` → "revise / mock"; stale → "overdue — review").

### 4. Recommend what to study

Suggest one cert to focus on next, with a one-line reason — prefer the **nearest target date**, then the **most stale** (oldest `last_activity`), then the **lowest coverage**. Make it a suggestion, not an action: the user opens that cert's project and runs `/sk:learn` there.

## Success check

- Reads multiple sibling projects via `scan.cjs` + each cert's `stats.cjs` aggregate; never opens any raw `results.jsonl`.
- Mutates nothing in any cert (no state writes, no file writes) — pure overview.
- Empty parent dir → a clear "no certs found" message with the parent-dir convention, not a crash.
- Renders a combined table and a single, reasoned "study next" suggestion.
- The single-cert path (other skills) is untouched; each cert's `study/` stays isolated and token-bounded.
