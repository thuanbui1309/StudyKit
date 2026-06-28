'use strict';

/**
 * stats.cjs — zero-dep progress aggregator.
 *
 * Reads results.jsonl (the append-only attempt log) + syllabus.md (the
 * topic->domain->status table) and emits ONE structured aggregate JSON. The two
 * progress skills (sk:stats, sk:summary) shell out to this and render the
 * result; they never load raw results.jsonl themselves (token discipline).
 *
 * Mirrors select.cjs: pure functions + a thin CLI. Same (results, syllabus,
 * opts) -> same aggregate, every run (stable sort orders).
 *
 * Zero external dependencies; Node >= 18; CommonJS.
 */

const fs = require('node:fs');
const path = require('node:path');
const { today, daysBetween } = require('./state.cjs');
const { parseLines } = require('./select.cjs');

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

/** Round to 4 decimals so floats stay clean + deterministic across runs. */
function round4(x) {
  return Math.round((Number(x) || 0) * 10000) / 10000;
}

/** Safe ratio: numerator/denominator, 0 when the denominator is 0. */
function ratio(num, den) {
  return den > 0 ? round4(num / den) : 0;
}

/** Shift a 'YYYY-MM-DD' by `delta` whole days (UTC math, DST-immune). */
function shiftDate(ymd, delta) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + delta * 86400000);
  const p2 = (n) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${p2(dt.getUTCMonth() + 1)}-${p2(dt.getUTCDate())}`;
}

/** Canonical coverage bucket for a syllabus status. */
function bucketOf(status) {
  if (status === 'learned') return 'learned';
  if (status === 'learning') return 'learning';
  return 'not_started';
}

// ---------------------------------------------------------------------------
// syllabus.md parsing (the only new engine parsing responsibility)
// ---------------------------------------------------------------------------

/**
 * Tolerant reader for the `topic | domain | status | last_studied` table.
 * Skips the title, the header row, the `---` separator, and any malformed row.
 * Returns [{ topic, domain, status, last_studied }]. Never throws.
 */
function parseSyllabus(md) {
  const rows = [];
  for (const line of String(md).split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|')) continue; // only markdown table rows
    const cells = t.split('|').map((c) => c.trim());
    while (cells.length && cells[0] === '') cells.shift(); // drop edge empties from '| a |'
    while (cells.length && cells[cells.length - 1] === '') cells.pop();
    if (cells.length < 3) continue; // need at least topic, domain, status
    const [topic, domain, status, last_studied] = cells;
    if (!topic) continue;
    if (topic.toLowerCase() === 'topic') continue; // header row
    if (/^:?-+:?$/.test(topic)) continue; // separator row (---, :--:, etc.)
    rows.push({
      topic,
      domain: domain || 'unknown',
      status: status || 'not-started',
      last_studied: last_studied || '',
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/**
 * Build the full progress aggregate from attempt lines + syllabus rows.
 *
 * opts: { asOf?: 'YYYY-MM-DD', targetDate?: 'YYYY-MM-DD' }
 *   asOf       — "today" for recency math (defaults to local today).
 *   targetDate — when given, adds a `pace` block (raw numbers only).
 *
 * Off-syllabus attempt topics surface under domain "unknown" (never a crash).
 * Syllabus topics with zero attempts still appear (attempts 0) so coverage is
 * honest. See module header for determinism guarantees.
 */
function aggregate(resultLines, syllabusRows, opts) {
  const o = opts || {};
  const asOf = o.asOf || today();

  // --- syllabus index (topic -> {domain,status}) --------------------------
  const syl = new Map();
  for (const r of syllabusRows || []) syl.set(r.topic, r);

  // --- single pass over attempts -----------------------------------------
  const perTopic = new Map(); // topic -> { attempts, correct, lastSeen }
  const perDay = new Map(); // date  -> { attempts, correct, topics:Set }
  let totalAttempts = 0;
  let totalCorrect = 0;
  let firstActivity = null;
  let lastActivity = null;

  for (const ln of resultLines || []) {
    if (!ln || typeof ln.topic !== 'string' || typeof ln.date !== 'string') continue;
    const isCorrect = ln.correct === true;
    totalAttempts += 1;
    totalCorrect += isCorrect ? 1 : 0;
    if (firstActivity === null || ln.date < firstActivity) firstActivity = ln.date;
    if (lastActivity === null || ln.date > lastActivity) lastActivity = ln.date;

    const pt = perTopic.get(ln.topic) || { attempts: 0, correct: 0, lastSeen: null };
    pt.attempts += 1;
    pt.correct += isCorrect ? 1 : 0;
    if (pt.lastSeen === null || ln.date > pt.lastSeen) pt.lastSeen = ln.date;
    perTopic.set(ln.topic, pt);

    const pd = perDay.get(ln.date) || { attempts: 0, correct: 0, topics: new Set() };
    pd.attempts += 1;
    pd.correct += isCorrect ? 1 : 0;
    pd.topics.add(ln.topic);
    perDay.set(ln.date, pd);
  }

  // --- byTopic (union of syllabus topics + attempted topics) --------------
  const topicNames = new Set([...syl.keys(), ...perTopic.keys()]);
  const byTopic = [...topicNames]
    .sort()
    .map((topic) => {
      const row = syl.get(topic);
      const pt = perTopic.get(topic) || { attempts: 0, correct: 0, lastSeen: null };
      const days_since = pt.lastSeen != null ? daysBetween(pt.lastSeen, asOf) : null;
      return {
        topic,
        domain: row ? row.domain : 'unknown',
        status: row ? row.status : 'unknown',
        attempts: pt.attempts,
        correct: pt.correct,
        accuracy: ratio(pt.correct, pt.attempts),
        last_seen: pt.lastSeen,
        days_since,
      };
    });

  // --- coverage (from the syllabus only) ----------------------------------
  const coverage = { total: 0, learned: 0, learning: 0, not_started: 0, pct_learned: 0 };
  for (const r of syllabusRows || []) {
    coverage.total += 1;
    coverage[bucketOf(r.status)] += 1;
  }
  coverage.pct_learned = ratio(coverage.learned, coverage.total);

  // --- byDomain (rolled up from byTopic; syllabus order, unknown last) -----
  const domainOrder = [];
  const seenDomain = new Set();
  for (const r of syllabusRows || []) {
    if (!seenDomain.has(r.domain)) {
      seenDomain.add(r.domain);
      domainOrder.push(r.domain);
    }
  }
  for (const t of byTopic) {
    if (!seenDomain.has(t.domain)) {
      seenDomain.add(t.domain);
      domainOrder.push(t.domain);
    }
  }
  const byDomain = domainOrder.map((domain) => {
    const topics = byTopic.filter((t) => t.domain === domain);
    const attempts = topics.reduce((s, t) => s + t.attempts, 0);
    const correct = topics.reduce((s, t) => s + t.correct, 0);
    const learned = topics.filter((t) => bucketOf(t.status) === 'learned').length;
    const learning = topics.filter((t) => bucketOf(t.status) === 'learning').length;
    const not_started = topics.filter((t) => bucketOf(t.status) === 'not_started').length;
    return {
      domain,
      attempts,
      correct,
      accuracy: ratio(correct, attempts),
      topics_total: topics.length,
      learned,
      learning,
      not_started,
      coverage_pct: ratio(learned, topics.length),
    };
  });

  // --- byDay (chronological) ---------------------------------------------
  const byDay = [...perDay.keys()]
    .sort()
    .map((date) => {
      const pd = perDay.get(date);
      return {
        date,
        attempts: pd.attempts,
        correct: pd.correct,
        accuracy: ratio(pd.correct, pd.attempts),
        topics: [...pd.topics].sort(),
      };
    });

  // --- streak: consecutive active days ending at asOf ---------------------
  // Grace day: if asOf itself has no activity yet, anchor at asOf-1 so "haven't
  // studied today" doesn't read as a broken streak. Deterministic + documented.
  const activeDays = new Set(byDay.map((d) => d.date));
  let streak = 0;
  let cursor = activeDays.has(asOf) ? asOf : shiftDate(asOf, -1);
  while (activeDays.has(cursor)) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }

  const totals = {
    attempts: totalAttempts,
    correct: totalCorrect,
    accuracy: ratio(totalCorrect, totalAttempts),
    days_active: byDay.length,
    first_activity: firstActivity,
    last_activity: lastActivity,
    streak,
  };

  // --- wrongHeavy: attempted topics with >=1 wrong; worst accuracy first ---
  const wrongHeavy = byTopic
    .filter((t) => t.attempts > 0 && t.correct < t.attempts)
    .sort(
      (a, b) =>
        a.accuracy - b.accuracy || b.attempts - a.attempts || a.topic.localeCompare(b.topic)
    )
    .map((t) => ({ topic: t.topic, attempts: t.attempts, correct: t.correct, accuracy: t.accuracy }));

  // --- stale: studied topics (learned/learning) by days_since desc --------
  const stale = byTopic
    .filter(
      (t) =>
        t.last_seen != null && (bucketOf(t.status) === 'learned' || bucketOf(t.status) === 'learning')
    )
    .sort((a, b) => b.days_since - a.days_since || a.topic.localeCompare(b.topic))
    .map((t) => ({ topic: t.topic, last_seen: t.last_seen, days_since: t.days_since }));

  const out = { asOf, totals, coverage, byTopic, byDomain, byDay, wrongHeavy, stale };

  // --- pace (only when a target date is supplied) -------------------------
  if (o.targetDate) {
    const daysRemaining = daysBetween(asOf, o.targetDate);
    const topicsRemaining = coverage.total - coverage.learned;
    out.pace = {
      target_date: o.targetDate,
      days_remaining: daysRemaining,
      topics_remaining: topicsRemaining,
      required_per_day: daysRemaining > 0 ? round4(topicsRemaining / daysRemaining) : topicsRemaining,
    };
  }

  return out;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(argv) {
  const [studyDir, optsJson] = argv;
  if (!studyDir) {
    process.stderr.write("Usage: node stats.cjs <studyDir> '<optsJson>'\n");
    process.exit(2);
  }
  const opts = JSON.parse(optsJson || '{}');
  const resultsPath = path.join(studyDir, 'results.jsonl');
  const syllabusPath = path.join(studyDir, 'syllabus.md');
  const rawResults = fs.existsSync(resultsPath) ? fs.readFileSync(resultsPath, 'utf8') : '';
  const rawSyllabus = fs.existsSync(syllabusPath) ? fs.readFileSync(syllabusPath, 'utf8') : '';
  const agg = aggregate(parseLines(rawResults), parseSyllabus(rawSyllabus), opts);
  process.stdout.write(`${JSON.stringify(agg)}\n`);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`${e && e.message ? e.message : String(e)}\n`);
    process.exit(1);
  }
}

module.exports = { round4, ratio, shiftDate, bucketOf, parseSyllabus, aggregate };
