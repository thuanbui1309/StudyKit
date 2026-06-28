'use strict';

/**
 * state.cjs — owner of the StudyKit state schema.
 *
 * Two layers:
 *   1. Pure helpers (exported) — used by tests and indirectly by skills.
 *   2. A thin CLI wrapper — the ONLY way skills mutate state.json. Skills never
 *      hand-edit state.json; they shell out to `node state.cjs <cmd> ...`.
 *
 * Zero external dependencies; Node >= 18; CommonJS.
 *
 * studyDir convention: callers pass the path to the `study/` directory itself
 * (skills run from the project root and pass `study`). state.json and
 * results.jsonl live directly inside it.
 */

const fs = require('node:fs');
const path = require('node:path');

const STATE_VERSION = 1;

// ---------------------------------------------------------------------------
// Pure helpers (deterministic, no disk I/O) — safe to unit test directly.
// ---------------------------------------------------------------------------

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Local-date 'YYYY-MM-DD'. Accepts an optional Date for testability. */
function today(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Parse 'YYYY-MM-DD' into numeric parts. */
function parseYMD(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return { y, m, d };
}

/**
 * Integer day count from `a` to `b` (both 'YYYY-MM-DD'); result = b - a.
 * Computed in UTC so it is immune to local timezone / DST drift.
 */
function daysBetween(a, b) {
  const pa = parseYMD(a);
  const pb = parseYMD(b);
  const ua = Date.UTC(pa.y, pa.m - 1, pa.d);
  const ub = Date.UTC(pb.y, pb.m - 1, pb.d);
  return Math.round((ub - ua) / 86400000);
}

/** True when the stored day differs from the actual local today. */
function isNewDay(state, now = new Date()) {
  return !state || state.today !== today(now);
}

/** Canonical empty state. `exam` is the only seed a caller must supply. */
function defaultState({ exam } = {}) {
  return {
    version: STATE_VERSION,
    exam: exam || '',
    phase: 'study', // init | study | exam-prep
    today: '',
    day_status: 'not-started', // not-started | in-progress | done
    // study phase: review | learn | recall | done
    // exam-prep phase: revise | mock | done  (plain strings; setStep accepts any)
    step: 'review',
    step_progress: { answered: 0, total: 0, items: [] },
    config: {
      review_quiz_size: 10,
      select_seed: 1234,
      window_days: 7,
      wrong_factor: 3,
      // exam-prep (additive; merged onto older states by normalizeState)
      mock_size: 65, // questions in a full mock exam
      pass_mark: 0.72, // mock pass threshold (fraction correct)
      switch_coverage: 0.8, // propose study->exam-prep at this pct_learned
      switch_days_before: 14, // ...or this many days before the target date
      // open-ended grading (additive)
      judge_pass_threshold: 0.7, // rubric overall >= this -> binary correct
    },
    updated_at: '',
  };
}

/**
 * Merge a (possibly partial) state object onto defaults so every persisted
 * state has the full shape. Provided fields win; config merges key-wise.
 * This is what prevents schema drift when a skill writes a partial state.
 */
function normalizeState(input) {
  const base = defaultState({ exam: input && input.exam });
  const merged = { ...base, ...input };
  merged.config = { ...base.config, ...((input && input.config) || {}) };
  merged.step_progress = { ...base.step_progress, ...((input && input.step_progress) || {}) };
  return merged;
}

// ---------------------------------------------------------------------------
// Disk paths
// ---------------------------------------------------------------------------

function stateFile(studyDir) {
  return path.join(studyDir, 'state.json');
}

function resultsFile(studyDir) {
  return path.join(studyDir, 'results.jsonl');
}

// ---------------------------------------------------------------------------
// State I/O
// ---------------------------------------------------------------------------

/** Read state, or `{ exists: false }` when absent. Corrupt JSON fails loud. */
function readState(studyDir) {
  const f = stateFile(studyDir);
  if (!fs.existsSync(f)) return { exists: false };
  const raw = fs.readFileSync(f, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    const err = new Error(
      `Corrupt state file at ${f}: ${e.message}. Refusing to reset — fix or remove it manually.`
    );
    err.code = 'CORRUPT_STATE';
    throw err;
  }
}

/** Read state that MUST exist; throws an actionable error otherwise. */
function requireState(studyDir) {
  const s = readState(studyDir);
  if (s && s.exists === false) {
    throw new Error(`No state at ${stateFile(studyDir)} — run /sk:init first.`);
  }
  return s;
}

/**
 * Atomically persist state: write to a .tmp sibling then rename (rename is
 * atomic on POSIX, so a crash never leaves a half-written state.json). Stamps
 * updated_at and validates the schema version.
 */
function writeState(studyDir, state) {
  if (state.version !== STATE_VERSION) {
    throw new Error(
      `State version mismatch: engine is v${STATE_VERSION}, state is v${state.version}.`
    );
  }
  state.updated_at = new Date().toISOString();
  const f = stateFile(studyDir);
  const tmp = `${f}.tmp`;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, f);
  return state;
}

// ---------------------------------------------------------------------------
// State transitions (CLI subcommands)
// ---------------------------------------------------------------------------

function startDay(studyDir) {
  const state = requireState(studyDir);
  state.today = today();
  state.day_status = 'in-progress';
  state.step = 'review';
  state.step_progress = { answered: 0, total: 0, items: [] };
  return writeState(studyDir, state);
}

/**
 * Begin a quiz block. `items` is the active quiz: [{ q_id, topic }, ...].
 * For non-quiz steps (e.g. learn) pass []. Stored in state.json so resume
 * reads the exact questions back — never re-selects, never parses markdown.
 */
function setStep(studyDir, step, items) {
  const state = requireState(studyDir);
  const list = Array.isArray(items) ? items : [];
  state.step = step;
  state.step_progress = { answered: 0, total: list.length, items: list };
  return writeState(studyDir, state);
}

/**
 * Record one answered question: append a complete line to results.jsonl, then
 * increment step_progress.answered. Single write path for every answer.
 *
 * Order is append-then-state: a crash in the (tiny) gap re-asks the last
 * question on resume, which appends a duplicate same-topic line — harmless,
 * since select.cjs aggregates by topic. The reverse order could silently drop
 * a result, so we prefer the idempotent failure mode.
 */
function recordAnswer(studyDir, resultLine) {
  const state = requireState(studyDir);
  fs.mkdirSync(studyDir, { recursive: true });
  fs.appendFileSync(resultsFile(studyDir), `${JSON.stringify(resultLine)}\n`, 'utf8');
  state.step_progress.answered = (state.step_progress.answered || 0) + 1;
  return writeState(studyDir, state);
}

/**
 * Append one result line WITHOUT touching step_progress. For OUT-OF-STEP
 * records — a standalone /sk:judge grade, or a Feynman teach-back judged
 * alongside (not as one of) the recall quiz items — so the active quiz cursor
 * is never corrupted. The engine still owns every results.jsonl write, so the
 * "results.jsonl written only by the engine" invariant holds; this is just the
 * append-only sibling of record-answer (which also advances the cursor).
 */
function appendResult(studyDir, resultLine) {
  const state = requireState(studyDir);
  fs.mkdirSync(studyDir, { recursive: true });
  fs.appendFileSync(resultsFile(studyDir), `${JSON.stringify(resultLine)}\n`, 'utf8');
  return state; // state unchanged; returned for CLI symmetry
}

function finishDay(studyDir) {
  const state = requireState(studyDir);
  state.day_status = 'done';
  state.step = 'done';
  return writeState(studyDir, state);
}

const PHASES = ['study', 'exam-prep'];

/**
 * Switch the study phase (study <-> exam-prep) and reset the day so the next
 * start-day opens the new phase's loop cleanly. Additive: no schema bump — the
 * phase field already exists; only the accepted set of phases is documented.
 *
 * Note the naming overlap: `studyDir` is the directory (conventionally `study`),
 * while `study` is also a phase value. `set-phase study study` means "in the
 * study/ dir, switch back to the study phase" — correct, if slightly redundant.
 */
function setPhase(studyDir, toPhase) {
  if (!PHASES.includes(toPhase)) {
    throw new Error(`Invalid phase "${toPhase}". Expected one of: ${PHASES.join(', ')}.`);
  }
  const state = requireState(studyDir);
  state.phase = toPhase;
  state.day_status = 'not-started';
  state.step = 'review';
  state.step_progress = { answered: 0, total: 0, items: [] };
  return writeState(studyDir, state);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE =
  'Usage: node state.cjs <read|write|start-day|set-step|record-answer|append-result|finish-day|set-phase> <studyDir> [args]';

function main(argv) {
  const [cmd, studyDir, ...rest] = argv;
  const emit = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);

  if (cmd && !studyDir) {
    process.stderr.write(`Missing <studyDir>.\n${USAGE}\n`);
    process.exit(2);
  }

  switch (cmd) {
    case 'read':
      emit(readState(studyDir));
      break;
    case 'write':
      emit(writeState(studyDir, normalizeState(JSON.parse(rest[0]))));
      break;
    case 'start-day':
      emit(startDay(studyDir));
      break;
    case 'set-step':
      emit(setStep(studyDir, rest[0], JSON.parse(rest[1] || '[]')));
      break;
    case 'record-answer':
      emit(recordAnswer(studyDir, JSON.parse(rest[0])));
      break;
    case 'append-result':
      emit(appendResult(studyDir, JSON.parse(rest[0])));
      break;
    case 'finish-day':
      emit(finishDay(studyDir));
      break;
    case 'set-phase':
      emit(setPhase(studyDir, rest[0]));
      break;
    default:
      process.stderr.write(`Unknown command: ${cmd}\n${USAGE}\n`);
      process.exit(2);
  }
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`${e && e.message ? e.message : String(e)}\n`);
    process.exit(1);
  }
}

module.exports = {
  STATE_VERSION,
  today,
  daysBetween,
  isNewDay,
  defaultState,
  normalizeState,
  stateFile,
  resultsFile,
  readState,
  requireState,
  writeState,
  startDay,
  setStep,
  recordAnswer,
  appendResult,
  finishDay,
  setPhase,
  PHASES,
};
