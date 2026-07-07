/**
 * test_agent_figure.js — end-to-end single-figure test of the agentic generator.
 *
 * Runs the full plan → generate(AGENT) → critique → decide loop for ONE figure and
 * prints a detailed timing breakdown:
 *   - per loop stage (plan / generate / critic / decide)
 *   - per agent turn (what the coding agent did + how long)
 *   - per render task inside the agent (how long each headless render took)
 *
 * Usage:
 *   node test_agent_figure.js [resultFileOrFigureName]
 *
 * Env (all have robust defaults set below so we never time out on a legit run):
 *   GENERATOR_MODE=agent|escalate|single   (default: agent)
 *   AGENT_GEN_MODEL, AGENT_GEN_MAX_TURNS, AGENT_GEN_TIMEOUT_MS, AGENT_GEN_CONCURRENCY
 */

require('dotenv').config();

// ── Robust defaults (only set if the caller didn't) ──────────────────────────
process.env.GENERATOR_MODE = process.env.GENERATOR_MODE || 'agent';
process.env.AGENT_GEN_MODEL = process.env.AGENT_GEN_MODEL || 'sonnet';
process.env.AGENT_GEN_MAX_TURNS = process.env.AGENT_GEN_MAX_TURNS || '8';
process.env.AGENT_GEN_TIMEOUT_MS = process.env.AGENT_GEN_TIMEOUT_MS || '300000'; // 5 min wall-clock guard
process.env.AGENT_GEN_CONCURRENCY = process.env.AGENT_GEN_CONCURRENCY || '1';
process.env.AGENT_GEN_RENDER_WAIT_MS = process.env.AGENT_GEN_RENDER_WAIT_MS || '3500';
process.env.AGENT_GEN_EFFORT = process.env.AGENT_GEN_EFFORT || 'low';
process.env.AGENT_GEN_THINKING_TOKENS = process.env.AGENT_GEN_THINKING_TOKENS || '4096';
// Force Puppeteer to the globally-installed Chrome. The dev tooling may inject a
// sandbox PUPPETEER_CACHE_DIR that has no Chrome, so we OVERRIDE unconditionally
// (a `||` fallback would keep the bad injected value). This is a test-harness quirk
// only — the real server relies on Puppeteer's default cache dir.
if (!process.env.PUPPETEER_CACHE_DIR || /cursor-sandbox-cache|\/T\//.test(process.env.PUPPETEER_CACHE_DIR)) {
    process.env.PUPPETEER_CACHE_DIR = `${process.env.HOME}/.cache/puppeteer`;
}

const fs = require('fs');
const path = require('path');
const { runFigureLoop, formatLoopResults } = require('./figure_loop');
const { loadBaseScaffold } = require('./runtime-helpers');
const { verifyFigure, DEFAULT_VIEWPORTS } = require('./verify');

// Loop / model config (planner + critic use fast, known-good models).
const PLANNER_MODEL = process.env.TEST_PLANNER_MODEL || 'gpt-4o';
const CRITIC_MODEL = process.env.TEST_CRITIC_MODEL || 'gpt-4o';
const MAX_ATTEMPTS = Number(process.env.TEST_MAX_ATTEMPTS) || 1;

function pickSourceFigure(arg) {
    const dir = path.join(__dirname, 'results');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

    // If an explicit file/figure was given, honor it.
    if (arg) {
        const direct = files.find(f => f === arg || f === `${arg}.json`);
        if (direct) return JSON.parse(fs.readFileSync(path.join(dir, direct), 'utf8'));
        // else match by filename stem
        for (const f of files) {
            try {
                const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
                if (j.source_base64 && String(j.filename || '').toLowerCase().includes(arg.toLowerCase())) return j;
            } catch { /* skip */ }
        }
    }

    // Otherwise pick the first result that carries a source image.
    for (const f of files) {
        try {
            const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
            if (j.source_base64) return j;
        } catch { /* skip */ }
    }
    throw new Error('No result JSON with source_base64 found in results/.');
}

function stemFromFilename(filename) {
    return String(filename || 'figure').replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9_]+/gi, '_').toLowerCase();
}

(async () => {
    const arg = process.argv[2];
    const src = pickSourceFigure(arg);
    const figureStem = stemFromFilename(src.filename);
    const mediaType = src.source_media_type || src.mediaType || 'image/png';
    const base64 = src.source_base64;
    const chapterName = src.chapter || src.chapterName || null;

    const { scaffold } = loadBaseScaffold(__dirname);

    console.log('════════════════════════════════════════════════════════════════');
    console.log(` AGENTIC GENERATOR — single-figure test`);
    console.log(`   figure:        ${src.filename}  (stem=${figureStem})`);
    console.log(`   chapter:       ${chapterName || '(none)'}`);
    console.log(`   GENERATOR_MODE=${process.env.GENERATOR_MODE}  AGENT_GEN_MODEL=${process.env.AGENT_GEN_MODEL}`);
    console.log(`   maxTurns=${process.env.AGENT_GEN_MAX_TURNS}  timeout=${process.env.AGENT_GEN_TIMEOUT_MS}ms  concurrency=${process.env.AGENT_GEN_CONCURRENCY}`);
    console.log(`   planner=${PLANNER_MODEL}  critic=${CRITIC_MODEL}  maxAttempts=${MAX_ATTEMPTS}`);
    console.log('════════════════════════════════════════════════════════════════\n');

    const wallStart = Date.now();
    let loopState;
    try {
        loopState = await runFigureLoop({
            figureStem,
            chapterName,
            imageData: { base64, mediaType },
            scaffold,
            sourceBase64: base64,
            sourceMediaType: mediaType,
            maxAttempts: MAX_ATTEMPTS,
            passThreshold: 4.0,
            plannerModel: PLANNER_MODEL,
            generatorModel: 'gpt-5.5', // only used if agent falls back to single-shot
            criticModel: CRITIC_MODEL,
            fewShot: { planner: false, critic: false, orchestrator: false },
        });
    } catch (e) {
        console.error('\n[test] runFigureLoop threw:', e.message);
        console.error(e.stack);
        process.exit(1);
    }
    const wallMs = Date.now() - wallStart;

    console.log('\n' + formatLoopResults(loopState));

    // ── Detailed agent task timeline (per attempt) ──────────────────────────────
    console.log('\n════════════════════ AGENT TASK TIMELINE ════════════════════');
    for (const a of loopState.attempts) {
        if (!a.agentRun) {
            console.log(`  attempt ${a.iteration}: (no agent run — single-shot path was used)`);
            continue;
        }
        const r = a.agentRun;
        console.log(`  attempt ${a.iteration}: agent model turns=${r.turns} renders=${r.renders} clean=${r.clean} reason=${r.terminalReason} total=${(r.elapsedMs / 1000).toFixed(1)}s`);
        for (const ev of (r.timeline || [])) {
            if (ev.phase === 'model_turn') {
                console.log(`      · turn ${ev.turn}: ${ev.action} — ${(ev.ms / 1000).toFixed(1)}s`);
            } else if (ev.phase === 'render') {
                const verdict = ev.ok ? 'CLEAN' : (ev.error || `${ev.blank ? 'blank ' : ''}${ev.pageErrors} exc / ${ev.consoleErrors} console`);
                console.log(`         ↳ render #${ev.call}: ${(ev.ms / 1000).toFixed(1)}s → ${verdict}`);
            } else if (ev.phase === 'queue_wait') {
                console.log(`      · waited ${(ev.ms / 1000).toFixed(1)}s for concurrency slot`);
            }
        }
        if (r.usage) console.log(`      tokens: in=${r.usage.input_tokens ?? '?'} out=${r.usage.output_tokens ?? '?'}`);
    }
    console.log('══════════════════════════════════════════════════════════════');

    // ── Persist artifacts for inspection ────────────────────────────────────────
    const outDir = path.join(__dirname, 'agent_test_out');
    fs.mkdirSync(outDir, { recursive: true });
    const outHtml = path.join(outDir, `${figureStem}.html`);
    const outJson = path.join(outDir, `${figureStem}.timing.json`);
    if (loopState.currentHtml) fs.writeFileSync(outHtml, loopState.currentHtml);
    fs.writeFileSync(outJson, JSON.stringify({
        figureStem,
        wallMs,
        status: loopState.status,
        bestScore: loopState.bestScore,
        timings: loopState.timings,
        agentRuns: loopState.attempts.map(a => a.agentRun || null),
    }, null, 2));

    // ── Final multi-viewport verification of the chosen HTML ────────────────────
    if (loopState.currentHtml) {
        console.log('\n════════════════ FINAL VERIFICATION (multi-viewport) ════════════════');
        const report = await verifyFigure(loopState.currentHtml, { viewports: DEFAULT_VIEWPORTS });
        console.log(`  result: ${report.ok ? 'PASS' : 'FAIL'}  errors=${report.errors.length}  warnings=${report.warnings.length}`);
        const show = (arr, mark) => {
            const seen = new Set();
            for (const c of arr) {
                const key = c.id + c.message;
                if (seen.has(key)) continue; seen.add(key);
                console.log(`    ${mark} [${c.id}] ${c.message}`);
            }
        };
        if (report.errors.length) { console.log('  ERRORS:'); show(report.errors, '✗'); }
        if (report.warnings.length) { console.log('  WARNINGS:'); show(report.warnings, '·'); }
        if (report.ok && !report.warnings.length) console.log('    (all checks passed at every viewport)');
        // Also log the passing checks so the battery is visible
        const passed = [...new Set(report.checks.filter(c => c.pass).map(c => c.id))];
        console.log(`  checks passing: ${passed.join(', ')}`);
        console.log('══════════════════════════════════════════════════════════════════════');
    }

    console.log(`\n[test] wall-clock total: ${(wallMs / 1000).toFixed(1)}s`);
    console.log(`[test] status=${loopState.status}  bestScore=${loopState.bestScore}/5`);
    console.log(`[test] wrote HTML  → ${outHtml}`);
    console.log(`[test] wrote timing→ ${outJson}`);
    process.exit(0);
})();
