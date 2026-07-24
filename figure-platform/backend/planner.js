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

const fs = require('fs');
const path = require('path');
const { generateWithModel } = require('./models');
const { inferChapterFromFilename, list3dCandidates } = require('./chapter-discovery');

// ── Paths ──────────────────────────────────────────────────────────────────────
const ROOT_DIR = path.join(__dirname, '..', '..');
const QMD_DIR = ROOT_DIR;                                     // .qmd files live at repo root

const PLANNER_MODEL = 'gemini-3.5-flash';
const PLANNER_MAX_TOKENS = 10240;

// ── Context extraction ─────────────────────────────────────────────────────────

/**
 * Find the .qmd file for a given chapter name.
 * Chapter names may differ slightly from filenames, so we try several matches.
 */
function findQmdFile(chapterName) {
  if (!chapterName) return null;

  // Direct match
  const direct = path.join(QMD_DIR, `${chapterName}.qmd`);
  if (fs.existsSync(direct)) return direct;

  // Try common variations: underscores → hyphens, etc.
  const candidates = fs.readdirSync(QMD_DIR).filter(f => f.endsWith('.qmd'));
  const normalised = chapterName.toLowerCase().replace(/[-_ ]/g, '');
  for (const c of candidates) {
    const stem = c.replace(/\.qmd$/, '').toLowerCase().replace(/[-_ ]/g, '');
    if (stem === normalised) return path.join(QMD_DIR, c);
  }

  // Substring match (e.g. "blurring_2" matches "blurring_2.qmd")
  for (const c of candidates) {
    const stem = c.replace(/\.qmd$/, '').toLowerCase();
    if (stem.includes(chapterName.toLowerCase()) || chapterName.toLowerCase().includes(stem)) {
      return path.join(QMD_DIR, c);
    }
  }

  return null;
}

/**
 * Extract a focused chunk of text around references to a specific figure.
 * Returns ~3-5 paragraphs surrounding each reference to the figure stem.
 */
function extractFigureContext(qmdContent, figureStem) {
  const lines = qmdContent.split('\n');
  const stemLower = figureStem.toLowerCase().replace(/\.[^.]+$/, ''); // strip extension
  const contextRadius = 15; // lines before/after a reference to include
  const collected = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    // Match figure image paths like figures/imaging/brdf.png or @fig-lightSpray references
    if (line.includes(stemLower) || line.includes(`/${stemLower}.`) || line.includes(`/${stemLower})`)) {
      const start = Math.max(0, i - contextRadius);
      const end = Math.min(lines.length - 1, i + contextRadius);
      for (let j = start; j <= end; j++) collected.add(j);
    }
  }

  if (collected.size === 0) {
    // Fallback: return first ~40 lines (chapter intro) as minimal context
    return lines.slice(0, 40).join('\n');
  }

  // Build contiguous chunks
  const sortedIndices = [...collected].sort((a, b) => a - b);
  const chunks = [];
  let chunkStart = sortedIndices[0];
  let chunkEnd = sortedIndices[0];

  for (let k = 1; k < sortedIndices.length; k++) {
    if (sortedIndices[k] <= chunkEnd + 3) {
      chunkEnd = sortedIndices[k];
    } else {
      chunks.push(lines.slice(chunkStart, chunkEnd + 1).join('\n'));
      chunkStart = sortedIndices[k];
      chunkEnd = sortedIndices[k];
    }
  }
  chunks.push(lines.slice(chunkStart, chunkEnd + 1).join('\n'));

  return chunks.join('\n\n[...]\n\n');
}

/**
 * Extract full text for a chapter (used in chapter mode to parse all figure refs).
 */
function loadChapterText(chapterName) {
  const qmdPath = findQmdFile(chapterName);
  if (!qmdPath) return null;
  return fs.readFileSync(qmdPath, 'utf-8');
}



// ── LLM interaction planner (fast, small-token call) ────────────────────────

// Shared across both planner profiles so the two prompts never drift.
// Interactions are grouped by "load" — how much generator code and failure
// risk each type adds — so the planner spends complexity only where the
// concept demands it.
const INTERACTION_PALETTE = `INTERACTION PALETTE — pick the fewest, lowest-load interactions that convey the concept. "Load" = generator code + failure risk; spend it only when the concept needs it. In "teaches", say what the learner understands, not what the control does.

LOW (scaffold-provided; prefer these, often one suffices):
• orbit / drag — rotate/move the scene. When depth or 3D shape IS the concept.
• hover — reveal a label on demand. When showing every label at once clutters.
• click — highlight one element. When focus on one part of a busy scene matters.

MEDIUM (a few reactive lines):
• slider — sweep one continuous variable. When dragging it visibly transforms the figure.
• toggle — switch between 2+ named views. For before/after or dual views (e.g. spatial ↔ frequency).
• button / state — step through discrete phases. When distinct stages should be visited deliberately.

HIGH (self-driving or free-form; much more code, more ways to break — at most one per figure):
• animation — self-playing motion. When the concept is inherently dynamic and a slider can't convey it.
• equation_input — learner types math, parsed at runtime. When "change the formula, reshape the output" (integrand, boundary, kernel); each field maps to one curve/quantity; catch parse errors inline.
• code_editor — learner writes/debugs code; the figure traces its execution. Highest load — ONLY when the concept IS an algorithm. Give a minimal API (e.g. swap(i,j), compare(i,j)) and a reference implementation.`;

const INTERACTION_FIELDS = `INTERACTION FIELDS — every interaction object has "id" (unique camelCase), "type", and "teaches". Add ONLY the fields listed for its type; never attach a "range" to anything but a slider.
• orbit / drag / hover / click — no extra fields.
• animation      — "label", optional "loop": true | false.
• slider         — "label", "range": [min, max, step], "default": <number>.
• toggle         — "label", "options": ["A", "B", ...], "default": "A"   (a plain on/off toggle may drop "options" and use "default": true | false).
• button / state — "label", "states": ["idle", "running", "done"], "default": "idle".
• equation_input — "label", "fields": [ { "id": "...", "label": "f(x) =", "default": "sin(x)", "variables": ["x"], "role": "integrand | boundary | kernel | ..." } ].
• code_editor    — "label", "api": "the minimal operation API user code calls (e.g. swap(i,j), compare(i,j)); each op should record a trace frame so execution can be played back", "sample_code": "<correct implementation as a string>", optional "buggy_code": "<broken variant for the learner to debug>".

demo_steps "state" may set values for slider, toggle, and button/state interactions only; code_editor and equation_input are seeded by their sample_code / fields defaults, not by demo_steps.`;

function buildPlannerPrompt(useFewShot = true) {
  if (process.env.PLANNER_PROFILE === 'standalone-demo') {
    return `You are an expert at planning interactive 3D visualizations for textbook figures.

PRIMARY CONTEXT:
The generated output will be opened as a standalone interactive learning artifact. It should still begin from a faithful reconstruction of the source figure, but it does not need to behave like a same-size inline PDF replacement. Decide which interactions, controls, annotations, and guided states best help a learner understand the concept.

${INTERACTION_PALETTE}

Output ONLY valid JSON (no markdown, no explanation):
{
  "projection_type": "perspective | axonometric | oblique",
  "camera_view": { "azimuthDeg": <0=side · 45=three-quarter · 90=front-on>, "elevationDeg": <0=eye-level · 20-35=slightly above · 90=top-down>, "rollDeg": 0, "heightFraction": <0.5 default · up to 0.75 to fill the frame> },
  "elements": ["exhaustive list of every geometric element visible in the figure that must be recreated in 3D"],
  "interactions": [
    { "id": "uniqueCamelCaseId", "type": "one palette type", "teaches": "what the learner understands", "...": "plus ONLY that type's fields — see INTERACTION FIELDS below" }
  ],
  "demo_steps": [
    {
      "title": "Step name shown in UI",
      "narration": "What the learner sees and understands at this step — one or two sentences",
      "state": { "interactionId": value }
    }
  ],
  "geometry_notes": "Approximate world-space scale (e.g. 'cube ~2 units side'), dominant colors, and any domain-specific formula or value needed for correctness.",
  "notes": "Three.js / rendering technique notes (distinct from geometry_notes)"
}

${INTERACTION_FIELDS}

Rules:
- PROJECTION TYPE: Examine the image carefully and identify which of these three types it is:
  • "perspective" — depth edges converge toward one or more vanishing points; objects/faces farther away are visibly smaller; parallel edges in 3D fan out toward a horizon. Dead giveaway: a box where the far face is smaller than the near face.
  • "axonometric" — depth edges are parallel to each other (never converge); the figure looks like it was viewed from a corner or above-angle; all three axes visible simultaneously at consistent angles; equal lengths along an axis stay equal. Dead giveaway: a cube where all edges along the same axis are the same length and direction.
  • "oblique" — the front face is a perfect undistorted rectangle (right angles, no foreshortening); depth edges all leave at the same fixed diagonal angle (typically 30–45°) and are shorter than true length. Dead giveaway: a box whose front face looks like a flat 2D square and whose side/top edges go off diagonally.
  Decision priority: classify by the camera/drawing projection, not by the subject matter. Do not infer "perspective" merely because the diagram shows light rays, arrows, a camera, a 3D surface, or depth labels. First look for projected-parallel 3D line families: if they visibly converge or objects shrink with distance, use "perspective"; if those line families remain parallel in the drawing, use "axonometric" unless the front-face/depth-edge pattern specifically matches "oblique". A parallelogram face or plane is a preserved-parallelism cue, not by itself a perspective cue.
  If the figure is a flat 2D plot or diagram with no 3D depth cues at all, use "axonometric".
- CAMERA VIEW: From the image, estimate the pose that reproduces the source's framing — this is what makes the result recognizable as the same figure. azimuthDeg: 90 front-on, 45 three-quarter/corner, 0 side. elevationDeg: 0 eye-level, 20–35 looking slightly down, 90 top-down. heightFraction: how much of the frame the figure fills (0.5 default, up to 0.75). rollDeg is usually 0. A flat 2D plot/diagram → view head-on with no tilt (front-on 90/0, or top-down 0/90 — whichever plane the geometry lives in). camera_view sets pose and framing only; projection_type still decides the mechanism.
- DEMO STEPS: Include demo_steps when the concept has 2+ distinct phases the learner should visit in sequence. Use [] if the figure is a single continuous exploration.
- GEOMETRY NOTES: Always fill geometry_notes. State world-space dimensions, color palette, and any formula the generator needs to be mathematically correct.
- MULTI-PART FIGURES: If the source figure contains multiple labeled panels (e.g., (a)/(b)/(c), side-by-side comparisons, before/after pairs, or sequential diagrams), do NOT recreate all panels simultaneously in the initial view. Show one panel as the default and link the rest through a single interaction — a toggle, tab switch, or slider — so the learner actively moves between parts. The transition itself should teach the comparison or progression.
- Prefer interactions that expose relationships in the figure rather than generic controls.`;
  }

  return `You are an expert at planning interactive 3D visualizations for textbook figures.

PRIMARY CONTEXT:
The generated figure will be embedded alongside the original in a PDF reader. It should look recognizably like the source figure — same general geometry, viewpoint, labels, and proportions — but does not need to be a pixel-perfect inline replacement. Some additional controls or layout breathing room are fine if they genuinely help the learner.

${INTERACTION_PALETTE}

Output ONLY valid JSON (no markdown, no explanation):
{
  "projection_type": "perspective | axonometric | oblique",
  "camera_view": { "azimuthDeg": <0=side · 45=three-quarter · 90=front-on>, "elevationDeg": <0=eye-level · 20-35=slightly above · 90=top-down>, "rollDeg": 0, "heightFraction": <0.5 default · up to 0.75 to fill the frame> },
  "elements": ["exhaustive list of every geometric element visible in the figure that must be recreated in 3D"],

  "interactions": [
    { "id": "uniqueCamelCaseId", "type": "one palette type", "teaches": "what the learner understands", "...": "plus ONLY that type's fields — see INTERACTION FIELDS below" }
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

Rules:
- PROJECTION TYPE: Examine the image carefully and identify which of these three types it is:
  • "perspective" — depth edges converge toward one or more vanishing points; objects/faces farther away are visibly smaller; parallel edges in 3D fan out toward a horizon. Dead giveaway: a box where the far face is smaller than the near face.
  • "axonometric" — depth edges are parallel to each other (never converge); the figure looks like it was viewed from a corner or above-angle; all three axes visible simultaneously at consistent angles; equal lengths along an axis stay equal. Dead giveaway: a cube where all edges along the same axis are the same length and direction.
  • "oblique" — the front face is a perfect undistorted rectangle (right angles, no foreshortening); depth edges all leave at the same fixed diagonal angle (typically 30–45°) and are shorter than true length. Dead giveaway: a box whose front face looks like a flat 2D square and whose side/top edges go off diagonally.
  Decision priority: classify by the camera/drawing projection, not by the subject matter. Do not infer "perspective" merely because the diagram shows light rays, arrows, a camera, a 3D surface, or depth labels. First look for projected-parallel 3D line families: if they visibly converge or objects shrink with distance, use "perspective"; if those line families remain parallel in the drawing, use "axonometric" unless the front-face/depth-edge pattern specifically matches "oblique". A parallelogram face or plane is a preserved-parallelism cue, not by itself a perspective cue.
  If the figure is a flat 2D plot or diagram with no 3D depth cues at all, use "axonometric".
- CAMERA VIEW: From the image, estimate the pose that reproduces the source's framing — this is what makes the result recognizable as the same figure. azimuthDeg: 90 front-on, 45 three-quarter/corner, 0 side. elevationDeg: 0 eye-level, 20–35 looking slightly down, 90 top-down. heightFraction: how much of the frame the figure fills (0.5 default, up to 0.75). rollDeg is usually 0. A flat 2D plot/diagram → view head-on with no tilt (front-on 90/0, or top-down 0/90 — whichever plane the geometry lives in). camera_view sets pose and framing only; projection_type still decides the mechanism.
- DEMO STEPS: Include demo_steps when the concept has 2+ distinct phases the learner should visit in sequence. Each step drives one named configuration of the interaction state. Use [] if the figure is a single continuous exploration with no natural sequence.
- GEOMETRY NOTES: Always fill geometry_notes. State approximate world-space dimensions, color palette (with hex codes when determinable from the source), and any formula or numeric range the generator needs to be mathematically correct. This prevents the generator from guessing sizes and getting the zoom wrong.
- MULTI-PART FIGURES: If the source figure contains multiple labeled panels (e.g., (a)/(b)/(c), side-by-side comparisons, before/after pairs), do NOT show all panels simultaneously. Show one panel by default and link the others through a single interaction — a toggle, tab, or slider — so the learner actively moves between them. The transition itself should teach the comparison or progression.

${useFewShot ? `Here are two examples of good plans:

=== EXAMPLE 1: Geometric 3D scene with sliders driving continuous object motion ===

Textbook context:
Perspective projection equations derived geometrically. A 3D point P at world coordinates (X, Y, Z) projects through the pinhole (at the origin) onto the projection plane at distance f. From similar triangles: x = f * X/Z and y = f * Y/Z. Under perspective projection, distant objects become smaller through the inverse scaling by Z. The focal length f is the distance from the pinhole to the sensing plane.

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
      "id": "pointX",
      "type": "slider",
      "label": "Lateral position X",
      "range": [-4, 4, 0.5],
      "default": 2,
      "teaches": "Shifting P sideways moves the projected point proportionally, showing that x scales linearly with X for a fixed depth"
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
      "state": { "pointZ": 5, "pointX": 2, "focalLength": 2 }
    },
    {
      "title": "Increase depth Z",
      "narration": "Move P to Z=10. The projected x halves to 0.4 — the 1/Z inverse scaling is directly visible.",
      "state": { "pointZ": 10, "pointX": 2, "focalLength": 2 }
    },
    {
      "title": "Longer focal length",
      "narration": "Increase f to 4. The projection plane moves out and x grows again — a longer focal length zooms in.",
      "state": { "pointZ": 10, "pointX": 2, "focalLength": 4 }
    }
  ],
  "geometry_notes": "Pinhole at origin: SphereGeometry ~0.08 units radius, black. 3D point P at roughly (2, 0.5, -5) from origin. Projection plane at z=-f as semi-transparent PlaneGeometry ~3×2 units, blue 0.18 opacity. Ray as a thin Line from P through origin to projected point. Geometry fits within ±3 X, ±2 Y, -12 to 0 Z. Colors: pinhole black, P orange #ff8800, projected point red #cc2200, ray red, plane blue.",
  "notes": "Update the ray endpoint, projected point position, and both similar-triangle overlays reactively on every slider change. Use orthographic camera so the similar-triangle proportions remain visually accurate. Render the ray as a solid line from P through the origin and on to the projection plane; use a dashed extension beyond the plane to hint at the virtual camera plane."
}

=== END EXAMPLE 1 ===

=== EXAMPLE 2: Mathematical function figure with sliders driving continuous curve shape ===

Textbook context:
The parameter sigma adjusts the spatial extent of the Gaussian g(x; sigma) = (1 / sqrt(2*pi*sigma^2)) * exp(-x^2 / (2*sigma^2)). The normalization constant is set so that the function integrates to 1. The Gaussian kernel is positive and symmetric (a zero-phase filter). In practice only samples within three standard deviations are needed — at 3*sigma the amplitude is around 1% of its central value. The Fourier transform of a Gaussian is also a Gaussian with width inversely proportional to sigma.

{
  "projection_type": "axonometric",
  "camera_view": { "azimuthDeg": 0, "elevationDeg": 90, "rollDeg": 0, "heightFraction": 0.7 },
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
      "id": "showDiscrete",
      "type": "toggle",
      "label": "Show discrete samples",
      "default": false,
      "teaches": "Overlays the sampled integer-position values to show how the continuous kernel is approximated in practice and why truncating at 3*sigma loses almost nothing"
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
      "state": { "sigma": 0.5, "showDiscrete": false }
    },
    {
      "title": "Show discrete samples",
      "narration": "Toggle on discrete stems to see integer-position samples. Tails beyond 3σ are negligible — truncation loses almost nothing.",
      "state": { "sigma": 0.5, "showDiscrete": true }
    },
    {
      "title": "Wide kernel",
      "narration": "Increase σ to 2. The curve spreads and flattens — more neighbors averaged, stronger blurring.",
      "state": { "sigma": 2, "showDiscrete": true }
    }
  ],
  "geometry_notes": "X-axis spans x ∈ [-4.5, 4.5]. Y scale: map sigma=1 peak (0.399) to 0.8 world-units for readability (multiply curve values by 0.8/gauss(0,1)). Y-axis 0 to ~1.0. Curve as 200-pt THREE.Line, blue #1a66cc. Stems as LineSegments at integer x ∈ [-4,4], grey. Sigma bracket dark-grey. Camera bird's-eye (azimuth=0, elevation=90) — pure 2D XY plot. For frequency domain: sigma_freq = 1/(2π·sigma_spatial), x-axis MUST switch to [-0.5, 0.5] (Nyquist range) or the curve is an invisible spike.",
  "notes": "Render the Gaussian curve as a smooth THREE.Line sampled at 200 points. For discrete stems use LineSegments from each integer sample down to y=0. Recompute all curve points reactively whenever sigma changes. For the domain toggle, keep both curves in the scene and show/hide rather than destroying geometry."
}

=== END EXAMPLE 2 ===` : ''}`;
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

  // Try to load chapter text
  const qmdContent = resolvedChapter ? loadChapterText(resolvedChapter) : null;
  let contextChunk = '';

  if (qmdContent) {
    contextChunk = extractFigureContext(qmdContent, figureStem);
  } else {
    contextChunk = `Figure: ${figureStem}. No chapter text found — plan from filename alone.`;
  }
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

  const qmdContent = loadChapterText(chapterName);
  const plans = [];

  for (const candidate of candidates) {
    let contextChunk = '';
    if (qmdContent) {
      contextChunk = extractFigureContext(qmdContent, candidate.stem);
    } else {
      contextChunk = `Figure: ${candidate.stem} from chapter "${chapterName}". No chapter text found.`;
    }

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
};
