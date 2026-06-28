'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const stats = require('../stats.cjs');

const ENGINE = path.join(__dirname, '..', 'stats.cjs');
const asOf = '2026-06-28';

// --- syllabus parsing ------------------------------------------------------

test('parseSyllabus reads data rows, skips title/header/separator/malformed, defaults blanks', () => {
  const md = [
    '# Syllabus',
    '',
    '| topic | domain | status | last_studied |',
    '|-------|--------|--------|--------------|',
    '| iam | Security | learned | 2026-06-20 |',
    '| vpc | Security | learning | |',
    '| orphan |  | learning | |', // empty domain -> defaults to "unknown"
    '| s3 |', // too few cells -> skipped
    'not a table row', // no leading pipe -> skipped
  ].join('\n');
  assert.deepStrictEqual(stats.parseSyllabus(md), [
    { topic: 'iam', domain: 'Security', status: 'learned', last_studied: '2026-06-20' },
    { topic: 'vpc', domain: 'Security', status: 'learning', last_studied: '' },
    { topic: 'orphan', domain: 'unknown', status: 'learning', last_studied: '' },
  ]);
});

test('parseSyllabus on empty/garbage input returns []', () => {
  assert.deepStrictEqual(stats.parseSyllabus(''), []);
  assert.deepStrictEqual(stats.parseSyllabus('just prose, no table'), []);
});

// --- aggregate: empty project ---------------------------------------------

test('aggregate of an empty project is fully zeroed and has no pace', () => {
  const agg = stats.aggregate([], [], { asOf });
  assert.deepStrictEqual(agg, {
    asOf,
    totals: {
      attempts: 0,
      correct: 0,
      accuracy: 0,
      days_active: 0,
      first_activity: null,
      last_activity: null,
      streak: 0,
    },
    coverage: { total: 0, learned: 0, learning: 0, not_started: 0, pct_learned: 0 },
    byTopic: [],
    byDomain: [],
    byDay: [],
    wrongHeavy: [],
    stale: [],
  });
  assert.strictEqual(agg.pace, undefined);
});

// --- aggregate: a hand-checked fixture -------------------------------------

const FIX_LINES = [
  { date: '2026-06-26', topic: 'iam', kind: 'recall', correct: true, score: 1 },
  { date: '2026-06-26', topic: 'iam', kind: 'recall', correct: false, score: 0 },
  { date: '2026-06-27', topic: 'vpc', kind: 'review', correct: false, score: 0 },
  { date: '2026-06-28', topic: 'vpc', kind: 'recall', correct: true, score: 1 },
  { date: '2026-06-28', topic: 'ec2', kind: 'judge', correct: true, score: 1 }, // off-syllabus
];
const FIX_SYL = [
  { topic: 'iam', domain: 'Security', status: 'learned', last_studied: '2026-06-20' },
  { topic: 'vpc', domain: 'Security', status: 'learning', last_studied: '2026-06-25' },
  { topic: 's3', domain: 'Storage', status: 'not-started', last_studied: '' },
];

const EXPECTED = {
  asOf: '2026-06-28',
  totals: {
    attempts: 5,
    correct: 3,
    accuracy: 0.6,
    days_active: 3,
    first_activity: '2026-06-26',
    last_activity: '2026-06-28',
    streak: 3,
  },
  coverage: { total: 3, learned: 1, learning: 1, not_started: 1, pct_learned: 0.3333 },
  byTopic: [
    { topic: 'ec2', domain: 'unknown', status: 'unknown', attempts: 1, correct: 1, accuracy: 1, last_seen: '2026-06-28', days_since: 0 },
    { topic: 'iam', domain: 'Security', status: 'learned', attempts: 2, correct: 1, accuracy: 0.5, last_seen: '2026-06-26', days_since: 2 },
    { topic: 's3', domain: 'Storage', status: 'not-started', attempts: 0, correct: 0, accuracy: 0, last_seen: null, days_since: null },
    { topic: 'vpc', domain: 'Security', status: 'learning', attempts: 2, correct: 1, accuracy: 0.5, last_seen: '2026-06-28', days_since: 0 },
  ],
  byDomain: [
    { domain: 'Security', attempts: 4, correct: 2, accuracy: 0.5, topics_total: 2, learned: 1, learning: 1, not_started: 0, coverage_pct: 0.5 },
    { domain: 'Storage', attempts: 0, correct: 0, accuracy: 0, topics_total: 1, learned: 0, learning: 0, not_started: 1, coverage_pct: 0 },
    { domain: 'unknown', attempts: 1, correct: 1, accuracy: 1, topics_total: 1, learned: 0, learning: 0, not_started: 1, coverage_pct: 0 },
  ],
  byDay: [
    { date: '2026-06-26', attempts: 2, correct: 1, accuracy: 0.5, topics: ['iam'] },
    { date: '2026-06-27', attempts: 1, correct: 0, accuracy: 0, topics: ['vpc'] },
    { date: '2026-06-28', attempts: 2, correct: 2, accuracy: 1, topics: ['ec2', 'vpc'] },
  ],
  wrongHeavy: [
    { topic: 'iam', attempts: 2, correct: 1, accuracy: 0.5 },
    { topic: 'vpc', attempts: 2, correct: 1, accuracy: 0.5 },
  ],
  stale: [
    { topic: 'iam', last_seen: '2026-06-26', days_since: 2 },
    { topic: 'vpc', last_seen: '2026-06-28', days_since: 0 },
  ],
  pace: { target_date: '2026-09-01', days_remaining: 65, topics_remaining: 2, required_per_day: 0.0308 },
};

test('aggregate matches the hand-checked fixture (with pace)', () => {
  const agg = stats.aggregate(FIX_LINES, FIX_SYL, { asOf, targetDate: '2026-09-01' });
  assert.deepStrictEqual(agg, EXPECTED);
});

test('aggregate omits pace when no targetDate is given', () => {
  const agg = stats.aggregate(FIX_LINES, FIX_SYL, { asOf });
  const { pace, ...expectedNoPace } = EXPECTED;
  assert.deepStrictEqual(agg, expectedNoPace);
});

test('aggregate is deterministic: two runs are identical', () => {
  const a = stats.aggregate(FIX_LINES, FIX_SYL, { asOf, targetDate: '2026-09-01' });
  const b = stats.aggregate(FIX_LINES, FIX_SYL, { asOf, targetDate: '2026-09-01' });
  assert.deepStrictEqual(a, b);
});

test('streak grace day: today inactive but yesterday active still counts the run', () => {
  const lines = [
    { date: '2026-06-26', topic: 'iam', correct: true },
    { date: '2026-06-27', topic: 'vpc', correct: true },
  ];
  // asOf = 06-28 has no activity; streak anchors at 06-27 and counts back.
  const agg = stats.aggregate(lines, [], { asOf });
  assert.strictEqual(agg.totals.streak, 2);
});

test('a gap two days before asOf breaks the streak', () => {
  const lines = [
    { date: '2026-06-24', topic: 'iam', correct: true }, // isolated, before the gap
    { date: '2026-06-27', topic: 'vpc', correct: true },
    { date: '2026-06-28', topic: 'vpc', correct: true },
  ];
  const agg = stats.aggregate(lines, [], { asOf });
  assert.strictEqual(agg.totals.streak, 2); // 06-28, 06-27, then 06-26 missing -> stop
});

// --- CLI wiring ------------------------------------------------------------

test('CLI: reads results.jsonl + syllabus.md from a studyDir and prints the aggregate', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-stats-'));
  fs.writeFileSync(
    path.join(dir, 'results.jsonl'),
    FIX_LINES.map((l) => JSON.stringify(l)).join('\n') + '\n'
  );
  fs.writeFileSync(
    path.join(dir, 'syllabus.md'),
    [
      '# Syllabus',
      '| topic | domain | status | last_studied |',
      '|-------|--------|--------|--------------|',
      '| iam | Security | learned | 2026-06-20 |',
      '| vpc | Security | learning | 2026-06-25 |',
      '| s3 | Storage | not-started | |',
    ].join('\n') + '\n'
  );
  const out = execFileSync('node', [ENGINE, dir, JSON.stringify({ asOf, targetDate: '2026-09-01' })], {
    encoding: 'utf8',
  });
  assert.deepStrictEqual(JSON.parse(out), EXPECTED);
});

test('CLI: a studyDir with no files yields a zeroed aggregate and exits 0', () => {
  const out = execFileSync('node', [ENGINE, '/no/such/study/dir', JSON.stringify({ asOf })], {
    encoding: 'utf8',
  });
  const agg = JSON.parse(out);
  assert.strictEqual(agg.totals.attempts, 0);
  assert.strictEqual(agg.coverage.total, 0);
  assert.deepStrictEqual(agg.byTopic, []);
});
