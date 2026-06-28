---
name: sk:summary
description: "Narrative progress report for a StudyKit project. Shells out to the engine aggregator (stats.cjs) with the profile's target date, composes a human timeline + status assessment, and overwrites a single study/progress.md snapshot."
user-invocable: true
when_to_use: "Invoke for a readable progress story: study span, streak, accuracy trend, per-domain strengths/weaknesses, pace vs your target date, and what to study next. Also writes/refreshes study/progress.md. For raw numbers only, use /sk:stats."
category: study
keywords: [study, summary, progress, timeline, pace, report, spaced-repetition]
metadata:
  author: studykit
  version: "0.1.0"
---

# sk:summary — narrative progress + saved snapshot

Tell the progress story for ONE study project — span, streak, accuracy trend, per-domain strengths/weaknesses, pace vs the target date, and what to do next — then overwrite a single `study/progress.md` snapshot. The numbers come from the same engine aggregate `/sk:stats` uses; this skill adds the narrative and the saved file. For bare metrics, use `/sk:stats`.

## Conventions (read first)

- **Run from the study project root.** The workspace is `study/`; pass `study` as `<studyDir>` to the engine.
- **Read only the aggregate (+ one profile line).** Numbers come from one engine call — never open `study/results.jsonl` yourself:
  ```bash
  node .claude/skills/_engine/stats.cjs study '{"targetDate":"<date>"}'
  ```
  The only extra read is the single `Target date:` line from `profile.md` (to supply `targetDate`). Do not load the whole knowledge base or all daily logs.
- **One snapshot file.** This skill OVERWRITES `study/progress.md` (latest snapshot only — not an append, no per-run history files). Use the Write tool.
- **No state mutation.** Reading is fine; never call `start-day`/`set-step`/`record-answer`. The only write is `progress.md`.
- **Language — match the user.** All prose in `progress.md` and the printed narrative is in the user's language; keep the section headers (`## Status`, `## Coverage`, `## Timeline`, `## Weak / stale`), JSON keys, and topic slugs canonical ASCII English.

## Flow

### 1. Uninitialized guard

```bash
node .claude/skills/_engine/state.cjs read study
```

- `{"exists":false}` → tell the user to run **`/sk:init`** first, then stop.
- Otherwise note the `exam` name (for the report heading) and continue.

### 2. Target date (one cheap read)

```bash
grep -i "target date" study/profile.md
```

- If the value is a real date (`YYYY-MM-DD` or similar), use it as `targetDate`.
- If it is "none yet" / blank / unparseable, omit `targetDate` — the aggregate then has no `pace` block, and you simply skip the pace sentence.

### 3. Aggregate

```bash
node .claude/skills/_engine/stats.cjs study '{"targetDate":"<date>"}'   # drop the opt if no target
```

Parse the JSON: `totals`, `coverage`, `byTopic[]`, `byDomain[]`, `byDay[]`, `wrongHeavy[]`, `stale[]`, and `pace` (only when a target was passed). A zeroed aggregate → say there's no activity yet and point to `/sk:learn`; still write a minimal `progress.md`.

### 4. Compose the narrative

Turn the raw numbers into judgment (the engine gives numbers; you give the read):

- **Span & cadence** — first activity → today, active-day count, current streak.
- **Accuracy trend** — overall accuracy, and whether recent `byDay` accuracy is rising or falling vs earlier days.
- **Strengths / weaknesses** — strongest and weakest domains from `byDomain` accuracy + coverage.
- **Pace vs target** — if `pace` is present: `days_remaining`, `topics_remaining`, `required_per_day`; phrase it ("on track" / "behind — needs ~N topics/week to finish by <date>"). Skip if no target.
- **What next** — concrete: top `wrongHeavy` to review, most `stale` to refresh, first `not_started` topics to learn.

### 5. Overwrite `study/progress.md`

Write this single snapshot (headers canonical ASCII; prose in the user's language):

```markdown
# Progress — <exam>

> Snapshot: <asOf> · Streak: <n> days · Coverage: <pct>% learned

## Status
<assessment: pace vs target, what to review/learn next>

## Coverage
<per-domain table: domain | learned/total | accuracy>

## Timeline
<recent active days: date — topics touched, accuracy>

## Weak / stale
<wrong-heavy + stale topic lists>
```

Then print the same narrative to the user and confirm the file was written.

## Success check

- Reads `state.json` (guard) + one `Target date:` line; all metrics come from `stats.cjs` — never from raw `results.jsonl`.
- Calls `stats.cjs` with `targetDate` when the profile has a real date; omits it (and the pace sentence) otherwise.
- Overwrites exactly one `study/progress.md` (single snapshot, not append, no history files).
- Prose in the user's language; section headers + machine tokens canonical ASCII.
- A zeroed aggregate still produces a clean, minimal report and points to `/sk:learn`.
