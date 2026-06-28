# Daily loop — block detail

Extended guidance for `sk:learn`. The authoritative flow and engine calls are in `SKILL.md`; this file adds the teaching detail and a worked day.

## Review block

Goal: spaced resurfacing of *prior* topics — not today's new material (that's Recall).

- Selection is seeded and runs once. The returned topics already reflect recency (older-within-window heavier) and wrong-answer weighting; do not re-weight or re-order them yourself.
- Generate exactly one question per selected topic. Vary question type across a session (single-answer, multi-response). Ground each question in that topic's `knowledge/<topic>.md` so it tests what the user actually studied.
- Multi-response questions must say how many to choose, and grade all-or-nothing.

## Learn block

Goal: genuinely teach one new topic.

**Propose → confirm → only then commit:**
- Propose a topic: a `/sk:learn` argument, else the first `learning` topic (resume partial — read its `## Next` note), else the first `not-started` row in `syllabus.md` (heaviest domain first). If all `learned`, offer to deepen or note a possible exam-prep switch (deferred).
- **Wait for the user's explicit OK** (or a topic of their own). Do NOT persist state, fetch docs, or write files before they confirm — this is what prevents wasted fetches on the wrong topic.
- After confirmation: persist (`set-step study learn '[{"topic":"…"}]'`) and set syllabus `status: learning`. This is the durable resume record.

**Ground in official docs (after persisting, before tutoring):**
- Cache first: if `knowledge/<topic>.md` already has a real summary + `## References` URL, teach from it — don't refetch.
- Else read the `## Official Docs` base in `profile.md`, WebSearch the topic under that domain, WebFetch the best official page, and summarize it into `knowledge/<topic>.md` (+ URL under `## References`). Store a concise summary, not the raw page.
- Offline / no base / fetch fails: ask the user to paste the doc, or teach from model knowledge with a clear "not grounded" caveat. The loop still works offline.

- Then tutor to the user's preference (analogies, first-principles, examples-first), checking understanding — conversational, **no further tool calls until the block ends**.
- At block end, write in one pass:
  1. `daily/<date>.md` `## Learn — <topic>` — a compact Q&A digest (not a transcript).
  2. `knowledge/<topic>.md` — append durable facts under Summary / Key concepts / Common pitfalls (what future Review questions are grounded in); a `## Next` line if partially covered.
  3. Leave `syllabus.md` at `status: learning` — the topic flips to `learned` only after its Recall, so an interrupted learn→recall isn't mistaken for finished.

## Recall + Feynman block

Goal: prove retention of **this cycle's** topic.

**Persist first.** Generate the quiz (q_ids `c01`, `c02`, …, each carrying `topic`) and `set-step study recall` BEFORE the teach-back — that flips `state.step` to `recall` so an interruption resumes the recall, not a fresh Learn.

**Feynman teach-back rubric** — ask the user to explain the topic as if teaching a beginner, then score:

| Signal | Good | Gap |
| --- | --- | --- |
| Core idea in plain language | states it without jargon crutches | needs the notes open |
| Cause/effect & trade-offs | explains *why*, compares options | lists facts only |
| Edge cases | volunteers a pitfall | misses obvious traps |

Name gaps directly and point to the `knowledge/<topic>.md` section to revisit. Then ask the quiz one question at a time, `kind: "recall"`. **When it completes**, set syllabus `status: learned` for the topic (or keep `learning` + `## Next` if shaky), then ask the user: study another topic (new Learn→Recall cycle) or finish the day?

## Worked day (first study day, empty review pool)

1. `read study` → `{day_status:"not-started", phase:"study", config:{…}}`.
2. `start-day study` → `day_status:"in-progress"`, `step:"review"`, `today` set.
3. `select.cjs study/results.jsonl '{…}'` → `[]` (nothing logged yet). Write `## Review\n_Skipped — empty review pool (first study day)._` and advance.
4. Propose the first `not-started` topic (here `iam-and-identity`); the user confirms or names another (say `caching-and-cdn`). **Only after the OK**: `set-step study learn '[{"topic":"caching-and-cdn"}]'` + syllabus `learning`. Ground it: WebFetch the official CloudFront/ElastiCache pages under the profile's docs base → summarize into `knowledge/caching-and-cdn.md` (+ References). Teach from that. At end: write `## Learn — caching-and-cdn`, update `knowledge/…`; syllabus stays `learning`.
5. Recall: generate 3 questions → `set-step study recall '[{q_id:"d20260628-c01",…}, …]'` (FIRST), then teach-back, then ask one at a time; each answer → daily line + `record-answer … kind:"recall"`. At completion → syllabus `caching-and-cdn` → `learned`.
6. Ask: another topic or finish? If finish → `finish-day study`. If continue → back to step 4 for the next topic (no `start-day`).

## Worked resume (mid-review, new session)

1. `read study` → `{day_status:"in-progress", step:"review", step_progress:{answered:6, total:10, items:[…10…]}}`.
2. `isNewDay` is false → do not start a new day. Step is a quiz with `answered < total`.
3. Resume at `items[6]`: re-display that exact question from the stored item (no regeneration), continue through `items[9]`. Each answer → daily line + `record-answer`. At `answered == 10`, advance to Learn.

No markdown was parsed and no question changed — the only thing consulted was `state.json`.

## Worked resume (mid-learn, new session)

1. `read study` → `{day_status:"in-progress", step:"learn", step_progress:{items:[{topic:"iam-and-identity"}]}}`.
2. `isNewDay` false; step is `learn` → resume the **same** topic `items[0].topic` — no re-pick, no re-suggest, **even if `syllabus.md` shows it `learned`**. Continue from `knowledge/iam-and-identity.md` (+ `## Next` if present). Only `state.json` was consulted.

## Worked resume (mid-recall — the learn→recall boundary)

1. User finished learning `iam-and-identity`; the Recall block ran `set-step study recall` (so `step:"recall"`), then the session was cleared during teach-back.
2. `read study` → `{step:"recall", step_progress:{answered:0, total:3, items:[{topic:"iam-and-identity", q_id:"…c01", …}]}}`.
3. Resume at `items[0]` of the **recall** — the right topic's quiz, NOT a new Learn. (Recall was persisted before teach-back, and the topic stays `learning` until the quiz completes, so nothing mis-routes to the next topic.)
