#!/usr/bin/env node
'use strict';

/**
 * studykit — install CLI.
 *
 * `studykit init [targetDir]` copies the product skills (_engine, sk-init,
 * sk-learn) into <targetDir>/.claude/skills/. It refreshes skill files on
 * re-run (idempotent) and never creates or touches <targetDir>/study/ — that
 * workspace belongs to /sk:init.
 *
 * Works both from a git checkout (`node bin/studykit.cjs init <dir>`) and when
 * installed from npm (`npx studykit init <dir>`): skills/ is always a sibling
 * of this bin/ directory.
 *
 * Zero external dependencies; Node >= 18; CommonJS.
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const SKILLS_SRC = path.join(REPO_ROOT, 'skills');
const PRODUCT_SKILLS = ['_engine', 'sk-init', 'sk-learn'];

function version() {
  try {
    return require(path.join(REPO_ROOT, 'package.json')).version;
  } catch {
    return '0.0.0';
  }
}

/** Copy product skills into <target>/.claude/skills/, overwriting existing skill files. */
function install(targetDir) {
  const target = path.resolve(targetDir || '.');
  const destSkills = path.join(target, '.claude', 'skills');
  fs.mkdirSync(destSkills, { recursive: true });
  for (const name of PRODUCT_SKILLS) {
    const src = path.join(SKILLS_SRC, name);
    if (!fs.existsSync(src)) {
      throw new Error(`Missing source skill: ${src}. Is the StudyKit install corrupt?`);
    }
    fs.cpSync(src, path.join(destSkills, name), { recursive: true, force: true });
  }
  return { target, destSkills };
}

const HELP = `studykit ${version()}

Usage:
  studykit init [targetDir]   Install StudyKit skills into <targetDir>/.claude/skills/ (default: .)
  studykit --version
  studykit --help

After init, open the target project with Claude Code and run /sk:init to build a study workspace.
The CLI never creates or touches <targetDir>/study/ — that belongs to /sk:init.`;

function main(argv) {
  const cmd = argv[0];

  if (cmd === '--version' || cmd === '-v') {
    process.stdout.write(`${version()}\n`);
    return;
  }
  if (!cmd || cmd === '--help' || cmd === '-h') {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  if (cmd === 'init') {
    const { target, destSkills } = install(argv[1]);
    const note = fs.existsSync(path.join(target, 'study'))
      ? '\nNote: existing study/ left untouched.'
      : '';
    process.stdout.write(
      `Installed StudyKit skills (${PRODUCT_SKILLS.join(', ')}) into ${destSkills}${note}\n` +
        `Next: open ${target} in Claude Code and run /sk:init\n`
    );
    return;
  }

  process.stderr.write(`Unknown command: ${cmd}\n\n${HELP}\n`);
  process.exit(2);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`${e && e.message ? e.message : String(e)}\n`);
    process.exit(1);
  }
}

module.exports = { install, version, PRODUCT_SKILLS };
