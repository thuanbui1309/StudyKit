'use strict';

/**
 * select.cjs — deterministic, topic-level spaced-repetition selector.
 *
 * Reads results.jsonl (append-only attempt log), aggregates BY TOPIC within a
 * recency window, weights each topic by how long ago it was last seen and
 * whether the latest attempt was wrong, then draws a seeded weighted sample
 * WITHOUT replacement. Same (seed, results, asOf) -> same topics, every run.
 *
 * It selects TOPICS, not questions: sk:learn generates one fresh question per
 * selected topic (there is no question bank).
 *
 * Zero external dependencies; Node >= 18; CommonJS.
 */

const fs = require('node:fs');
const { today, daysBetween } = require('./state.cjs');

// ---------------------------------------------------------------------------
// Seeded PRNG — mulberry32: tiny, fast, deterministic for a 32-bit seed.
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

function withDefaults(opts) {
  const o = opts || {};
  // Accept either the documented camelCase keys or the snake_case keys that
  // live in state.config (window_days, wrong_factor, select_seed) — so a skill
  // that forwards config verbatim can't silently fall back to defaults.
  const pick = (camel, snake, dflt) => {
    if (o[camel] != null) return o[camel];
    if (o[snake] != null) return o[snake];
    return dflt;
  };
  return {
    n: o.n,
    seed: pick('seed', 'select_seed', 0) >>> 0,
    windowDays: pick('windowDays', 'window_days', 7),
    wrongFactor: pick('wrongFactor', 'wrong_factor', 3),
    asOf: o.asOf || o.as_of || today(),
  };
}

/** Parse jsonl text into objects, skipping blank and corrupt lines. */
function parseLines(raw) {
  const out = [];
  for (const line of String(raw).split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      // Skip unparsable line (e.g. partial append) — never crash selection.
    }
  }
  return out;
}

/**
 * Collapse attempt lines to one record per topic within [asOf - windowDays, asOf]:
 *   { topic, lastSeen, wrong }
 * `lastSeen` is the most recent in-window date; `wrong` reflects that latest
 * attempt. File order is chronological, so a same-or-newer line wins ties.
 */
function aggregateByTopic(lines, opts) {
  const { asOf, windowDays } = opts;
  const byTopic = new Map();
  for (const ln of lines) {
    if (!ln || typeof ln.topic !== 'string' || typeof ln.date !== 'string') continue;
    const age = daysBetween(ln.date, asOf); // asOf - date
    if (age < 0 || age > windowDays) continue; // future, or older than the window
    const prev = byTopic.get(ln.topic);
    if (!prev || ln.date >= prev.lastSeen) {
      byTopic.set(ln.topic, {
        topic: ln.topic,
        lastSeen: ln.date,
        wrong: ln.correct === false,
      });
    }
  }
  return [...byTopic.values()];
}

/**
 * Selection weight for a topic. Older-within-window = heavier; a wrong latest
 * attempt multiplies by wrongFactor.
 *
 * recency = age + 1 (not raw age): the +1 keeps every in-window topic at weight
 * >= 1 so a topic last seen today still carries its wrong-answer multiplier and
 * the sampler never faces an all-zero pool. Monotonic in age, so "older heavier"
 * still holds. (Deviation from the plan's literal `age x factor`, which would
 * zero out same-day topics.)
 */
function computeWeight(agg, opts) {
  const { asOf, wrongFactor } = opts;
  const recency = daysBetween(agg.lastSeen, asOf) + 1;
  return recency * (agg.wrong ? wrongFactor : 1);
}

/** Seeded weighted draw without replacement; returns up to n distinct items. */
function weightedSampleWithoutReplacement(items, weights, n, rng) {
  const pool = items.map((it, i) => ({ it, w: weights[i] }));
  const picked = [];
  const count = Math.min(n, pool.length);
  for (let k = 0; k < count; k++) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    if (total <= 0) break; // no weight left to distribute
    let r = rng() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      r -= pool[idx].w;
      if (r <= 0) break;
    }
    if (idx >= pool.length) idx = pool.length - 1; // floating-point guard
    picked.push(pool[idx].it);
    pool.splice(idx, 1);
  }
  return picked;
}

/**
 * Select up to `n` distinct topics to resurface. Deterministic given
 * (opts.seed, lines, opts.asOf). Empty/whitespace pool -> [].
 */
function selectTopics(lines, opts) {
  const o = withDefaults(opts);
  const aggs = aggregateByTopic(lines, o);
  if (aggs.length === 0) return [];
  const weights = aggs.map((a) => computeWeight(a, o));
  const rng = mulberry32(o.seed);
  return weightedSampleWithoutReplacement(aggs, weights, o.n, rng).map((a) => ({
    topic: a.topic,
    lastSeen: a.lastSeen,
    wrong: a.wrong,
  }));
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(argv) {
  const [resultsPath, optsJson] = argv;
  if (!resultsPath) {
    process.stderr.write("Usage: node select.cjs <resultsPath> '<optsJson>'\n");
    process.exit(2);
  }
  const opts = JSON.parse(optsJson || '{}');
  const raw = fs.existsSync(resultsPath) ? fs.readFileSync(resultsPath, 'utf8') : '';
  const selected = selectTopics(parseLines(raw), opts);
  process.stdout.write(`${JSON.stringify(selected)}\n`);
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
  mulberry32,
  parseLines,
  aggregateByTopic,
  computeWeight,
  weightedSampleWithoutReplacement,
  selectTopics,
};
