#!/usr/bin/env node
/**
 * dedupe_context_export_results.js — leave exactly one record per figure.
 *
 * Several figures ended up with more than one record for the same experiment:
 *
 *   - completedIds() used to compare raw ids, so a figure stored as "14_3_10"
 *     was not recognised when the driver asked for "14.3.10" and got regenerated.
 *   - A validation wave on the claude-opus-5-cc (Claude Code subscription)
 *     provider had its driver interrupted, but /api/context-export-generate-async
 *     had already accepted the jobs and the server finished them regardless.
 *
 * Nothing was overwritten — every run wrote its own record and HTML under its
 * own job id — so the duplicates are all still on disk and a consumer that takes
 * the newest record per figure silently picks the wrong one in two ways: it can
 * pick a subscription-path run, and it can pick a re-run that iterated fewer
 * times than the original.
 *
 * Selection is therefore by quality, not recency:
 *   1. API path beats the claude-opus-5-cc subscription path (different system
 *      prompt overhead and no max_tokens cap — not comparable to the rest).
 *   2. More attempts beats fewer (3 attempts is a fully iterated figure).
 *   3. Longer HTML beats shorter, as a proxy for a more developed figure.
 *   4. Newer beats older, purely to make the choice deterministic.
 *
 * Losers are MOVED, never deleted, so a wrong call here is reversible.
 *
 * Usage:
 *   node dedupe_context_export_results.js                 # dry run (default)
 *   node dedupe_context_export_results.js --apply
 *   node dedupe_context_export_results.js --experiment NAME
 */
const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, 'context_export_results');
const HTML_ROOT = path.join(__dirname, 'context_export_html');
const QUARANTINE = '_duplicates';

function parseArgs(argv) {
  const options = { experiment: 'full-pipeline-claude-opus-5_FINAL', apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--apply') options.apply = true;
    else if (argv[i] === '--experiment') options.experiment = argv[++i];
  }
  return options;
}

// "14.3.10" and "14_3_10" address the same figure.
const normalizeId = (id) => String(id || '').replace(/\./g, '_');

/** jobId -> the set of model ids that job actually called, read from the llm logs. */
function modelsByJob(experiment) {
  const dir = path.join(__dirname, 'context_export_llm_logs', experiment);
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.jsonl')) continue;
    const jobId = file.replace(/\.jsonl$/, '').split('__').pop();
    const models = new Set();
    for (const line of fs.readFileSync(path.join(dir, file), 'utf-8').trim().split(/\r?\n/)) {
      if (!line) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.modelId) models.add(entry.modelId);
      } catch { /* skip malformed line */ }
    }
    out[jobId] = [...models];
  }
  return out;
}

function loadRecords(experiment) {
  const byFigure = new Map();
  const jobModels = modelsByJob(experiment);
  for (const file of fs.readdirSync(RESULTS_DIR)) {
    if (!file.endsWith('.json')) continue;
    let record;
    try {
      record = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, file), 'utf-8'));
    } catch { continue; }
    if (record.experiment !== experiment || !record.contextExportId) continue;
    const models = jobModels[record.id] || [];
    const key = normalizeId(record.contextExportId);
    if (!byFigure.has(key)) byFigure.set(key, []);
    byFigure.get(key).push({
      file,
      id: record.id,
      figure: record.contextExportId,
      timestamp: String(record.timestamp || record.generationStartedAt || ''),
      attempts: (record.attempts || []).length,
      htmlChars: (record.html || '').length,
      htmlFile: record.standaloneHtmlPath ? path.basename(record.standaloneHtmlPath) : null,
      isSubscription: models.some(m => /-cc$/.test(m)),
      models: models.join(',') || '?',
    });
  }
  return byFigure;
}

/** Highest quality first; see the header for why recency is only a tiebreak. */
function rank(a, b) {
  if (a.isSubscription !== b.isSubscription) return a.isSubscription ? 1 : -1;
  if (a.attempts !== b.attempts) return b.attempts - a.attempts;
  if (a.htmlChars !== b.htmlChars) return b.htmlChars - a.htmlChars;
  return b.timestamp.localeCompare(a.timestamp);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const byFigure = loadRecords(options.experiment);
  const duplicated = [...byFigure.entries()].filter(([, runs]) => runs.length > 1);

  console.log(`experiment: ${options.experiment}`);
  console.log(`figures with records: ${byFigure.size}`);
  console.log(`figures with duplicates: ${duplicated.length}`);
  if (!duplicated.length) { console.log('Nothing to do.'); return; }

  const losers = [];
  for (const [key, runs] of duplicated) {
    const sorted = [...runs].sort(rank);
    const [keep, ...drop] = sorted;
    console.log(`\n${key}`);
    const why = (r) => `att=${r.attempts} chars=${r.htmlChars} ${r.isSubscription ? 'SUBSCRIPTION' : 'api'} ${r.timestamp.slice(0, 19)}`;
    console.log(`   KEEP  ${keep.id}  ${why(keep)}`);
    for (const r of drop) {
      console.log(`   move  ${r.id}  ${why(r)}`);
      losers.push(r);
    }
  }

  console.log(`\n${losers.length} record(s) to quarantine, ${duplicated.length} figure(s) reduced to one each.`);
  if (!options.apply) { console.log('\nDry run — pass --apply to move them.'); return; }

  const recordQuarantine = path.join(RESULTS_DIR, QUARANTINE);
  const htmlQuarantine = path.join(HTML_ROOT, options.experiment, QUARANTINE);
  fs.mkdirSync(recordQuarantine, { recursive: true });
  fs.mkdirSync(htmlQuarantine, { recursive: true });

  let movedRecords = 0, movedHtml = 0;
  for (const r of losers) {
    fs.renameSync(path.join(RESULTS_DIR, r.file), path.join(recordQuarantine, r.file));
    movedRecords += 1;
    if (r.htmlFile) {
      const from = path.join(HTML_ROOT, options.experiment, r.htmlFile);
      if (fs.existsSync(from)) {
        fs.renameSync(from, path.join(htmlQuarantine, r.htmlFile));
        movedHtml += 1;
      }
    }
  }

  fs.writeFileSync(path.join(recordQuarantine, 'README.txt'),
    `Superseded duplicate records for ${options.experiment}.\n\n`
    + `Kept the best record per figure, not the newest: API path over the\n`
    + `claude-opus-5-cc subscription path, then more attempts, then longer HTML.\n`
    + `Newest was only a tiebreak, because two re-runs iterated fewer times than\n`
    + `the originals they would otherwise have replaced (19_2: 3 attempts -> 1,\n`
    + `14_4_5: 3 -> 2).\n\n`
    + `Moved, not deleted. Move a file back into context_export_results/ to undo.\n`
    + `Generated ${new Date().toISOString()}\n`);

  console.log(`\nMoved ${movedRecords} record(s) and ${movedHtml} html file(s) into ${QUARANTINE}/.`);
}

main();
