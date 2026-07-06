/**
 * critic.js — shared critic (evaluator) definition
 *
 * Used by the web generation pipeline.
 * Edit this file to change what the critic looks for, how it scores, or what it outputs.
 */

const { generateWithModel } = require('./models');
const { screenshotHtml } = require('./runtime-helpers');
const { extractPayloadFromHtml, formatPayload } = require('./generation');
const { loadQmdForChapter, numberLines } = require('./qmd_utils');

const CRITIC_DEFAULT_MODEL = 'gemini-3.1pro';
const CRITIC_MAX_TOKENS_PER_CALL = 8196;
// Change this value to start a new evaluation experiment namespace.
const CRITIC_EXPERIMENT_BASE = 'default_critic';

// ── Per-dimension GOLD_EVAL calibration slices ────────────────────────────────
// Each array contains examples at scores 1, 3, and 4 to calibrate the full scoring range.
// Each slice owns strictly disjoint keys — Object.assign merge in evaluateHtmlWithCritic is safe.

const GOLD_EVAL_GEOMETRY = [
  {
    geometry_accuracy_analysis: 'The layout bears no resemblance to the source. A single flat PlaneGeometry with a screenshot texture renders the figure as a 2D image in 3D space — no actual 3D primitives are constructed. None of the source elements (cameras, image planes, ray) exist as Three.js geometry objects. No spatial relationships to evaluate. Default viewpoint shows only a flat textured rectangle.',
    geometry_accuracy: 1,
    geometry_accuracy_improvement: 'Replace the canvas/texture approach entirely — construct each element as Three.js geometry: BoxGeometry for cameras, PlaneGeometry for image planes, a Line for the epipolar ray.',
  },
  {
    geometry_accuracy_analysis: 'Major layout is partially preserved — both cameras and image planes are present as 3D primitives (BoxGeometry and PlaneGeometry). However, the epipolar ray connecting Camera 1 to Image Plane 2 is missing entirely. The coordinate axes are present but incorrectly scaled, appearing ten times larger than the cameras. Spatial positions are otherwise sensible: cameras left/right, planes in front. Default viewpoint is slightly off-axis, clipping part of the right camera behind the canvas edge.',
    geometry_accuracy: 3,
    geometry_accuracy_improvement: 'Add the epipolar ray as a Three.js Line connecting Camera 1\'s center to the intersection point on Image Plane 2, and reduce coordinate axis scale to match camera proportions.',
  },
  {
    geometry_accuracy_analysis: 'Layout is fully preserved — both cameras (BoxGeometry), two image planes (PlaneGeometry), the red epipolar ray (Line), and coordinate axes are all present in correct relative positions. Spatial relationships make sense: cameras left/right, planes in front, ray connecting them. Proportions are close to the source. Minor issue: the default camera viewpoint is slightly more top-down than the source, which partially obscures the depth relationship between the cameras and image planes.',
    geometry_accuracy: 4,
    geometry_accuracy_improvement: 'Adjust the default camera elevation angle to more closely match the source figure\'s 3/4 view so the depth relationship between cameras and image planes is clearly readable.',
  },
];

const GOLD_EVAL_INTERACTIVITY = [
  {
    interactivity_usability_analysis: 'No developer-built controls are present. The only interaction is OrbitControls (mouse drag to rotate/zoom the scene). No buttons, sliders, toggles, or step-through animations were implemented.',
    interactivity_usability: 1,
    interactivity_usability_improvement: 'Add at least one developer-built interaction — e.g., a slider to rotate Camera 2 and show how the epipolar line shifts, or step buttons that narrate the epipolar geometry concept.',
  },
  {
    interactivity_usability_analysis: 'One developer-built control: a "Next Step" button that cycles through three narration panels explaining epipolar geometry. The button is functional and the text updates correctly. No sliders or parameter controls are present — the geometry itself does not change with the button, only the narration text.',
    interactivity_usability: 3,
    interactivity_usability_improvement: 'Add a parameter control (e.g., a slider) that visibly changes the scene geometry — such as rotating Camera 2 to show how it shifts the epipolar line on Image Plane 2.',
  },
  {
    interactivity_usability_analysis: 'Two developer-built controls: (1) Camera rotation slider — functional, visibly rotates Camera 2 and updates the epipolar line on Image Plane 2 in real time. (2) Three step buttons with narration — functional, update both text and highlight the relevant geometry element. Minor usability issue: the UI panel overlaps the bottom of the scene at small viewport widths, partially covering Image Plane 2.',
    interactivity_usability: 4,
    interactivity_usability_improvement: 'Fix the UI panel layout so it does not overlap the scene at small viewport widths — position it below the canvas or add a minimum height constraint.',
  },
];

const GOLD_EVAL_FAITHFULNESS = [
  {
    faithfulness_analysis: 'The rendered output does not resemble the source figure at all. The source shows two cameras with image planes and a red epipolar ray on a white background. The output renders a blue sphere at the center with orbit rings around it — a completely different scene. Colors, composition, and subject matter are all wrong.',
    discrepancies: [
      'subject matter is entirely different: source is a stereo camera setup, output is an orbital sphere',
      'colors do not match: blue sphere vs. gray cameras and red ray',
      'no image planes present',
      'no epipolar ray present',
    ],
    faithfulness: 1,
    faithfulness_improvement: 'Rebuild the scene to match the source: two gray rectangular cameras, two white image planes, and a red ray from Camera 1 to Image Plane 2.',
  },
  {
    faithfulness_analysis: 'The general layout is recognizable — two cameras and image planes are visible in roughly the correct arrangement. However, colors are significantly off: cameras are bright green rather than gray, and the epipolar ray is blue rather than red. The image planes are translucent purple rather than white. One camera body is twice the size of the other, which is not the case in the source.',
    discrepancies: [
      'camera color is bright green instead of gray',
      'epipolar ray is blue instead of red',
      'image planes are translucent purple instead of white',
      'Camera 2 is roughly twice the size of Camera 1 — asymmetric sizing not present in source',
    ],
    faithfulness: 3,
    faithfulness_improvement: 'Fix material colors: set cameras to gray, the epipolar ray to red, and image planes to white to match the source figure.',
  },
  {
    faithfulness_analysis: 'Overall similarity is high — the stereo camera arrangement, red epipolar ray, and image planes are recognizable at a glance and match the source composition. Colors are broadly correct (red ray, gray cameras, white planes). Proportions are close. Significant differences: camera bodies are cone/pyramid primitives rather than rectangular boxes; an extra green arrow labeled T appears at the bottom that is not in the source; axis arrows on the cameras are rendered in 3D while the source shows them as flat 2D indicators; far more text labels are present than in the original.',
    discrepancies: [
      'camera shapes differ: they are pyramids when they should be rectangles',
      'there are more labels than the original figure has',
      'there is an extra green arrow labelled T at the bottom',
      'blue and green axis arrows on cameras are 3D when they should be 2D',
    ],
    faithfulness: 4,
    faithfulness_improvement: 'Remove the extra green T arrow not present in the source and replace the 3D axis arrows on the camera bodies with flat 2D indicators.',
  },
];

const GOLD_EVAL_LABEL_QUALITY = [
  {
    label_quality_analysis: 'Source labels: "Camera 1", "Camera 2", "Image Plane 1", "Image Plane 2", "Epipolar Line". In the output: "Camera 1" ✓ present, small font; "Camera 2" ✓ present, small font; "Image Plane 1/2" ✓ present, small font; "Epipolar Line" ✓ present but barely readable. Additionally, the output adds axis labels (x1, y1, z1, x2, y2, z2), coordinate origin labels, ray labels, and epipole markers that do not appear in the source — severe label clutter. All label fonts are 12–14px, much smaller than the source figure\'s scale.',
    label_quality: 1,
    label_quality_improvement: 'Remove axis labels (x1, y1, z1, x2, y2, z2) and other labels absent from the source figure, and increase remaining label font sizes to at least 16px.',
  },
  {
    label_quality_analysis: 'Source labels: "Camera 1", "Camera 2", "Image Plane 1", "Image Plane 2", "Epipolar Line". In the output: "Camera 1" ✓ correct text, 18px, well-placed; "Camera 2" ✓ correct text, 18px, well-placed; "Image Plane 1" ✗ text reads "Plane A" — incorrect; "Image Plane 2" ✗ absent — missing entirely; "Epipolar Line" ✓ correct text but 12px and overlaps the ray geometry. No extra labels beyond source.',
    label_quality: 3,
    label_quality_improvement: 'Rename "Plane A" to "Image Plane 1", add the missing "Image Plane 2" label, and increase the "Epipolar Line" font size to 16px with a small offset to avoid overlapping the ray.',
  },
  {
    label_quality_analysis: 'Source labels: "Camera 1", "Camera 2", "Image Plane 1", "Image Plane 2", "Epipolar Line". In the output: "Camera 1" ✓ correct, 18px, well-placed; "Camera 2" ✓ correct, 18px, well-placed; "Image Plane 1" ✓ correct, 16px, well-placed; "Image Plane 2" ✓ correct, 16px, well-placed; "Epipolar Line" ✓ correct text, 16px, but positioned slightly behind the image plane geometry and partially occluded at the default camera angle. No extra labels.',
    label_quality: 4,
    label_quality_improvement: 'Adjust the "Epipolar Line" label position so it renders in front of the image plane geometry and is not occluded at the default camera angle.',
  },
];

const GOLD_EVAL_CONCEPT_ACCURACY = [
  {
    concept_accuracy_analysis: 'Core concept: epipolar geometry — a 3D point visible in two cameras must lie on corresponding epipolar lines in each image. User-visible claims: (1) "Camera 1" / "Camera 2" labels — accurate. (2) Step 1 button label: "Rotate the epipole" — inaccurate; the epipole is a fixed projected point, not something the user rotates. (3) Step 2 narration: "Moving the slider changes the focal length of Camera 1" — inaccurate; the slider controls camera rotation, not focal length. (4) Step 3 narration: "The blue line shows the field of view" — inaccurate; the blue line is the epipolar line, not a field of view indicator. Three of four user-visible claims contain misinformation.',
    concept_accuracy: 1,
    concept_accuracy_improvement: 'Rewrite all user-visible narration: the slider controls camera rotation (not focal length), the highlighted line is the epipolar line (not field of view), and the epipole is a projected point (not something the user rotates).',
  },
  {
    concept_accuracy_analysis: 'Core concept: epipolar geometry — the relationship between two camera views and the epipolar line constraint. User-visible claims: (1) "Camera 1" / "Camera 2" labels — accurate. (2) "Image Plane 1" / "Image Plane 2" labels — accurate. (3) Step narration: "The red ray from Camera 1 defines a line in the image of Camera 2" — accurate and specific. (4) Slider label: "Camera Distance" — misleading; the slider controls camera rotation angle, not distance. (5) Tooltip on epipolar line: "This is the baseline" — inaccurate; the baseline is the line between camera centers, not the epipolar line. Two of five claims are inaccurate.',
    concept_accuracy: 3,
    concept_accuracy_improvement: 'Rename the slider label from "Camera Distance" to "Camera 2 Rotation Angle" and correct the epipolar line tooltip from "baseline" to "epipolar line — the projection of the 3D ray into Camera 2\'s image plane".',
  },
  {
    concept_accuracy_analysis: 'Core concept: epipolar geometry — a 3D point visible in two cameras defines an epipolar line constraint in each image. User-visible claims: (1) Camera and image plane labels — accurate. (2) Step 1 narration: "A 3D point observed in Camera 1 projects a ray into space" — accurate. (3) Step 2 narration: "This ray intersects Camera 2\'s image plane along the epipolar line" — accurate. (4) Step 3 narration: "Changing camera pose shifts the epipolar line" — accurate. (5) Slider label: "Baseline length" — slightly misleading; the slider changes the translation vector magnitude but "baseline length" implies only distance, not direction. Minor inaccuracy that does not fundamentally mislead.',
    concept_accuracy: 4,
    concept_accuracy_improvement: 'Rename the slider label from "Baseline length" to "Camera 2 translation" to more accurately describe that the slider controls the full translation vector.',
  },
];

const GOLD_EVAL_AGGREGATOR = [
  {
    notes: 'The figure is fundamentally mis-implemented — flat canvas textures instead of 3D primitives, no developer-built interactions, and concept narration contains several factual errors. A plan revision is needed before generation fixes will be effective.',
    action_items: [
      'Replace the single flat PlaneGeometry/canvas texture with actual 3D primitives: BoxGeometry for cameras, PlaneGeometry for image planes, Line for the epipolar ray.',
      'Rewrite all user-visible narration to accurately describe epipolar geometry — fix the slider label, epipolar line tooltip, and step descriptions.',
      'Add at least two developer-built interactions: a camera rotation slider that visibly updates the epipolar line, and step buttons that narrate the concept.',
    ],
  },
  {
    notes: 'The figure captures the core structure but has gaps across multiple dimensions: the epipolar ray is missing, two label names are wrong, and one user-visible claim misidentifies the baseline. Execution fixes across geometry, labels, and concept would meaningfully raise quality.',
    action_items: [
      'Add the epipolar ray as a Three.js Line from Camera 1\'s center to Image Plane 2, and reduce coordinate axis scale to match camera proportions.',
      'Rename "Plane A" to "Image Plane 1", add the missing "Image Plane 2" label, and increase the "Epipolar Line" font to 16px.',
      'Correct the slider label from "Camera Distance" to "Camera 2 Rotation Angle" and fix the epipolar line tooltip to read "epipolar line" rather than "baseline".',
    ],
  },
  {
    notes: 'Concept and visual composition are solid, but label clutter (score 1), wrong camera primitives (score 2), and a broken rotation slider (score 2) are the primary blockers. Faithfulness is close but held back by extra elements not in the source.',
    action_items: [
      'Remove axis labels (x1, y1, z1, x2, y2, z2) and other labels absent from the source figure, and increase remaining label font sizes to at least 16px.',
      'Replace cone/pyramid camera body geometry with BoxGeometry to match the rectangular camera shapes in the source figure.',
      'Fix the rotation slider — add a Three.js rotation update to the epipolar line geometry so it visibly responds to the slider value on image plane 2.',
      'Remove the extra green T arrow not present in the source and replace the 3D axis arrows on the camera bodies with flat 2D indicators.',
    ],
  },
];

const SCORE_KEYS = ['geometry_accuracy', 'interactivity_usability', 'faithfulness', 'label_quality', 'concept_accuracy'];
const GEOMETRY_PHASE_RUBRICS = ['geometry_accuracy', 'faithfulness', 'label_quality'];
const CONTENT_PHASE_RUBRICS = ['interactivity_usability', 'concept_accuracy'];

// ── Per-dimension system prompts ───────────────────────────────────────────────
// All prompts receive the same userContent (source image + screenshot + code).

const CRITIC_SHARED_PREAMBLE = `You are a strict critic scoring a specific rubric dimension for a generated interactive Three.js 3D figure.
Be critical and honest — err toward lower scores when in doubt.
Respond ONLY with valid JSON — no explanation, no markdown, no fences.

SCAFFOLD CONTEXT (provided automatically by the harness — do NOT penalize for missing these):
- THREE, OrbitControls, renderer, scene, orthographic camera, controls, and animate loop are all pre-wired.
- addLabel(text, position3D, {color, fontSize, bold, offset, background}?) — floating HTML label system.
- setStandardView({azimuth, polar, heightFraction}?) — frames the camera to scene content.
- A "Reset View" button is scaffolded but should not appear as visible chrome in inline output.`;

const CRITIC_PROMPT_GEOMETRY_ACCURACY = `${CRITIC_SHARED_PREAMBLE}

DIMENSION: Geometric accuracy — how well the generated figure reconstructs the 3D geometry of the original.
Evaluate: whether the major geometric layout is preserved; whether the HTML builds real 3D primitives (not flat cards, images, or canvases); which geometric objects are present (planes, rays, arrows, axes, surfaces, cameras, etc.) and whether any are missing; whether relative positions, scale, depth, and connections make spatial sense; whether the default camera view makes the geometry readable without hiding key spatial relationships.
Watch for: wrong shapes for elements (e.g. cone instead of box for a camera), proportions noticeably off.
SCORE OVERRIDE — FAKE 3D: If the HTML uses canvas.getContext('2d'), CanvasTexture, a flat PlaneGeometry with a drawn/pasted image as a texture, or any approach that renders a 2D drawing as a substitute for real geometry — score MUST be 1. This overrides all other scoring rules regardless of visual recognizability.
INLINE REPLACEMENT STANDARD: The rendered first frame must be a drop-in replacement for the source image — same apparent crop, zoom, camera angle, perspective/orthographic feel, object scale, and whitespace. Penalize over-zooming, under-zooming, stretched aspect ratio, shifted object position, changed perspective, or missing whitespace. If the default viewpoint differs meaningfully from the source (e.g. a top face visible in the source is hidden in the render, foreground/background order is reversed), cap score at 3.
You will receive the original source figure image and the generated HTML/JavaScript code.

geometry_accuracy — integer 1–5:
  5 – All elements represented; plausible positions, connections, proportions
  4 – All major elements present; minor position/alignment issues
  3 – 1-2 elements missing OR noticeable spatial errors; concept still recognizable
  2 – Multiple missing elements OR major spatial errors
  1 – Unrecognizable, completely wrong topology, or fake 3D

Output this exact JSON:
{
  "geometry_accuracy_analysis": "assess layout preservation, use of real 3D primitives, presence of key geometric objects, spatial relationships, and camera viewpoint — cite specific evidence",
  "geometry_accuracy": "<integer 1-5>",
  "geometry_accuracy_improvement": "one concrete fix for the most impactful geometry issue, or null if score is 5"
}`;

const CRITIC_PROMPT_INTERACTIVITY_USABILITY = `${CRITIC_SHARED_PREAMBLE}

DIMENSION: Interactivity and usability — quality of developer-built interactions.
CRITICAL: OrbitControls (mouse drag to rotate/zoom) does NOT count as a meaningful interaction. Meaningful = buttons, sliders, toggles, step-through animations, parameter controls built by the developer.
Evaluate: number of meaningful interactions, whether they are functional, whether they are pedagogically useful. Use the interaction plan to check whether planned interactions were actually implemented.
Watch for: controls present in code but non-functional, only OrbitControls with no developer-built interactions (score must be 1).
You will receive the interaction plan and the generated HTML/JavaScript code.

interactivity_usability — integer 1–5:
  5 – 3+ meaningful interactions, all functional and pedagogically useful; guided step-through demo present
  4 – 2 meaningful interactions functional and pedagogically useful; minor usability issues
  3 – 1 meaningful interaction functional and pedagogically useful; no guided demo
  2 – Interactions exist in code but are broken or have no visible effect
  1 – Only OrbitControls present, or no interactions at all — score MUST be 1

Output this exact JSON:
{
  "interactivity_usability_analysis": "list every developer-built interaction with evidence of whether it is functional and pedagogically useful",
  "interactivity_usability": "<integer 1-5>",
  "interactivity_usability_improvement": "one concrete fix for the most impactful interactivity issue, or null if score is 5"
}`;

const CRITIC_PROMPT_FAITHFULNESS = `${CRITIC_SHARED_PREAMBLE}

DIMENSION: Visual faithfulness — how closely the rendered output matches the original textbook figure.
Evaluate: color match, compositional similarity, proportions, overall visual resemblance at a glance.
Watch for: colors that don't match the original, elements present that don't appear in the original, proportions noticeably off.
You will receive the original source figure image and a rendered screenshot of the generated HTML.

faithfulness — integer 1–5:
  5 – Matches original ≥95% (colors, proportions, composition)
  4 – Matches ≥85%; recognizable at a glance
  3 – Matches ≥65%; general idea clear
  2 – Matches <65%; hard to recognize
  1 – Completely different or fabricated

Output this exact JSON:
{
  "faithfulness_analysis": "describe overall similarity with specific visual evidence — colors, composition, proportions — then list the most significant differences",
  "discrepancies": ["discrepancy 1", "discrepancy 2"],
  "faithfulness": "<integer 1-5>",
  "faithfulness_improvement": "one concrete fix for the most impactful faithfulness issue, or null if score is 5"
}`;

const CRITIC_PROMPT_LABEL_QUALITY = `${CRITIC_SHARED_PREAMBLE}

DIMENSION: Label quality — which figure has better text labels and annotations matching the original.
Evaluate: presence of all required labels, correctness of label text, readability, size, placement, and freedom from clutter.
Watch for: important annotations absent, labels not present in the original figure.
You will receive the original source figure image and a rendered screenshot of the generated HTML.

label_quality — integer 1–5:
  5 – All labels correct, clear, well-sized, well-placed, not cluttered
  4 – 1-2 labels have minor issues; rest perfect
  3 – Half of labels have issues (size/placement/clarity/clutter)
  2 – Most labels problematic or missing
  1 – No labels or all wrong/unreadable/severely cluttered

Output this exact JSON:
{
  "label_quality_analysis": "list the labels in the source figure and cite evidence of whether each appears in the output with correct text, appropriate size, and placement",
  "label_quality": "<integer 1-5>",
  "label_quality_improvement": "one concrete fix for the most impactful label issue, or null if score is 5"
}`;

const CRITIC_PROMPT_CONCEPT_ACCURACY = `${CRITIC_SHARED_PREAMBLE}

DIMENSION: Conceptual accuracy — how well the figure teaches the correct concept via its labels, tooltips, interactions, and geometry.
1. EXTRACT: identify the key concept illustrated by the source figure (1-3 concepts)
2. FOR EACH CONCEPT: assess how well the generated figure teaches it via its labels, tooltips, interactions, and geometry
3. IDENTIFY MISMATCHES: user-visible claims in the figure that contradict or ignore the concept (label text, button descriptions, narration text, step titles only — not code comments)
You will receive the original source figure image and the generated HTML/JavaScript code.

concept_accuracy — integer 1–5:
  5 – All concepts accurate; interactions demonstrate correct relationships; no misinformation
  4 – Main concept correct; ≤1 minor detail wrong or missing
  3 – Main concept present; 2-3 details wrong or missing
  2 – Significant errors or fabrications; would mislead students
  1 – Completely incorrect or misleading

Output this exact JSON:
{
  "concept_accuracy_analysis": "identify the core concept; then list each user-visible claim (label text, button descriptions, narration) with evidence of whether it is accurate or misleading",
  "concept_accuracy": "<integer 1-5>",
  "concept_accuracy_improvement": "one concrete fix for the most impactful concept issue, or null if score is 5"
}`;

const CRITIC_PROMPT_AGGREGATOR = `You receive per-dimension scores and analyses for a generated interactive Three.js 3D figure.
Synthesize a summary and prioritized action list for the next iteration. Up-weight the lowest-scoring active dimensions only.
Be specific — action items must name the actual elements, labels, controls, claims, or interactions to fix, not generic advice.
Respond ONLY with valid JSON — no explanation, no markdown, no fences.
You will receive the original source figure image, the generated HTML/JavaScript code, a rendered screenshot, and the dimension scores and analyses.

Output this exact JSON:
{
  "notes": "2-4 sentence holistic summary of overall quality and main issues",
  "action_items": ["Fix X", "Adjust Y"]
}`;

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildCriticSystemPrompt(basePrompt, goldEvalExamples, useFewShot) {
  if (!useFewShot) return basePrompt;
  const examples = (Array.isArray(goldEvalExamples) ? goldEvalExamples : [goldEvalExamples])
    .map((ex, i) => `Example ${i + 1}:\n${JSON.stringify(ex, null, 2)}`)
    .join('\n\n');
  return basePrompt + '\n\n' +
    'Example outputs for calibration — use these to understand the scoring scale and reasoning style. Do not copy these values:\n' +
    examples;
}

function buildAggregatorSystemPrompt(useFewShot) {
  if (!useFewShot) return CRITIC_PROMPT_AGGREGATOR;
  const examples = GOLD_EVAL_AGGREGATOR
    .map((ex, i) => `Example ${i + 1}:\n${JSON.stringify(ex, null, 2)}`)
    .join('\n\n');
  return CRITIC_PROMPT_AGGREGATOR + '\n\n' +
    'Example outputs for calibration — use these to understand the expected format and specificity. Do not copy these values:\n' +
    examples;
}

function parseJsonResponse(raw) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = fenced ? fenced[1].trim() : raw.trim();
  try { return JSON.parse(text); }
  catch { throw new Error('Critic did not return valid JSON: ' + text.slice(0, 200)); }
}

function getCriticContext() {
  return { criticVersion: CRITIC_EXPERIMENT_BASE };
}

// ── Finalise raw evaluator output: clamp, derive visual_aesthetics + overall ──
function finaliseEval(evaluation, activeRubrics = SCORE_KEYS) {
  for (const key of activeRubrics) {
    evaluation[key] = Math.min(5, Math.max(1, Math.round(Number(evaluation[key]) || 3)));
  }
  if (GEOMETRY_PHASE_RUBRICS.every(k => activeRubrics.includes(k))) {
    evaluation.visual_aesthetics = Math.round(
      ((evaluation.geometry_accuracy + evaluation.faithfulness + evaluation.label_quality) / 3) * 10
    ) / 10;
  }
  evaluation.overall_average = Math.round(
    (activeRubrics.reduce((s, k) => s + evaluation[k], 0) / activeRubrics.length) * 10
  ) / 10;
  return evaluation;
}

/**
 * Run evaluator model and return finalised rubric scores.
 * Makes 5 parallel calls — one per rubric dimension — with per-dimension inputs:
 *   geometry:      source image + screenshot + HTML
 *   interactivity: plan + HTML
 *   faithfulness:  source image + screenshot
 *   labels:        source image + screenshot
 *   concept:       QMD + plan + HTML
 *
 * @param {{
 *   html: string,
 *   evalImage?: string,
 *   evalMediaType?: string,
 *   plan?: object,
 *   chapterName?: string,
 *   model?: string,
 *   maxTokens?: number,
 *   useFewShot?: boolean,
 * }} opts
 */
async function evaluateHtmlWithCritic(opts) {
  const {
    html,
    evalImage,
    evalMediaType = 'image/png',
    plan,
    chapterName,
    model = CRITIC_DEFAULT_MODEL,
    maxTokens = CRITIC_MAX_TOKENS_PER_CALL,
    useFewShot = true,
    rubrics,
  } = opts || {};

  const activeRubrics = Array.isArray(rubrics) && rubrics.length ? rubrics : SCORE_KEYS;

  if (!html) throw new Error('No HTML found for evaluation.');

  const rendered = await screenshotHtml(html);

  // Shared content blocks — composed per-dimension below.
  const sourceImageParts = evalImage ? [
    { type: 'text', text: 'Reference source figure image:' },
    { type: 'image_url', image_url: { url: `data:${evalMediaType};base64,${evalImage}` } },
  ] : [];

  const screenshotParts = rendered?.data ? [
    { type: 'text', text: 'Rendered screenshot of the generated HTML output:' },
    { type: 'image_url', image_url: { url: `data:${rendered.mediaType || 'image/jpeg'};base64,${rendered.data}` } },
  ] : [];

  const htmlPart = {
    type: 'text',
    text: `Here is the generated code to evaluate:\n\n${formatPayload(extractPayloadFromHtml(html) ?? { uiHtml: '', codeJs: html })}`,
  };
  const outputInstruction = { type: 'text', text: 'Output ONLY the JSON evaluation object.' };

  const planParts = plan ? [
    { type: 'text', text: `Interaction plan:\n${JSON.stringify(plan, null, 2)}` },
  ] : [];

  let qmdParts = [];
  if (chapterName) {
    try {
      const qmdText = loadQmdForChapter(chapterName);
      qmdParts = [{ type: 'text', text: `Textbook QMD source:\n${numberLines(qmdText)}` }];
    } catch { /* chapter not found — skip QMD */ }
  }

  // Per-dimension userContent per spec.
  const geometryContent = [...sourceImageParts, htmlPart, outputInstruction];
  const interactivityContent = [...planParts, htmlPart, outputInstruction];
  const faithfulnessContent = [...sourceImageParts, ...screenshotParts, outputInstruction];
  const labelsContent = [...sourceImageParts, ...screenshotParts, outputInstruction];
  const conceptContent = [...qmdParts, ...planParts, htmlPart, outputInstruction];

  // Run only the requested rubric calls in parallel.
  // Each call owns strictly disjoint output keys — Object.assign merge is safe.
  const rubricRegistry = {
    geometry_accuracy: () => generateWithModel(model, { systemPrompt: buildCriticSystemPrompt(CRITIC_PROMPT_GEOMETRY_ACCURACY, GOLD_EVAL_GEOMETRY, useFewShot), userContent: geometryContent, maxTokens }),
    interactivity_usability: () => generateWithModel(model, { systemPrompt: buildCriticSystemPrompt(CRITIC_PROMPT_INTERACTIVITY_USABILITY, GOLD_EVAL_INTERACTIVITY, useFewShot), userContent: interactivityContent, maxTokens }),
    faithfulness: () => generateWithModel(model, { systemPrompt: buildCriticSystemPrompt(CRITIC_PROMPT_FAITHFULNESS, GOLD_EVAL_FAITHFULNESS, useFewShot), userContent: faithfulnessContent, maxTokens }),
    label_quality: () => generateWithModel(model, { systemPrompt: buildCriticSystemPrompt(CRITIC_PROMPT_LABEL_QUALITY, GOLD_EVAL_LABEL_QUALITY, useFewShot), userContent: labelsContent, maxTokens }),
    concept_accuracy: () => generateWithModel(model, { systemPrompt: buildCriticSystemPrompt(CRITIC_PROMPT_CONCEPT_ACCURACY, GOLD_EVAL_CONCEPT_ACCURACY, useFewShot), userContent: conceptContent, maxTokens }),
  };

  const activeResults = await Promise.all(activeRubrics.map(k => rubricRegistry[k]()));
  const evaluation = Object.assign({}, ...activeRubrics.map((k, i) => parseJsonResponse(activeResults[i])));

  // 6th sequential call: aggregator sees source image + screenshot + HTML + all dimension scores.
  const aggregatorUserContent = [
    ...sourceImageParts,
    ...screenshotParts,
    htmlPart,
    {
      type: 'text',
      text: `Dimension scores and analyses from the parallel evaluation calls:\n${JSON.stringify(evaluation, null, 2)}\n\nBased on the above scores and the figure itself, output the JSON with "notes" and "action_items".`,
    },
  ];
  const aggregatorRaw = await generateWithModel(model, {
    systemPrompt: buildAggregatorSystemPrompt(useFewShot),
    userContent: aggregatorUserContent,
    maxTokens,
  });
  Object.assign(evaluation, parseJsonResponse(aggregatorRaw));

  return finaliseEval(evaluation, activeRubrics);
}

module.exports = {
  CRITIC_EXPERIMENT_BASE,
  GEOMETRY_PHASE_RUBRICS,
  CONTENT_PHASE_RUBRICS,
  getCriticContext,
  evaluateHtmlWithCritic,
};
