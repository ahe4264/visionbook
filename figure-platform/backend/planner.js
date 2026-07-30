/**
 * planner.js — extracts relevant chapter context for a figure and plans interactions
 *
 * Two modes:
 *   1. Single-figure:  planForFigure(figureStem, chapterName)
 *      → targeted extraction around that figure's references in the .qmd
 *   2. Chapter mode:    planChapter(chapterName)
 *      → identifies all 3D candidates, returns an array of plans (one per figure)
 *
 * Each plan = { figureStem, contextChunk, interactionPlan }
 *   - contextChunk:    the paragraphs around the figure reference in the .qmd
 *   - interactionPlan: LLM-generated interaction blueprint (fast, ~200 tokens)
 *
 * Used by the web generation pipeline.
 */

const { generateWithModel } = require('./models');
const { inferChapterFromFilename, list3dCandidates } = require('./chapter-discovery');
const { findQmdFile, extractFigureContext } = require('./qmd_utils');

const PLANNER_MODEL = 'gemini-3.5-flash';
const PLANNER_MAX_TOKENS = 10240;

// ── LLM interaction planner (fast, small-token call) ────────────────────────

// Shared across both planner profiles so the two prompts never drift.
// Interactions are grouped by "load" — how much generator code and failure
// risk each type adds — so the planner spends complexity only where the
// concept demands it.
const INTERACTION_PALETTE = `INTERACTION PALETTE — choose the interactions that best fit the concept. Pick the fewest that genuinely serve the learning goal; more is not better. In "teaches", say what the learner understands, not what the control does.

• orbit / drag — rotate/move the scene. When depth or 3D shape IS the concept.
• hover — reveal a label on demand. When showing every label at once clutters.
• click — highlight one element. When focus on one part of a busy scene matters.
• slider — sweep one continuous variable. When dragging it visibly transforms the figure.
• toggle — switch between 2+ named views. For before/after or dual views (e.g. spatial ↔ frequency).
• button / state — step through discrete phases. When distinct stages should be visited deliberately.
• animation — self-playing motion. When the concept is inherently dynamic and a slider can't convey it.
• equation_input — learner types math, parsed at runtime. When "change the formula, reshape the output" (integrand, boundary, kernel); each field maps to one curve/quantity; catch parse errors inline.
• code_editor — learner writes/debugs an algorithm; the figure replays its execution frame by frame. Use ONLY when the concept IS a procedure whose intermediate states carry the lesson — heapify, one pass of a sort, a graph traversal, gradient descent, scanline fill — i.e. the question a learner has is "in what order does it touch the data, and why". Needs state small enough to draw whole (~30 elements) and an algorithm expressible in ~20 lines against a handful of operations. Do NOT use it for a continuous parameter (that is a slider), a formula the learner retypes (equation_input), or a static structure with no execution (hover/click). Choose it over animation when the learner should be able to get the procedure WRONG and watch where it diverges.`;

const INTERACTION_FIELDS = `INTERACTION FIELDS — every interaction object has "id" (unique camelCase), "type", and "teaches". Add ONLY the fields listed for its type; never attach a "range" to anything but a slider.

"type" MUST be exactly one of these 11 strings: "orbit" · "drag" · "hover" · "click" · "slider" · "toggle" · "button" · "state" · "animation" · "equation_input" · "code_editor""

• orbit / drag / hover / click — no extra fields.
• animation      — "label", optional "loop": true | false.
• slider         — "label", "range": [min, max, step], "default": <number>.
• toggle         — "label", "options": ["A", "B", ...], "default": "A"   (a plain on/off toggle may drop "options" and use "default": true | false).
• button / state — "label", "states": ["idle", "running", "done"], "default": "idle".
• equation_input — "label", "fields": [ { "id": "...", "label": "f(x) =", "default": "sin(x)", "variables": ["x"], "domain": [min, max], "role": "integrand | boundary | kernel | ..." } ]. "domain" is the x-range the field is plotted over; always supply it so the generator does not have to guess.
• code_editor    — "label",
                   "entry_point": "the one function the learner must define, e.g. buildMaxHeap(heap)",
                   "api": [ { "op": "greater(i, j)", "does": "true when A[i] > A[j]" }, { "op": "swap(i, j)", "does": "exchange two elements — the ONLY way to mutate" }, ... ],
                   "frame": "what one recorded step shows, e.g. 'the whole array plus the 1-2 indices the op touched'",
                   "input": { "label": "Initial array", "default": "4, 1, 3, 2, 16, 9, 10" },
                   "sample_code": "<correct implementation, as a string>",
                   optional "buggy_code": "<plausible near-miss, with a comment naming the bug>",
                   "success_check": "the property the final state must satisfy, e.g. 'every parent >= both of its children'".
  Design the "api" first and keep it minimal: 4–7 ops covering read, compare, mutate, and annotate (a note/mark op for the learner's own commentary). Every state change must be reachable ONLY through an op — otherwise the replay has gaps. The learner writes algorithm logic, never drawing code.

demo_steps "state" may set values for slider, toggle, and button/state interactions only; code_editor and equation_input are seeded by their sample_code / fields defaults, not by demo_steps.`;

// The two profiles differ only by PRIMARY CONTEXT and a couple of rule wordings —
// they used to be two near-identical ~2.4k-token prompts that had already drifted.
// Both now honour useFewShot; the standalone branch silently ignored it before, so
// few-shot ablations under PLANNER_PROFILE=standalone-demo were a no-op.
const PLANNER_PROFILES = {
  inline: `PRIMARY CONTEXT:
The generated figure will be embedded alongside the original in a PDF reader. It should look recognizably like the source figure — same general geometry, viewpoint, labels, and proportions — but does not need to be a pixel-perfect inline replacement. Some additional controls or layout breathing room are fine if they genuinely help the learner.`,
  'standalone-demo': `PRIMARY CONTEXT:
The generated output will be opened as a standalone interactive learning artifact. It should still begin from a faithful reconstruction of the source figure, but it does not need to behave like a same-size inline PDF replacement. Decide which interactions, controls, annotations, and guided states best help a learner understand the concept.`,
};

const PLANNER_RULES = `Rules:
- PROJECTION TYPE: pick whichever the source most resembles. Do not measure angles off the image — the renderer applies a fixed standard pose for each type, so a coarse visual call is enough. Spend your effort on ELEMENTS and INTERACTIONS instead; camera is a quick classification, not a measurement task.
  • "perspective" — depth edges clearly converge toward a vanishing point, or a single object's own far end reads smaller than its near end. Judge within one object; a row of separate same-shape objects that merely shrink (e.g. neural-net layers) is not perspective.
  • "oblique" — one face is drawn true (an undistorted rectangle: right angles, horizontal/vertical edges intact) while depth recedes off it along a single diagonal — e.g. stacked feature maps/filter banks drawn as offset same-size copies.
  • "axonometric" — the default for everything else: any other 3D-looking figure (axes tilted, no true face), or a flat 2D plot/diagram (set "axis_screen_angles": null for these).
- CAMERA VIEW: camera_view sets framing only. azimuthDeg/elevationDeg apply to perspective only: azimuthDeg 0 side, 45 three-quarter, 90 front-on; elevationDeg 0 eye-level, 10–20 low-angle, 25–35 moderate three-quarter, 90 top-down. rollDeg is usually 0. heightFraction is how much of the frame the figure should fill (0.5 default, up to 0.75).
- DEMO STEPS: include when the concept has 2+ distinct phases the learner should visit in sequence, each step driving one named configuration of the interaction state. Use [] for a single continuous exploration with no natural sequence.
- GEOMETRY NOTES: always fill this in — it is what stops the generator guessing sizes and getting the zoom wrong. Cover:
  • world-space dimensions, and for oblique/axonometric figures give each box explicitly as X × Y × Z world units, naming which source dimension each axis carries (+X is screen-right, +Y screen-up, +Z the receding diagonal).
  • the colour palette, with hex codes where determinable from the source.
  • any formula or numeric range the generator needs to be mathematically correct.
  • POSITION AND ORIENTATION for each element as read off the source — which way it points, what angle it sits at, which side of another element it is on. Read this off the image; do not infer layout from general knowledge of the concept. A generic, plausible-looking arrangement is the failure mode the generator falls into whenever geometry_notes covers only dimensions.
  • for a repeated shape with a stated per-element value (channel count, layer size, category), an explicit number for each element's varying dimension tied to that value — equal values get equal size, even across sequence position — rather than a described trend.
- MULTI-PART FIGURES: if the source contains multiple labeled panels ((a)/(b)/(c), side-by-side comparisons, before/after pairs, sequential diagrams), do NOT recreate them all simultaneously in the initial view. Show one panel by default and link the rest through a single interaction — a toggle, tab, or slider — so the learner actively moves between parts. The transition itself should teach the comparison or progression.
- Prefer interactions that expose relationships in the figure rather than generic controls.`;

const PLANNER_FEW_SHOT = `Here are two examples of good plans:

=== EXAMPLE 1: Geometric 3D scene with sliders driving continuous object motion ===

Textbook context:
Perspective projection derived geometrically. A 3D point P at (X, Y, Z) projects through the pinhole at the origin onto the projection plane at distance f. From similar triangles: x = f * X/Z and y = f * Y/Z, so distant objects become smaller through the inverse scaling by Z.

{
  "projection_type": "perspective",
  "camera_view": { "azimuthDeg": 60, "elevationDeg": 12, "rollDeg": 0, "heightFraction": 0.6 },
  "elements": [
    "pinhole/aperture point at the origin",
    "3D point P floating in space at coordinates (X, Y, Z)",
    "projection plane perpendicular to the Z-axis at distance f",
    "projected point p = (x, y) on the projection plane",
    "light ray from P through the pinhole continuing to p",
    "Z-axis (optical axis) running through the pinhole",
    "X-axis horizontal through the pinhole",
    "similar-triangle annotations: one triangle in the XZ plane, one in the xf plane",
    "dimension labels: Z, X, f, x"
  ],
  "interactions": [
    {
      "id": "pointZ",
      "type": "slider",
      "label": "Depth Z",
      "range": [2, 12, 0.5],
      "default": 5,
      "teaches": "Moving P farther from the pinhole compresses its projected position toward the optical axis, demonstrating the 1/Z scaling in x = fX/Z"
    },
    {
      "id": "focalLength",
      "type": "slider",
      "label": "Focal length f",
      "range": [1, 5, 0.5],
      "default": 2,
      "teaches": "Increasing f moves the projection plane farther from the pinhole, magnifying the projected image — a longer focal length is like zooming in"
    }
  ],
  "demo_steps": [
    {
      "title": "Default setup",
      "narration": "P at depth Z=5 projects through the pinhole to x=f·X/Z=0.8 on the plane. Observe the ray from P through the origin continuing to the projected point.",
      "state": { "pointZ": 5, "focalLength": 2 }
    },
    {
      "title": "Increase depth Z",
      "narration": "Move P to Z=10. The projected x halves to 0.4 — the 1/Z inverse scaling is directly visible.",
      "state": { "pointZ": 10, "focalLength": 2 }
    }
  ],
  "geometry_notes": "Pinhole at origin: SphereGeometry ~0.08 units radius, black. 3D point P at roughly (2, 0.5, -5) from origin. Projection plane at z=-f as semi-transparent PlaneGeometry ~3×2 units, blue 0.18 opacity. Ray as a thin Line from P through origin to projected point. Geometry fits within ±3 X, ±2 Y, -12 to 0 Z. Colors: pinhole black, P orange #ff8800, projected point red #cc2200, ray red, plane blue.",
  "notes": "Update the ray endpoint, projected point, and both similar-triangle overlays reactively on every slider change. Render the ray as a solid line from P through the origin to the plane, with a dashed extension beyond it."
}

=== EXAMPLE 2: Mathematical function figure with a slider and a domain toggle ===

Textbook context:
The parameter sigma adjusts the spatial extent of the Gaussian g(x; sigma) = (1 / sqrt(2*pi*sigma^2)) * exp(-x^2 / (2*sigma^2)), normalized to integrate to 1. In practice only samples within three standard deviations are needed. The Fourier transform of a Gaussian is also a Gaussian, with width inversely proportional to sigma.

{
  "projection_type": "axonometric",
  "camera_view": { "rollDeg": 0, "heightFraction": 0.7 },
  "axis_screen_angles": null,
  "elements": [
    "x-axis with tick marks spanning -4 to +4",
    "y-axis with tick marks from 0 to 1",
    "smooth continuous Gaussian bell curve",
    "vertical stem markers at each integer sample position (discrete version)",
    "sigma annotation bracket from 0 to sigma on the x-axis",
    "3*sigma cutoff boundary markers (dashed vertical lines)",
    "baseline y=0"
  ],
  "interactions": [
    {
      "id": "sigma",
      "type": "slider",
      "label": "sigma",
      "range": [0.5, 3, 0.5],
      "default": 1,
      "teaches": "Controls the spatial width of the Gaussian — a wider sigma averages over more neighboring pixels, producing stronger blurring"
    },
    {
      "id": "domain",
      "type": "toggle",
      "label": "Domain",
      "options": ["Spatial", "Frequency"],
      "default": "Spatial",
      "teaches": "Switches between the spatial kernel and its Fourier transform, revealing that a wider spatial Gaussian produces a narrower frequency response"
    }
  ],
  "demo_steps": [
    {
      "title": "Narrow kernel",
      "narration": "σ=0.5 gives a tall, narrow peak — only very close neighbors are averaged; minimal blurring.",
      "state": { "sigma": 0.5, "domain": "Spatial" }
    },
    {
      "title": "Wide kernel",
      "narration": "Increase σ to 2. The curve spreads and flattens — more neighbors averaged, stronger blurring.",
      "state": { "sigma": 2, "domain": "Spatial" }
    }
  ],
  "geometry_notes": "X-axis spans x ∈ [-4.5, 4.5]. Y scale: map the sigma=1 peak (0.399) to 0.8 world-units for readability. Y-axis 0 to ~1.0. Curve as a 200-pt THREE.Line, blue #1a66cc. Stems as LineSegments at integer x ∈ [-4,4], grey. Camera straight-on — a pure 2D XY plot, hence axis_screen_angles: null. In the frequency domain sigma_freq = 1/(2π·sigma_spatial) and the x-axis MUST switch to [-0.5, 0.5] (Nyquist range) or the curve is an invisible spike.",
  "notes": "Recompute all curve points reactively whenever sigma changes. For the domain toggle keep both curves in the scene and show/hide rather than destroying geometry."
}

=== END EXAMPLE 2 ===`;

function buildPlannerPrompt(useFewShot = true) {
  const profile = PLANNER_PROFILES[process.env.PLANNER_PROFILE] || PLANNER_PROFILES.inline;

  return `You are an expert at planning interactive 3D visualizations for textbook figures.

${profile}

${INTERACTION_PALETTE}

Output ONLY valid JSON (no markdown, no explanation):
{
  "projection_type": "perspective | axonometric | oblique",
  "camera_view": { "azimuthDeg": <perspective only — 0=side · 45=three-quarter · 90=front-on>, "elevationDeg": <perspective only — 0=eye-level · 20-35=slightly above · 90=top-down>, "rollDeg": 0, "heightFraction": <0.5 default · up to 0.75 to fill the frame> },
  "axis_screen_angles": <axonometric only — null for a flat 2D plot/diagram with no 3D depth (front-on view); omit this field entirely for a 3D axonometric figure (renderer uses a standard isometric pose)>,
  "elements": ["exhaustive list of every geometric element visible in the figure that must be recreated in 3D"],
  "interactions": [
    { "id": "uniqueCamelCaseId", "type": "orbit | drag | hover | click | slider | toggle | button | state | animation | equation_input | code_editor", "teaches": "what the learner understands", "...": "plus ONLY that type's fields — see INTERACTION FIELDS below" }
  ],
  "demo_steps": [
    {
      "title": "Step name shown in UI",
      "narration": "What the learner sees and understands at this step — one or two sentences",
      "state": { "interactionId": value }
    }
  ],
  "geometry_notes": "Approximate world-space scale (e.g. 'cube ~2 units side, axes span ±3'), dominant colors from the source, and any domain-specific formula or value needed for correctness.",
  "notes": "Three.js / rendering technique notes (distinct from geometry_notes)"
}

${INTERACTION_FIELDS}

${PLANNER_RULES}${useFewShot ? `\n\n${PLANNER_FEW_SHOT}` : ''}`;
}

/**
 * Call the LLM to generate a quick interaction plan for one figure.
 * Optionally includes the image for vision-based planning.
 * Returns the parsed plan object.
 */
function buildAuthoredIntentBlock({ authoredInteractions, sourcePath } = {}) {
  const parts = [];
  if (authoredInteractions) parts.push(`Requested interactions:\n${String(authoredInteractions).trim()}`);
  if (sourcePath) parts.push(`Source file:\n${String(sourcePath).trim()}`);
  if (!parts.length) return '';
  return `AUTHOR-PROVIDED INTERACTION REQUESTS:\n${parts.join('\n\n')}\n\nUse these requested interactions when forming the plan. Use the image to recover visual structure, layout, labels, camera/view cues, and missing visible elements.`;
}

async function generateInteractionPlan(contextChunk, figureStem, { base64, mediaType } = {}, plannerModel = PLANNER_MODEL, useFewShot = true, authoredIntent = {}) {
  const userContent = [];

  // Include image if provided
  if (base64 && mediaType) {
    userContent.push({
      type: 'image_url',
      image_url: { url: `data:${mediaType};base64,${base64}` },
    });
  }

  // Always include text
  const authoredBlock = buildAuthoredIntentBlock(authoredIntent);
  userContent.push({
    type: 'text',
    text: `Figure: ${figureStem}\n\n${authoredBlock ? `${authoredBlock}\n\n` : ''}Planner context:\n${contextChunk.slice(0, 3000)}`,
  });

  let content = await generateWithModel(plannerModel || PLANNER_MODEL, {
    systemPrompt: buildPlannerPrompt(useFewShot),
    userContent,
    maxTokens: PLANNER_MAX_TOKENS,
  });
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) content = fenced[1].trim();

  try {
    return JSON.parse(content);
  } catch {
    return { concept: 'Could not parse plan', elements: [], interactions: [], labels: [], raw: content.slice(0, 500) };
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Plan for a single figure (fast path — used when user drops an image).
 *
 * @param {string} figureStem  - e.g. "brdf" or "pinhole_geometry2"
 * @param {string} chapterName - e.g. "imaging" (optional, will be inferred)
 * @param {object} imageData   - optional { base64, mediaType }
 * @returns {{ figureStem, chapterName, contextChunk, interactionPlan }}
 */
async function planForFigure(figureStem, chapterName, imageData, plannerModel = PLANNER_MODEL, useFewShot = true, authoredIntent = {}) {
  const resolvedChapter = chapterName || inferChapterFromFilename(figureStem);

  let contextChunk = (resolvedChapter && extractFigureContext(figureStem, resolvedChapter)) ||
    `Figure: ${figureStem}. No chapter text found — plan from filename alone.`;

  if (authoredIntent?.authoredPrompt) {
    contextChunk = String(authoredIntent.authoredPrompt);
  }
  const interactionPlan = await generateInteractionPlan(contextChunk, figureStem, imageData, plannerModel, useFewShot, authoredIntent);

  return {
    figureStem,
    chapterName: resolvedChapter || null,
    contextChunk,
    interactionPlan,
    ...(authoredIntent?.authoredPrompt ? { authoredPrompt: authoredIntent.authoredPrompt } : {}),
    ...(authoredIntent?.authoredInteractions ? { authoredInteractions: authoredIntent.authoredInteractions } : {}),
    ...(authoredIntent?.sourcePath ? { sourcePath: authoredIntent.sourcePath } : {}),
  };
}

/**
 * Plan for an entire chapter (batch path — used when user selects a chapter).
 * Returns plans for all 3D candidates, one at a time (async generator for streaming).
 *
 * @param {string} chapterName
 * @param {object} imageDataMap - optional map of figureStem -> { base64, mediaType }
 * @returns {Array<{ figureStem, chapterName, contextChunk, interactionPlan, imagePath }>}
 */
async function planChapter(chapterName, imageDataMap = {}, plannerModel = PLANNER_MODEL, useFewShot = true) {
  const candidates = list3dCandidates(chapterName);
  if (!candidates.length) return [];

  const plans = [];

  for (const candidate of candidates) {
    const contextChunk = extractFigureContext(candidate.stem, chapterName) ||
      `Figure: ${candidate.stem} from chapter "${chapterName}". No chapter text found.`;

    const interactionPlan = await generateInteractionPlan(contextChunk, candidate.stem, imageDataMap[candidate.stem], plannerModel, useFewShot);

    plans.push({
      figureStem: candidate.stem,
      filename: candidate.filename,
      chapterName,
      contextChunk,
      interactionPlan,
      imagePath: candidate.fullPath,
    });
  }

  return plans;
}

/**
 * Refine an existing plan based on critic feedback.
 * Called when plan-level issues are detected (e.g., missing interactions, concept misunderstood).
 *
 * @param {object} previousPlan - the interaction plan that failed
 * @param {object} evaluation - critic evaluation with scores and failure modes
 * @param {object} feedback - reviewer feedback with actionItems
 * @param {string} figureStem - e.g. "brdf"
 * @param {string} plannerModel - e.g. "gpt-4o"
 * @returns {Promise<object>} - revised interactionPlan
 */
async function refinePlan(previousPlan, evaluation, feedback, figureStem, plannerModel = PLANNER_MODEL, useFewShot = true) {
  if (!previousPlan) throw new Error('previousPlan is required');
  if (!evaluation) throw new Error('evaluation is required');
  if (!feedback) throw new Error('feedback is required');
  if (!figureStem) throw new Error('figureStem is required');

  // The critic emits plan-level fixes separately from generation-level ones.
  // Prefer plan_action_items here — those are the fixes aimed at the planner —
  // and keep the generation-level action_items as secondary symptom context.
  const planActionItems = (evaluation.plan_action_items || []).filter(Boolean);
  const genActionItems = (feedback.action_items || evaluation.action_items || []).filter(Boolean);

  const feedbackSummary = [
    'The previous interaction plan had issues.',
    ...(planActionItems.length
      ? ['Plan-level fixes requested by the critic:', ...planActionItems.map(a => `  • ${a}`), '']
      : []),
    'Generation-level issues observed (symptoms that may trace back to the plan):',
    ...genActionItems.map(a => `  • ${a}`),
    '',
    'Specific scores:',
    `  • Overall: ${evaluation.overall_average}/5`,
    `  • Concept accuracy: ${evaluation.concept_accuracy}/5`,
    ...(evaluation.failure_modes || []).map(m => `  • ${m}`),
    '',
    'Revise the interaction plan to address these issues.',
    'Focus on:',
    '  • Ensuring all required interactions are explicitly specified',
    '  • Clarifying the core concept that is being illustrated',
    '  • Specifying demo steps that progressively build understanding',
    'Output ONLY valid JSON (no markdown, no explanation).',
  ].join('\n');

  const userContent = [
    {
      type: 'text',
      text: `Figure: ${figureStem}\n\nContext:\n${previousPlan.contextChunk?.slice(0, 2000) || 'N/A'}\n\n${feedbackSummary}\n\nPrevious plan (for reference):\n${JSON.stringify(previousPlan.interactionPlan, null, 2)}`,
    },
  ];

  let content = await generateWithModel(plannerModel, {
    systemPrompt: buildPlannerPrompt(useFewShot),
    userContent,
    maxTokens: PLANNER_MAX_TOKENS,
  });

  // Strip markdown fences if present
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) content = fenced[1].trim();

  try {
    const refinedPlan = JSON.parse(content);
    return refinedPlan;
  } catch (e) {
    throw new Error(`Failed to parse refined plan: ${e.message}\n${content.slice(0, 300)}`);
  }
}

module.exports = {
  planForFigure,
  planChapter,
  refinePlan,
  PLANNER_MODEL,
  INTERACTION_PALETTE,
  INTERACTION_FIELDS,
  INTERACTION_FIELDS_TEXT: INTERACTION_FIELDS,
  buildAuthoredIntentBlock,
};
