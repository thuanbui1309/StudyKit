# State schema migration template

`state.cjs` owns the StudyKit state schema. "Markdown is the human source of truth; `state.json` is resume law" — so a change to the schema can break resume for every existing study project. This doc is the decision rule and the recipe for both kinds of change.

The current schema is `STATE_VERSION = 1`. Everything shipped so far (stats, exam-prep config, `set-phase`, judge config) has been **additive** and did **not** bump it.

## First decide: additive or breaking?

Ask one question — **can an old `state.json` still be read correctly after the change?**

| Change | Kind | Version bump? |
|--------|------|---------------|
| Add a new `config` key (with a default) | additive | No |
| Add a new optional top-level field (with a default) | additive | No |
| Add a new `step` value (e.g. `revise`, `mock`) | additive | No (`setStep` accepts any string) |
| Add a new `kind` in `results.jsonl` (e.g. `judge`) | additive | No (this is the attempt log, not state) |
| Rename a field or `config` key | **breaking** | Yes |
| Remove a field, or change its type/meaning | **breaking** | Yes |
| Change an enum value an old state already stored | **breaking** | Yes |

Why additive is safe: `normalizeState` merges the persisted object onto `defaultState`, and merges `config`/`step_progress` key-wise. A field absent in an old state is filled from the default; a field present wins. So new keys "appear" on old states for free — proven by the `normalizeState backfills new exam-prep config onto an old-shape state` test.

## Recipe A — additive change (no bump)

1. Add the field/key to `defaultState()` with a sensible default.
2. If it lives in `config` or `step_progress`, you're done — `normalizeState` already merges it key-wise.
3. Add a test that an **old-shape** object (without the new key) round-trips through `normalizeState` with the default filled in.
4. Keep `STATE_VERSION` unchanged. Keep the baseline suite green.

That is the entire change. Do **not** bump the version for additive work — a bump would make `writeState` reject every existing v1 state (`version mismatch`).

## Recipe B — breaking change (bump + migrate)

Only when an old state can no longer be read correctly (rename / remove / retype).

1. **Bump** `STATE_VERSION` to `N+1`.
2. **Migrate on read.** Teach `normalizeState` (or a dedicated `migrate(old)` it calls) to detect `input.version < N+1` and transform the old shape into the new one — read-old → write-new. Map renamed fields, supply defaults for genuinely new required fields, drop removed ones.
3. **Stamp** the new version onto the migrated object before it reaches `writeState` (which enforces `state.version === STATE_VERSION`).
4. **Test both versions.** Add fixtures: a `vN` state migrates to `vN+1` with values mapped correctly, and a fresh `vN+1` state round-trips. Keep the old-version fixture checked in so the migration stays covered.
5. Migration must be **idempotent** — running it on an already-current state is a no-op.

### Sketch

```js
function migrate(input) {
  let s = input;
  if (s.version === 1) {
    s = { ...s, version: 2, /* rename/transform fields here */ };
  }
  // future: if (s.version === 2) { ...; s.version = 3; }
  return s;
}

function normalizeState(input) {
  const migrated = migrate(input || {});
  const base = defaultState({ exam: migrated.exam });
  const merged = { ...base, ...migrated };
  merged.config = { ...base.config, ...(migrated.config || {}) };
  merged.step_progress = { ...base.step_progress, ...(migrated.step_progress || {}) };
  return merged;
}
```

## Invariants to keep either way

- State is mutated **only** through `state.cjs`; skills never hand-edit `state.json`.
- `writeState` stays atomic (write `.tmp` → rename) and keeps validating the version.
- Resume reads `state.json` only — never parse markdown to recover state.
- A corrupt state still fails loud (never silently reset).
