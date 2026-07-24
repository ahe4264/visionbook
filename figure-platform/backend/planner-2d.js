/**
 * planner-2d.js — educational demo planner for 2D interactive figures
 *
 * Reads the figure image and textbook context, produces a pedagogical blueprint
 * focused on guided demo steps and meaningful interactions. Geometry and layout
 * details are intentionally minimal — the generator handles those from the image.
 */

const fs = require('fs');
const path = require('path');
const { generateWithModel } = require('./models');
const { findQmdFile } = require('./qmd_utils');

const PLANNER_2D_MODEL = 'gemini-3.5-flash';
const PLANNER_2D_MAX_TOKENS = 4096;

const PLAN_2D_SYSTEM_PROMPT = `You are an educational designer planning an interactive guided demo for a textbook figure.

Output ONLY this JSON:
{
  "concept": "One sentence: the core concept this figure teaches.",
  "figureType": "line_plot | scatter_plot | bar_chart | flow_chart | network_diagram | diagram | other",
  "learningObjectives": [
    "After engaging with this figure, the student will understand X",
    "The student will be able to explain Y"
  ],
  "keyInsight": "The single most important 'aha moment' — the thing that makes this concept click.",
  "interactions": [
    {
      "id": "camelCaseId",
      "type": "slider | toggle | button",
      "label": "Short label (≤20 chars)",
      "range": [min, max, step],
      "default": value,
      "effect": "Concrete description of what visually changes when this control is adjusted.",
      "teaches": "The specific concept or causal relationship this control demonstrates."
    }
  ],
  "reconstructionNotes": "High-level visual description for the generator: approximate layout, colors, key labels, data patterns, important annotations. No pixel measurements — describe what matters visually."
}

RULES:
- figureType: pick the closest match; used only to select the rendering library.
- learningObjectives: 2–4 items. Be specific — not 'understand the graph' but 'understand why X increases as Y decreases'.
- keyInsight: one sentence. This is the thing you most want the student to walk away remembering.
- interactions: at most 3. Ask yourself: does adjusting this control let the student discover something about the concept that they couldn't see otherwise? If the answer is no — if it's decorative, if it just relabels something, if the figure would teach equally well without it — leave it out. Return [] if the figure is a static diagram or illustration with no meaningful parameter to explore.
- reconstructionNotes: describe what matters for faithful recreation — axis labels, approximate data shape, color coding, key annotations — but do NOT try to enumerate exact data coordinates.
- Output ONLY valid JSON — no markdown fences, no explanation.`;

// ── QMD context extraction ────────────────────────────────────────────────────

/**
 * Load ±15 lines of QMD context around the first occurrence of figureStem.
 * Returns null if the chapter or QMD file cannot be found.
 */
function extractFigureContext(figureStem, chapterName) {
  if (!chapterName) return null;
  const qmdPath = findQmdFile(chapterName);
  if (!qmdPath) return null;

  let content;
  try {
    content = fs.readFileSync(qmdPath, 'utf-8');
  } catch {
    return null;
  }

  const lines = content.split('\n');
  const stemLower = figureStem.toLowerCase().replace(/\.[^.]+$/, ''); // strip extension
  const RADIUS = 15;

  let matchLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if (
      line.includes(stemLower) ||
      line.includes('/' + stemLower + '.') ||
      line.includes('/' + stemLower + ')')
    ) {
      matchLine = i;
      break;
    }
  }

  if (matchLine === -1) {
    // Fallback: return first 40 lines (chapter intro context)
    return lines.slice(0, 40).join('\n');
  }

  const start = Math.max(0, matchLine - RADIUS);
  const end = Math.min(lines.length - 1, matchLine + RADIUS);
  return lines.slice(start, end + 1).join('\n');
}

// ── Main planner ──────────────────────────────────────────────────────────────

/**
 * Analyze a 2D figure and produce a reconstruction blueprint.
 *
 * @param {string} figureStem   - filename without extension
 * @param {string} chapterName  - chapter hint (used to locate .qmd for context)
 * @param {string} base64       - base64-encoded image
 * @param {string} mediaType    - e.g. 'image/png'
 * @returns {Promise<object>}   - parsed plan JSON
 */
function buildAuthoredIntentBlock({ authoredInteractions, sourcePath } = {}) {
  const parts = [];
  if (authoredInteractions) parts.push(`Requested interactions:\n${String(authoredInteractions).trim()}`);
  if (sourcePath) parts.push(`Source file:\n${String(sourcePath).trim()}`);
  if (!parts.length) return '';
  return `\n\nAUTHOR-PROVIDED INTERACTION REQUESTS:\n${parts.join('\n\n')}\n\nUse these requested interactions when forming the plan. Use the image to recover visual structure, layout, labels, and missing visible elements.`;
}

async function plan2dFigure(figureStem, chapterName, base64, mediaType, plannerModel = PLANNER_2D_MODEL, authoredIntent = {}) {
  const contextChunk = extractFigureContext(figureStem, chapterName);
  const effectiveContext = authoredIntent?.authoredPrompt ? String(authoredIntent.authoredPrompt) : contextChunk;
  const authoredBlock = buildAuthoredIntentBlock(authoredIntent);

  const userContent = [
    { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } },
    {
      type: 'text',
      text: `Figure: "${figureStem}"${chapterName ? ` (chapter: ${chapterName})` : ''}` +
        (effectiveContext ? `\n\nPlanner context:\n${effectiveContext}` : '') +
        authoredBlock +
        `\n\nDesign an educational guided demo for this figure. Think through:
1. What is the core concept a student should understand from this figure?
2. What is the single most important insight — the "aha moment"?
3. What sequence of observations would build understanding from scratch?
4. What controls (if any) would let a student explore the concept hands-on?
5. How should each demo step direct the student's attention and explain what they see?

Do NOT describe pixel positions, exact coordinates, or rendering geometry. Focus entirely on the learning experience.
Return the pedagogical blueprint as JSON.`,
    },
  ];

  let content = await generateWithModel(plannerModel, {
    systemPrompt: PLAN_2D_SYSTEM_PROMPT,
    userContent,
    maxTokens: PLANNER_2D_MAX_TOKENS,
  });

  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) content = fenced[1].trim();

  try {
    return JSON.parse(content);
  } catch {
    return {
      concept: figureStem.replace(/_/g, ' '),
      figureType: 'other',
      learningObjectives: [],
      keyInsight: '',
      interactions: [],
      demo_steps: [],
      reconstructionNotes: '',
      raw: content.slice(0, 500),
    };
  }
}

module.exports = { plan2dFigure, PLANNER_2D_MODEL };
