---
name: sk:init
description: "One-time setup for a StudyKit study project. Discovers the exam blueprint, builds the knowledge base (profile, syllabus, knowledge/), records the candidate's background, and writes the initial study/state.json via the engine. Idempotent."
user-invocable: true
when_to_use: "Invoke once per study project to set up a new exam/topic before /sk:learn. Re-running detects an existing setup and will not clobber study/ without confirmation."
category: study
keywords: [study, init, exam, blueprint, syllabus, knowledge-base, spaced-repetition]
argument-hint: "[exam name]"
metadata:
  author: studykit
  version: "0.1.0"
---

# sk:init — set up a study project

Set up `study/` for ONE exam/topic: discover the blueprint, scaffold the knowledge base, record the candidate's background, and write the initial cursor. Run once per project. `/sk:learn` is the daily driver afterward.

## Conventions (read first)

- **Run from the study project root.** The study workspace is the `study/` directory; pass `study` as the `<studyDir>` to every engine call.
- **State is engine-owned.** Never hand-write or hand-edit `study/state.json`. Mutate it ONLY through:
  ```bash
  node .claude/skills/_engine/state.cjs <cmd> study [args]
  ```
- **Markdown via the Write tool; state via the engine.** You write `profile.md`, `syllabus.md`, `knowledge/<topic>.md`, and an empty `results.jsonl` with the Write tool. You write `state.json` only through `state.cjs`.
- **Token discipline.** Write skeletons to disk; keep only the confirmed blueprint outline in context. Do not dump full research transcripts into the conversation.
- **Language — match the user.** Run the interview and write human-facing prose (blueprint confirmation, `profile.md` Candidate Background / Notes, knowledge-skeleton guidance) in the language the user is interacting in — detect it, never assume English. Keep machine/contract tokens canonical ASCII English: topic slugs/filenames (kebab-case), syllabus `status` values, `state.json` fields/values, exam codes, and the template section headers (`## Summary` / `## References` / …).

## Flow

### 1. Idempotency check

```bash
node .claude/skills/_engine/state.cjs read study
```

- `{"exists":false}` → fresh project, continue.
- A real state object → already initialized. Report `exam`, `phase`, `day_status`, then ask: **re-initialize** (and what to keep), or **abort and run `/sk:learn`**. Never overwrite an existing `study/` without explicit confirmation.

### 2. Exam target

Use the skill argument as the exam name if given; otherwise ask: *which exam or certification?* (e.g. "AWS Certified Solutions Architect – Associate (SAA-C03)"). Capture the official code if known.

### 3. Blueprint discovery (hybrid)

Draft the exam blueprint, then confirm with the user before writing anything.

1. **Research first.** Use WebSearch (or the `researcher` subagent for an obscure cert) to draft:
   - official name + code + provider
   - **domains and their weights** (e.g. "Design Secure Architectures — 30%")
   - **structure**: question count, duration, formats (incl. multi-response), scoring, pass mark
   - difficulty / prerequisites
   - **official documentation base** — the authoritative docs site `/sk:learn` will teach from (e.g. AWS → `https://docs.aws.amazon.com/`). Capture the root URL + source name.
   - Cite sources.
2. **Fallback when web is unavailable or the cert is obscure:** ask the user to paste the official exam guide, and build the blueprint from that. The skill MUST work offline via paste.
3. **Confirm the blueprint.** Present it compactly and let the user correct domains, weights, and structure before any file is written.
4. **Draft and confirm the syllabus.** From the confirmed domains, derive a proposed topic list (kebab-case slugs; roughly more topics for heavier domains) and present it grouped by domain. Let the user **approve / remove / rename / add** topics. Only the approved list becomes `syllabus.md`, and you create a `knowledge/<topic>.md` skeleton ONLY for approved topics. Write no topic files until the user signs off on the list.

See `references/blueprint-template.md` for a worked AWS SAA example.

### 4. Write the knowledge base

Create these with the Write tool under `study/` (create directories as needed):

**`study/profile.md`**
```markdown
# <Exam name> — Study Profile

## Exam
- Code / Provider: <code> / <provider>
- Structure: <n questions>, <duration>, <formats incl. multi-response>, <scoring>, pass <mark>
- Difficulty: <level / prerequisites>
- Target date: <date or "none yet">

## Domains
| Domain | Weight |
|--------|--------|
| <domain> | <xx%> |

## Official Docs
- Source: <authoritative docs name>
- Base URL: <root docs URL>
<!-- /sk:learn grounds each Learn topic in pages under this base, caching a cited summary into knowledge/<topic>.md. -->

## Candidate Background
<!-- filled in step 6 -->

## Notes
- Sources: <links>
```

**`study/syllabus.md`** — one row per **confirmed** topic (from the syllabus confirmation in step 3):
```markdown
# Syllabus

| topic | domain | status | last_studied |
|-------|--------|--------|--------------|
| <topic-slug> | <domain> | not-started | |
```

**`study/knowledge/<topic>.md`** — a skeleton for each **confirmed** topic (kebab-case slugs matching the syllabus `topic` column):
```markdown
# <Topic>

> Domain: <domain> · Status: not-started

## Summary

## Key concepts

## Common pitfalls / exam traps

## References
```

**`study/results.jsonl`** — create an empty file (the append-only attempt log `select.cjs` reads).

### 5. Write initial state (engine only)

Propose, confirm, then write. From the confirmed blueprint, derive three config values:

- `review_quiz_size` — the daily Review size (~10 is typical).
- `mock_size` — full mock-exam length, proposed from the real exam's question count (e.g. SAA-C03 → 65).
- `pass_mark` — the mock pass threshold as a **fraction of correct answers** (0–1). Convert from the official pass mark: a scaled `720/1000` ≈ `0.72`; a percentage `70%` → `0.70`. This is also written into `profile.md`'s Exam line.

```bash
node .claude/skills/_engine/state.cjs write study '{"version":1,"exam":"<exam name>","phase":"study","day_status":"not-started","config":{"review_quiz_size":10,"select_seed":1234,"window_days":7,"wrong_factor":3,"mock_size":65,"pass_mark":0.72}}'
```

The engine fills the remaining fields (`today`, `step`, `step_progress`, `updated_at`), backfills any config key you omit (e.g. the exam-prep `switch_coverage`/`switch_days_before` thresholds keep their defaults — `/sk:learn` proposes the phase switch off them), and validates the schema version. `select_seed` only needs to be stored once for determinism — keep the default unless the user wants a specific seed. `mock_size`/`pass_mark` are what `/sk:learn` uses once the project reaches the exam-prep phase.

### 6. Background interview

For each domain, ask the candidate to self-rate (1–5) and note relevant experience. Write the result into the **Candidate Background** section of `profile.md`, with a brief gap assessment (which domains need the most work). This personalizes early study; it does not change state.

### 7. Handoff

Confirm what was created (profile, syllabus, N knowledge skeletons, empty results, state=study) and tell the user to run **`/sk:learn`** to start the daily loop.

## Success check

- `study/` contains `profile.md`, `syllabus.md`, ≥1 `knowledge/<topic>.md`, an empty `results.jsonl`, and a valid `state.json` (phase=study) written via `state.cjs`.
- `profile.md` records an `## Official Docs` base (or notes none found) so `/sk:learn` can ground teaching in authoritative docs.
- The user approved the syllabus topic list (add/remove/rename) before any topic file was written; topics map to confirmed domains; statuses start `not-started`.
- Re-running detects the existing setup and does not clobber `study/` without confirmation.
