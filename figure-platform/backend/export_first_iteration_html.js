#!/usr/bin/env node
/**
 * Export the *first* iteration's HTML for each context-export result.
 *
 * The standalone files written during generation (context_export_html/<experiment>/)
 * hold the FINAL html — i.e. after the critic/refine loop ran. This script writes
 * the no-iteration baseline instead: attempts[0], the raw one-shot generation,
 * before any feedback was applied. Same filename convention as
 * server.js:writeStandaloneHtml, so the two folders line up 1:1 for comparison.
 *
 *   node export_first_iteration_html.js [--experiment full-pipeline_FINAL] [--dry-run]
 */
const fs = require('fs');
const path = require('path');
const { safeStem } = require('./context_exports');

const CONTEXT_EXPORT_RESULTS_DIR = process.env.CONTEXT_EXPORT_RESULTS_DIR
  ? path.resolve(process.env.CONTEXT_EXPORT_RESULTS_DIR)
  : path.join(__dirname, 'context_export_results');
const CONTEXT_EXPORT_HTML_DIR = process.env.CONTEXT_EXPORT_HTML_DIR
  ? path.resolve(process.env.CONTEXT_EXPORT_HTML_DIR)
  : path.join(__dirname, 'context_export_html');

const DEFAULT_EXPERIMENT = 'full-pipeline_FINAL';

// Model id → output folder. Keyed on family so a version bump (gpt-5.5 → gpt-6)
// still lands in the right bucket.
const MODEL_FAMILIES = [
  { match: /^gemini/i, folder: 'no-iteration-gemini_FINAL' },
  { match: /^gpt/i, folder: 'no-iteration-gpt_FINAL' },
  { match: /^kimi/i, folder: 'no-iteration-kimi_FINAL' },
  { match: /^qwen/i, folder: 'no-iteration-qwen_FINAL' },
];

function folderForModel(model) {
  const hit = MODEL_FAMILIES.find(entry => entry.match.test(String(model || '')));
  return hit ? hit.folder : null;
}

function parseArgs(argv) {
  const options = { experiment: DEFAULT_EXPERIMENT, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--experiment') {
      options.experiment = argv[index + 1] || DEFAULT_EXPERIMENT;
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: node export_first_iteration_html.js [options]',
        '',
        '  --experiment <name>  Experiment to export (default: ' + DEFAULT_EXPERIMENT + ')',
        '  --dry-run            Report what would be written, write nothing',
      ].join('\n'));
      process.exit(0);
    }
  }
  return options;
}

/** First attempt that actually produced html, by iteration order. */
function firstIterationAttempt(record) {
  const attempts = Array.isArray(record.attempts) ? record.attempts : [];
  return attempts
    .filter(attempt => attempt && typeof attempt.html === 'string' && attempt.html.trim())
    .sort((a, b) => (a.iteration || 0) - (b.iteration || 0))[0] || null;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(CONTEXT_EXPORT_RESULTS_DIR)) {
    console.error(`No results directory at ${CONTEXT_EXPORT_RESULTS_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(CONTEXT_EXPORT_RESULTS_DIR).filter(name => name.endsWith('.json'));
  const written = {};
  const skipped = [];

  for (const file of files) {
    const fullPath = path.join(CONTEXT_EXPORT_RESULTS_DIR, file);
    let record;
    try {
      record = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    } catch (err) {
      skipped.push(`${file}: unreadable (${err.message})`);
      continue;
    }

    if (record.experiment !== options.experiment) continue;

    const folder = folderForModel(record.model);
    if (!folder) {
      skipped.push(`${file}: unmapped model "${record.model}"`);
      continue;
    }

    const attempt = firstIterationAttempt(record);
    if (!attempt) {
      skipped.push(`${file}: no attempt with html`);
      continue;
    }
    if (attempt.iteration !== 1) {
      skipped.push(`${file}: earliest html is iteration ${attempt.iteration}, not 1`);
      continue;
    }

    const stem = safeStem(record.filename || record.id) || record.id;
    const outDir = path.join(CONTEXT_EXPORT_HTML_DIR, folder);
    const outPath = path.join(outDir, `${stem}__${record.id}.html`);

    if (!options.dryRun) {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(outPath, attempt.html, 'utf-8');
    }
    written[folder] = (written[folder] || 0) + 1;
  }

  const prefix = options.dryRun ? '[dry-run] would write' : 'wrote';
  const folders = Object.keys(written).sort();
  if (!folders.length) {
    console.log(`No records matched experiment "${options.experiment}".`);
  }
  for (const folder of folders) {
    console.log(`${prefix} ${written[folder]} file(s) → context_export_html/${folder}`);
  }
  if (skipped.length) {
    console.log(`\nSkipped ${skipped.length}:`);
    for (const line of skipped) console.log(`  ${line}`);
  }
}

main();
