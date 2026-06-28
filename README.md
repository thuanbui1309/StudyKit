# StudyKit

Turn any project directory into a **spaced-repetition study workspace** driven by Claude skills.

One learning domain = one project. Your learning state lives as flat markdown + jsonl on disk, so any Claude Code session resumes exactly where you left off with a single command — no manual context reload.

## Install

Install the skills into a study project (a directory you'll use for one exam/topic):

```bash
# from npm (once published)
npx studykit init ~/study/aws-saa

# from a git checkout
node bin/studykit.cjs init ~/study/aws-saa
```

This copies three skills into `~/study/aws-saa/.claude/skills/`:

| Skill       | Role                                                            |
| ----------- | -------------------------------------------------------------- |
| `sk-init`   | One-time setup: builds the exam blueprint + knowledge base     |
| `sk-learn`  | The daily driver: review → learn → recall, with exact resume   |
| `_engine`   | Zero-dependency Node helpers (`state.cjs`, `select.cjs`)        |

`init` only installs skills. It **never** creates or touches `study/` — that belongs to `/sk:init`.

## Use

Open the study project in Claude Code, then:

1. `/sk:init` — once per project. Discovers the exam blueprint, writes `profile.md`, `syllabus.md`, and `knowledge/`, and records your background.
2. `/sk:learn` — every study session. Runs the daily loop one question at a time and resumes the exact step + question across sessions.

## What `/sk:init` creates

```
<study-project>/
  study/
    state.json            # machine cursor (the engine owns this schema)
    profile.md            # exam meta + structure + your background + target date
    syllabus.md           # topic | domain | status | last_studied
    knowledge/<topic>.md  # knowledge base, grows as you study
    daily/YYYY-MM-DD.md    # human-readable daily record
    results.jsonl          # append-only attempt log the selector reads
```

## How it works

- **Markdown is the human source of truth; `results.jsonl` is the machine index.** The selector reads only the jsonl.
- **State-first resume.** `/sk:learn` reads the tiny `state.json` cursor first, then loads only today's slice — reads stay token-bounded no matter how long your history grows.
- **Deterministic, topic-level selection.** `select.cjs` is seeded (seed stored in state) and resurfaces *topics* — older-within-window and previously-wrong topics weighted heavier — then `sk-learn` generates a fresh question per topic. There is no question bank.
- **Zero dependencies.** Pure Node CommonJS (`>=18`), tested with the built-in `node --test`.

## Develop

```bash
npm test          # node --test skills/_engine/test/
```

> Study state (`study/daily/`, `results.jsonl`) is your progress. The git-track vs ignore recommendation is finalized during dogfooding — see the project plan.

## License

MIT
