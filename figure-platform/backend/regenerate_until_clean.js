#!/usr/bin/env node
/**
 * regenerate_until_clean.js — keep regenerating a set of figures until every
 * one of them has a cleanly finished record, or until it is provable that more
 * attempts will not help.
 *
 * Why a loop rather than a bigger --concurrency: a figure that fails leaves
 * either no record at all or a record whose final attempt is status=error, and
 * both count as "not done" only after the degraded record is moved aside. Each
 * round therefore quarantines what failed, recomputes what is outstanding from
 * disk, and runs that set again. Resume stays derived from state, so a round
 * interrupted halfway simply becomes the next round's input.
 *
 * Escalation: the subscription path (claude-opus-5-cc) ignores maxTokens —
 * Claude Code picks its own budget — so figures that fail by exhausting their
 * output budget fail there deterministically no matter how often they are
 * retried. After SUBSCRIPTION_ROUNDS the loop switches to the API model, whose
 * budget is controlled by FIGURE_GEN_MAX_TOKENS on the server. Without that
 * switch "retry until clean" would spin forever on exactly those figures.
 *
 * Rate limits are the one thing worth waiting on rather than retrying through:
 * a subscription window that has closed will reject every call until it resets,
 * so a round whose failures are predominantly 429s does not count as a round and
 * the loop sleeps instead.
 *
 * Usage:
 *   node regenerate_until_clean.js --ids-file _degraded_ids.txt
 *   node regenerate_until_clean.js --ids-file x.txt --primary claude-opus-5-cc \
 *        --fallback claude-opus-5 --subscription-rounds 2 --max-rounds 6
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const RESULTS_DIR = path.join(__dirname, 'context_export_results');

function parseArgs(argv) {
  const o = {
    experiment: 'full-pipeline-claude-opus-5_FINAL',
    idsFile: '_degraded_ids.txt',
    primary: 'claude-opus-5-cc',
    fallback: 'claude-opus-5',
    subscriptionRounds: 2,
    maxRounds: 6,
    concurrency: 0,          // 0 → everything at once
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--experiment') o.experiment = argv[++i];
    else if (a === '--ids-file') o.idsFile = argv[++i];
    else if (a === '--primary') o.primary = argv[++i];
    else if (a === '--fallback') o.fallback = argv[++i];
    else if (a === '--subscription-rounds') o.subscriptionRounds = Number(argv[++i]) || 0;
    else if (a === '--max-rounds') o.maxRounds = Number(argv[++i]) || 6;
    else if (a === '--concurrency') o.concurrency = Number(argv[++i]) || 0;
  }
  return o;
}

const normalizeId = (id) => String(id || '').replace(/\./g, '_');
const stamp = () => new Date().toISOString().slice(11, 19);

/** Figures with a record whose final attempt did NOT end in an error. */
function cleanlyDone(experiment) {
  const done = new Set();
  for (const file of fs.readdirSync(RESULTS_DIR)) {
    if (!file.endsWith('.json')) continue;
    let record;
    try { record = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, file), 'utf-8')); } catch { continue; }
    if (record.experiment !== experiment || !record.contextExportId) continue;
    const attempts = record.attempts || [];
    const last = attempts[attempts.length - 1] || {};
    if (last.status === 'error') continue;
    done.add(normalizeId(record.contextExportId));
  }
  return done;
}

function run(cmd, args, onLine) {
  return new Promise((resolve) => {
    // No shell. process.execPath is "C:\Program Files\nodejs\node.exe" on this
    // machine, and shell:true concatenates argv without quoting, so cmd.exe saw
    // "C:\Program" as the command and every round died instantly. Three rounds
    // reported "outstanding 24 -> 24" having never started a single job.
    const child = spawn(cmd, args, { cwd: __dirname });
    let buf = '';
    const feed = (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).replace(/\r$/, '');
        buf = buf.slice(nl + 1);
        if (onLine) onLine(line);
      }
    };
    child.stdout.on('data', d => feed(String(d)));
    child.stderr.on('data', d => feed(String(d)));
    child.on('error', err => { if (onLine) onLine('SPAWN FAILED: ' + err.message); });
    child.on('close', code => resolve(code));
  });
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const targets = fs.readFileSync(path.join(__dirname, o.idsFile), 'utf-8')
    .split(',').map(s => s.trim()).filter(Boolean);

  console.log(`target figures: ${targets.length}   experiment: ${o.experiment}`);
  console.log(`primary=${o.primary} for ${o.subscriptionRounds} round(s), then fallback=${o.fallback}`);
  console.log('');

  let round = 0;
  let previousOutstanding = Infinity;

  while (round < o.maxRounds) {
    // Move aside anything that failed, so it reads as outstanding again.
    await run(process.execPath, ['quarantine_degraded.js', '--apply', '--experiment', o.experiment], () => {});

    const done = cleanlyDone(o.experiment);
    const outstanding = targets.filter(id => !done.has(normalizeId(id)));

    if (!outstanding.length) {
      console.log(`[${stamp()}] ALL CLEAN — ${targets.length}/${targets.length} figures have a non-error record.`);
      return;
    }

    round += 1;
    const model = round <= o.subscriptionRounds ? o.primary : o.fallback;
    const concurrency = o.concurrency > 0 ? o.concurrency : outstanding.length;

    console.log(`[${stamp()}] ── round ${round}/${o.maxRounds}  model=${model}  outstanding=${outstanding.length}  concurrency=${concurrency}`);

    let rateLimited = 0, failures = 0;
    const tail = [];
    const args = [
      'batch_context_exports.js',
      '--model', model,
      '--experiment', o.experiment,
      '--concurrency', String(concurrency),
      '--ids', outstanding.join(','),
    ];
    const code = await run(process.execPath, args, (line) => {
      tail.push(line); if (tail.length > 25) tail.shift();
      if (/✓|✗|succeeded in|outstanding|Nothing to do/.test(line)) console.log('   ' + line);
      if (/✗/.test(line)) {
        failures += 1;
        if (/\b429\b|rate.?limit/i.test(line)) rateLimited += 1;
      }
    });

    // A round that starts no jobs is a broken driver, not a set of hard figures.
    // Say so loudly: three rounds already reported "outstanding 24 → 24" while
    // the child was dying on its own command line and printing nothing that
    // matched the filter above.
    if (code !== 0) {
      console.log(`[${stamp()}] batch exited ${code}; last output:`);
      for (const l of tail) console.log('   | ' + l);
    }

    // A closed subscription window rejects everything until it resets. Waiting
    // is the only thing that helps, and this round should not count against the
    // round budget or the no-progress check.
    if (failures && rateLimited / failures > 0.5) {
      round -= 1;
      const waitMs = 15 * 60 * 1000;
      console.log(`[${stamp()}] rate limited on ${rateLimited}/${failures} failures — waiting ${waitMs / 60000} min, round not counted`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    const stillOutstanding = targets.filter(id => !cleanlyDone(o.experiment).has(normalizeId(id))).length;
    console.log(`[${stamp()}] round ${round} end — outstanding ${outstanding.length} → ${stillOutstanding}`);

    if (stillOutstanding === 0) {
      console.log(`[${stamp()}] ALL CLEAN — ${targets.length}/${targets.length}.`);
      return;
    }
    // No progress on the fallback model means more rounds will not help.
    if (stillOutstanding >= previousOutstanding && model === o.fallback) {
      console.log(`[${stamp()}] no progress on ${model}; stopping rather than looping.`);
      break;
    }
    previousOutstanding = stillOutstanding;
  }

  const remaining = targets.filter(id => !cleanlyDone(o.experiment).has(normalizeId(id)));
  console.log(`\nstopped with ${remaining.length} figure(s) still not clean:`);
  console.log('  ' + remaining.join(', '));
  process.exitCode = remaining.length ? 1 : 0;
}

main().catch(err => { console.error('FAIL', err.message); process.exit(1); });
