/**
 * dependency-detector.js — infers prerequisite edges between concepts
 *
 * Given a list of filled concept nodes, asks an LLM:
 * "For each concept, which others in this list must be understood first?"
 *
 * Outputs the same list with .deps populated as arrays of concept ids.
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { generateWithModel } = require('../models');

const MODEL = 'gpt-5.4';

function buildDepPrompt(concepts) {
  const list = concepts.map(c =>
    `- id: ${c.id}\n  label: ${c.label}\n  definition: ${c.one_sentence}`
  ).join('\n');

  return `You are analyzing concept dependencies for a computer vision textbook chapter.

Here are the concepts extracted from the chapter:
${list}

For each concept, identify which OTHER concepts in this list are DIRECT prerequisites —
meaning a student must understand them first before this concept makes sense.

Rules:
- Only list concepts from the list above as deps (use their exact ids)
- Keep deps minimal: only the most immediate prerequisites, not transitive ones
- A foundation concept (no deps) should have an empty array
- Do NOT create circular dependencies

Output ONLY valid JSON (no fences), an array mirroring the input order:
[
  { "id": "concept_id", "deps": ["dep_id_1", "dep_id_2"] },
  ...
]`;
}

/**
 * @param {Array} conceptNodes  — filled nodes from slot-filler
 * @returns same nodes with .deps populated
 */
async function detectDependencies(conceptNodes) {
  if (conceptNodes.length <= 1) return conceptNodes;

  const prompt = buildDepPrompt(conceptNodes);

  let raw = await generateWithModel(MODEL, {
    systemPrompt: 'You detect prerequisite relationships between educational concepts. Output valid JSON only.',
    userContent: [{ type: 'text', text: prompt }],
    maxTokens: 4096,
  });
  raw = raw || '[]';
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) raw = fenced[1].trim();

  let depMap = {};
  try {
    const arr = JSON.parse(raw);
    arr.forEach(item => { depMap[item.id] = item.deps || []; });
  } catch {
    console.error('[dep-detector] Failed to parse dependency map:', raw.slice(0, 300));
  }

  // Validate: only allow deps that exist in the concept list
  const validIds = new Set(conceptNodes.map(c => c.id));
  return conceptNodes.map(c => ({
    ...c,
    deps: (depMap[c.id] || []).filter(d => validIds.has(d) && d !== c.id),
  }));
}

module.exports = { detectDependencies };
