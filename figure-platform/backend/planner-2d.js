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
const PLANNER_2D_MAX_TOKENS = 10240;

// ── System prompt ─────────────────────────────────────────────────────────────

function buildPlanner2dPrompt(useFewShot = true) {
  return `You are an educational designer planning an interactive guided demo for a 2D textbook figure.

${INTERACTION_PALETTE}

Output ONLY this JSON (no markdown, no explanation):
{
  "concept": "One sentence: the core concept this figure teaches.",
  "figureType": "line_plot | scatter_plot | bar_chart | flow_chart | network_diagram | diagram | other",
  "elements": ["exhaustive list of every visual element to reconstruct — axes, data series, nodes, edges, labels, annotations, legends"],
  "interactions": [
    { "id": "camelCaseId", "type": "orbit | drag | hover | click | slider | toggle | button | state | animation | equation_input | code_editor", "teaches": "what the learner understands", "...": "plus ONLY that type's fields per INTERACTION FIELDS below" }
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
- code_editor is fully available in 2D and is often the RIGHT choice in array/tree/graph figures that illustrate an algorithm (heapify, a sort pass, BFS/DFS, scanline fill) are 2D figures whose lesson is the execution order, not the picture. Pair it with figureType "diagram" or "network_diagram" — never "flow_chart" or a plot type, since those route to renderers that cannot redraw an arbitrary structure per frame. When you pick code_editor, make it the figure's primary interaction rather than adding it alongside several sliders.
- demo_steps: include when the concept has 2+ distinct phases. Each step state sets interaction values. Use [] if the figure is a single static view with no natural sequence.
- keyInsight: one sentence. The thing you most want the student to walk away remembering.
- reconstructionNotes: describe what matters for faithful recreation — axis labels, approximate data shape, color coding, key annotations — but do NOT enumerate exact data coordinates.
- Output ONLY valid JSON — no markdown fences, no explanation.

${useFewShot ? `Here are two examples of good plans:

=== EXAMPLE 1: 2D coordinate diagram with an equation-input pair and a slice-direction toggle ===

Planner context:
A worked example evaluating the double integral of (2x - y^2) over the triangular region R enclosed by y = -x + 1, y = x + 1, and y = 3, with vertices (-2, 3), (0, 1), (2, 3). The y-axis divides R into R1 (shaded blue, left) and R2 (shaded yellow, right), each with a red vertical strip showing the inner integration direction — the decomposition into two Type-I sub-regions required when the lower boundary changes expression across the y-axis.

Requested interactions:
- equation_input for the two lower boundary equations, pre-filled "-x + 1" (left, R1) and "x + 1" (right, R2); editing either redraws that boundary, updates R1/R2, and updates the inner integral limits, showing that the formula change at x=0 is what forces the split
- toggle between Type I (vertical slices, R1 + R2 with red strips) and Type II (horizontal slices, one region with blue strips, x from -(y-1) to (y-1)) — teaches that switching integration order removes the need to decompose R

{
  "concept": "Splitting a region at the point where its lower boundary's formula changes is what forces a double integral into two Type-I sub-integrals; reordering to Type II slices removes the need to split.",
  "figureType": "diagram",
  "elements": [
    "x-axis with tick marks at -2, 0, 2 and y-axis",
    "triangular region R with vertices (-2,3), (0,1), (2,3)",
    "top boundary line y = 3",
    "lower-left boundary line y = -x + 1, labeled",
    "lower-right boundary line y = x + 1, labeled",
    "sub-region R1 (left half), shaded blue, labeled",
    "sub-region R2 (right half), shaded yellow, labeled",
    "red vertical strip marker inside R1 and R2 (Type I slice direction)",
    "blue horizontal strip marker spanning R (Type II slice direction)"
  ],
  "interactions": [
    {
      "id": "boundaryEquations",
      "type": "equation_input",
      "label": "Lower boundary equations",
      "fields": [
        { "id": "f1", "label": "Left boundary y =", "default": "-x + 1", "variables": ["x"], "domain": [-2, 0], "role": "boundary" },
        { "id": "f2", "label": "Right boundary y =", "default": "x + 1", "variables": ["x"], "domain": [0, 2], "role": "boundary" }
      ],
      "teaches": "The split point x=0 and the two sets of integration limits come directly from where the lower boundary's formula changes — editing either equation moves the split and reshapes R1/R2 accordingly"
    },
    {
      "id": "sliceDirection",
      "type": "toggle",
      "label": "Slice direction",
      "options": ["Type I (vertical)", "Type II (horizontal)"],
      "default": "Type I (vertical)",
      "teaches": "Reordering the integral to horizontal (Type II) slices covers all of R with one continuous sweep, removing the need to split into R1 and R2"
    }
  ],
  "demo_steps": [
    {
      "title": "Initial split",
      "narration": "The lower boundary is y = -x + 1 for x<0 and y = x + 1 for x>0, so R must be split into R1 and R2 at x=0 to integrate with vertical (Type I) slices.",
      "state": { "sliceDirection": "Type I (vertical)" }
    },
    {
      "title": "Edit a boundary",
      "narration": "Try changing the left boundary equation — R1 reshapes and the split point moves, showing the split is a direct consequence of the boundary formula, not a fixed feature of the region.",
      "state": { "sliceDirection": "Type I (vertical)" }
    },
    {
      "title": "Switch to Type II",
      "narration": "Toggling to horizontal slices covers R in a single continuous sweep from x=-(y-1) to x=(y-1), eliminating the need for two sub-integrals.",
      "state": { "sliceDirection": "Type II (horizontal)" }
    }
  ],
  "keyInsight": "A double integral must be split wherever the lower (or upper) boundary's formula changes across the slicing direction — choosing the other slicing direction can remove the split entirely.",
  "reconstructionNotes": "Triangle apex at (0,1), base corners at (-2,3) and (2,3). R1 fill a clear blue, R2 fill a clear yellow (not a muddy tan) so the two sub-regions read as distinct at a glance. Boundary line labels in italic serif math styling near their line. Red strip markers only visible in Type I mode; blue horizontal strip only visible in Type II mode — cross-fade between them on toggle rather than an abrupt cut."
}

=== END EXAMPLE 1 ===

=== EXAMPLE 2: Multi-panel conceptual diagram with a model toggle and a step-through binding animation ===

Planner context:
Two competing models of enzyme-substrate binding, shown as four diagrams in two panels. Panel (a), lock-and-key: a green enzyme with a rigid pre-formed cavity labeled 'Active site is proper shape', purple substrates above it, then 'Substrate complex formed' with the substrates seated in a geometrically unchanged site. Panel (b), induced fit: a more open, flexible site labeled 'Active site changes to fit', then 'Substrate complex formed' after the enzyme reshapes around the substrate. Both models explain substrate specificity; they differ in whether it comes from a rigid pocket or an adaptive conformational change.

Requested interactions:
- Toggle between the lock-and-key and induced-fit models: observe the rigid versus flexible active site as the substrate approaches and binds
- Animate substrate binding for each model, highlighting the conformational change in the induced-fit case but not in lock-and-key

{
  "concept": "Lock-and-key and induced fit both explain why an enzyme only binds a structurally compatible substrate, but only induced fit involves the active site itself changing shape upon binding.",
  "figureType": "diagram",
  "elements": [
    "green enzyme body with an active-site cavity",
    "purple substrate molecule(s), complementary in shape to the active site",
    "label 'Active site is proper shape' (lock-and-key, before binding)",
    "label 'Active site changes to fit' (induced fit, before binding)",
    "label 'Substrate complex formed' (after binding, both models)",
    "label 'Substrates'"
  ],
  "interactions": [
    {
      "id": "bindingModel",
      "type": "toggle",
      "label": "Binding model",
      "options": ["Lock-and-key", "Induced fit"],
      "default": "Lock-and-key",
      "teaches": "The two models differ in whether the active site's shape is fixed before binding (lock-and-key) or adjusts to the substrate (induced fit)"
    },
    {
      "id": "dockingState",
      "type": "button",
      "label": "Dock substrate",
      "states": ["idle", "docking", "bound"],
      "default": "idle",
      "teaches": "Stepping through docking shows the substrate approaching and seating in the active site — in induced fit, the active site outline visibly reshapes around it; in lock-and-key, the cavity outline stays fixed throughout"
    }
  ],
  "demo_steps": [
    {
      "title": "Two models, same specificity",
      "narration": "Both enzymes only accept a substrate whose shape is compatible with the active site — the difference is whether that compatibility exists before binding or is created by binding.",
      "state": { "bindingModel": "Lock-and-key", "dockingState": "idle" }
    },
    {
      "title": "Lock-and-key binding",
      "narration": "Step through docking: the substrate seats into a cavity whose shape never changes — 'proper shape' before and after.",
      "state": { "bindingModel": "Lock-and-key", "dockingState": "bound" }
    },
    {
      "title": "Induced-fit binding",
      "narration": "Switch models and step through docking again: this time the active site outline visibly reshapes and wraps around the substrate as it binds.",
      "state": { "bindingModel": "Induced fit", "dockingState": "bound" }
    }
  ],
  "keyInsight": "Substrate specificity is explained by both models, but only induced fit requires the enzyme's active-site shape to be dynamic rather than fixed.",
  "reconstructionNotes": "Show one binding-model panel at a time (per the toggle), not both side by side, so the toggle itself is the comparison. Enzyme body a solid green outline; substrate shapes solid purple, sized to visibly match (lock-and-key) or only approximately match until docked (induced fit) the active-site cavity. Keep the active-site outline path identical between idle/docking states for lock-and-key, and morph it for induced fit — that outline change is the entire teaching point."
}

=== END EXAMPLE 2 ===` : ''}`;
}

// ── Main planner ──────────────────────────────────────────────────────────────

async function plan2dFigure(figureStem, chapterName, base64, mediaType, plannerModel = PLANNER_2D_MODEL, useFewShot = true, authoredIntent = {}) {
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
        // The "think through" checklist this used to carry mapped 1:1 onto the
        // schema fields (concept / elements / interactions / demo_steps /
        // keyInsight) the system prompt already demands.
        `\n\nDesign an educational guided demo for this figure and return the pedagogical blueprint as JSON.`,
    },
  ];

  let content = await generateWithModel(plannerModel, {
    systemPrompt: buildPlanner2dPrompt(useFewShot),
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

async function refinePlan2d(previousPlan, evaluation, figureStem, plannerModel = PLANNER_2D_MODEL, useFewShot = true) {
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
    systemPrompt: buildPlanner2dPrompt(useFewShot),
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

module.exports = { plan2dFigure, refinePlan2d, PLANNER_2D_MODEL, buildPlanner2dPrompt };
