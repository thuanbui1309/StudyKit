'use strict';

/**
 * scan.cjs — read-only enumerator for multi-cert overview.
 *
 * Given a parent directory that holds sibling study projects
 * (~/study/aws-saa/, ~/study/terraform/, ...), find each child whose
 * `study/state.json` exists and return a small per-cert summary read from that
 * state. sk:certs shells out to this so the overview stays token-bounded and
 * the enumeration stays testable. Read-only: it never mutates any cert.
 *
 * Zero external dependencies; Node >= 18; CommonJS.
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * Scan immediate children of `parentDir`, and for each child that has a
 * `study/state.json`, return
 * [{ project, studyDir, exam, phase, day_status, updated_at }], sorted by
 * project name. A missing/unreadable parent yields []; a corrupt cert state is
 * skipped (never throws). The studyDir path lets the caller run stats.cjs per
 * cert for richer metrics without this file reading results.jsonl.
 */
function scanCerts(parentDir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(parentDir, { withFileTypes: true });
  } catch {
    return out; // parent missing/unreadable
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const studyDir = path.join(parentDir, ent.name, 'study');
    const stateFile = path.join(studyDir, 'state.json');
    if (!fs.existsSync(stateFile)) continue;
    let st;
    try {
      st = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    } catch {
      continue; // skip a corrupt/unreadable cert rather than failing the whole scan
    }
    out.push({
      project: ent.name,
      studyDir,
      exam: st.exam || '',
      phase: st.phase || '',
      day_status: st.day_status || '',
      updated_at: st.updated_at || '',
    });
  }
  out.sort((a, b) => a.project.localeCompare(b.project));
  return out;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(argv) {
  const parentDir = argv[0] || '.';
  process.stdout.write(`${JSON.stringify(scanCerts(parentDir))}\n`);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`${e && e.message ? e.message : String(e)}\n`);
    process.exit(1);
  }
}

module.exports = { scanCerts };
