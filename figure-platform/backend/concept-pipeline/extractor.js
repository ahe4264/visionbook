/**
 * extractor.js — Concept Extractor agent
 *
 * Given a RAG index for a chapter, uses an LLM to:
 *   1. List all atomic concepts in the chapter
 *   2. Map each concept to its most relevant RAG chunks
 *
 * Output per concept:
 *   { id, label, relevantChunks: [chunkId, ...], figureStems: [...] }
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const { generateWithModel } = require('../models');

const MODEL = 'gpt-5.4';

// ── Prompt ───────────────────────────────────────────────────────────────────

function buildExtractionPrompt(chapterTitle, chunkSummaries) {
  return `You are an expert curriculum designer analyzing a computer vision textbook chapter.

Chapter: "${chapterTitle}"

Below are the sections of this chapter (each with an ID and its text):
${chunkSummaries}

Your task: identify all ATOMIC concepts taught in this chapter.

Rules for "atomic":
- One single idea, principle, or mechanism per concept (not a broad topic)
- 2-4 sentence description max
- Should be teachable as a standalone unit with one example, one question
- Named at a level a student would google (e.g. "Pinhole Camera Model" not "Cameras")

For each concept output:
- id: snake_case short identifier
- label: human-readable name (3-6 words)
- section_ids: list of chunk IDs where this concept appears
- figure_stems: list of figure filenames (stems only) directly illustrating this concept
- one_sentence: one sentence defining the concept (for context, not for display)

Output ONLY a JSON array. No prose, no markdown fences. Example:
[
  {
    "id": "pinhole_model",
    "label": "Pinhole Camera Model",
    "section_ids": ["camera_as_linsys__cameras_as_linear_systems"],
    "figure_stems": ["flatland_camera_linear"],
    "one_sentence": "A pinhole camera maps scene intensities to sensor readings via a sparse identity-like matrix."
  }
]`;
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Extract atomic concepts from a chapter's RAG chunks.
 * @param {string} chapterTitle
 * @param {Array} chunks  — from rag.loadIndex()
 * @returns {Array<{ id, label, section_ids, figure_stems, one_sentence }>}
 */
async function extractConcepts(chapterTitle, chunks) {
  // Build a compact summary of each chunk for the prompt (avoid huge context)
  const chunkSummaries = chunks.map(c =>
    `[${c.id}]\nSection: ${c.section}\nFigures: ${c.figureStems.join(', ') || 'none'}\n${c.text}`
  ).join('\n\n---\n\n');

  const prompt = buildExtractionPrompt(chapterTitle, chunkSummaries);

  const content_raw = await generateWithModel(MODEL, {
    systemPrompt: 'You extract structured curriculum data from textbook chapters. Always output valid JSON arrays.',
    userContent: [{ type: 'text', text: prompt }],
    maxTokens: 8192,
  });

  let content = content_raw || '[]';
  // Strip fences
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) content = fenced[1].trim();

  try {
    const concepts = JSON.parse(content);
    // Attach full chunk text for slot-filler downstream
    return concepts.map(c => ({
      ...c,
      chunks: chunks.filter(ch => (c.section_ids || []).includes(ch.id)),
    }));
  } catch (err) {
    console.error('[extractor] Failed to parse concept list:', content.slice(0, 400));
    throw new Error('Concept extraction returned invalid JSON');
  }
}

module.exports = { extractConcepts };
