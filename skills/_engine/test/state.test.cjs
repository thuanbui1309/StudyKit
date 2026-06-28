'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const state = require('../state.cjs');

const ENGINE = path.join(__dirname, '..', 'state.cjs');

/** Fresh, isolated `study/` dir under the OS temp root. */
function tmpStudy() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sk-state-')), 'study');
}

function seed(dir, extra = {}) {
  return state.writeState(dir, state.normalizeState({ exam: 'X', ...extra }));
}

// --- pure date helpers ---

test('today() formats local YYYY-MM-DD (zero-padded)', () => {
  assert.strictEqual(state.today(new Date(2026, 5, 8)), '2026-06-08');
  assert.match(state.today(), /^\d{4}-\d{2}-\d{2}$/);
});

test('daysBetween is (b - a) and tz-safe across a month boundary', () => {
  assert.strictEqual(state.daysBetween('2026-06-28', '2026-06-28'), 0);
  assert.strictEqual(state.daysBetween('2026-06-27', '2026-06-28'), 1);
  assert.strictEqual(state.daysBetween('2026-06-28', '2026-06-27'), -1);
  assert.strictEqual(state.daysBetween('2026-05-31', '2026-06-01'), 1);
  assert.strictEqual(state.daysBetween('2026-06-01', '2026-06-08'), 7);
});

test('isNewDay compares stored today to actual today', () => {
  const now = new Date(2026, 5, 28);
  assert.strictEqual(state.isNewDay({ today: '2026-06-28' }, now), false);
  assert.strictEqual(state.isNewDay({ today: '2026-06-27' }, now), true);
  assert.strictEqual(state.isNewDay({ today: '' }, now), true);
});

// --- schema helpers ---

test('defaultState has the full canonical shape', () => {
  const s = state.defaultState({ exam: 'AWS SAA' });
  assert.strictEqual(s.version, state.STATE_VERSION);
  assert.strictEqual(s.exam, 'AWS SAA');
  assert.strictEqual(s.phase, 'study');
  assert.strictEqual(s.day_status, 'not-started');
  assert.deepStrictEqual(s.step_progress, { answered: 0, total: 0, items: [] });
  assert.strictEqual(s.config.window_days, 7);
  assert.strictEqual(s.config.wrong_factor, 3);
});

test('normalizeState fills missing fields and merges config key-wise', () => {
  const s = state.normalizeState({ exam: 'X', config: { review_quiz_size: 20 } });
  assert.strictEqual(s.version, 1);
  assert.strictEqual(s.config.review_quiz_size, 20); // provided wins
  assert.strictEqual(s.config.window_days, 7); // default preserved
  assert.deepStrictEqual(s.step_progress, { answered: 0, total: 0, items: [] });
});

test('normalizeState merges a partial step_progress onto the full shape', () => {
  const s = state.normalizeState({ exam: 'X', step_progress: { answered: 2 } });
  assert.strictEqual(s.step_progress.answered, 2); // provided wins
  assert.strictEqual(s.step_progress.total, 0); // default preserved
  assert.deepStrictEqual(s.step_progress.items, []); // default preserved
});

// --- disk I/O ---

test('write then read round-trips, stamps updated_at, leaves no .tmp', () => {
  const dir = tmpStudy();
  const written = seed(dir);
  assert.ok(written.updated_at, 'updated_at stamped');
  const read = state.readState(dir);
  assert.strictEqual(read.exam, 'X');
  assert.strictEqual(read.version, 1);
  assert.ok(!fs.existsSync(`${state.stateFile(dir)}.tmp`), 'no leftover tmp file');
});

test('read on a missing file returns {exists:false}', () => {
  assert.deepStrictEqual(state.readState(tmpStudy()), { exists: false });
});

test('a corrupt state file fails loud (never silently resets)', () => {
  const dir = tmpStudy();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(state.stateFile(dir), '{ not json', 'utf8');
  assert.throws(() => state.readState(dir), /Corrupt state file/);
});

test('writeState rejects a mismatched schema version', () => {
  assert.throws(() => state.writeState(tmpStudy(), { version: 99 }), /version mismatch/i);
});

// --- transitions ---

test('start-day sets review step + zeroed progress + today', () => {
  const dir = tmpStudy();
  seed(dir);
  const s = state.startDay(dir);
  assert.strictEqual(s.day_status, 'in-progress');
  assert.strictEqual(s.step, 'review');
  assert.deepStrictEqual(s.step_progress, { answered: 0, total: 0, items: [] });
  assert.strictEqual(s.today, state.today());
});

test('set-step stores the active quiz items in state.json', () => {
  const dir = tmpStudy();
  seed(dir);
  const items = [
    { q_id: 'd1-r01', topic: 'vpc' },
    { q_id: 'd1-r02', topic: 's3' },
  ];
  const s = state.setStep(dir, 'review', items);
  assert.strictEqual(s.step, 'review');
  assert.strictEqual(s.step_progress.total, 2);
  assert.strictEqual(s.step_progress.answered, 0);
  assert.deepStrictEqual(s.step_progress.items, items);
});

test('set-step learn with [] stores no items', () => {
  const dir = tmpStudy();
  seed(dir);
  const s = state.setStep(dir, 'learn', []);
  assert.strictEqual(s.step, 'learn');
  assert.strictEqual(s.step_progress.total, 0);
  assert.deepStrictEqual(s.step_progress.items, []);
});

test('record-answer appends exactly one line and increments answered', () => {
  const dir = tmpStudy();
  seed(dir);
  state.setStep(dir, 'review', [
    { q_id: 'q1', topic: 'vpc' },
    { q_id: 'q2', topic: 's3' },
  ]);
  const line1 = { date: '2026-06-28', topic: 'vpc', kind: 'review', q_id: 'q1', correct: false, score: 0 };
  const s1 = state.recordAnswer(dir, line1);
  assert.strictEqual(s1.step_progress.answered, 1);
  const s2 = state.recordAnswer(dir, { date: '2026-06-28', topic: 's3', kind: 'review', q_id: 'q2', correct: true, score: 1 });
  assert.strictEqual(s2.step_progress.answered, 2);
  const lines = fs.readFileSync(state.resultsFile(dir), 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 2);
  assert.deepStrictEqual(JSON.parse(lines[0]), line1);
});

test('finish-day marks the day done', () => {
  const dir = tmpStudy();
  seed(dir);
  const s = state.finishDay(dir);
  assert.strictEqual(s.day_status, 'done');
  assert.strictEqual(s.step, 'done');
});

// --- CLI wiring (skills shell out to these) ---

test('CLI: read missing -> {exists:false}; write then read round-trips', () => {
  const dir = tmpStudy();
  const out1 = execFileSync('node', [ENGINE, 'read', dir], { encoding: 'utf8' });
  assert.deepStrictEqual(JSON.parse(out1), { exists: false });
  execFileSync('node', [ENGINE, 'write', dir, JSON.stringify({ version: 1, exam: 'CLI' })], { encoding: 'utf8' });
  const out2 = execFileSync('node', [ENGINE, 'read', dir], { encoding: 'utf8' });
  assert.strictEqual(JSON.parse(out2).exam, 'CLI');
});

test('CLI: record-answer appends + increments through stdout state', () => {
  const dir = tmpStudy();
  execFileSync('node', [ENGINE, 'write', dir, JSON.stringify({ version: 1, exam: 'CLI' })], { encoding: 'utf8' });
  const out = execFileSync(
    'node',
    [ENGINE, 'record-answer', dir, JSON.stringify({ date: '2026-06-28', topic: 'vpc', kind: 'review', q_id: 'q1', correct: true, score: 1 })],
    { encoding: 'utf8' }
  );
  assert.strictEqual(JSON.parse(out).step_progress.answered, 1);
  assert.strictEqual(fs.readFileSync(state.resultsFile(dir), 'utf8').trim().split('\n').length, 1);
});
