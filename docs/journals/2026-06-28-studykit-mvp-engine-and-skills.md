# StudyKit MVP Study Engine & Skills Delivered

**Date**: 2026-06-28 11:30  
**Severity**: Low (greenfield, no prod impact)  
**Component**: Engine state, selector, CLI, skill handlers  
**Status**: DONE (P1–P3 + autonomous P4)

## What Happened

Cooked the StudyKit MVP from plan `260628-1024-studykit-mvp-study-engine`. Built engine ownership (state schema, atomic writes, corrupt-state loudness), deterministic spaced-rep selector, install CLI, and the study loop (init→learn→recall with mid-session resume). 27 passing tests. Committed `feat: studykit MVP study engine and skills` (+1480 across 12 files). Zero external runtime deps; Node >=18 only.

## The Brutal Truth

This shipped greenfield with zero external dependencies, which feels deceptively clean. That's because almost all the hard decisions (resume contract, weight formula, selection monotonicity) live in configuration and state schema rather than library choices. The real win: **no library mismatch to regret in 6 months**. The real risk: **all resume logic depends on state.json shape, and one field rename breaks resume silently if schema migrations don't ship first**.

Also: `.gitignore` inherited from parent was dropping `bin/`, which would have invisible-failed a clone of this publishable repo. Caught at review, but should have run a test clone during build.

## Technical Details

**Atomic state writes** (`skills/_engine/state.cjs`):
- All writes: tmp file → fsSync.rename → never partial.
- Corrupt state: throws loud, never resets silently.
- `record-answer` is the single append path: results.jsonl line + answered counter increment.

**Selector** (`skills/_engine/select.cjs`):
- Mulberry32 seeded by topic → same seed = same order deterministic.
- Weight formula: `(age_days + 1) × (wrong ? wrongFactor : 1)`.
- Why the +1? Raw age zeros out same-day topics → degenerate all-zero sampler.

**Resume contract** (the decision that hurt the most):
- Store RICH items in `state.json.step_progress.items`: `{q_id, topic, question, options, answer}`.
- Why not minimal `{q_id, topic}`? Resume reads state.json ONLY; never regenerates mid-quiz questions.
- `daily/<date>.md` stays human record; state is machine-readable atomic contract.

## What We Tried

Considered storing minimal item refs in state and re-fetching from markdown:
- Rejected: mid-quiz resume would re-parse markdown → question could silently drift if skill re-ran without user noticing.
- Also: markdown is untyped; state.json is the source of truth for resume.

Tried raw weight formula `age × wrongFactor`:
- Failed: same-day topics hit age=0 → weight=0 → never sampled.
- Fixed: `(age + 1) × wrongFactor` preserves monotonicity while keeping every in-window topic weightable.

## Root Cause Analysis

Why `.gitignore` almost broke the publish?
- Inherited `.gitignore` from parent project had `bin/` blanket exclusion (prob local build output).
- StudyKit `bin/` is source: `studykit.cjs` install CLI.
- No clone test during build → would have caught on first export.

Why did resume schema nearly become a time bomb?
- Initial plan: store refs, fetch during resume.
- Reality: skills are untyped markdown forwarding; the engine can't assume the skill will re-generate the same question with the same options.
- Answer: rich items in state, engine is source of truth, skills are ephemeral.

## Lessons Learned

1. **Schema is resume law.** Once state.json ships, any field rename breaks mid-quiz users silently. Run migrations first, never async schema changes.

2. **Greenfield means no regrets *yet*.** No deps = no version hell tomorrow. But all architectural decisions are now frozen in state schema. Document every `state.json` field assumption; treat it like a public API.

3. **Test clones in the build.** The `.gitignore` incident would have failed a `git clone && npm install` dry-run. Add to the runbook.

4. **Untyped skill↔engine surface is high-risk.** Skills forward `state.config` (snake_case opts); `select.cjs` now tolerates snake_case so we don't silently fall back to defaults. But this is fragile. Consider a skill schema validator before scaling to 10+ skills.

5. **Weights need intuition testing.** The `age + 1` fix works, but it's a magic number. Future learner: plot the weight distribution and verify it matches your SRS spacing intent. Don't assume.

## Next Steps

1. **Interactive P4 dogfood**: Live AWS SAA `/sk:init` → `/sk:learn` day → cross-session resume. Runbook: `plans/reports/handoff-runbook-260628-1049-studykit-p4-live-dogfood-aws-saa-report.md`.

2. **Publish hardening**: Exclude `_engine/test/` from install tarball (don't ship test fixtures).

3. **Schema migration template**: Create one before anyone extends state.json fields. Document the contract.

4. **Clone test in CI/CD**: Add `git clone && npm install && node bin/studykit.cjs --help` to publish pipeline.

---

**Status**: DONE  
**Summary**: Greenfield MVP shipped (12 files, +1480, 27 tests). Three schema decisions locked in; resume contract chosen to avoid silent question drift; selector weight formula fixed to handle same-day topics. Ready for live P4 dogfood; publish-time test clone and tarball trim needed.
