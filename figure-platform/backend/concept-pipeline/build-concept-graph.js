#!/usr/bin/env node
/**
 * build-concept-graph.js — CLI entry point
 *
 * Usage:
 *   node concept-pipeline/build-concept-graph.js <chapterName> [--rebuild-rag]
 *
 * Example:
 *   node concept-pipeline/build-concept-graph.js camera_as_linsys
 *   node concept-pipeline/build-concept-graph.js imaging --rebuild-rag
 *
 * Output:
 *   figure-platform/backend/concept-graphs/<chapterName>.graph.json
 *
 * Pipeline:
 *   1. RAG  — chunk + embed .qmd (cached; skipped if .rag.json exists unless --rebuild-rag)
 *   2. Extract — LLM identifies atomic concepts from chunks
 *   3. Fill slots — LLM fills motivation/example/question/pset; links demo/visual
 *   4. Detect deps — LLM infers prerequisite edges
 *   5. Save graph JSON
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const { buildIndex, loadIndex }    = require('./rag');
const { extractConcepts }          = require('./extractor');
const { fillAllSlots }             = require('./slot-filler');
const { detectDependencies }       = require('./dependency-detector');

const ROOT_DIR   = path.join(__dirname, '..', '..', '..');
const OUTPUT_DIR = path.join(__dirname, '..', 'concept-graphs');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ── CLI args ──────────────────────────────────────────────────────────────────
const args        = process.argv.slice(2);
const chapterName = args.find(a => !a.startsWith('--'));
const rebuildRag  = args.includes('--rebuild-rag');

if (!chapterName) {
  console.error('Usage: node build-concept-graph.js <chapterName> [--rebuild-rag]');
  console.error('Example: node build-concept-graph.js camera_as_linsys');
  process.exit(1);
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Building concept graph: ${chapterName}`);
  console.log(`${'═'.repeat(60)}\n`);

  // ── Step 1: RAG ──────────────────────────────────────────────────────────
  console.log('Step 1/4  RAG — chunking + embedding');
  let chunks = rebuildRag ? null : loadIndex(chapterName);
  if (chunks) {
    console.log(`          ↳ loaded cached index (${chunks.length} chunks). Use --rebuild-rag to refresh.`);
  } else {
    chunks = await buildIndex(chapterName);
    console.log(`          ↳ built + saved index (${chunks.length} chunks)`);
  }

  // Determine chapter title from chunks
  const chapterTitle = chunks[0]?.chapterTitle || chapterName;

  // ── Step 2: Extract concepts ─────────────────────────────────────────────
  console.log('\nStep 2/4  Extracting atomic concepts …');
  const rawConcepts = await extractConcepts(chapterTitle, chunks);
  console.log(`          ↳ ${rawConcepts.length} concepts found`);
  rawConcepts.forEach((c, i) => console.log(`          ${i + 1}. ${c.label}`));

  // ── Step 3: Fill slots ───────────────────────────────────────────────────
  console.log('\nStep 3/4  Filling concept slots …');
  const filledConcepts = await fillAllSlots(rawConcepts, chapterName, chunks);

  // ── Step 4: Detect dependencies ──────────────────────────────────────────
  console.log('\nStep 4/4  Detecting dependencies …');
  const graph = await detectDependencies(filledConcepts);

  // Summary
  const withDeps    = graph.filter(c => c.deps.length > 0).length;
  const withDemo    = graph.filter(c => c.slots.demo.length > 0).length;
  const withVisual  = graph.filter(c => c.slots.visual.length > 0).length;
  console.log(`          ↳ ${withDeps} concepts have deps`);
  console.log(`          ↳ ${withDemo} concepts linked to generated HTML demos`);
  console.log(`          ↳ ${withVisual} concepts linked to source visuals`);

  // ── Save ──────────────────────────────────────────────────────────────────
  const output = {
    chapterName,
    chapterTitle,
    generatedAt: new Date().toISOString(),
    concepts: graph,
  };
  const outPath = path.join(OUTPUT_DIR, `${chapterName}.graph.json`);
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n✓ Graph saved → ${outPath}`);
  console.log(`  Open concept-graph.html and update DATA_URL to load it.\n`);

})().catch(err => {
  console.error('\n[build-concept-graph] Error:', err.message);
  process.exit(1);
});
