'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const scan = require('../scan.cjs');

const ENGINE = path.join(__dirname, '..', 'scan.cjs');

/** Make <parent>/<name>/study/state.json with the given JSON text. */
function makeCert(parent, name, text) {
  const studyDir = path.join(parent, name, 'study');
  fs.mkdirSync(studyDir, { recursive: true });
  fs.writeFileSync(path.join(studyDir, 'state.json'), text);
}

test('scanCerts on a missing parent dir returns []', () => {
  assert.deepStrictEqual(scan.scanCerts('/no/such/parent'), []);
});

test('scanCerts finds */study/state.json, skips non-cert + corrupt, sorts by project', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-scan-'));
  makeCert(parent, 'terraform', JSON.stringify({ exam: 'Terraform Associate', phase: 'study', day_status: 'done', updated_at: '2026-06-20T00:00:00.000Z' }));
  makeCert(parent, 'aws-saa', JSON.stringify({ exam: 'AWS SAA', phase: 'exam-prep', day_status: 'in-progress', updated_at: '2026-06-28T00:00:00.000Z' }));
  makeCert(parent, 'broken', '{ not json'); // corrupt -> skipped
  fs.mkdirSync(path.join(parent, 'not-a-cert'), { recursive: true }); // no study/ -> skipped
  fs.writeFileSync(path.join(parent, 'loose-file.txt'), 'x'); // not a dir -> skipped

  const got = scan.scanCerts(parent);
  assert.strictEqual(got.length, 2);
  assert.deepStrictEqual(got.map((c) => c.project), ['aws-saa', 'terraform']); // sorted
  assert.strictEqual(got[0].exam, 'AWS SAA');
  assert.strictEqual(got[0].phase, 'exam-prep');
  assert.strictEqual(got[0].studyDir, path.join(parent, 'aws-saa', 'study'));
  assert.strictEqual(got[1].project, 'terraform');
});

test('CLI: scan prints a JSON array for a parent dir', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-scan-cli-'));
  makeCert(parent, 'aws-saa', JSON.stringify({ exam: 'AWS SAA', phase: 'study', day_status: 'not-started', updated_at: '' }));
  const out = execFileSync('node', [ENGINE, parent], { encoding: 'utf8' });
  const arr = JSON.parse(out);
  assert.strictEqual(arr.length, 1);
  assert.strictEqual(arr[0].project, 'aws-saa');
});

test('CLI: scan of a missing parent prints []', () => {
  const out = execFileSync('node', [ENGINE, '/no/such/parent'], { encoding: 'utf8' });
  assert.deepStrictEqual(JSON.parse(out), []);
});
