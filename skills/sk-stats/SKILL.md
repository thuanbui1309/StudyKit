---
name: sk:stats
description: "Read-only progress metrics for a StudyKit project. Shells out to the engine aggregator (stats.cjs) and renders totals, per-domain rollup, coverage, accuracy, wrong-heavy and stale topics — without ever loading the raw attempt log."
user-invocable: true
when_to_use: "Invoke any time to see hard numbers on a study project: how many attempts, accuracy per domain, coverage vs syllabus, which topics are weak or stale. Read-only — writes nothing. For a narrative timeline + a saved snapshot, use /sk:summary instead."
category: study
keywords: [study, stats, progress, metrics, coverage, accuracy, spaced-repetition]
metadata:
  author: studykit
  version: "0.1.0"
---

# sk:stats — progress metrics

Show the numbers for ONE study project: totals, per-domain accuracy, coverage vs the syllabus, and the wrong-heavy / stale topic lists. Pure read-only — it never mutates state and never writes files. For a narrative + a saved `progress.md`, use `/sk:summary`.

## Conventions (read first)

- **Run from the study project root.** The workspace is `study/`; pass `study` as `<studyDir>` to the engine.
- **Read only the aggregate.** Get every number from one engine call — never open `study/results.jsonl` yourself (that's the engine's job and it would blow the token budget):
  ```bash
  node .claude/skills/_engine/stats.cjs study '{}'
  ```
  The engine reads `results.jsonl` + `syllabus.md` and returns one JSON aggregate. `asOf` defaults to today.
- **Read-only.** No `state.cjs` calls, no `start-day`, no file writes. Running `/sk:stats` must never change the project.
- **Token discipline.** Load only the aggregate JSON. Do not read the knowledge base, daily logs, or the raw attempt log.
- **Language — match the user.** Labels and prose in the user's language; keep machine tokens (JSON keys, `status` values, topic slugs) and these section names canonical ASCII English.

## Flow

### 1. Uninitialized guard

```bash
node .claude/skills/_engine/state.cjs read study
```

- `{"exists":false}` → tell the user to run **`/sk:init`** first, then stop.
- Otherwise continue (you only needed to confirm the project exists; the numbers come from `stats.cjs`).

### 2. Aggregate

```bash
node .claude/skills/_engine/stats.cjs study '{}'
```

Parse the JSON. Its shape (see `_engine/stats.cjs` header for the contract): `totals`, `coverage`, `byTopic[]`, `byDomain[]`, `byDay[]`, `wrongHeavy[]`, `stale[]`. A fresh project returns everything zeroed — render that as "no attempts yet, start with `/sk:learn`".

### 3. Render

Present compactly (a few small tables, not a wall of JSON):

- **Totals** — attempts, correct, overall accuracy, active days, current streak, study span (`first_activity` → `asOf`).
- **Coverage** — `learned / learning / not_started` out of `total`, plus `pct_learned` as a short bar (e.g. `learned 8/20 (40%)`).
- **By domain** — a table: domain · learned/total · coverage% · attempts · accuracy. Render `byDomain` in the order returned (syllabus order; `unknown` last for any off-syllabus topics).
- **Wrong-heavy** — the worst `wrongHeavy` topics (show the top ~8): topic · accuracy · correct/attempts. Note "nothing wrong yet" if empty.
- **Stale** — the most overdue `stale` topics (top ~8): topic · last_seen · days_since.

Close with a one-line read of where things stand (e.g. "Security is your weakest domain; 3 topics untouched"). For the full narrative + pace-vs-target and a saved snapshot, point to `/sk:summary`.

## Success check

- Reads `state.json` only to guard for uninitialized; all numbers come from `stats.cjs`.
- Never opens `results.jsonl` directly and never writes any file or mutates state.
- A fresh project (zeroed aggregate) renders cleanly without crashing and suggests `/sk:learn`.
- Tables match the aggregate (per-domain rollup, coverage, wrong-heavy, stale) and are shown in the engine's stable order.
