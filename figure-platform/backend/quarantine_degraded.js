#!/usr/bin/env node
/**
 * quarantine_degraded.js — move records whose final attempt ended in an error
 * out of the result set, leaving only cleanly finished figures behind.
 *
 * A degraded record still holds usable HTML from an earlier attempt, so it does
 * not look missing to anything that counts records — it silently reports as a
 * finished figure that was never fully iterated. Moving it aside does two
 * things: the remaining set is uniformly clean, and completedIds() stops seeing
 * the figure as done, so a regeneration run picks it up and refills it in place
 * instead of creating a second record beside the bad one.
 *
 * Moved, never deleted: everything lands in _degraded/ and can be moved back.
 *
 * Usage:
 *   node quarantine_degraded.js                # dry run
 *   node quarantine_degraded.js --apply
 */
const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, 'context_export_results');
const HTML_ROOT = path.join(__dirname, 'context_export_html');
const QUARANTINE = '_degraded';

const options = {
  experiment: 'full-pipeline-claude-opus-5_FINAL',
  apply: process.argv.includes('--apply'),
};
const expFlag = process.argv.indexOf('--experiment');
if (expFlag !== -1) options.experiment = process.argv[expFlag + 1];

function classify(error) {
  const e = String(error || '');
  if (/placed HTML inside FIGURE_CODE/i.test(e)) return 'contract-false-positive';
  if (/missing required scaffold marker/i.test(e)) return 'generation-truncated';
  if (/Evaluator did not return valid JSON/i.test(e)) return 'evaluator-bad-json';
  if (/usage limit|specified API usage/i.test(e)) return 'api-usage-limit';
  return 'other';
}

const degraded = [];
let clean = 0;
for (const file of fs.readdirSync(RESULTS_DIR)) {
  if (!file.endsWith('.json')) continue;
  let record;
  try { record = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, file), 'utf-8')); } catch { continue; }
  if (record.experiment !== options.experiment) continue;
  const attempts = record.attempts || [];
  const last = attempts[attempts.length - 1] || {};
  if (last.status !== 'error') { clean += 1; continue; }
  degraded.push({
    file,
    figure: record.contextExportId,
    attempts: attempts.length,
    htmlChars: (record.html || '').length,
    htmlFile: record.standaloneHtmlPath ? path.basename(record.standaloneHtmlPath) : null,
    category: classify(last.error),
  });
}

const byCategory = {};
for (const d of degraded) (byCategory[d.category] = byCategory[d.category] || []).push(d);

console.log(`experiment: ${options.experiment}`);
console.log(`clean records:    ${clean}`);
console.log(`degraded records: ${degraded.length}`);
for (const [category, list] of Object.entries(byCategory).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${String(list.length).padStart(3)}  ${category}`);
}
if (!degraded.length) { console.log('Nothing to do.'); process.exit(0); }
if (!options.apply) {
  console.log('\nDry run — pass --apply to move them.');
  process.exit(0);
}

const recordQuarantine = path.join(RESULTS_DIR, QUARANTINE);
const htmlQuarantine = path.join(HTML_ROOT, options.experiment, QUARANTINE);
fs.mkdirSync(recordQuarantine, { recursive: true });
fs.mkdirSync(htmlQuarantine, { recursive: true });

let movedRecords = 0, movedHtml = 0;
for (const d of degraded) {
  fs.renameSync(path.join(RESULTS_DIR, d.file), path.join(recordQuarantine, d.file));
  movedRecords += 1;
  if (d.htmlFile) {
    const from = path.join(HTML_ROOT, options.experiment, d.htmlFile);
    if (fs.existsSync(from)) {
      fs.renameSync(from, path.join(htmlQuarantine, d.htmlFile));
      movedHtml += 1;
    }
  }
}

fs.writeFileSync(path.join(recordQuarantine, 'README.txt'),
  `Records for ${options.experiment} whose final attempt ended in status=error.\n\n`
  + `Each still contains usable HTML from an earlier attempt, which is exactly why\n`
  + `they were moved: they counted as finished figures while never completing their\n`
  + `iterations. With them out of the way the remaining set is uniformly clean and\n`
  + `completedIds() treats these figures as outstanding, so a regeneration run\n`
  + `refills them in place rather than writing a second record beside the bad one.\n\n`
  + Object.entries(byCategory).map(([c, l]) => `${c} (${l.length}):\n  ${l.map(d => d.figure).sort().join(', ')}`).join('\n\n')
  + `\n\nMoved, not deleted. Move a file back into context_export_results/ to undo.\n`
  + `Generated ${new Date().toISOString()}\n`);

fs.writeFileSync(path.join(__dirname, '_degraded_ids.txt'), degraded.map(d => d.figure).sort().join(','));

console.log(`\nMoved ${movedRecords} record(s) and ${movedHtml} html file(s) into ${QUARANTINE}/.`);
console.log(`Remaining clean records: ${clean}`);
console.log(`Ids written to _degraded_ids.txt for the regeneration run.`);
