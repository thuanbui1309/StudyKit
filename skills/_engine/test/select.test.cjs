'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const select = require('../select.cjs');

const asOf = '2026-06-28';
const baseOpts = { n: 10, seed: 1234, windowDays: 7, wrongFactor: 3, asOf };

const ENGINE = path.join(__dirname, '..', 'select.cjs');

test('parseLines skips blank and corrupt lines', () => {
  const raw =
    '{"topic":"vpc","date":"2026-06-28","correct":true}\n\n{ broken\n{"topic":"s3","date":"2026-06-28","correct":false}\n';
  const parsed = select.parseLines(raw);
  assert.strictEqual(parsed.length, 2);
  assert.deepStrictEqual(parsed.map((p) => p.topic), ['vpc', 's3']);
});

test('aggregateByTopic keeps the latest date + latest wrong flag, within window', () => {
  const lines = [
    { topic: 'vpc', date: '2026-06-25', correct: true },
    { topic: 'vpc', date: '2026-06-27', correct: false }, // newer attempt -> wrong wins
    { topic: 's3', date: '2026-06-10', correct: false }, // age 18 > window -> excluded
    { topic: 'iam', date: '2026-06-28', correct: true },
  ];
  const aggs = select
    .aggregateByTopic(lines, baseOpts)
    .sort((a, b) => a.topic.localeCompare(b.topic));
  assert.deepStrictEqual(aggs.map((a) => a.topic), ['iam', 'vpc']);
  const vpc = aggs.find((a) => a.topic === 'vpc');
  assert.strictEqual(vpc.lastSeen, '2026-06-27');
  assert.strictEqual(vpc.wrong, true);
});

test('computeWeight: older is heavier; a wrong latest attempt multiplies by wrongFactor', () => {
  const recent = { topic: 'a', lastSeen: '2026-06-27', wrong: false }; // age 1 -> 2
  const older = { topic: 'b', lastSeen: '2026-06-24', wrong: false }; // age 4 -> 5
  const wrong = { topic: 'c', lastSeen: '2026-06-27', wrong: true }; // age 1 -> 2*3 = 6
  assert.strictEqual(select.computeWeight(recent, baseOpts), 2);
  assert.strictEqual(select.computeWeight(older, baseOpts), 5);
  assert.strictEqual(select.computeWeight(wrong, baseOpts), 6);
  assert.ok(select.computeWeight(older, baseOpts) > select.computeWeight(recent, baseOpts));
  assert.ok(select.computeWeight(wrong, baseOpts) > select.computeWeight(recent, baseOpts));
});

test('selectTopics is deterministic for a fixed seed and yields distinct topics', () => {
  const lines = [
    { topic: 'vpc', date: '2026-06-27', correct: false },
    { topic: 's3', date: '2026-06-26', correct: true },
    { topic: 'iam', date: '2026-06-25', correct: false },
    { topic: 'ec2', date: '2026-06-24', correct: true },
    { topic: 'rds', date: '2026-06-23', correct: false },
  ];
  const a = select.selectTopics(lines, { ...baseOpts, n: 3 });
  const b = select.selectTopics(lines, { ...baseOpts, n: 3 });
  assert.deepStrictEqual(a, b);
  assert.strictEqual(a.length, 3);
  assert.strictEqual(new Set(a.map((t) => t.topic)).size, 3);
});

test('selectTopics returns fewer than n when the pool is smaller, all distinct', () => {
  const lines = [
    { topic: 'vpc', date: '2026-06-27', correct: false },
    { topic: 's3', date: '2026-06-26', correct: true },
  ];
  const got = select.selectTopics(lines, { ...baseOpts, n: 5 });
  assert.strictEqual(got.length, 2);
  assert.strictEqual(new Set(got.map((t) => t.topic)).size, 2);
});

test('empty pool and all-out-of-window pool both return []', () => {
  assert.deepStrictEqual(select.selectTopics([], baseOpts), []);
  const stale = [{ topic: 'vpc', date: '2026-01-01', correct: false }];
  assert.deepStrictEqual(select.selectTopics(stale, baseOpts), []);
});

test('when n covers the pool, membership is identical regardless of seed', () => {
  const lines = [
    { topic: 'vpc', date: '2026-06-27', correct: false },
    { topic: 's3', date: '2026-06-26', correct: true },
    { topic: 'iam', date: '2026-06-25', correct: false },
  ];
  const s1 = select.selectTopics(lines, { ...baseOpts, n: 3, seed: 1 }).map((t) => t.topic).sort();
  const s2 = select.selectTopics(lines, { ...baseOpts, n: 3, seed: 2 }).map((t) => t.topic).sort();
  assert.deepStrictEqual(s1, ['iam', 's3', 'vpc']);
  assert.deepStrictEqual(s2, ['iam', 's3', 'vpc']);
});

test('snake_case opts (window_days/wrong_factor/select_seed) are honored, not masked by defaults', () => {
  const lines = [
    { topic: 'recent', date: '2026-06-27', correct: true }, // age 1, in any window
    { topic: 'older', date: '2026-06-24', correct: true }, // age 4, only in the default 7-day window
  ];
  // A custom 2-day window (snake_case) must exclude the age-4 topic.
  const tight = select.selectTopics(lines, { n: 10, select_seed: 1234, window_days: 2, wrong_factor: 3, asOf });
  assert.deepStrictEqual(tight.map((t) => t.topic), ['recent']);
  // Same payload via the default window keeps both.
  const wide = select.selectTopics(lines, { n: 10, seed: 1234, asOf });
  assert.strictEqual(wide.length, 2);
});

// --- CLI wiring ---

test('CLI: reads a results file and prints a JSON topic array', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-sel-'));
  const rp = path.join(dir, 'results.jsonl');
  fs.writeFileSync(rp, '{"topic":"vpc","date":"2026-06-27","correct":false}\n');
  const out = execFileSync('node', [ENGINE, rp, JSON.stringify(baseOpts)], { encoding: 'utf8' });
  const arr = JSON.parse(out);
  assert.strictEqual(arr.length, 1);
  assert.strictEqual(arr[0].topic, 'vpc');
  assert.strictEqual(arr[0].wrong, true);
});

test('CLI: a missing results file yields []', () => {
  const out = execFileSync(
    'node',
    [ENGINE, '/no/such/results.jsonl', JSON.stringify(baseOpts)],
    { encoding: 'utf8' }
  );
  assert.deepStrictEqual(JSON.parse(out), []);
});
