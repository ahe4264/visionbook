/**
 * slot-filler.js — Slot Filler agent
 *
 * For each extracted concept, fills:
 *   motivation  — why this concept matters (from RAG text)
 *   example     — concrete instantiation (from RAG text)
 *   pset        — 1-2 practice problems (generated)
 *   question    — Socratic check question (generated)
 *   demo        — linked generated HTML from figure pipeline (by figure stem)
 *   visual      — linked original image path (by figure stem)
 *   deps        — left empty here; filled by dependency-detector
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs   = require('fs');
const path = require('path');
const { query: ragQuery } = require('./rag');
const { generateWithModel } = require('../models');

const RESULTS_DIR     = path.join(__dirname, '..', 'results');
const CHAPTER_FIG_DIR = path.join(__dirname, '..', '..', 'chapter-figures');

const MODEL = 'gpt-5.4';

// ── Figure index helpers ─────────────────────────────────────────────────────

/**
 * Build a map of figureStem → best result HTML path from results/ directory.
 * Mirrors the logic in chapter_editor.js but as a plain map.
 */
function buildResultsIndex() {
  const index = {}; // stem → { resultId, html, score }
  if (!fs.existsSync(RESULTS_DIR)) return index;

  for (const file of fs.readdirSync(RESULTS_DIR)) {
    if (!file.endsWith('.json')) continue;
    try {
      const rec = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, file), 'utf-8'));
      // stem: prefer filename-derived (matches chapter-figures/ names)
      const stem = rec.filename?.replace(/\.[^.]+$/, '') || rec.figureStem || rec.stem;
      if (!stem) continue;

      // Score: dig into evaluationVersions → evaluationResults → any model
      // Field may be overall_average, total_score, or totalScore
      let score = 0;
      const evs = rec.evaluationVersions || {};
      for (const ev of Object.values(evs)) {
        for (const modelData of Object.values(ev.evaluationResults || {})) {
          const s = modelData.overall_average ?? modelData.total_score ?? modelData.totalScore ?? 0;
          if (typeof s === 'number') score = Math.max(score, s);
        }
      }

      if (!index[stem] || score > index[stem].score) {
        index[stem] = {
          resultId: file.replace('.json', ''),
          html:     rec.html || null,
          score,
        };
      }
    } catch { /* skip corrupt records */ }
  }
  return index;
}

/**
 * Find original image path for a figure stem from chapter-figures/.
 */
function findVisualPath(stem, chapterName) {
  const candidates = [
    path.join(CHAPTER_FIG_DIR, chapterName, 'candidates_3d', `${stem}.png`),
    path.join(CHAPTER_FIG_DIR, chapterName, 'candidates_3d', `${stem}.jpg`),
    path.join(CHAPTER_FIG_DIR, chapterName, 'diagrams_2d',   `${stem}.png`),
    path.join(CHAPTER_FIG_DIR, chapterName, 'diagrams_2d',   `${stem}.jpg`),
  ];
  // Also search all chapter dirs if chapterName not useful
  if (!chapterName || chapterName === 'unknown') {
    if (fs.existsSync(CHAPTER_FIG_DIR)) {
      for (const ch of fs.readdirSync(CHAPTER_FIG_DIR)) {
        for (const ext of ['png', 'jpg']) {
          candidates.push(path.join(CHAPTER_FIG_DIR, ch, 'candidates_3d', `${stem}.${ext}`));
          candidates.push(path.join(CHAPTER_FIG_DIR, ch, 'diagrams_2d',   `${stem}.${ext}`));
        }
      }
    }
  }
  return candidates.find(p => fs.existsSync(p)) || null;
}

// ── Slot-extraction prompt ────────────────────────────────────────────────────
// LLM extracts from source text — does NOT generate or invent content

function buildSlotPrompt(concept, chunkTexts) {
  return `You are extracting verbatim quotes from textbook passages. NEVER paraphrase or invent content.
Every value must be a direct, word-for-word excerpt from the passages below.

Concept: "${concept.label}"

Textbook passages (each labelled with its section name):
${chunkTexts}

Extract these 4 slots. For each:
- "text": copy the exact sentence(s) verbatim from the passage — no rewording
- "section": the section label (in brackets) where you found it
- Clean the text: remove all [math], [equation], {#...} tags, figure references like Fig. X or @fig-..., and citation markers — keep only readable prose
- If a slot cannot be found verbatim in the text, set both fields to null

1. motivation  — 1-2 verbatim sentences explaining why this concept matters or what problem it solves
2. example     — the most concrete verbatim example, figure reference, or scenario mentioned
3. question    — a question verbatim from the text (explicitly stated, not implied)
4. key_passage — the single most important 1-3 verbatim sentences that define this concept

Output ONLY valid JSON (no fences):
{
  "motivation":  { "text": "...", "section": "..." },
  "example":     { "text": "...", "section": "..." },
  "question":    { "text": "...", "section": "..." },
  "key_passage": { "text": "...", "section": "..." }
}`;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Fill all slots for one concept.
 * @param {object} concept      — from extractor (includes .chunks)
 * @param {string} chapterName
 * @param {object} resultsIndex — from buildResultsIndex()
 * @param {Array}  allChunks    — full RAG index for this chapter (used for retrieval)
 * @returns full concept node ready for the graph
 */
async function fillSlots(concept, chapterName, resultsIndex, allChunks) {
  // Use the extractor's section_ids chunks as primary context (directly relevant).
  // Supplement with RAG retrieval only if the concept has fewer than 2 own chunks.
  const ownChunks = concept.chunks || [];
  let relevantChunks = ownChunks;
  if (allChunks && allChunks.length > 0 && allChunks[0].embedding) {
    const queryText = `${concept.label}: ${concept.one_sentence}`;
    const ragChunks = await ragQuery(allChunks, queryText, 3);
    // Merge: own chunks first, then any RAG chunks not already included
    const ownIds = new Set(ownChunks.map(c => c.id));
    const extra = ragChunks.filter(c => !ownIds.has(c.id));
    relevantChunks = [...ownChunks, ...extra].slice(0, 4);
  }

  const chunkTexts = relevantChunks
    .map(c => `[SECTION: ${c.section}]\n${c.text}`)
    .join('\n\n---\n\n');

  // LLM extraction — pulls from source text only, no generation
  let llmSlots = { motivation: null, example: null, question: null, key_passage: null };
  if (chunkTexts.trim()) {
    let raw = await generateWithModel(MODEL, {
      systemPrompt: 'You extract verbatim quotes from textbook passages. Never paraphrase or invent. Always output valid JSON.',
      userContent: [{ type: 'text', text: buildSlotPrompt(concept, chunkTexts) }],
      maxTokens: 800,
    });
    raw = raw || '{}';
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) raw = fenced[1].trim();
    try {
      const parsed = JSON.parse(raw);
      for (const k of Object.keys(llmSlots)) {
        const val = parsed[k];
        // Accept { text, section } objects; discard nulls or empty
        if (val && typeof val === 'object' && val.text && val.text !== 'null') {
          const cleaned = val.text
            .replace(/\[math\]/g, '')
            .replace(/\[equation\]\{[^}]*\}/g, '')
            .replace(/\[equation\]/g, '')
            .replace(/\{#[^}]*\}/g, '')
            .replace(/@fig-\S+/g, '')
            .replace(/Fig\.\s*\d+/gi, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
          llmSlots[k] = { text: cleaned, section: val.section || null };
        }
      }
    } catch { /* keep nulls */ }
  }

  // Link demo + visual from existing pipeline
  const demoLinks = [];
  const visualLinks = [];

  for (const stem of (concept.figure_stems || [])) {
    const result = resultsIndex[stem];
    if (result) {
      demoLinks.push({ stem, resultId: result.resultId, score: result.score });
    }
    const visual = findVisualPath(stem, chapterName);
    if (visual) visualLinks.push({ stem, path: visual });
  }

  return {
    id:           concept.id,
    label:        concept.label,
    chapterName,
    one_sentence: concept.one_sentence,
    slots: {
      motivation:   llmSlots.motivation   || null,  // { text, section } — verbatim quote
      example:      llmSlots.example      || null,  // { text, section } — verbatim quote
      question:     llmSlots.question     || null,  // { text, section } — verbatim quote
      key_passage:  llmSlots.key_passage  || null,  // { text, section } — verbatim quote
      demo:         demoLinks,   // [{stem, resultId, score}] — augmented figures
      visual:       visualLinks, // [{stem, path}]            — original figures
    },
    deps: [], // filled by dependency-detector
    section_ids:   concept.section_ids || [],
    figure_stems:  concept.figure_stems || [],
  };
}

/**
 * Fill slots for all concepts in a chapter.
 */
/**
 * @param {Array}  concepts    — extracted concept list
 * @param {string} chapterName
 * @param {Array}  allChunks   — full RAG index with embeddings (for retrieval)
 */
async function fillAllSlots(concepts, chapterName, allChunks) {
  const resultsIndex = buildResultsIndex();
  const filled = [];

  for (let i = 0; i < concepts.length; i++) {
    const c = concepts[i];
    console.log(`[slot-filler] (${i + 1}/${concepts.length}) ${c.label}`);
    const node = await fillSlots(c, chapterName, resultsIndex, allChunks);
    filled.push(node);
  }
  return filled;
}

module.exports = { fillAllSlots, buildResultsIndex, findVisualPath };
