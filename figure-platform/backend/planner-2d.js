/**
 * planner-2d.js — educational demo planner for 2D interactive figures
 *
 * Mirrors planner.js but targets 2D figures (SVG.js / Chart.js / Mermaid).
 * Shares INTERACTION_PALETTE, INTERACTION_FIELDS, and buildAuthoredIntentBlock
 * from planner.js so both planners stay in sync on the interaction vocabulary.
 */

const { generateWithModel } = require('./models');
const { extractFigureContext } = require('./qmd_utils');
const { INTERACTION_PALETTE, INTERACTION_FIELDS, buildAuthoredIntentBlock } = require('./planner');

const PLANNER_2D_MODEL = 'gemini-3.5-flash';
const PLANNER_2D_MAX_TOKENS = 4096;

// ── System prompt ─────────────────────────────────────────────────────────────

const PLAN_2D_SYSTEM_PROMPT = `You are an educational designer planning an interactive guided demo for a 2D textbook figure.

${INTERACTION_PALETTE}

Output ONLY this JSON (no markdown, no explanation):
{
  "concept": "One sentence: the core concept this figure teaches.",
  "figureType": "line_plot | scatter_plot | bar_chart | flow_chart | network_diagram | diagram | other",
  "elements": ["exhaustive list of every visual element to reconstruct — axes, data series, nodes, edges, labels, annotations, legends"],
  "interactions": [
    { "id": "camelCaseId", "type": "<palette type>", "teaches": "what the learner understands", "...": "plus ONLY that type's fields per INTERACTION FIELDS below" }
  ],
  "demo_steps": [
    {
      "title": "Step name shown in UI",
      "narration": "What the learner sees and understands at this step — one or two sentences",
      "state": { "interactionId": value }
    }
  ],
  "keyInsight": "The single most important 'aha moment' — the thing that makes this concept click.",
  "reconstructionNotes": "High-level visual description for the generator: approximate layout, colors, key labels, data patterns, important annotations. No pixel measurements — describe what matters visually."
}

${INTERACTION_FIELDS}

2D-SPECIFIC RULES:
- figureType: pick the closest match; used only to select the rendering library (flow_chart → Mermaid, plots → Chart.js, everything else → SVG.js).
- elements: list every distinct visual element the generator needs to recreate — every axis, every data series by name/color, every node/edge, every annotation.
- interactions: orbit/drag are valid if the figure benefits from pan/zoom; animation is valid for process or sequence diagrams. OrbitControls is NOT available in 2D — orbit means pan/zoom the SVG viewport, not 3D rotation.
- demo_steps: include when the concept has 2+ distinct phases. Each step state sets interaction values. Use [] if the figure is a single static view with no natural sequence.
- keyInsight: one sentence. The thing you most want the student to walk away remembering.
- reconstructionNotes: describe what matters for faithful recreation — axis labels, approximate data shape, color coding, key annotations — but do NOT enumerate exact data coordinates.
- Output ONLY valid JSON — no markdown fences, no explanation.`;

// ── Main planner ──────────────────────────────────────────────────────────────

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
        (authoredBlock ? `\n\n${authoredBlock}` : '') +
        `\n\nDesign an educational guided demo for this figure. Think through:
1. What is the core concept a student should understand from this figure?
2. What visual elements must be faithfully reconstructed?
3. What interactions (if any) let a student explore the concept hands-on?
4. What sequence of demo steps would build understanding from scratch?
5. What is the single most important insight the student should remember?

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
      elements: [],
      interactions: [],
      demo_steps: [],
      keyInsight: '',
      reconstructionNotes: '',
      raw: content.slice(0, 500),
    };
  }
}

// ── Plan refinement (mirrors planner.js refinePlan) ───────────────────────────

async function refinePlan2d(previousPlan, evaluation, figureStem, plannerModel = PLANNER_2D_MODEL) {
  if (!previousPlan) throw new Error('previousPlan is required');
  if (!evaluation) throw new Error('evaluation is required');
  if (!figureStem) throw new Error('figureStem is required');

  const planActionItems = (evaluation.plan_action_items || []).filter(Boolean);
  const genActionItems = (evaluation.action_items || []).filter(Boolean);

  const feedbackSummary = [
    'The previous interaction plan had issues.',
    ...(planActionItems.length
      ? ['Plan-level fixes requested:', ...planActionItems.map(a => `  • ${a}`), '']
      : []),
    'Generation-level issues observed:',
    ...genActionItems.map(a => `  • ${a}`),
    '',
    'Specific scores:',
    `  • Overall: ${evaluation.overall_average}/5`,
    `  • Concept accuracy: ${evaluation.concept_accuracy}/5`,
    ...(evaluation.failure_modes || []).map(m => `  • ${m}`),
    '',
    'Revise the interaction plan to address these issues.',
    'Output ONLY valid JSON (no markdown, no explanation).',
  ].join('\n');

  const userContent = [
    {
      type: 'text',
      text: `Figure: ${figureStem}\n\n${feedbackSummary}\n\nPrevious plan (for reference):\n${JSON.stringify(previousPlan, null, 2)}`,
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
  } catch (e) {
    throw new Error(`Failed to parse refined 2D plan: ${e.message}\n${content.slice(0, 300)}`);
  }
}

module.exports = { plan2dFigure, refinePlan2d, PLANNER_2D_MODEL };
