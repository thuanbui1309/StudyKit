# StudyKit Full-Scope: Stats, Exam-Prep, Judge, Multi-Cert + Publish Prep

**Date**: 2026-06-28 13:30
**Severity**: Low (greenfield additive build; no prod impact, nothing published)
**Component**: Engine (stats, scan, state), 4 new skills, packaging
**Status**: DONE (P1–P3 + P5 + P4 prep); publish/main-merge deferred to user

## What Happened

Cooked the full-scope plan `260628-1221-studykit-full-scope` on top of the approved MVP. Shipped four epics end-to-end and prepared the fifth:

- **P1 Stats** — `_engine/stats.cjs` aggregator (reads `results.jsonl` + `syllabus.md` → one JSON aggregate) + `sk:stats` / `sk:summary`.
- **P2 Exam-prep** — `set-phase` engine command, additive exam-prep config, `sk:learn` phase routing + revise/mock loop, user-confirmed auto-switch, migration-template doc.
- **P3 Judge** — `sk:judge` + shared rubric, wired into `sk:learn` Recall, binary `kind:"judge"` line.
- **P5 Multi-cert** — Option A: `_engine/scan.cjs` + read-only `sk:certs` overview.
- **P4 prep** — tarball negation glob, `LICENSE`, removed the stray `release-manifest.json`, `prepublishOnly`, README rewrite. Stopped before `npm publish` + `main` merge per scope.

50/50 engine tests (27 baseline + 23 new), zero new deps. Consolidated code review verdict: SHIP.

## The Brutal Truth

**The plan said "no engine change required" for the judge. The plan was wrong, and only implementation surfaced it.** `record-answer` couples two things — appending a results line AND advancing `step_progress.answered`. That coupling is correct for in-step quiz answers, but a standalone `/sk:judge` (or a Feynman teach-back) records *out of step*. Run it mid-review-quiz and the cursor jumps past an unanswered question; the next session resumes at `items[answered]` and silently skips it. The validated plan (14 claims checked, "eligible for implementation") never caught this because it's a runtime interaction between two features, not a static fact. Fix was a clean additive primitive — `append-result` (append-only, no cursor move) — which the reviewer independently confirmed was necessary, not gold-plating. Lesson: a verified plan reduces unknowns, it doesn't eliminate the ones that only exist *between* components.

**A documentation comment took down a source file.** `scan.cjs` had `*/study/state.json` inside a JSDoc block — the `*/` closed the comment early, and the next backtick opened a template literal that swallowed everything to line 63. `node -c` blamed line 63; the real cause was line 19. It was invisible until the test file `require`'d the module and the whole test suite reported one failure. If `scan.cjs` had shipped without a test, this is exactly the kind of thing that survives to a user's machine. The test caught it in seconds — the strongest argument for the engine's "every .cjs has a node:test" rule.

**The additive bet paid off exactly as predicted.** The plan staked everything on `setStep` accepting any string + `normalizeState` merging config onto defaults, so the entire new surface (revise/mock steps, five new config keys, judge threshold) landed with `STATE_VERSION` still at 1 — proven by a test that backfills an old-shape state. The migration template shipped anyway, unused, as the insurance for the day a *breaking* change is truly needed. Good plans are right about their load-bearing claims even when wrong about the incidental ones.

## Technical Details

**`append-result` (`skills/_engine/state.cjs`)** — append-only sibling of `record-answer`; writes one `results.jsonl` line, returns state unchanged. Keeps "results.jsonl written only by the engine" intact while decoupling out-of-step records from the quiz cursor. Tested: cursor `after === before`.

**`stats.cjs` determinism** — fixed sort orders everywhere (byTopic alpha, byDomain in syllabus-first-appearance order with `unknown` last, wrongHeavy by accuracy↑/attempts↓/topic, stale by days_since↓). Streak uses a documented grace day (today-inactive anchors at yesterday). Off-syllabus attempts → `domain:"unknown"`; missing files → zeroed aggregate, never a crash. Full aggregate re-derived by hand in the test fixture.

**`set-phase` naming overlap** — CLI is `set-phase <studyDir> <toPhase>` (studyDir first, per engine convention), so switching back to study reads `set-phase study study` (dir `study`, phase `study`). The plan's shorthand `set-phase exam-prep study` does NOT match the arg order; the skills use the correct order. Documented the overlap in code.

**Tarball trim** — `files` negation glob `"!skills/_engine/test"` (verified during MVP that `.npmignore` can't subtract from the `files` whitelist). `npm pack --dry-run`: 18 product files, 0 test files, LICENSE present. Packaged-install smoke test (pack → extract → install → run engine) passed.

## Follow-ups (user gate)

Merge `dogfood-260628-study-loop-hardening` → `main`; pick release version (1.0.0 vs 0.2.0); `npm view studykit` name check (scoped fallback `@thuanbui1309/studykit`); `npm publish`; optional `install.sh`. Then live dogfood the exam-prep + judge + auto-switch loops in a real study project — LLM-in-the-loop behavior is spec-only here, not unit-testable.
